-- 024_rls_extension DOWN: 移除 RLS 策略

-- 1. webhook_endpoints
DROP POLICY IF EXISTS webhook_endpoints_tenant_isolation ON webhook_endpoints;
ALTER TABLE webhook_endpoints DISABLE ROW LEVEL SECURITY;

-- 2. webhook_deliveries
DROP POLICY IF EXISTS webhook_deliveries_tenant_isolation ON webhook_deliveries;
ALTER TABLE webhook_deliveries DISABLE ROW LEVEL SECURITY;

-- 3. audit_logs
DROP POLICY IF EXISTS audit_logs_tenant_isolation ON audit_logs;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;

-- 4. stripe_customers
DROP POLICY IF EXISTS stripe_customers_tenant_isolation ON stripe_customers;
ALTER TABLE stripe_customers DISABLE ROW LEVEL SECURITY;

-- 5. stripe_subscriptions
DROP POLICY IF EXISTS stripe_subscriptions_tenant_isolation ON stripe_subscriptions;
ALTER TABLE stripe_subscriptions DISABLE ROW LEVEL SECURITY;
