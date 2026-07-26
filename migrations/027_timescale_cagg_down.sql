-- =============================================================================
-- P4-3 DOWN: 回滚 TimescaleDB CAGG 扩展
-- =============================================================================

-- 移除压缩策略
SELECT remove_compression_policy('daily_aggregate', if_exists => true);
SELECT remove_compression_policy('weekly_aggregate', if_exists => true);

-- 删除 CAGG 视图
DROP MATERIALIZED VIEW IF EXISTS daily_aggregate;
DROP MATERIALIZED VIEW IF EXISTS weekly_aggregate;
