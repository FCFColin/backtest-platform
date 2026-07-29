-- =============================================================================
-- 回滚迁移 v32：移除 api_keys/invitations RLS 策略并删除 org_memberships 表
-- 描述：回滚 v32
-- =============================================================================

DROP POLICY IF EXISTS org_memberships_tenant_isolation ON org_memberships;
DROP POLICY IF EXISTS invitations_tenant_isolation ON invitations;
DROP POLICY IF EXISTS api_keys_tenant_isolation ON api_keys;

ALTER TABLE org_memberships NO FORCE ROW LEVEL SECURITY;
ALTER TABLE org_memberships DISABLE ROW LEVEL SECURITY;
ALTER TABLE invitations NO FORCE ROW LEVEL SECURITY;
ALTER TABLE invitations DISABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys NO FORCE ROW LEVEL SECURITY;
ALTER TABLE api_keys DISABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS org_memberships;
