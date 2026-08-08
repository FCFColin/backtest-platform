-- 还原 001 原始 RLS 策略
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['api_keys', 'invitations'] LOOP
    EXECUTE format('DROP POLICY %s_tenant_isolation ON %s', t, t);
    EXECUTE format($f$CREATE POLICY %s_tenant_isolation ON %s FOR ALL USING (org_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid OR NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL) WITH CHECK (org_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)$f$, t, t);
  END LOOP;
END $$;

DROP POLICY stripe_customers_tenant_isolation ON stripe_customers;
CREATE POLICY stripe_customers_tenant_isolation ON stripe_customers FOR ALL
  USING (org_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_tenant_id', true)::uuid);
