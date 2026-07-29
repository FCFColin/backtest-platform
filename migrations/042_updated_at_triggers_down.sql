-- 回滚 v42：删除 updated_at 触发器
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
DROP TRIGGER IF EXISTS trg_tickers_updated_at ON tickers;
DROP TRIGGER IF EXISTS trg_organizations_updated_at ON organizations;
DROP TRIGGER IF EXISTS trg_portfolios_updated_at ON portfolios;
DROP TRIGGER IF EXISTS trg_saved_configs_updated_at ON saved_configs;
DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
DROP TRIGGER IF EXISTS trg_stripe_customers_updated_at ON stripe_customers;
DROP FUNCTION IF EXISTS set_updated_at();