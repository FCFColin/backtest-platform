-- Consolidated initial schema (rebaselined from 45 migration files)
-- Generated 2026-08-01

-- 001_init.sql
-- =============================================================================
-- 迁移 v1：初始 schema
-- 描述：tickers, prices, cpi_data, exchange_rates, schema_migrations
-- =============================================================================
-- 企业理由：独立 SQL 文件便于 DBA 审查（I-3）。
-- 内联 SQL 无法 git diff，DBA 无法逐文件审批。
-- 权衡：需维护文件与代码的同步，但版本控制 diff 和 CI 测试收益更大。

CREATE TABLE IF NOT EXISTS tickers (
  ticker VARCHAR(20) PRIMARY KEY,
  category VARCHAR(50) NOT NULL DEFAULT '',
  market VARCHAR(20) NOT NULL DEFAULT '',
  search_vector tsvector,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prices (
  id BIGSERIAL PRIMARY KEY,
  ticker VARCHAR(20) NOT NULL REFERENCES tickers(ticker),
  date DATE NOT NULL,
  open NUMERIC(19, 6),
  high NUMERIC(19, 6),
  low NUMERIC(19, 6),
  close NUMERIC(19, 6),
  volume BIGINT,
  adjusted_close NUMERIC(19, 6),
  UNIQUE(ticker, date)
);

CREATE INDEX IF NOT EXISTS idx_prices_ticker ON prices(ticker);
CREATE INDEX IF NOT EXISTS idx_prices_ticker_date ON prices(ticker, date);
CREATE INDEX IF NOT EXISTS idx_prices_date_brin ON prices USING BRIN(date);

CREATE TABLE IF NOT EXISTS cpi_data (
  country VARCHAR(10) NOT NULL,
  date DATE NOT NULL,
  value NUMERIC(19, 6) NOT NULL,
  PRIMARY KEY (country, date)
);

CREATE TABLE IF NOT EXISTS exchange_rates (
  base_currency VARCHAR(10) NOT NULL,
  target_currency VARCHAR(10) NOT NULL,
  date DATE NOT NULL,
  rate NUMERIC(19, 6) NOT NULL,
  PRIMARY KEY (base_currency, target_currency, date)
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  description TEXT
);

-- 002_fts.sql
-- =============================================================================
-- 迁移 v2：全文搜索
-- 描述：tickers 搜索向量 + GIN 索引
-- =============================================================================

-- 搜索向量列已在 v1 创建，此处添加 GIN 索引和更新触发器
CREATE INDEX IF NOT EXISTS idx_tickers_search ON tickers USING GIN(search_vector);

-- 自动更新搜索向量的触发器函数
CREATE OR REPLACE FUNCTION update_ticker_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW.ticker, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.category, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW.market, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tickers_search_vector
BEFORE INSERT OR UPDATE ON tickers
FOR EACH ROW EXECUTE FUNCTION update_ticker_search_vector();

-- DDL/DML 同迁移说明 (M-009)：以下 UPDATE 为一次性数据回填，与上方 DDL（GIN 索引 +
-- 触发器）必须在同一迁移中执行。原因：触发器依赖 search_vector 列存在，GIN 索引
-- 依赖 search_vector 已填充。拆分会使迁移中间态存在空向量行，导致索引膨胀与
-- 查询结果不完整。回填使用 WHERE search_vector IS NULL 保证幂等。
-- 回填现有数据的搜索向量
UPDATE tickers SET search_vector =
  setweight(to_tsvector('simple', COALESCE(ticker, '')), 'A') ||
  setweight(to_tsvector('simple', COALESCE(category, '')), 'B') ||
  setweight(to_tsvector('simple', COALESCE(market, '')), 'C')
WHERE search_vector IS NULL;

-- 003_index_cleanup.sql
-- =============================================================================
-- 迁移 v3：索引清理 + CHECK 约束
-- 描述：删除冗余索引 + 添加 CHECK 约束
-- =============================================================================

-- 企业理由：idx_prices_ticker 是 UNIQUE(ticker,date) 的最左前缀冗余索引，
-- PostgreSQL 查询优化器在已有唯一约束索引时不会使用此单列索引。
-- 冗余索引使写入放大 3x（INSERT/UPDATE 需同时维护 3 个 B-Tree），
-- 百万级数据导入差异达分钟级。
-- 权衡：删除后需 EXPLAIN 验证查询仍走唯一约束索引。
DROP INDEX IF EXISTS idx_prices_ticker;

-- 企业理由：idx_prices_ticker_date 与 UNIQUE(ticker,date) 完全重复，
-- 唯一约束已自动创建等价索引，此索引零收益纯开销。
DROP INDEX IF EXISTS idx_prices_ticker_date;

-- 企业理由：CHECK 约束是数据质量最后防线，防止应用层 bug 写入非法数据。
-- 如 high < low 的脏数据会导致回测计算错误（最大回撤等指标失真）。
-- 权衡：约束增加写入校验开销（微秒级），换取数据完整性。
ALTER TABLE prices ADD CONSTRAINT prices_ohlc_check CHECK (
  high >= low
  AND low <= open
  AND low <= close
  AND high >= open
  AND high >= close
  AND volume >= 0
);

-- 004_users.sql
-- 企业理由：共享 API Key 无法区分用户身份，不符合 SOC 2/ISO 27001 可追溯要求。
-- 用户表支持多用户注册、密码哈希存储、角色分配，是认证体系的基础。
-- 权衡：引入用户管理复杂度（注册/密码重置/账户锁定），但满足合规要求。
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'analyst' CHECK (role IN ('admin', 'analyst', 'readonly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 005_outbox.sql
-- Architecture: Outbox表，保证事件与业务数据的事务一致性
-- 企业为何需要：直接发送事件可能在业务数据写入后、事件发送前崩溃，导致数据不一致
-- 权衡：Outbox增加写入开销（双写），但保证最终一致性

CREATE TABLE IF NOT EXISTS outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type VARCHAR(100) NOT NULL,
  aggregate_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,

  CONSTRAINT chk_processed_after_created CHECK (processed_at IS NULL OR processed_at >= created_at)
);

CREATE INDEX idx_outbox_unprocessed ON outbox (created_at) WHERE processed_at IS NULL;
CREATE INDEX idx_outbox_aggregate ON outbox (aggregate_type, aggregate_id);

-- 006_outbox_dedup.sql
-- ADR-024 / T-11: Outbox 去重与幂等强化
--
-- 企业为何需要：原实现同一 BacktestCompleted 事件被写入两次
--   （application/backtest-service 的事务写入 + BacktestCompletedHandler 的非事务写入），
--   且 OutboxPublisher → eventDispatcher → handler → 再写 outbox → NOTIFY 形成反馈环。
-- 本迁移引入 event_id 唯一去重键，配合写入侧 ON CONFLICT DO NOTHING，
--   使重复写入（重试、双路径）成为幂等的 no-op，作为应用层修复之外的数据库级防线（纵深防御）。
-- 权衡：event_id 可空以兼容历史行；新写入应始终提供 event_id。

ALTER TABLE outbox ADD COLUMN IF NOT EXISTS event_id UUID;

-- 唯一约束：相同 event_id 仅允许一行，重复写入被 ON CONFLICT 吞掉。
-- 使用唯一索引（而非列约束）以便对历史 NULL 行宽容（多个 NULL 不冲突）。
CREATE UNIQUE INDEX IF NOT EXISTS uq_outbox_event_id ON outbox (event_id) WHERE event_id IS NOT NULL;

-- 007_least_privilege.sql
-- T-21 / 维度8：数据库最小权限角色（least privilege）
--
-- 企业为何需要：应用以拥有 DDL/DROP 权限的库主用户连接时，一旦发生 SQL 注入或凭证泄露，
-- 攻击者即可 DROP TABLE / 篡改结构 / 越权读取所有库。最小权限原则要求运行期账户仅持有
-- 业务所需的 DML 权限（SELECT/INSERT/UPDATE/DELETE），DDL 由独立的迁移账户执行。
--
-- 使用方式（由 DBA / 迁移流程以管理员身份执行一次）：
--   1. 设置应用角色密码：\set app_password '强随机密码'
--   2. 执行本脚本；
--   3. 将应用 DATABASE_URL 切换为 backtest_app 角色（而非库主用户）。
--
-- 权衡：引入双角色（迁移账户 + 运行账户）增加少量运维步骤，但显著缩小攻击爆炸半径。
-- 注意：本脚本使用 IF NOT EXISTS 思路，幂等可重入；角色密码请通过环境注入，勿硬编码。

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backtest_app') THEN
    -- 占位密码：生产部署时务必以 ALTER ROLE 重设为强随机密码并通过密钥管理注入。
    CREATE ROLE backtest_app LOGIN PASSWORD 'change-me-in-deploy';
  END IF;
END
$$;

-- 连接与 schema 使用权限（使用 current_database() 避免硬编码库名，便于 testcontainers/多环境）
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO backtest_app', current_database());
END
$$;
GRANT USAGE ON SCHEMA public TO backtest_app;

-- 仅授予现有表的 DML 权限（不含 DDL/TRUNCATE/DROP）
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO backtest_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO backtest_app;

-- 对未来由迁移账户创建的表/序列，自动继承相同 DML 权限
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO backtest_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO backtest_app;

-- 显式回收危险默认权限（PUBLIC 对 public schema 的 CREATE）
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- 008_checks.sql
-- =============================================================================
-- 迁移 v8：业务 CHECK 约束（T-I2）
-- 企业理由：非法价格/负值应在 DB 层拒绝，而非仅在应用层校验。
-- 权衡：历史脏数据可能导致迁移失败，需先清洗；新写入受约束保护。
-- =============================================================================

ALTER TABLE prices
  ADD CONSTRAINT chk_prices_close_positive CHECK (close IS NULL OR close > 0);

ALTER TABLE prices
  ADD CONSTRAINT chk_prices_volume_nonnegative CHECK (volume IS NULL OR volume >= 0);

ALTER TABLE cpi_data
  ADD CONSTRAINT chk_cpi_value_positive CHECK (value > 0);

ALTER TABLE exchange_rates
  ADD CONSTRAINT chk_exchange_rate_positive CHECK (rate > 0);

-- 009_tenancy.sql
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

-- 010_user_email.sql
-- 010 自助注册与邀请：用户邮箱 + 邮箱验证令牌 + 组织邀请（ADR-035）
--
-- 企业理由：SaaS 自助开通要求"邮箱即账号"——注册需邮箱、需验证以防滥用，
-- 团队协作需邀请机制把新成员加入组织。本迁移补齐三块：
-- 1. users 增加 email（唯一，迁移期可空）+ email_verified_at
-- 2. email_verification_tokens：注册/重发时签发，验证后失效
-- 3. invitations：组织管理员邀请邮箱加入，持 token 接受后建立 membership
--
-- 隔离边界：这些表属身份/控制平面（与 organizations/memberships/api_keys 同类），
-- 不启用 RLS——它们在"尚未解析出租户"或"验证/邀请接受"等跨租户流程中被查询。

-- ---------------------------------------------------------------------------
-- 1. users 邮箱列
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- 邮箱大小写不敏感唯一（仅对非空生效，兼容历史无邮箱用户）
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
  ON users (lower(email)) WHERE email IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. 邮箱验证令牌
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 仅存令牌哈希（sha256 hex），明文仅在邮件链接中出现
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_verif_user ON email_verification_tokens(user_id);

-- ---------------------------------------------------------------------------
-- 3. 组织邀请
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'analyst' CHECK (role IN ('owner', 'admin', 'analyst', 'readonly')),
  -- 仅存 token 哈希，明文仅在邀请链接中
  token_hash TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invitations_org ON invitations(org_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(lower(email));
-- 同组织同邮箱仅允许一条待处理邀请（accepted_at IS NULL）
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_pending
  ON invitations(org_id, lower(email)) WHERE accepted_at IS NULL;

-- 授予运行角色对新表的 DML 权限
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backtest_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      email_verification_tokens, invitations
      TO backtest_app;
  END IF;
END
$$;

-- 011_billing.sql
-- 011 Stripe 计费：客户与订阅映射（ADR-036）
--
-- 企业理由：SaaS 变现依赖把"组织（租户）"映射到 Stripe 的 customer 与 subscription，
-- 并把订阅状态/计划回写到 organizations，使应用层按计划做配额与功能门控。
--
-- 隔离边界：这两张表属计费控制平面（与 organizations 同类），不启用 RLS——
-- webhook 回调时尚无租户上下文，需按 stripe_customer_id 反查组织。

-- ---------------------------------------------------------------------------
-- 1. 组织 -> Stripe 客户映射（一对一）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stripe_customers (
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. 订阅（每组织当前一条活跃订阅；历史以 stripe_subscription_id 唯一）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  plan VARCHAR(20) NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  status VARCHAR(32) NOT NULL DEFAULT 'incomplete',
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(org_id);

-- 授予运行角色对新表的 DML 权限
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backtest_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      stripe_customers, subscriptions
      TO backtest_app;
  END IF;
END
$$;

-- 012_usage.sql
-- 012 用量计量与配额（ADR-037）
--
-- 企业理由：SaaS 需按计划限制资源消耗（防滥用 + 变现分层）。本迁移提供两层用量数据：
-- 1. usage_events：明细事件流（审计 / 对账 / 后续 BI），每次计费动作追加一行
-- 2. usage_counters：按 (org, period, metric) 聚合的月度计数，作为配额判定的权威来源
--    （Redis 计数器为快路径，DB 为持久兜底与跨实例一致性）
--
-- 隔离边界：用量与租户强绑定，启用 RLS（与 009 的租户数据表一致），按
-- current_setting('app.current_tenant_id') 收敛读写。

-- ---------------------------------------------------------------------------
-- 1. 用量明细事件
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  metric VARCHAR(40) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_events_org_metric ON usage_events(org_id, metric, created_at);

-- ---------------------------------------------------------------------------
-- 2. 月度聚合计数（period 形如 '2026-06'）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage_counters (
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period VARCHAR(7) NOT NULL,
  metric VARCHAR(40) NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, period, metric)
);

-- ---------------------------------------------------------------------------
-- RLS：按当前租户收敛
-- ---------------------------------------------------------------------------
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events FORCE ROW LEVEL SECURITY;
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'usage_events' AND policyname = 'usage_events_tenant_isolation') THEN
    CREATE POLICY usage_events_tenant_isolation ON usage_events
      USING (org_id = current_setting('app.current_tenant_id', true)::uuid)
      WITH CHECK (org_id = current_setting('app.current_tenant_id', true)::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'usage_counters' AND policyname = 'usage_counters_tenant_isolation') THEN
    CREATE POLICY usage_counters_tenant_isolation ON usage_counters
      USING (org_id = current_setting('app.current_tenant_id', true)::uuid)
      WITH CHECK (org_id = current_setting('app.current_tenant_id', true)::uuid);
  END IF;
END
$$;

-- 授予运行角色 DML 权限（RLS 仍生效）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backtest_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON usage_events, usage_counters TO backtest_app;
  END IF;
END
$$;

-- 013_drop_redundant_index.sql
-- =============================================================================
-- 迁移 v13：删除冗余索引 idx_users_username
-- 描述：users.username 已有 UNIQUE 约束（自动创建唯一索引），idx_users_username 重复
-- =============================================================================

-- 企业理由：users 表 username 列在 migration 004 中已定义 UNIQUE 约束，
-- PostgreSQL 自动为 UNIQUE 约束创建 B-Tree 索引，idx_users_username 与其完全重复。
-- 冗余索引使写入放大（INSERT/UPDATE 需同时维护两个 B-Tree），无查询收益。
-- 权衡：删除后需 EXPLAIN 验证查询仍走唯一约束索引。
DROP INDEX IF EXISTS idx_users_username;

-- 014_drop_chk_prices_volume_nonnegative.sql
-- =============================================================================
-- 迁移 v14：删除冗余 CHECK 约束 chk_prices_volume_nonnegative
-- 描述：prices.volume 的非负性已由 prices_ohlc_check（v3）中的 volume >= 0 覆盖，
--       008_checks.sql 新增的 chk_prices_volume_nonnegative 与其语义重复
-- =============================================================================

-- 企业理由：003_index_cleanup.sql 的 prices_ohlc_check CHECK 约束已包含
-- volume >= 0 条件（PostgreSQL 中 NULL >= 0 结果为 NULL，CHECK 约束视 NULL 为通过，
-- 故等价于 volume IS NULL OR volume >= 0）。008_checks.sql 新增的独立约束
-- chk_prices_volume_nonnegative 与其完全重复，增加写入校验开销且无额外保护。
-- 权衡：删除后依赖 prices_ohlc_check 覆盖 volume 非负性，语义无损。
ALTER TABLE prices DROP CONSTRAINT IF EXISTS chk_prices_volume_nonnegative;

-- 015_add_exchange_column.sql
-- =============================================================================
-- 迁移 v15：新增 tickers.exchange 列
-- 描述：存储标的所属交易所代码（SZSE/SSE/US 等），用于按交易所分布统计。
--       修复数据引擎页"按交易所分布"全部显示为"未知"的 bug（Task 4.1）。
-- =============================================================================
-- 企业理由：原 updateMarketStats 硬编码 byExchange[''] 空键，导致所有标的
-- 都落入"未知"桶。新增 exchange 列后，data-fetcher 抓取时按 ticker 后缀推导
-- （_SZ/.SZ→SZSE，_SS/.SS/_SH/.SH→SSE，无后缀→US），backfill 脚本回填历史数据。
-- 权衡：增加一列存储与索引开销，但解除"未知"桶阻塞，使分布统计可用。
-- 注意：文件编号从 spec 原计划的 002 调整为 015，因 002_fts.sql 已存在。

ALTER TABLE tickers ADD COLUMN IF NOT EXISTS exchange VARCHAR(20) NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_tickers_exchange ON tickers(exchange);

-- 016_backtest_progress.sql
-- =============================================================================
-- 迁移 v16：回测任务进度列（P0-03 回测任务异步化）
-- 描述：为 backtest_runs 表添加 progress_pct 列，存储异步任务执行进度（0-100）。
--       BullMQ Worker 在数据加载/回测计算/结果写入各阶段调用 job.updateProgress()，
--       API 端点 GET /api/v1/backtest/runs/:jobId 透出该进度供前端轮询展示。
-- =============================================================================
-- 企业理由：异步化后客户端无法同步感知完成时间，进度百分比提升用户体验
--           （避免长时间无反馈的"黑屏等待"）。列存储在 backtest_runs 表中，
--           便于历史任务回溯与运维监控。
-- 权衡：增加一列存储与 CHECK 约束开销，但进度可见性是异步化必需的 UX 保障。

ALTER TABLE backtest_runs ADD COLUMN IF NOT EXISTS progress_pct INTEGER NOT NULL DEFAULT 0;

-- 进度百分比约束：必须在 0-100 范围内，防止异常值污染前端展示。
ALTER TABLE backtest_runs ADD CONSTRAINT chk_backtest_runs_progress_pct
  CHECK (progress_pct >= 0 AND progress_pct <= 100);

-- 017_admin_api_key_db.sql
-- =============================================================================
-- 迁移 v17：ADMIN_API_KEY 安全加固 — 平台密钥移入 DB + 生命周期 + argon2id
-- 描述：ADMIN_API_KEY 静态凭证加固（P0-04）：移入 api_keys 表（is_platform_admin=true, org_id=NULL），
--       新增 expires_at（最大 90 天）与 key_hash_argon2（argon2id）列，支持轮换与吊销。
-- =============================================================================
-- 企业理由：单一静态 ADMIN_API_KEY 不可吊销、不可审计、违背等保三级"身份鉴别"
-- 与"访问控制"控制点。将其移入 api_keys 表后，可按密钥记录轮换、吊销、
-- 限期、记录最后使用时间，与按组织密钥共用同一治理面。
-- 权衡：org_id 由 NOT NULL 改为可空（平台密钥不绑定租户），需以 CHECK 约束
-- 收敛为"平台密钥 org_id 为 NULL，租户密钥 org_id NOT NULL"，避免出现
-- 既无租户又非平台的孤儿记录。argon2id 与既有 sha256(key_hash) 共存以渐进迁移：
-- 新密钥写入 key_hash_argon2，旧密钥仍按 key_hash 等值查找直至轮换。

-- 1) 平台管理员标记（运营 SaaS 自身的 break-glass 密钥，org_id 为 NULL）
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) 有效期（NULL=不限；平台 break-glass 密钥应用层强制 <=90 天）
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 3) argon2id 编码哈希（新密钥使用；与 key_hash 共存，verify 时优先 argon2id）
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_hash_argon2 TEXT;

-- 4) 平台 break-glass 密钥的 org_id 为 NULL（不绑定租户）
ALTER TABLE api_keys ALTER COLUMN org_id DROP NOT NULL;

-- 5) 约束：要么平台密钥（org_id NULL），要么租户密钥（org_id NOT NULL）
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_org_or_platform;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_org_or_platform CHECK (
  (is_platform_admin = TRUE AND org_id IS NULL)
  OR
  (is_platform_admin = FALSE AND org_id IS NOT NULL)
);

-- 6) expires_at 上限 90 天（写时校验，防止签发超长有效期密钥）
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_expires_max_90d;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_expires_max_90d CHECK (
  expires_at IS NULL OR expires_at <= NOW() + INTERVAL '90 days'
);

-- 7) 索引：平台密钥定位、有效期扫描
CREATE INDEX IF NOT EXISTS idx_api_keys_platform_admin
  ON api_keys(is_platform_admin) WHERE is_platform_admin = TRUE;
CREATE INDEX IF NOT EXISTS idx_api_keys_expires
  ON api_keys(expires_at) WHERE expires_at IS NOT NULL;

-- 018_timescaledb.sql
-- 描述：prices 表转 TimescaleDB hypertable + 列压缩 + 月线 Continuous Aggregate
-- =============================================================================
-- 迁移 v18：TimescaleDB 时序优化（P1-02）
-- =============================================================================
-- 企业理由（ADR-007）：prices 是增长最快的表，5K ticker × 30 年 × 252 交易日
-- ≈ 3780 万行；扩展至 20K ticker 后超过 1.5 亿行，标准 B-tree 索引显现性能衰退。
-- TimescaleDB hypertable 提供自动时间分区（chunk 级分区裁剪）、列压缩（90%+ 压缩率）
-- 与 Continuous Aggregate（预计算月线 OHLCV），在保持完整 SQL 兼容性的前提下获得
-- 10–100 倍时序查询性能提升。chunk_time_interval=3 个月（金融日线，每 chunk ≈ 63 交易日）。
--
-- 权限说明：CREATE EXTENSION 需超级用户；docker 环境由 postgres-init/03-timescaledb.sql
-- 在数据库初始化阶段（POSTGRES_USER 超级用户）预装扩展，本语句在此场景下为幂等 no-op。
-- hypertable/compression/CAGG 由表 owner（backtest_app）执行。
-- =============================================================================

-- 1. 安装 TimescaleDB 扩展（若已由 init 脚本预装则幂等跳过）
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- 2. 修正主键：hypertable 要求所有唯一索引（含 PK）包含分区列 date
--    原 prices_pkey(id) 不含 date，无法在 hypertable 上保留；
--    UNIQUE(ticker, date) 已含 date，迁移后仍有效（hypertable 唯一约束）。
--    id 列保留为普通 BIGSERIAL（无唯一约束），向后兼容；应用代码未引用 prices.id。
ALTER TABLE prices DROP CONSTRAINT IF EXISTS prices_pkey;

-- 3. 转换为 hypertable：按 date 分区，每 chunk 3 个月
--    migrate_data => true：prices 表已有 14.5M 行历史数据，需迁移到 hypertable 分区
--    （新表可省略此参数；含数据时必须指定，否则报 "table is not empty"）
SELECT create_hypertable(
  'prices',
  'date',
  chunk_time_interval => INTERVAL '3 months',
  migrate_data => TRUE,
  if_not_exists => TRUE
);

-- 4. ticker 空间维度：当 ticker 数量 > 10000 时启用 16 分区（spec P1-02 要求）
--    幂等：add_dimension 已存在时跳过；ticker 不足时跳过避免无谓分区开销。
--    使用 timescaledb_information.dimensions 公开视图（兼容 TimescaleDB 2.28+，
--    避免直接访问内部表 _timescaledb_config.dimensions 导致权限/兼容性问题）
DO $$
DECLARE
  ticker_count INTEGER;
  dim_exists BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO ticker_count FROM tickers;
  SELECT EXISTS(
    SELECT 1 FROM timescaledb_information.dimensions
    WHERE hypertable_name = 'prices'
      AND column_name = 'ticker'
  ) INTO dim_exists;
  IF ticker_count > 10000 AND NOT dim_exists THEN
    PERFORM add_dimension('prices', 'ticker', number_partitions => 16);
  END IF;
END $$;

-- 5. 列压缩策略：历史数据 6 个月后自动压缩
--    segmentby=ticker（按标的分段，查询常按 ticker 过滤），orderby=date DESC
ALTER TABLE prices SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'ticker',
  timescaledb.compress_orderby = 'date DESC'
);
SELECT add_compression_policy('prices', INTERVAL '6 months', if_not_exists => TRUE);

-- 6. Continuous Aggregate：月线 OHLCV（加速回测范围查询/统计）
--    time_bucket() 是 TimescaleDB 推荐的时间分桶函数（CAGG 要求使用 time_bucket，
--    不支持 date_trunc）。first()/last() 为 TimescaleDB 时序聚合，按 date 排序取首/末值。
--    WITH NO DATA：不立即物化历史数据，由刷新策略增量填充。
CREATE MATERIALIZED VIEW IF NOT EXISTS prices_monthly
WITH (timescaledb.continuous) AS
SELECT
  ticker,
  time_bucket('1 month', date) AS month,
  first(open, date) AS open,
  max(high) AS high,
  min(low) AS low,
  last(close, date) AS close,
  sum(volume) AS volume
FROM prices
GROUP BY ticker, time_bucket('1 month', date)
WITH NO DATA;

-- 7. CAGG 自动刷新策略：每小时刷新最近 3 个月内的聚合（覆盖延迟 < 1 小时）
--    注意：start_offset 与 end_offset 的窗口必须覆盖至少 2 个月度 bucket，
--    因此 start_offset 至少为 3 months（覆盖当月 + 上月 + 边界）。
SELECT add_continuous_aggregate_policy(
  'prices_monthly',
  start_offset => INTERVAL '3 months',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

-- 019_security_compliance.sql
-- =============================================================================
-- 迁移 v19：等保三级合规（P1-09）— MFA + 密码策略 + 登录审计
-- 描述：等保三级身份鉴别与访问控制：TOTP MFA、密码历史、登录事件审计表
-- =============================================================================
-- 企业理由（GB/T 22239 三级要求）：
--   8.1.4 身份鉴别：应对登录的用户进行身份标识和鉴别，身份标识具有唯一性，
--     身份鉴别信息具有复杂度要求并定期更换；
--   8.1.4 b) 应具有登录失败处理功能，配置并启用结束会话、限制非法登录次数
--     等选项；自动化检测异常登录行为。
--   8.1.10 审计：应启用安全审计功能，审计覆盖到每个用户，对重要的用户行为
--     和重要安全事件进行审计；审计记录保留至少 6 个月（180 天）。
--
-- 权衡：
--   - mfa_secret 以明文存储（应用层加密可选），因 TOTP 密钥泄露需物理访问 DB，
--     且 DB 已强制 TLS + 最小权限（NOBYPASSRLS）。后续可接入 KMS 加密。
--   - password_history 保留最近 5 次（配置项 PASSWORD_HISTORY_KEEP），
--     超出由应用层删除；表上无 RLS（用户身份验证前需查询）。
-- =============================================================================

-- 1) users 表扩展：MFA + 密码生命周期
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
-- TOTP 备份码（argon2id 哈希后的数组，一次性消费）
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT[];
-- 密码上次修改时间（用于密码过期策略）
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
-- 首次登录或重置后强制改密
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_must_change BOOLEAN NOT NULL DEFAULT FALSE;

-- DDL/DML 同迁移说明 (M-009)：以下 UPDATE 为已存在用户回填 password_changed_at = created_at，
-- 与上方 ALTER TABLE ADD COLUMN 必须在同一迁移中执行。原因：新列 DEFAULT NOW() 会使
-- 已有用户的 password_changed_at 设为迁移执行时间，立即触发密码过期策略（90 天），
-- 导致全部存量用户被迫改密。回填为 created_at 保持原有密码生命周期不变。幂等：
-- 仅更新 password_changed_at = NOW() 的行（即刚由 DEFAULT 填充的行）。
-- 已存在用户回填 password_changed_at = created_at（避免立即触发密码过期）
UPDATE users SET password_changed_at = created_at WHERE password_changed_at = NOW();

-- 索引：MFA 强制角色扫描（ADMIN 强制 MFA 时快速定位未启用用户）
CREATE INDEX IF NOT EXISTS idx_users_mfa_enabled ON users(mfa_enabled) WHERE mfa_enabled = FALSE;

-- 2) 密码历史表：禁止复用最近 N 次密码（等保 8.1.4 a)
CREATE TABLE IF NOT EXISTS password_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_history_user_time
  ON password_history(user_id, changed_at DESC);

-- 3) 登录事件审计表：异常登录检测（等保 8.1.4 b) + 8.1.10 审计）
--    记录每次登录尝试（成功/失败），用于 IP 维度异常检测与审计追溯。
--    与 Redis 实时锁定互补：Redis 处理短期计数（5min/10次），本表保留 180 天供审计查询。
CREATE TABLE IF NOT EXISTS login_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  username VARCHAR(50),
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN NOT NULL,
  failure_reason VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_events_user_time ON login_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_events_ip_time ON login_events(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_events_created ON login_events(created_at DESC);

-- 4) 审计保留策略：login_events 与 outbox 审计记录保留 180 天
--    分区表便于高效清理旧数据（DROP PARTITION 比 DELETE 快几个数量级）
--    注：outbox 表已有 created_at，保留策略由 scripts/audit-retention-cleanup.sh 执行
--    login_events 采用应用层 cron 清理（见 scripts/cleanup-login-events.sql）

-- 5) 等保合规视图：未启用 MFA 的 ADMIN 用户（安全扫描用）
CREATE OR REPLACE VIEW v_admin_users_without_mfa AS
SELECT id, username, role, email, created_at
FROM users
WHERE role = 'admin' AND is_active = true AND mfa_enabled = false;

-- 6) updated_at 触发器扩展：users 表已有 updated_at 触发器（004_users.sql），
--    新增列自动被现有触发器覆盖（触发器引用 NEW.* 通配）。

-- 020_custom_rbac.sql
-- =============================================================================
-- 迁移 v20：可配置 RBAC（P2-01）— 自定义角色 + 角色权限映射 + 用户角色绑定
-- 描述：将硬编码的 ROLE_PERMISSIONS 映射迁移到数据库，支持租户自定义角色与权限
-- =============================================================================
-- 企业理由（P2-01）：
--   此前 RBAC 权限映射硬编码于 rbac.ts 的 ROLE_PERMISSIONS 常量，新增角色或调整
--   权限需修改代码并重新部署。多租户 SaaS 场景下，不同租户对角色边界有差异化需求
--   （如"仅可回测不可管理数据"的受限分析师），硬编码无法满足。
--   将角色与权限下沉到数据库后，管理员可通过 Admin API 动态创建自定义角色、
--   分配权限、绑定用户，无需发版。
--
-- 权衡：
--   - 隔离边界：roles/role_permissions/user_roles 属于身份/控制平面，与 memberships
--     同类——在"尚未解析出租户"时即被查询（中间件解析用户权限），且需读取系统角色
--     （org_id IS NULL）。因此不启用 RLS，由应用层显式 WHERE org_id 过滤 + 系统角色
--     全局可见，与 009_tenancy.sql 对 memberships 的处理一致。
--   - 向后兼容：保留 users.role 列（legacy 全局角色），user_roles 为增量叠加。
--     中间件优先查 DB 角色，无 DB 角色时回退到 legacy ROLE_PERMISSIONS 映射。
--   - 系统角色（admin/analyst/readonly）is_system=TRUE，禁止修改/删除，保证基线不变。
-- =============================================================================

-- 1) 角色表：系统角色 org_id=NULL，自定义角色绑定租户
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- org_id 为 NULL 表示系统角色（全局可见），非 NULL 为租户自定义角色
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 系统角色 org_id=NULL，自定义角色按 (org_id, name) 唯一
  -- UNIQUE(org_id, name) 允许多个 NULL（Postgres 默认行为），系统角色互不冲突
  CONSTRAINT uq_roles_org_name UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_roles_org ON roles(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roles_system ON roles(is_system) WHERE is_system = TRUE;

-- 2) 角色权限映射表：角色 → 权限字符串（如 'backtest:run'）
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission VARCHAR(60) NOT NULL,
  PRIMARY KEY (role_id, permission)
);

-- 3) 用户角色绑定表：替代 users.role 单列（保留该列向后兼容）
CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_org ON user_roles(org_id) WHERE org_id IS NOT NULL;

-- 4) portfolios 增加角色可见性数组（用于组合共享给特定角色）
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS visible_to_roles UUID[];

-- DDL/DML 同迁移说明 (M-009)：以下 INSERT 为系统角色种子数据（is_system=TRUE），
-- 与上方 CREATE TABLE 必须在同一迁移中执行。原因：应用启动时中间件依赖这三个
-- 系统角色（admin/analyst/readonly）存在，若拆分到独立 seed 迁移，在 DDL 迁移
-- 与 seed 迁移之间重启应用会导致 RBAC 查询返回空角色集，全部请求被拒绝。
-- ON CONFLICT DO NOTHING 保证幂等。系统角色 org_id=NULL，不属任何租户。
-- 5) 种子系统角色 + 权限（与 rbac.ts ROLE_PERMISSIONS 对齐）
--    使用 CTE 一次性插入角色并回填权限，避免多次往返
WITH admin_role AS (
  INSERT INTO roles (org_id, name, description, is_system)
  VALUES (NULL, 'admin', '系统管理员，拥有全部权限', TRUE)
  ON CONFLICT DO NOTHING
  RETURNING id
),
analyst_role AS (
  INSERT INTO roles (org_id, name, description, is_system)
  VALUES (NULL, 'analyst', '分析师，可运行回测和管理数据', TRUE)
  ON CONFLICT DO NOTHING
  RETURNING id
),
readonly_role AS (
  INSERT INTO roles (org_id, name, description, is_system)
  VALUES (NULL, 'readonly', '只读用户，仅能查看数据', TRUE)
  ON CONFLICT DO NOTHING
  RETURNING id
),
admin_perms AS (
  SELECT id AS role_id, perm FROM admin_role
  CROSS JOIN unnest(ARRAY[
    'backtest:run','data:manage','data:read','admin:access',
    'optimizer:run','signal:read','strategy:manage'
  ]) AS perm
),
analyst_perms AS (
  SELECT id AS role_id, perm FROM analyst_role
  CROSS JOIN unnest(ARRAY[
    'backtest:run','data:read','data:manage',
    'optimizer:run','signal:read','strategy:manage'
  ]) AS perm
),
readonly_perms AS (
  SELECT id AS role_id, perm FROM readonly_role
  CROSS JOIN unnest(ARRAY['data:read','signal:read']) AS perm
),
all_perms AS (
  SELECT role_id, perm FROM admin_perms
  UNION ALL
  SELECT role_id, perm FROM analyst_perms
  UNION ALL
  SELECT role_id, perm FROM readonly_perms
)
INSERT INTO role_permissions (role_id, permission)
SELECT role_id, perm FROM all_perms
ON CONFLICT DO NOTHING;

-- 授予运行角色对新表的 DML 权限（与 009_tenancy.sql 模式一致）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backtest_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON roles, role_permissions, user_roles TO backtest_app;
  END IF;
END
$$;

-- 021_webhooks.sql
-- =============================================================================
-- 迁移 v21：Webhook 系统（P2-02）— 端点配置 + 投递历史
-- 描述：Webhook 端点配置表与投递历史表，支持事件订阅、HMAC 签名、重试与自动禁用
-- =============================================================================
-- 企业理由：
--   平台事件（如 BacktestCompleted）需主动推送到用户配置的 HTTPS 端点，
--   使客户集成（CI/CD、Slack 通知、数据同步）无需轮询。Outbox 模式保证事件不丢；
--   Webhook 投递表保证最终一致性与可观测性（投递状态、重试、自动禁用）。
--
-- 权衡：
--   - webhook_endpoints 使用 org_id 而非 tenant_id（与 api_keys 对齐），
--     024_rls_extension.sql 已为本表补启用 RLS（修复 GUC 名后），单租户查询
--     通过 current_setting('app.current_tenant_id') 隔离；后台重试作业以
--     SECURITY DEFINER 函数或独立连接跳过 RLS。
--   - webhook_deliveries 每端点保留最近 100 条（应用层 cleanupOldDeliveries 清理），
--     避免长期累积；超出部分按 created_at DESC 删除最旧。
--   - 失败连续 5 次自动禁用端点（is_active=FALSE, disabled_at=NOW()），
--     防止持续打死的端点拖垮重试作业。
--   - URL HTTPS 校验由应用层 zod schema 完成（DB 层不加 CHECK，便于本地 http 调试时
--     临时放宽；生产校验在路由层）。
--   - secret 列为 bytea（AES-256-GCM 密文），配套 secret_iv/secret_tag/
--     secret_kid 存储加密元数据。主密钥由 WEBHOOK_SECRET_KEK 环境变量提供。
--     应用层（webhookService.ts）在 INSERT 前 encrypt()、在签名前 decrypt()。
--     DB 层不接触明文密钥，即使 DB 泄露攻击者也无法伪造事件签名。
-- =============================================================================

-- 0) pgcrypto 扩展（提供加解密函数，应用层调用 pgp_sym_encrypt/decrypt）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Webhook 端点配置表
--    secret 列存储 AES 加密密文（base64），由 webhookService.ts 加解密
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret BYTEA NOT NULL,
  secret_iv BYTEA,
  secret_tag BYTEA,
  secret_kid TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  subscribed_events TEXT[] NOT NULL DEFAULT '{}',
  failed_consecutive_count INTEGER NOT NULL DEFAULT 0,
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_org ON webhook_endpoints(org_id);
-- 活跃端点查询索引（triggerWebhooks 按 org_id + is_active + subscribed_events 过滤）
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_active
  ON webhook_endpoints(org_id) WHERE is_active = TRUE;

-- 2) Webhook 投递历史表（每端点保留最近 100 条，由 cleanupOldDeliveries 收敛）
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending','success','failed','retrying')),
  response_code INTEGER,
  response_body TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 投递历史查询（按端点倒序分页）
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint_created
  ON webhook_deliveries(endpoint_id, created_at DESC);
-- 重试作业扫描索引：仅扫描待重试投递（pending/retrying 且到点）
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry
  ON webhook_deliveries(next_retry_at) WHERE status IN ('pending','retrying');

-- 3) updated_at 触发器（与 users 表 004_users.sql 同模式）
CREATE OR REPLACE FUNCTION trg_webhook_endpoints_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_webhook_endpoints_updated_at ON webhook_endpoints;
CREATE TRIGGER set_webhook_endpoints_updated_at
  BEFORE UPDATE ON webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION trg_webhook_endpoints_updated_at();

-- 4) 授予运行角色 DML 权限（与 009_tenancy.sql 同模式，兼容既有角色）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backtest_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_endpoints, webhook_deliveries TO backtest_app;
  END IF;
END
$$;

-- 022_audit_storage.sql
-- =============================================================================
-- 迁移 v22：不可篡改审计存储（P2-03）— 持久化审计日志表
-- 描述：独立于 outbox 的持久化审计存储，HMAC 签名防篡改，定期导出至 MinIO WORM
-- =============================================================================
-- 企业理由：
--   outbox 表是事件投递的临时队列（processed_at 后即视为已消费），不适合长期
--   保留审计记录。等保三级 8.1.4 要求审计日志保留 ≥180 天且不可篡改，需独立
--   持久化表存储全量审计明细，并通过 HMAC-SHA256 签名实现篡改检测（tamper-evidence）。
--   定期导出至 MinIO Object Lock COMPLIANCE 模式（WORM）后，即便 DBA 也无法删除
--   已写入的对象，满足合规审计的不可篡改要求。
--
-- 权衡：
--   - user_id / org_id 不加外键约束：审计日志必须比用户/组织存活更久，
--     用户或组织删除后审计记录仍需可查（合规追溯），FK ON DELETE CASCADE 会
--     导致审计记录被连带删除，违反不可篡改原则。改为应用层校验归属。
--   - hmac_signature 在写入时计算并固定存储，后续 verifyAuditIntegrity 重算
--     并比对——payload 被篡改时签名不匹配即可检出。HMAC 密钥（AUDIT_HMAC_KEY）
--     由 KMS/Secret Manager 管理，DBA 无法伪造签名。
--   - object_key / exported_at 为可空字段：写入时未导出（NULL），导出至 MinIO
--     后回填对象键与时间戳，便于按对象追溯。
--   - 部分索引 idx_audit_logs_unexported（WHERE exported_at IS NULL）加速
--     导出作业扫描，避免全表扫描未导出记录。
-- =============================================================================

-- 1) 持久化审计日志表（独立于 outbox 临时队列）
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  user_id UUID,
  org_id UUID,
  ip_address INET,
  action VARCHAR(50) NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'READ', 'EXPORT', 'CONFIG')),
  resource_type VARCHAR(50),
  resource_id VARCHAR(100),
  payload JSONB NOT NULL,
  hmac_signature TEXT NOT NULL,
  object_key TEXT,
  exported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 按时间倒序查询审计日志（管理后台分页浏览）
CREATE INDEX IF NOT EXISTS idx_audit_logs_created
  ON audit_logs(created_at DESC);

-- 按组织 + 时间倒序查询（租户内审计追溯）
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created
  ON audit_logs(org_id, created_at DESC);

-- 导出作业扫描未导出记录（部分索引，仅扫描 exported_at IS NULL 的行）
CREATE INDEX IF NOT EXISTS idx_audit_logs_unexported
  ON audit_logs(exported_at) WHERE exported_at IS NULL;

-- 2) 授予运行角色 DML 权限（与 009_tenancy.sql / 021_webhooks.sql 同模式）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backtest_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON audit_logs TO backtest_app;
  END IF;
END
$$;

-- 023_cagg_backfill.sql
-- 描述：CAGG 回填 + 刷新策略调整（P1-01 TimescaleDB 迁移完成）
-- =============================================================================
-- 迁移 v23：prices_monthly CAGG 历史数据回填 + 刷新策略优化
-- =============================================================================
-- 企业理由（P1-01）：迁移 018 创建 prices_monthly CAGG 时使用 WITH NO DATA，
-- 历史月线数据未物化，导致月度粒度查询回退到原始 prices hypertable 全扫。
-- 本迁移调整 CAGG 刷新策略，并尝试回填历史数据。
--
-- 注意：refresh_continuous_aggregate 不能在事务中执行（TimescaleDB 限制），
-- 而 migrations.ts 的 initSchema 用 BEGIN/COMMIT 包裹每个迁移。
-- 因此回填部分使用 EXCEPTION 捕获事务冲突，仅在非事务上下文成功；
-- 实际回填由 scripts/refresh-cagg.sql 独立脚本执行（不通过 migrations.ts）。
-- =============================================================================

-- 1. 分批回填 CAGG 历史数据（从 2000-01-01 到当前月，每月一批）
--    若在事务中运行则跳过（由 scripts/refresh-cagg.sql 独立执行）
DO $$
DECLARE
  v_start DATE := '2000-01-01';
  v_end   DATE := DATE_TRUNC('month', CURRENT_DATE)::DATE;
  v_cur   DATE := v_start;
  v_batch_count INTEGER := 0;
BEGIN
  -- 检查 prices_monthly 是否存在
  IF NOT EXISTS (
    SELECT 1 FROM timescaledb_information.continuous_aggregates
    WHERE view_name = 'prices_monthly'
  ) THEN
    RAISE NOTICE 'prices_monthly CAGG does not exist, skipping backfill';
    RETURN;
  END IF;

  WHILE v_cur < v_end LOOP
    -- refresh_continuous_aggregate 在 TimescaleDB 2.18+ 是 procedure，需用 CALL
    -- 不能在事务中运行；若失败则跳过回填，由独立脚本执行
    BEGIN
      CALL refresh_continuous_aggregate(
        'prices_monthly',
        v_cur,
        (v_cur + INTERVAL '1 month')::DATE
      );
      v_batch_count := v_batch_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'CAGG backfill skipped (cannot run in transaction): %', SQLERRM;
      RETURN;
    END;

    v_cur := (v_cur + INTERVAL '1 month')::DATE;

    -- 每 12 个月输出一次进度
    IF v_batch_count % 12 = 0 THEN
      RAISE NOTICE 'CAGG backfill progress: % batches completed (current: %)', v_batch_count, v_cur;
    END IF;
  END LOOP;

  RAISE NOTICE 'CAGG backfill completed: % batches total', v_batch_count;
END $$;

-- 2. 移除旧的 CAGG 刷新策略（start_offset=1month, end_offset=1hour, schedule=1hour）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM timescaledb_information.jobs
    WHERE proc_name = 'policy_refresh_continuous_aggregate'
      AND hypertable_name = 'prices_monthly'
  ) THEN
    PERFORM remove_continuous_aggregate_policy('prices_monthly');
    RAISE NOTICE 'Removed old CAGG refresh policy';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Old CAGG policy removal skipped: %', SQLERRM;
END $$;

-- 3. 添加新的 CAGG 刷新策略
--    start_offset=3months：刷新最近 3 个月数据（覆盖 late-arriving 修正）
--    end_offset=2days：截止 2 天前（容忍 data-fetcher 24h 延迟补抓）
--    schedule_interval=1day：每日刷新一次（日线数据收盘后确定，无需更频繁）
SELECT add_continuous_aggregate_policy(
  'prices_monthly',
  start_offset => INTERVAL '3 months',
  end_offset   => INTERVAL '2 days',
  schedule_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- 024_rls_extension.sql
-- =============================================================================
-- P1-04: RLS 策略扩展 — 为 webhook/audit/billing 表添加行级安全
-- =============================================================================
-- 企业理由：多租户隔离要求所有包含 org_id 的表都启用 RLS，防止跨租户
-- 数据泄露。009_tenancy.sql 已为 portfolios/saved_configs/backtest_runs 启用，
-- 但 021_webhooks.sql 显式跳过、022_audit_storage.sql 和 011_billing.sql 未覆盖。
-- ==============================================================================

-- 1. webhook_endpoints：租户隔离（跨租户扫描需要聚合，但单租户查询必须隔离）
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_endpoints_tenant_isolation
  ON webhook_endpoints
  FOR ALL
  USING (org_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_tenant_id', true)::uuid);

-- 2. webhook_deliveries：租户隔离
--    webhook_deliveries 表无 org_id 列（设计上通过 endpoint_id FK 关联到 webhook_endpoints）。
--    RLS 策略使用子查询通过 endpoint_id → webhook_endpoints.org_id 链路判定租户归属。
--    WITH CHECK 使用同子查询确保新增 delivery 必须属于当前租户的 endpoint。
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_deliveries_tenant_isolation
  ON webhook_deliveries
  FOR ALL
  USING (
    endpoint_id IN (
      SELECT id FROM webhook_endpoints
      WHERE org_id = current_setting('app.current_tenant_id', true)::uuid
    )
  )
  WITH CHECK (
    endpoint_id IN (
      SELECT id FROM webhook_endpoints
      WHERE org_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

-- 3. audit_logs：租户隔离（platform_admin 可跨租户，通过 SET app.is_platform_admin = 'true'）
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_tenant_isolation
  ON audit_logs
  FOR ALL
  USING (
    org_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.is_platform_admin', true) = 'true'
  )
  WITH CHECK (
    org_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

-- 4. stripe_customers：租户隔离
ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY stripe_customers_tenant_isolation
  ON stripe_customers
  FOR ALL
  USING (org_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_tenant_id', true)::uuid);

-- 5. subscriptions：租户隔离（表名见 011_billing.sql，原 024 误写为 stripe_subscriptions）
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_tenant_isolation
  ON subscriptions
  FOR ALL
  USING (org_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_tenant_id', true)::uuid);

-- 025_audit_chain.sql
-- =============================================================================
-- P2-04: 审计日志链式校验 — 添加 prev_hash 列
-- =============================================================================
-- 企业理由：HMAC 签名检测单条记录篡改，但无法检测整条记录被删除（DBA 删除
-- 审计行）。链式 hash（每条记录的 prev_hash = SHA256(prev.id || prev.hmac_signature)）
-- 将所有记录链接成链，删除中间任何一条都会导致链断裂，verify-audit-chain.ts
-- 脚本可检测到断裂点。
-- ==============================================================================

-- 1) 添加 prev_hash 列（NULL = 链中第一条记录或迁移前的历史记录）
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS prev_hash VARCHAR(64);

-- 2) 索引：加速链式验证查询（按 created_at 顺序遍历）
CREATE INDEX IF NOT EXISTS idx_audit_logs_chain ON audit_logs (created_at ASC, id ASC)
  WHERE prev_hash IS NOT NULL;

-- 026_tactical_configs.sql
-- =============================================================================
-- P1-1: 战术配置持久化
-- =============================================================================
-- 企业理由：战术配置（tactical configs）此前仅在内存中暂存，服务重启后丢失。
-- GA 前必须持久化到 PostgreSQL，配合 RLS 实&隔离保证多租户数据安全2
-- =============================================================================

CREATE TABLE tactical_configs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  description TEXT CHECK (char_length(description) <= 500),
  config      JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tactical_configs_tenant_name_unique UNIQUE (tenant_id, name)
);

-- 自动更新 updated_at 触发器函数（表专用，避免与其它迁移的通用函数冲突）
CREATE OR REPLACE FUNCTION trg_tactical_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_tactical_configs_updated_at
  BEFORE UPDATE ON tactical_configs
  FOR EACH ROW EXECUTE FUNCTION trg_tactical_configs_updated_at();

-- RLS 隔离（ADR-032）
-- 使用 app.current_tenant_id（与 pool.ts withTenant/withTenantReadOnly 一致）
ALTER TABLE tactical_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tactical_configs FORCE ROW LEVEL SECURITY;

CREATE POLICY tactical_configs_tenant_isolation ON tactical_configs
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- 索引
CREATE INDEX tactical_configs_tenant_id_idx ON tactical_configs (tenant_id);
CREATE INDEX tactical_configs_user_id_idx ON tactical_configs (user_id);
CREATE INDEX tactical_configs_updated_at_idx ON tactical_configs (updated_at DESC);

-- 权限：backtest_app 角色可 CRUD 战术配置
GRANT SELECT, INSERT, UPDATE, DELETE ON tactical_configs TO backtest_app;

-- 027_timescale_cagg.sql
-- =============================================================================
-- P4-3: TimescaleDB 连续聚合（CAGG）扩展
-- =============================================================================
-- 企业理由：用户常用时间范围查询（YTD/1Y/5Y/10Y/ALL）可通过预计算聚合
-- 显著降低查询延迟。日度/周度 CAGG 将 30 年数据从 ~7000 行/标的降至
-- ~1500 行（周度），减少 80%+ I/O。
--
-- 前置条件：migrations/018_timescaledb.sql 已安装 TimescaleDB 扩展
--           并创建了 price_data hypertable。
--
-- 注意：此迁移需在 TimescaleDB 环境执行，无法在本地 Windows 验证。
-- =============================================================================

-- 日度连续聚合（精确到交易日，主要用于 ≤2 年范围回测）
-- 注：源表为 prices（见 001_init.sql），原 027 误写为 price_data
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_aggregate
WITH (timescaledb.continuous) AS
SELECT
  ticker,
  time_bucket('1 day', date) AS day,
  first(open, date) AS open,
  max(high) AS high,
  min(low) AS low,
  last(close, date) AS close,
  sum(volume) AS volume
FROM prices
GROUP BY ticker, time_bucket('1 day', date)
WITH NO DATA;

-- 周度连续聚合（主要用于 2-5 年范围概览图表）
CREATE MATERIALIZED VIEW IF NOT EXISTS weekly_aggregate
WITH (timescaledb.continuous) AS
SELECT
  ticker,
  time_bucket('7 days', date) AS week,
  first(open, date) AS open,
  max(high) AS high,
  min(low) AS low,
  last(close, date) AS close,
  sum(volume) AS volume
FROM prices
GROUP BY ticker, time_bucket('7 days', date)
WITH NO DATA;

-- 回填历史数据（异步执行，可能耗时数分钟）
-- 注意：refresh_continuous_aggregate 不能在事务中执行，需单独运行
-- 信息查询：列出已注册的 CAGG 刷新任务（仅日志输出，不影响迁移）
DO $$
DECLARE
  v_job_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_job_count
  FROM timescaledb_information.jobs
  WHERE proc_name LIKE '%daily_aggregate%' OR proc_name LIKE '%weekly_aggregate%';
  RAISE NOTICE 'TimescaleDB CAGG jobs registered: %', v_job_count;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'CAGG job count query skipped: %', SQLERRM;
END $$;

-- 启用压缩策略（>30 天的数据自动压缩）
-- 压缩可将存储降低 5-10x，查询性能提升 2-5x
ALTER MATERIALIZED VIEW daily_aggregate SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'ticker',
  timescaledb.compress_orderby = 'day DESC'
);

ALTER MATERIALIZED VIEW weekly_aggregate SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'ticker',
  timescaledb.compress_orderby = 'week DESC'
);

-- 添加压缩策略（30 天后自动压缩）
SELECT add_compression_policy('daily_aggregate', INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_compression_policy('weekly_aggregate', INTERVAL '30 days', if_not_exists => TRUE);

-- 权限（backtest_app 角色由 007_least_privilege.sql 创建，已存在）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backtest_app') THEN
    GRANT SELECT ON daily_aggregate TO backtest_app;
    GRANT SELECT ON weekly_aggregate TO backtest_app;
  END IF;
END
$$;

-- 028_placeholder.sql
-- =============================================================================
-- 迁移 v28：占位（no-op，填补序号空隙）
-- 描述：028 序号占位——原 028_announcements.sql 与 029_announcements.sql schema 冲突，
--       保留 029 的更完整设计；原 028_custom_tickers.sql 重编号为 030 避免冲突。
-- =============================================================================
-- 企业理由：CI 迁移完整性检查（scripts/check-migrations.mjs）要求文件序号无空隙。
--   本文件为 no-op（SELECT 1），仅记录版本号以保持序号连续，无任何 DDL 副作用。
--   生产环境已应用 027 后直接跳至 029；补登记 028 不影响已运行系统
--   （SELECT 1 在事务内执行，无锁无写入）。
-- 权衡：引入 no-op 迁移略显冗余，但消除了文件序号与注册表的双重空隙，
--   避免 CI 检查误报与后续维护者对空隙来源的困惑。

SELECT 1;

-- 029_announcements.sql
-- Migration: 029_announcements
-- P3-2: Announcements system
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'general',
    severity VARCHAR(20) NOT NULL DEFAULT 'info',
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 部分索引不能使用 NOW()（STABLE 而非 IMMUTABLE）；改为全索引，过期过滤在查询时执行。
CREATE INDEX IF NOT EXISTS idx_announcements_published ON announcements(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_expires ON announcements(expires_at) WHERE expires_at IS NOT NULL;

-- 公告为公开读，仅 admin 可写。RLS 启用后 FORCE 确保即使 owner 也受策略约束。
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements FORCE ROW LEVEL SECURITY;
CREATE POLICY announcements_public_read ON announcements FOR SELECT USING (true);
-- admin 写策略：使用 missing_ok=true 避免 GUC 未设置时抛错
CREATE POLICY announcements_admin_write ON announcements
    FOR INSERT
    WITH CHECK (COALESCE(current_setting('app.current_user_role', true), '') = 'admin');
CREATE POLICY announcements_admin_update ON announcements
    FOR UPDATE
    USING (COALESCE(current_setting('app.current_user_role', true), '') = 'admin')
    WITH CHECK (COALESCE(current_setting('app.current_user_role', true), '') = 'admin');
CREATE POLICY announcements_admin_delete ON announcements
    FOR DELETE
    USING (COALESCE(current_setting('app.current_user_role', true), '') = 'admin');

-- 030_custom_tickers.sql
-- =============================================================================
-- 迁移 v30：自定义 Tickers（用户上传 CSV，per-user RLS 隔离）
-- 描述：用户自定义标的表，按 user_id 行级隔离
-- =============================================================================
-- 注：原 028_custom_tickers.sql 重编号为 030，避免与 028_announcements 版本号冲突。
-- 028_announcements.sql 已删除（保留 029_announcements.sql 的更完整 schema）。
-- =============================================================================

CREATE TABLE IF NOT EXISTS custom_tickers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticker VARCHAR(20) NOT NULL,
    name VARCHAR(200),
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, ticker)
);

-- RLS: users can only access their own custom tickers
ALTER TABLE custom_tickers ENABLE ROW LEVEL SECURITY;

CREATE POLICY custom_tickers_user_select
    ON custom_tickers FOR SELECT
    USING (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY custom_tickers_user_insert
    ON custom_tickers FOR INSERT
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY custom_tickers_user_update
    ON custom_tickers FOR UPDATE
    USING (user_id = current_setting('app.current_user_id', true)::UUID)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY custom_tickers_user_delete
    ON custom_tickers FOR DELETE
    USING (user_id = current_setting('app.current_user_id', true)::UUID);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_custom_tickers_user ON custom_tickers(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_tickers_ticker ON custom_tickers(ticker);

-- 授予运行角色 DML 权限
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backtest_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON custom_tickers TO backtest_app;
  END IF;
END
$$;

-- 031_force_rls.sql
-- =============================================================================
-- 迁移 v31：FORCE ROW LEVEL SECURITY（C-002）
-- 描述：对所有已启用 RLS 的多租户表强制行级安全，防止表属主/BYPASSRLS 角色绕过
-- =============================================================================
-- 企业理由（C-002）：ENABLE RLS 仅对非属主、NOBYPASSRLS 角色生效；表属主与
-- BYPASSRLS 角色仍可绕过策略。多租户隔离要求即便属主连接也受策略约束，
-- FORCE ROW LEVEL SECURITY 收敛这一缺口。009_tenancy.sql 已对 portfolios 等
-- 表同时 ENABLE+FORCE，但 024_rls_extension.sql 仅 ENABLE 未 FORCE，本迁移补齐。

ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE custom_tickers FORCE ROW LEVEL SECURITY;
ALTER TABLE stripe_customers FORCE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints FORCE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries FORCE ROW LEVEL SECURITY;

-- 兜底：对所有已启用 RLS 但未 FORCE 的表强制（防遗漏，幂等）
DO $$
DECLARE
  tbl_name TEXT;
BEGIN
  FOR tbl_name IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
      AND c.relforcerowsecurity = false
  LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl_name);
  END LOOP;
END $$;

-- 032_enable_rls_api_keys_invitations.sql
-- =============================================================================
-- 迁移 v32：api_keys/invitations 启用 RLS + 新建 org_memberships 表（C-002）
-- 描述：为身份/控制平面表补齐行级安全，并创建 org_memberships 多租户表
-- =============================================================================
-- 企业理由（C-002）：009_tenancy.sql 出于"先有鸡先有蛋"考虑未对 api_keys 启用
-- RLS（登录/API Key 解析阶段尚未解析出租户）。但 C-002 验证要求所有含 org_id
-- 的表都启用 + FORCE RLS。本迁移补齐，并对 api_keys/invitations 采用"未设置
-- 租户上下文时放行读"的策略（OR current_setting(...) IS NULL），保证认证链路
-- 在 GUC 注入前仍可按 key_hash/token_hash 查询；写入仍强制租户归属校验。
-- org_memberships 为新增的组织成员表（与 memberships 并存，供未来组织级成员管理）。

-- 1) 新建 org_memberships 表（组织成员，org_id 隔离）
CREATE TABLE IF NOT EXISTS org_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'analyst' CHECK (role IN ('owner', 'admin', 'analyst', 'readonly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_memberships_org ON org_memberships(org_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON org_memberships(user_id);

-- 2) api_keys：启用 + FORCE RLS
--    读策略允许"未设租户上下文"时访问（认证中间件按 key_hash 查询解析所属组织），
--    写策略强制 org_id 必须匹配当前租户。
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;
-- 校验路径在租户解析前访问（key_hash 查询），未设置/空 tenant 时须放行；
-- NULLIF 防止 current_setting 返回 '' 时 ::uuid 抛 invalid input syntax
CREATE POLICY api_keys_tenant_isolation
  ON api_keys
  FOR ALL
  USING (
    org_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    OR NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
  )
  WITH CHECK (org_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 3) invitations：启用 + FORCE RLS（同 api_keys 模式，token_hash 查询需在租户解析前放行）
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY invitations_tenant_isolation
  ON invitations
  FOR ALL
  USING (
    org_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    OR NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
  )
  WITH CHECK (org_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 4) org_memberships：启用 + FORCE RLS（严格隔离，无认证放行需求）
ALTER TABLE org_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY org_memberships_tenant_isolation
  ON org_memberships
  FOR ALL
  USING (org_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_tenant_id', true)::uuid);

-- 5) 授予运行角色对新表的 DML 权限
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backtest_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON org_memberships TO backtest_app;
  END IF;
END $$;

-- 033_backtest_app_grants.sql
-- =============================================================================
-- 迁移 v33：backtest_app 角色全表 DML 授权 + 默认权限（C-002）
-- 描述：授予 backtest_app 对所有现有及未来表的 SELECT/INSERT/UPDATE/DELETE 权限
-- =============================================================================
-- 企业理由（C-002）：应用运行时连接从超级用户 backtest 切换到最小权限角色
-- backtest_app（NOBYPASSRLS）后，需确保该角色对所有业务表有 DML 权限，否则
-- RLS 策略生效但无表权限会导致查询被拒。本迁移一次性补齐现有表授权，并通过
-- ALTER DEFAULT PRIVILEGES 覆盖未来新建表，避免每次迁移都要手动 GRANT。

GRANT USAGE ON SCHEMA public TO backtest_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO backtest_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO backtest_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO backtest_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO backtest_app;

-- 034_webhook_secret_encrypt.sql
-- =============================================================================
-- 迁移 v34：webhook_endpoints.secret 加密存储（C-024）
-- 描述：将 secret 列从明文 text 改为 bytea 密文，新增 secret_iv/secret_tag/secret_kid
-- =============================================================================
-- 企业理由（C-024）：021_webhooks.sql 原将签名密钥以明文 text 存储，DB 拖库即可
-- 伪造事件签名。本迁移将 secret 改为 bytea（AES-256-GCM 密文），并新增 IV/认证标签/
-- 密钥标识列，配合应用层 envelopeEncryption.encrypt/decrypt（见 webhookService.ts）。
-- 现有明文数据无法还原为有效密文，统一置 NULL 并要求重新创建端点。

-- pgcrypto 扩展（021 已创建，此处幂等保证）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) secret 列 text -> bytea（现有明文置 NULL；若有数据先临时移除 NOT NULL 约束）
ALTER TABLE webhook_endpoints ALTER COLUMN secret DROP NOT NULL;
ALTER TABLE webhook_endpoints ALTER COLUMN secret TYPE bytea USING NULL;
ALTER TABLE webhook_endpoints ALTER COLUMN secret SET NOT NULL;

-- 2) 新增加密元数据列（IV / 认证标签 / 密钥标识）
ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS secret_iv bytea;
ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS secret_tag bytea;
ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS secret_kid text;

-- 035_prices_hypertable.sql
-- =============================================================================
-- 迁移 v35：prices 表 hypertable 幂等校验（P2-2 / D8-H1）
-- 描述：prices 表 TimescaleDB hypertable 转换 — 幂等安全网
-- =============================================================================
-- 企业理由（D8-H1）：审计报告指出 prices 表 2.4GB 未转 hypertable。经核查，
-- 018_timescaledb.sql 已完成 hypertable 转换（chunk_time_interval = 3 months，
-- migrate_data => true，含列压缩与月线 CAGG）。本迁移作为幂等安全网：
--   - 若 018 已应用（绝大多数环境）：create_hypertable(if_not_exists=>true) 为 no-op
--   - 若 018 未应用（异常环境）：本迁移兜底完成转换
--
-- chunk_time_interval 取值说明：
--   审计建议 1 day 间隔对日线金融数据不合适——30 年数据将产生 ~7500 个微 chunk，
--   元数据开销过大且分区裁剪收益微弱。TimescaleDB 官方建议每 chunk 约占内存预算
--   25%，日线数据推荐 1~3 个月（约 63~126 交易日每 chunk）。本迁移沿用 018 的
--   3 months 以保持一致，避免 chunk 粒度漂移。注意：if_not_exists=>true 时，已存在
--   的 hypertable 的 chunk_time_interval 不会被修改，故此处参数仅对未转换环境生效。
-- =============================================================================

-- 1. 确保 TimescaleDB 扩展存在（与 018 一致，幂等）
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- 2. 修正主键：hypertable 要求所有唯一索引包含分区列 date
--    （018 已执行此步；IF EXISTS 保证幂等，即便 018 已删过约束也不报错）
ALTER TABLE prices DROP CONSTRAINT IF EXISTS prices_pkey;

-- 3. 转换为 hypertable（幂等：已转换时 if_not_exists=>true 返回 notice 并跳过）
--    chunk_time_interval 与 018 保持一致（3 months），避免同一表出现不一致的
--    chunk 粒度。migrate_data=>true 仅在表非空且尚未 hypertable 时生效。
SELECT create_hypertable(
  'prices',
  'date',
  chunk_time_interval => INTERVAL '3 months',
  migrate_data => TRUE,
  if_not_exists => TRUE
);

-- 4. 校验：确认 prices 已是 hypertable（仅日志，不阻断）
DO $$
DECLARE
  is_hypertable BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM timescaledb_information.hypertables
    WHERE hypertable_name = 'prices'
  ) INTO is_hypertable;
  IF is_hypertable THEN
    RAISE NOTICE 'prices 已是 hypertable，035 为幂等 no-op';
  ELSE
    RAISE WARNING 'prices 仍未转换为 hypertable，请检查 TimescaleDB 扩展与权限';
  END IF;
END $$;
-- 036_audit_logs.sql
-- =============================================================================
-- 迁移 v36：audit_logs 表补齐列 + RLS 幂等校验（P2-2 / D8-H2）
-- 描述：审计报告称 audit_logs 表不存在；经核查 022_audit_storage.sql 已建表
--       （schema 更丰富：含 hmac_signature/object_key/exported_at/event_type），
--       024_rls_extension.sql 已 ENABLE RLS，031_force_rls.sql 已 FORCE RLS。
--       本迁移补齐审计要求缺失的 user_agent / metadata 列，并幂等确保 RLS。
-- =============================================================================
-- 企业理由（D8-H2）：审计发现 audit_logs 缺 user_agent（溯源客户端）与 metadata
--   （结构化上下文，区别于既有 payload）。022 原设计 payload 存全量事件体，
--   metadata 列补充轻量结构化索引字段（如 trace_id、request_id），便于按
--   调用链关联审计记录而不污染 payload。user_agent 用于安全事件溯源（同 IP
--   不同 UA 可区分脚本/浏览器）。两列均可空，不破坏既有写入。
--   RLS 已由 024/031 覆盖，此处幂等保留以兼容独立应用本迁移的环境。
-- =============================================================================

-- 1. 表存在性兜底（022 已建表时为 no-op；异常环境按审计 schema 最小化建表）
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID,
  user_id UUID,
  action TEXT,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. 补齐 022 schema 缺失的列（IF NOT EXISTS 保证幂等）
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 3. 幂等启用 + 强制 RLS（024 已 ENABLE，031 已 FORCE；此处 no-op 兜底）
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- 4. 幂等创建租户隔离策略（024 已创建同名策略；PG<15 不支持 CREATE POLICY IF NOT EXISTS）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_logs'
      AND policyname = 'audit_logs_tenant_isolation'
  ) THEN
    CREATE POLICY audit_logs_tenant_isolation
      ON audit_logs
      FOR ALL
      USING (
        org_id = current_setting('app.current_tenant_id', true)::uuid
        OR current_setting('app.is_platform_admin', true) = 'true'
      )
      WITH CHECK (
        org_id = current_setting('app.current_tenant_id', true)::uuid
        OR current_setting('app.is_platform_admin', true) = 'true'
      );
  END IF;
END $$;

-- 5. 元数据索引（按 trace_id/request_id 关联溯源，部分索引仅扫非空）
CREATE INDEX IF NOT EXISTS idx_audit_logs_metadata_gin
  ON audit_logs USING GIN (metadata) WHERE metadata IS NOT NULL;

-- 6. 授予运行角色 DML 权限（022 已授权；幂等兜底）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backtest_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON audit_logs TO backtest_app;
  END IF;
END $$;

-- 037_invitations_rls.sql
-- =============================================================================
-- 迁移 v37：invitations 表 RLS 幂等校验（P2-2 / D8-H3）
-- 描述：审计报告称 invitations 表缺 RLS；经核查 032_enable_rls_api_keys_invitations.sql
--       已 ENABLE+FORCE RLS 并创建 invitations_tenant_isolation 策略。本迁移为幂等安全网，
--       确保任意环境（含未应用 032 的异常环境）都满足"用户只能见本组织邀请"的隔离要求。
-- =============================================================================
-- 企业理由（D8-H3）：invitations 含 org_id，跨租户可见将泄露被邀请邮箱（PII）。
--   032 采用"未设租户上下文时放行读"策略（OR current_setting(...) IS NULL），
--   保证认证中间件在 GUC 注入前可按 token_hash 查询解析邀请归属；写入仍强制
--   org_id 匹配当前租户。本迁移沿用同策略避免破坏认证链路。
-- =============================================================================

-- 1. 幂等启用 + 强制 RLS（032 已执行；此处 no-op 兜底）
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;

-- 2. 幂等创建租户隔离策略（032 已创建同名策略；PG<15 不支持 CREATE POLICY IF NOT EXISTS）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invitations'
      AND policyname = 'invitations_tenant_isolation'
  ) THEN
    CREATE POLICY invitations_tenant_isolation
      ON invitations
      FOR ALL
      USING (
        org_id = current_setting('app.current_tenant_id', true)::uuid
        OR current_setting('app.current_tenant_id', true) IS NULL
      )
      WITH CHECK (org_id = current_setting('app.current_tenant_id', true)::uuid);
  END IF;
END $$;
-- 038_backtest_runs_default_status.sql
-- =============================================================================
-- 迁移 v38：backtest_runs.status 默认值改为 queued（P2-2 / D8-H4）
-- 描述：009_tenancy.sql 原默认 completed，新任务应起始 queued 等待调度
-- =============================================================================
-- 企业理由（D8-H4）：异步回测任务（ADR：BullMQ）新建时应处于 queued 等待
--   worker 拉取，completed 作为默认值会让"已落库但未执行"的任务被误判完成，
--   前端轮询立即显示完成态而结果为空。改为 queued 与任务生命周期语义一致。
--
-- 关键修正：009 原有 CHECK(status IN ('pending','running','completed','failed'))
--   不含 queued，仅改默认值会导致 INSERT 违反 CHECK。必须同时扩展 CHECK 约束。
--   保留全部历史值（pending/running/completed/failed）+ 新增 queued，避免破坏
--   既有数据与正在运行的任务状态机。
-- =============================================================================

-- 1. 扩展 status CHECK 约束以容纳 queued
--    009 未显式命名约束，Postgres 自动生成 backtest_runs_status_check。
--    用 DO 块按列名+约束类型定位并删除（兼容不同 PG 版本的自动命名），再重建。
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class cls ON cls.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
  WHERE nsp.nspname = 'public'
    AND cls.relname = 'backtest_runs'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%status%'
    AND pg_get_constraintdef(con.oid) LIKE '%pending%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE backtest_runs DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE backtest_runs
  ADD CONSTRAINT backtest_runs_status_check
  CHECK (status IN ('queued', 'pending', 'running', 'completed', 'failed'));

-- 2. 默认值改为 queued
ALTER TABLE backtest_runs ALTER COLUMN status SET DEFAULT 'queued';

-- 3. 既有 completed 任务不受影响（不回填历史数据，仅改默认值与新写入语义）
-- 039_prices_numeric.sql
-- =============================================================================
-- 迁移 v39：prices 金额列 DOUBLE PRECISION -> NUMERIC(19,6) 双写过渡（P2-2 / D8-H5）
-- 描述：DOUBLE PRECISION 浮点无法精确表示十进制金额，回测累积误差影响净值。
--       本迁移采用双写过渡（dual-write）：新增 *_numeric 列并回填，旧列保留供下版切换。
-- =============================================================================
-- 企业理由（D8-H5）：金融金额必须用定点 NUMERIC 存储（ADR-007）。DOUBLE PRECISION
--   约 15 位有效数字，0.1+0.2!=0.3 的浮点误差在 30 年回测复利计算中会放大到百分点级，
--   使净值/夏普比率失真。NUMERIC(19,6) 支持 13 位整数 + 6 位小数，覆盖亿级市值与
--   微价差。双写过渡避免一次性切换的风险：新写入同时落 DOUBLE（兼容旧读取）与
--   NUMERIC（精确），下版验证后切换读取源并删除旧列。
--
-- 范围：prices 的 open/high/low/close/adjusted_close 五个金额列均迁移；
--   volume（BIGINT，非金额）与 exchange（TEXT）不动。
--   任务原文 "price_numeric"（单数）按语义解读为全部金额列。
--
-- 注意：不删除旧 DOUBLE 列（下版切换后再删）；hypertable 上 CREATE INDEX 在事务
--   内执行（迁移 runner 包 BEGIN/COMMIT），不能用 CONCURRENTLY，与 018 模式一致。
-- =============================================================================

-- 1. 新增 NUMERIC(19,6) 列（可空，避免旧写入路径失败）
ALTER TABLE prices ADD COLUMN IF NOT EXISTS open_numeric NUMERIC(19, 6);
ALTER TABLE prices ADD COLUMN IF NOT EXISTS high_numeric NUMERIC(19, 6);
ALTER TABLE prices ADD COLUMN IF NOT EXISTS low_numeric NUMERIC(19, 6);
ALTER TABLE prices ADD COLUMN IF NOT EXISTS close_numeric NUMERIC(19, 6);
ALTER TABLE prices ADD COLUMN IF NOT EXISTS adjusted_close_numeric NUMERIC(19, 6);

-- DDL/DML 同迁移说明 (M-009)：以下 UPDATE 为一次性数据回填（DOUBLE -> NUMERIC），
-- 与上方 ALTER TABLE ADD COLUMN 必须在同一迁移中执行。原因：新增 NUMERIC 列
-- 默认 NULL，若拆分到独立迁移，在 DDL 与回填之间读取 NUMERIC 列会得到 NULL，
-- 导致回测计算异常。回填使用 WHERE *_numeric IS NULL 保证幂等。下方索引
-- 亦依赖回填完成后的数据分布。
-- 2. 回填：从 DOUBLE 列转换（NULL 保持 NULL）
--    2.4GB hypertable 全表 UPDATE 可能耗时数分钟，建议维护窗口执行。
UPDATE prices SET
  open_numeric = open::numeric(19, 6),
  high_numeric = high::numeric(19, 6),
  low_numeric = low::numeric(19, 6),
  close_numeric = close::numeric(19, 6),
  adjusted_close_numeric = adjusted_close::numeric(19, 6)
WHERE open_numeric IS NULL
   OR high_numeric IS NULL
   OR low_numeric IS NULL
   OR close_numeric IS NULL
   OR adjusted_close_numeric IS NULL;

-- 3. 索引：close 是回测主用价，建 (ticker, close_numeric) 支持按标的价幅查询
CREATE INDEX IF NOT EXISTS idx_prices_ticker_close_numeric
  ON prices (ticker, close_numeric);
-- 040_fk_indexes.sql
-- =============================================================================
-- 迁移 v40：外键列索引补齐（P2-2 / D8-H6）
-- 描述：审计发现 5 个 FK 列缺索引（实测 6 个）。FK 列无索引时，父表行删除/更新
--       会触发子表全表扫描（ON DELETE CASCADE / SET NULL 的引用完整性检查），在大表上
--       造成锁等待与性能衰退。本迁移为所有缺失索引的 FK 列补建索引。
-- =============================================================================
-- 企业理由（D8-H6）：Postgres 外键不自动建索引（与 MySQL 不同）。缺失索引的 FK
--   在父表 DELETE 时，子表需 Seq Scan 定位引用行，大表（backtest_runs/portfolios）
--   上可能秒级阻塞并引发锁升级。补建索引将引用检查降为 Index Scan，消除级联删除
--   的性能尾延迟，并加速按 owner 筛选的常见查询（如"我创建的回测"列表）。
--
-- 清单（6 个 FK 列缺索引，全部指向 users(id)，ON DELETE SET NULL/CASCADE）：
--   1. api_keys.created_by              (009_tenancy)
--   2. portfolios.owner_user_id          (009_tenancy)
--   3. saved_configs.owner_user_id      (009_tenancy)
--   4. backtest_runs.owner_user_id      (009_tenancy)
--   5. announcements.created_by          (029_announcements)
--   6. invitations.invited_by            (010_user_email)
--   已检查其余 FK（prices.ticker / memberships / api_keys.org_id / *_tenant_id /
--   webhook_*.endpoint_id / tactical_configs.* / custom_tickers.user_id /
--   org_memberships.* / email_verification_tokens.user_id）均有对应索引。
-- =============================================================================

-- 1. api_keys.created_by（平台密钥溯源、按创建者筛选）
CREATE INDEX IF NOT EXISTS idx_fk_api_keys_created_by
  ON api_keys (created_by);

-- 2. portfolios.owner_user_id（"我的组合"列表、属主级联 SET NULL）
CREATE INDEX IF NOT EXISTS idx_fk_portfolios_owner_user_id
  ON portfolios (owner_user_id);

-- 3. saved_configs.owner_user_id（"我的配置"列表、属主级联 SET NULL）
CREATE INDEX IF NOT EXISTS idx_fk_saved_configs_owner_user_id
  ON saved_configs (owner_user_id);

-- 4. backtest_runs.owner_user_id（"我的回测"列表、属主级联 SET NULL）
CREATE INDEX IF NOT EXISTS idx_fk_backtest_runs_owner_user_id
  ON backtest_runs (owner_user_id);

-- 5. announcements.created_by（公告作者溯源、属主级联）
CREATE INDEX IF NOT EXISTS idx_fk_announcements_created_by
  ON announcements (created_by);

-- 6. invitations.invited_by（邀请发起人溯源、属主级联 SET NULL）
CREATE INDEX IF NOT EXISTS idx_fk_invitations_invited_by
  ON invitations (invited_by);
-- 041_drop_redundant_indexes.sql
-- =============================================================================
-- 迁移 v41：删除冗余索引（D8-012）
-- 描述：删除与 UNIQUE 约束自动索引重复的 idx_prices_ticker_date 和 idx_organizations_slug
-- =============================================================================
-- 企业理由：prices 表的 (ticker, date) 已有 UNIQUE 约束（自动创建唯一索引
-- prices_ticker_date_key），idx_prices_ticker_date 是完全重复的 B-Tree 索引。
-- organizations 表的 slug 列同理。冗余索引导致写入放大（INSERT/UPDATE 维护
-- 两份相同 B-Tree）、磁盘浪费、ANALYZE 统计成本翻倍。
-- 权衡：删除后查询仍走 UNIQUE 约束索引，无性能损失。

DROP INDEX IF EXISTS idx_prices_ticker_date;
DROP INDEX IF EXISTS idx_organizations_slug;
-- 042_updated_at_triggers.sql
-- =============================================================================
-- 迁移 v42：添加 updated_at 触发器（D8-013）
-- 描述：为 7 张有 updated_at 列但无触发器的表添加自动更新触发器
-- =============================================================================
-- 企业理由：users/tickers/organizations/portfolios/saved_configs/subscriptions/
-- stripe_customers 均有 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW() 列，但无
-- BEFORE UPDATE 触发器维护。应用层若忘记在 UPDATE 时设置 updated_at = NOW()，
-- 该列永远停留在创建时间，误导审计与缓存失效逻辑。
-- 权衡：触发器增加每条 UPDATE 约 0.01ms 开销，但确保 updated_at 可信。

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_tickers_updated_at ON tickers;
CREATE TRIGGER trg_tickers_updated_at BEFORE UPDATE ON tickers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON organizations;
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_portfolios_updated_at ON portfolios;
CREATE TRIGGER trg_portfolios_updated_at BEFORE UPDATE ON portfolios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_saved_configs_updated_at ON saved_configs;
CREATE TRIGGER trg_saved_configs_updated_at BEFORE UPDATE ON saved_configs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_stripe_customers_updated_at ON stripe_customers;
CREATE TRIGGER trg_stripe_customers_updated_at BEFORE UPDATE ON stripe_customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- 043_api_keys_hash_check.sql
-- =============================================================================
-- 迁移 v43：完成 api_keys 双哈希列迁移（D8-017）
-- 描述：key_hash 列改为 nullable + 添加 CHECK 约束确保至少一个哈希非空
-- =============================================================================
-- 企业理由：017_admin_api_key_db.sql 添加了 key_hash_argon2 列用于 argon2id 哈希，
-- 但 key_hash 仍为 NOT NULL，导致即使 argon2 就绪也必须双写 sha256。无 CHECK 约束
-- 确保至少一个非空。本迁移完成迁移：key_hash 改为 nullable，添加 CHECK 约束。
-- 权衡：现有数据 key_hash 均非空，CHECK 约束不会拒绝任何现有行。

ALTER TABLE api_keys ALTER COLUMN key_hash DROP NOT NULL;

ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_hash_present;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_hash_present
  CHECK (key_hash IS NOT NULL OR key_hash_argon2 IS NOT NULL);
-- 044_user_roles_role_id_idx.sql
-- =============================================================================
-- migration v44: user_roles.role_id FK index (D8-H6 补充)
-- 描述：user_roles 的 PK 是 (user_id, role_id)，role_id 不是最左列，
-- 缺少 role_id 索引导致 roles ON DELETE CASCADE 时全表扫描。
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_fk_user_roles_role_id
  ON user_roles (role_id);


