-- =============================================================================
-- 迁移 v41：删除冗余索引（D8-012）
-- 描述：删除与 UNIQUE 约束自动索引重复的 idx_prices_ticker_date 和 idx_organizations_slug
-- =============================================================================
-- 企业理由：prices 表的 (ticker, date) 已有 UNIQUE 约束（自动创建唯一索引
-- prices_ticker_date_key），idx_prices_ticker_date 是完全重复的 B-Tree 索引。
-- organizations 表的 slug 列同理。冗余索引导致写入放大（INSERT/UPDATE 维护
-- 两份相同 B-Tree）、磁盘浪费、ANALYZE 统计成本翻倍。
-- 权衡：删除后查询仍走 UNIQUE 约束索引，无性能损失。

DROP INDEX IF EXISTS idx_prices_ticker_date;
DROP INDEX IF EXISTS idx_organizations_slug;