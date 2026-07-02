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
