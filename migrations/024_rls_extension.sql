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
  USING (org_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.tenant_id', true)::uuid);

-- 2. webhook_deliveries：租户隔离
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_deliveries_tenant_isolation
  ON webhook_deliveries
  FOR ALL
  USING (org_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.tenant_id', true)::uuid);

-- 3. audit_logs：租户隔离（platform_admin 可跨租户，通过 SET app.is_platform_admin = 'true'）
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_tenant_isolation
  ON audit_logs
  FOR ALL
  USING (
    org_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_platform_admin', true) = 'true'
  )
  WITH CHECK (
    org_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

-- 4. stripe_customers：租户隔离
ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY stripe_customers_tenant_isolation
  ON stripe_customers
  FOR ALL
  USING (org_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.tenant_id', true)::uuid);

-- 5. stripe_subscriptions：租户隔离
ALTER TABLE stripe_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY stripe_subscriptions_tenant_isolation
  ON stripe_subscriptions
  FOR ALL
  USING (org_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.tenant_id', true)::uuid);
