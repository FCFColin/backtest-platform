-- =============================================================================
-- 迁移 v42：添加 updated_at 触发器（D8-013）
-- 描述：为 7 张有 updated_at 列但无触发器的表添加自动更新触发器
-- =============================================================================
-- 企业理由：users/tickers/organizations/portfolios/saved_configs/subscriptions/
-- stripe_customers 均有 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW() 列，但无
-- BEFORE UPDATE 触发器维护。应用层若忘记在 UPDATE 时设置 updated_at = NOW()，
-- 该列永远停留在创建时间，误导审计与缓存失效逻辑。
-- 权衡：触发器增加每条 UPDATE 约 0.01ms 开销，但确保 updated_at 可信。

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_tickers_updated_at ON tickers;
CREATE TRIGGER trg_tickers_updated_at BEFORE UPDATE ON tickers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON organizations;
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_portfolios_updated_at ON portfolios;
CREATE TRIGGER trg_portfolios_updated_at BEFORE UPDATE ON portfolios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_saved_configs_updated_at ON saved_configs;
CREATE TRIGGER trg_saved_configs_updated_at BEFORE UPDATE ON saved_configs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_stripe_customers_updated_at ON stripe_customers;
CREATE TRIGGER trg_stripe_customers_updated_at BEFORE UPDATE ON stripe_customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();