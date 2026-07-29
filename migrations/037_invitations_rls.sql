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