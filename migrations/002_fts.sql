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

-- DDL/DML 同迁移说明 (M-009)：以下 UPDATE 为一次性数据回填，与上方 DDL（GIN 索引 +
-- 触发器）必须在同一迁移中执行。原因：触发器依赖 search_vector 列存在，GIN 索引
-- 依赖 search_vector 已填充。拆分会使迁移中间态存在空向量行，导致索引膨胀与
-- 查询结果不完整。回填使用 WHERE search_vector IS NULL 保证幂等。
-- 回填现有数据的搜索向量
UPDATE tickers SET search_vector =
  setweight(to_tsvector('simple', COALESCE(ticker, '')), 'A') ||
  setweight(to_tsvector('simple', COALESCE(category, '')), 'B') ||
  setweight(to_tsvector('simple', COALESCE(market, '')), 'C')
WHERE search_vector IS NULL;
