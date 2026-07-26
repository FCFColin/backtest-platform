-- =============================================================================
-- P4-3: TimescaleDB 连续聚合（CAGG）扩展
-- =============================================================================
-- 企业理由：用户常用时间范围查询（YTD/1Y/5Y/10Y/ALL）可通过预计算聚合
-- 显著降低查询延迟。日度/周度 CAGG 将 30 年数据从 ~7000 行/标的降至
-- ~1500 行（周度），减少 80%+ I/O。
--
-- 前置条件：migrations/018_timescaledb.sql 已安装 TimescaleDB 扩展
--           并创建了 price_data hypertable。
--
-- 注意：此迁移需在 TimescaleDB 环境执行，无法在本地 Windows 验证。
-- =============================================================================

-- 日度连续聚合（精确到交易日，主要用于 ≤2 年范围回测）
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_aggregate
WITH (timescaledb.continuous) AS
SELECT
  ticker,
  time_bucket('1 day', date) AS day,
  first(open, date) AS open,
  max(high) AS high,
  min(low) AS low,
  last(close, date) AS close,
  sum(volume) AS volume
FROM price_data
GROUP BY ticker, time_bucket('1 day', date)
WITH NO DATA;

-- 周度连续聚合（主要用于 2-5 年范围概览图表）
CREATE MATERIALIZED VIEW IF NOT EXISTS weekly_aggregate
WITH (timescaledb.continuous) AS
SELECT
  ticker,
  time_bucket('7 days', date) AS week,
  first(open, date) AS open,
  max(high) AS high,
  min(low) AS low,
  last(close, date) AS close,
  sum(volume) AS volume
FROM price_data
GROUP BY ticker, time_bucket('7 days', date)
WITH NO DATA;

-- 回填历史数据（异步执行，可能耗时数分钟）
-- 注意：refresh_continuous_aggregate 不能在事务中执行，需单独运行
SELECT timescaledb_internal.job_id, proc_name, schedule_interval
FROM timescaledb_information.jobs
WHERE proc_name LIKE '%daily_aggregate%' OR proc_name LIKE '%weekly_aggregate%';

-- 启用压缩策略（>30 天的数据自动压缩）
-- 压缩可将存储降低 5-10x，查询性能提升 2-5x
ALTER MATERIALIZED VIEW daily_aggregate SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'ticker',
  timescaledb.compress_orderby = 'day DESC'
);

ALTER MATERIALIZED VIEW weekly_aggregate SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'ticker',
  timescaledb.compress_orderby = 'week DESC'
);

-- 添加压缩策略（30 天后自动压缩）
SELECT add_compression_policy('daily_aggregate', INTERVAL '30 days');
SELECT add_compression_policy('weekly_aggregate', INTERVAL '30 days');

-- 权限
GRANT SELECT ON daily_aggregate TO backtest_app;
GRANT SELECT ON weekly_aggregate TO backtest_app;
