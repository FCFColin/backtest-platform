-- =============================================================================
-- 迁移 v2：全文搜索
-- 描述：tickers 搜索向量 + GIN 索引
-- =============================================================================

-- 搜索向量列已在 v1 创建，此处添加 GIN 索引和更新触发器
CREATE INDEX IF NOT EXISTS idx_tickers_search ON tickers USING GIN(search_vector);

-- 自动更新搜索向量的触发器函数
CREATE OR REPLACE FUNCTION update_ticker_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW.ticker, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.category, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW.market, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tickers_search_vector
BEFORE INSERT OR UPDATE ON tickers
FOR EACH ROW EXECUTE FUNCTION update_ticker_search_vector();

-- 回填现有数据的搜索向量
UPDATE tickers SET search_vector =
  setweight(to_tsvector('simple', COALESCE(ticker, '')), 'A') ||
  setweight(to_tsvector('simple', COALESCE(category, '')), 'B') ||
  setweight(to_tsvector('simple', COALESCE(market, '')), 'C')
WHERE search_vector IS NULL;
