-- =============================================================================
-- 迁移 v3：索引清理 + CHECK 约束
-- 描述：删除冗余索引 + 添加 CHECK 约束
-- =============================================================================

-- 企业理由：idx_prices_ticker 是 UNIQUE(ticker,date) 的最左前缀冗余索引，
-- PostgreSQL 查询优化器在已有唯一约束索引时不会使用此单列索引。
-- 冗余索引使写入放大 3x（INSERT/UPDATE 需同时维护 3 个 B-Tree），
-- 百万级数据导入差异达分钟级。
-- 权衡：删除后需 EXPLAIN 验证查询仍走唯一约束索引。
DROP INDEX IF EXISTS idx_prices_ticker;

-- 企业理由：idx_prices_ticker_date 与 UNIQUE(ticker,date) 完全重复，
-- 唯一约束已自动创建等价索引，此索引零收益纯开销。
DROP INDEX IF EXISTS idx_prices_ticker_date;

-- 企业理由：CHECK 约束是数据质量最后防线，防止应用层 bug 写入非法数据。
-- 如 high < low 的脏数据会导致回测计算错误（最大回撤等指标失真）。
-- 权衡：约束增加写入校验开销（微秒级），换取数据完整性。
ALTER TABLE prices ADD CONSTRAINT prices_ohlc_check CHECK (
  high >= low
  AND low <= open
  AND low <= close
  AND high >= open
  AND high >= close
  AND volume >= 0
);
