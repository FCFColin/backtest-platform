-- 描述：prices 表转 TimescaleDB hypertable + 列压缩 + 月线 Continuous Aggregate
-- =============================================================================
-- 迁移 v18：TimescaleDB 时序优化（P1-02）
-- =============================================================================
-- 企业理由（ADR-007）：prices 是增长最快的表，5K ticker × 30 年 × 252 交易日
-- ≈ 3780 万行；扩展至 20K ticker 后超过 1.5 亿行，标准 B-tree 索引显现性能衰退。
-- TimescaleDB hypertable 提供自动时间分区（chunk 级分区裁剪）、列压缩（90%+ 压缩率）
-- 与 Continuous Aggregate（预计算月线 OHLCV），在保持完整 SQL 兼容性的前提下获得
-- 10–100 倍时序查询性能提升。chunk_time_interval=3 个月（金融日线，每 chunk ≈ 63 交易日）。
--
-- 权限说明：CREATE EXTENSION 需超级用户；docker 环境由 postgres-init/03-timescaledb.sql
-- 在数据库初始化阶段（POSTGRES_USER 超级用户）预装扩展，本语句在此场景下为幂等 no-op。
-- hypertable/compression/CAGG 由表 owner（backtest_app）执行。
-- =============================================================================

-- 1. 安装 TimescaleDB 扩展（若已由 init 脚本预装则幂等跳过）
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- 2. 修正主键：hypertable 要求所有唯一索引（含 PK）包含分区列 date
--    原 prices_pkey(id) 不含 date，无法在 hypertable 上保留；
--    UNIQUE(ticker, date) 已含 date，迁移后仍有效（hypertable 唯一约束）。
--    id 列保留为普通 BIGSERIAL（无唯一约束），向后兼容；应用代码未引用 prices.id。
ALTER TABLE prices DROP CONSTRAINT IF EXISTS prices_pkey;

-- 3. 转换为 hypertable：按 date 分区，每 chunk 3 个月
SELECT create_hypertable(
  'prices',
  'date',
  chunk_time_interval => INTERVAL '3 months',
  if_not_exists => TRUE
);

-- 4. ticker 空间维度：当 ticker 数量 > 10000 时启用 16 分区（spec P1-02 要求）
--    幂等：add_dimension 已存在时跳过；ticker 不足时跳过避免无谓分区开销。
DO $$
DECLARE
  ticker_count INTEGER;
  dim_exists BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO ticker_count FROM ticker;
  SELECT EXISTS(
    SELECT 1 FROM _timescaledb_config.dimensions
    WHERE hypertable_id = (SELECT id FROM _timescaledb_config.hypertable WHERE table_name = 'prices')
      AND column_name = 'ticker'
  ) INTO dim_exists;
  IF ticker_count > 10000 AND NOT dim_exists THEN
    PERFORM add_dimension('prices', 'ticker', number_partitions => 16);
  END IF;
END $$;

-- 5. 列压缩策略：历史数据 6 个月后自动压缩
--    segmentby=ticker（按标的分段，查询常按 ticker 过滤），orderby=date DESC
ALTER TABLE prices SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'ticker',
  timescaledb.compress_orderby = 'date DESC'
);
SELECT add_compression_policy('prices', INTERVAL '6 months', if_not_exists => TRUE);

-- 6. Continuous Aggregate：月线 OHLCV（加速回测范围查询/统计）
--    first()/last() 为 TimescaleDB 时序聚合，按 date 排序取首/末值。
--    WITH NO DATA：不立即物化历史数据，由刷新策略增量填充。
CREATE MATERIALIZED VIEW IF NOT EXISTS prices_monthly
WITH (timescaledb.continuous) AS
SELECT
  ticker,
  date_trunc('month', date) AS month,
  first(open, date) AS open,
  max(high) AS high,
  min(low) AS low,
  last(close, date) AS close,
  sum(volume) AS volume
FROM prices
GROUP BY ticker, date_trunc('month', date)
WITH NO DATA;

-- 7. CAGG 自动刷新策略：每小时刷新最近 1 个月内的聚合（覆盖延迟 < 1 小时）
SELECT add_continuous_aggregate_policy(
  'prices_monthly',
  start_offset => INTERVAL '1 month',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);
