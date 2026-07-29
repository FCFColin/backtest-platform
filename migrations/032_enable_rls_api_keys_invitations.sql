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
CREATE POLICY api_keys_tenant_isolation
  ON api_keys
  FOR ALL
  USING (
    org_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.current_tenant_id', true) IS NULL
  )
  WITH CHECK (org_id = current_setting('app.current_tenant_id', true)::uuid);

-- 3) invitations：启用 + FORCE RLS（同 api_keys 模式，token_hash 查询需在租户解析前放行）
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY invitations_tenant_isolation
  ON invitations
  FOR ALL
  USING (
    org_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.current_tenant_id', true) IS NULL
  )
  WITH CHECK (org_id = current_setting('app.current_tenant_id', true)::uuid);

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
