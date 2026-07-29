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
