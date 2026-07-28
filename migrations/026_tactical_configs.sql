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
