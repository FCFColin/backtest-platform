-- =============================================================================
-- 回滚 v15：删除 tickers.exchange 列与索引
-- =============================================================================
-- 注意：回滚会丢失已回填的 exchange 数据，生产环境不建议回滚。

DROP INDEX IF EXISTS idx_tickers_exchange;
ALTER TABLE tickers DROP COLUMN IF EXISTS exchange;
