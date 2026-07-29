-- 回滚 v41：重建被删除的冗余索引（不推荐，仅为回滚完整性）
CREATE INDEX IF NOT EXISTS idx_prices_ticker_date ON prices(ticker, date);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);