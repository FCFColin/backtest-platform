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
