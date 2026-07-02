-- 009 多租户隔离：组织/成员/API Key + 租户拥有数据表 + Postgres RLS（ADR-032）
--
-- 企业理由：平台演进为多租户 SaaS 后，租户间数据隔离是安全与合规红线。
-- 在应用层手写 WHERE tenant_id=? 依赖"开发者永不遗漏"，任一遗漏即跨租户泄露。
-- 本迁移将隔离下沉到数据库：每张租户数据表启用行级安全（RLS），策略基于
-- current_setting('app.current_tenant_id')，由 withTenant() 在事务内 SET LOCAL 注入。
--
-- 隔离边界（有意为之）：
-- - 租户数据表（portfolios/saved_configs/backtest_runs）：启用 + FORCE RLS。
-- - 身份/控制平面（organizations/memberships/api_keys）：不启用 RLS——这些在
--   "尚未解析出租户"时即被查询（登录解析成员、API Key 解析所属组织），存在
--   先有鸡先有蛋问题；由应用层成员校验强制，并以最小权限角色收敛风险。
-- - outbox：仅新增 tenant_id 归因列，不启用 RLS——后台 OutboxPublisher 是跨租户
--   系统进程，需扫描所有未处理事件；RLS 会使其读不到他租户事件而中断投递。
-- - 市场数据（tickers/prices/cpi_data/exchange_rates）：保持全局共享，不加 tenant_id、不加 RLS。

-- ---------------------------------------------------------------------------
-- 1. 组织（租户实体）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(80) NOT NULL UNIQUE,
  plan VARCHAR(20) NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'canceled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

-- ---------------------------------------------------------------------------
-- 2. 成员关系（一个用户可属于多个组织，各组织内角色不同）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memberships (
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'analyst' CHECK (role IN ('owner', 'admin', 'analyst', 'readonly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);

-- ---------------------------------------------------------------------------
-- 3. 按组织的 API Key（哈希存储、可吊销，取代单一 ADMIN_API_KEY）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  -- 仅存储密钥哈希（sha256 hex），明文仅在创建时一次性返回给用户
  key_hash TEXT NOT NULL UNIQUE,
  -- 密钥前缀（如 bpk_live_xxxx 的前若干位），用于 UI 展示与定位，不含敏感信息
  key_prefix VARCHAR(20) NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(org_id) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. 平台管理员标记（运营 SaaS 自身，区别于租户内 admin）
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 5. 租户拥有的数据表（替代浏览器 localStorage）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(120) NOT NULL,
  assets JSONB NOT NULL,
  rebalance_frequency VARCHAR(20) NOT NULL DEFAULT 'none',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portfolios_tenant ON portfolios(tenant_id);

CREATE TABLE IF NOT EXISTS saved_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(120) NOT NULL,
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_saved_configs_tenant ON saved_configs(tenant_id);

CREATE TABLE IF NOT EXISTS backtest_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(120),
  request JSONB NOT NULL,
  result JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_backtest_runs_tenant ON backtest_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_backtest_runs_tenant_created ON backtest_runs(tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 6. outbox 增加租户归因列（不启用 RLS，见文件头说明）
-- ---------------------------------------------------------------------------
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS tenant_id UUID;
CREATE INDEX IF NOT EXISTS idx_outbox_tenant ON outbox(tenant_id) WHERE tenant_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. 行级安全（RLS）：仅租户数据表
-- ---------------------------------------------------------------------------
-- 运行角色 backtest_app 必须不得绕过 RLS（默认即 NOBYPASSRLS，此处显式收敛）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backtest_app') THEN
    ALTER ROLE backtest_app NOBYPASSRLS;
  END IF;
END
$$;

-- 策略说明：current_setting(..., true) 的第二参数 missing_ok=true，未设置租户上下文时
-- 返回 NULL → 与 tenant_id 比较恒为假 → 读返回零行、写被拒绝（fail-safe，拒绝优于泄露）。
-- FORCE ROW LEVEL SECURITY 确保即便表属主连接也受策略约束。

ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolios FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_portfolios ON portfolios
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE saved_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_configs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_saved_configs ON saved_configs
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE backtest_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE backtest_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_backtest_runs ON backtest_runs
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- 授予运行角色对新表的 DML 权限（007 的 ALTER DEFAULT PRIVILEGES 已覆盖未来表，
-- 此处显式 GRANT 以兼容已存在的角色与既有连接）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backtest_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      organizations, memberships, api_keys, portfolios, saved_configs, backtest_runs
      TO backtest_app;
  END IF;
END
$$;
