-- =============================================================================
-- 回滚 v16：删除 backtest_runs.progress_pct 列与约束
-- =============================================================================
-- 注意：回滚会丢失已记录的进度数据，生产环境不建议回滚。

ALTER TABLE backtest_runs DROP CONSTRAINT IF EXISTS chk_backtest_runs_progress_pct;
ALTER TABLE backtest_runs DROP COLUMN IF EXISTS progress_pct;
