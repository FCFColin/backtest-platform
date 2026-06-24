-- =============================================================================
-- 回滚 v3：恢复冗余索引 + 删除 CHECK 约束
-- =============================================================================

ALTER TABLE prices DROP CONSTRAINT IF EXISTS prices_ohlc_check;
-- 重建冗余索引（回滚用，生产环境不建议保留）
CREATE INDEX IF NOT EXISTS idx_prices_ticker ON prices(ticker);
CREATE INDEX IF NOT EXISTS idx_prices_ticker_date ON prices(ticker, date);
