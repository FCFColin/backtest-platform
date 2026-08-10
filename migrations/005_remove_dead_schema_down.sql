-- 005 down: 回滚死 schema 退役（一般仅回滚演练使用，生产不降级）

CREATE MATERIALIZED VIEW IF NOT EXISTS daily_aggregate
  WITH (timescaledb.continuous) AS
  SELECT date_trunc('day', date) AS bucket, ticker,
    first(close, date) AS first_close, last(close, date) AS last_close,
    max(high) AS max_high, min(low) AS min_low, sum(volume) AS total_volume
  FROM prices GROUP BY bucket, ticker;

CREATE MATERIALIZED VIEW IF NOT EXISTS weekly_aggregate
  WITH (timescaledb.continuous) AS
  SELECT date_trunc('week', date) AS bucket, ticker,
    first(close, date) AS first_close, last(close, date) AS last_close,
    max(high) AS max_high, min(low) AS min_low, sum(volume) AS total_volume
  FROM prices GROUP BY bucket, ticker;

ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS visible_to_roles UUID[];

ALTER TABLE backtest_runs DROP CONSTRAINT IF EXISTS backtest_runs_status_check;
ALTER TABLE backtest_runs ADD CONSTRAINT backtest_runs_status_check
  CHECK (status IN ('queued', 'pending', 'running', 'completed', 'failed'));
ALTER TABLE backtest_runs ALTER COLUMN status SET DEFAULT 'queued';

CREATE INDEX IF NOT EXISTS idx_backtest_runs_tenant ON backtest_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_mfa_enabled ON users(mfa_enabled) WHERE mfa_enabled = FALSE;
