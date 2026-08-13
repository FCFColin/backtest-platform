-- 平台旁路（ADR-009）：break-glass key 轮换/吊销、Stripe webhook 等无租户运维路径会被 RLS WITH CHECK 拦截。
-- api_keys/invitations 的 USING 侧已有 NULLIF 逃生（GUC 未设时全行可见），仅写入侧补平台旁路；
-- stripe_customers 全策略补平台旁路。
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['api_keys', 'invitations'] LOOP
    EXECUTE format('DROP POLICY %s_tenant_isolation ON %s', t, t);
    EXECUTE format($f$CREATE POLICY %s_tenant_isolation ON %s FOR ALL USING (org_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid OR NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL) WITH CHECK (org_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid OR current_setting('app.is_platform_admin', true) = 'true')$f$, t, t);
  END LOOP;
END $$;

DROP POLICY stripe_customers_tenant_isolation ON stripe_customers;
CREATE POLICY stripe_customers_tenant_isolation ON stripe_customers FOR ALL
  USING (org_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (org_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid OR current_setting('app.is_platform_admin', true) = 'true');
