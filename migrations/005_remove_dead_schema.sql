-- 005: 退役零消费者死 schema（ADR-054）
-- daily_aggregate/weekly_aggregate CAGG：001 建立后确认无任何查询消费者（仅 prices_monthly 有消费者，004 已赋权）；
-- portfolios.visible_to_roles：无任何代码读写（多租户共享经 tenant_id/memberships）；
-- backtest_runs.queued：DB 层死枚举（应用层 domain 'queued' 由 backtestRunRepo STATUS_MAP 映射为 'pending' 写入）；
-- idx_backtest_runs_tenant：被 idx_backtest_runs_tenant_created(tenant_id, created_at DESC) 复合索引覆盖；
-- idx_users_mfa_enabled：布尔低选择性部分索引，无查询利用。

DROP MATERIALIZED VIEW IF EXISTS daily_aggregate CASCADE;
DROP MATERIALIZED VIEW IF EXISTS weekly_aggregate CASCADE;

ALTER TABLE portfolios DROP COLUMN IF EXISTS visible_to_roles;

ALTER TABLE backtest_runs DROP CONSTRAINT IF EXISTS backtest_runs_status_check;
ALTER TABLE backtest_runs ADD CONSTRAINT backtest_runs_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed'));
ALTER TABLE backtest_runs ALTER COLUMN status SET DEFAULT 'pending';

DROP INDEX IF EXISTS idx_backtest_runs_tenant;
DROP INDEX IF EXISTS idx_users_mfa_enabled;
