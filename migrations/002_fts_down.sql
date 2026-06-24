-- =============================================================================
-- 回滚 v2：删除全文搜索
-- =============================================================================

DROP TRIGGER IF EXISTS trg_tickers_search_vector ON tickers;
DROP FUNCTION IF EXISTS update_ticker_search_vector();
DROP INDEX IF EXISTS idx_tickers_search;
