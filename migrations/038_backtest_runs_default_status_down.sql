-- =============================================================================
-- 回滚迁移 v38：恢复 backtest_runs.status 默认 completed + 原始 CHECK
-- =============================================================================

ALTER TABLE backtest_runs DROP CONSTRAINT IF EXISTS backtest_runs_status_check;
ALTER TABLE backtest_runs
  ADD CONSTRAINT backtest_runs_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed'));

ALTER TABLE backtest_runs ALTER COLUMN status SET DEFAULT 'completed';