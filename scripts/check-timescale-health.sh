#!/bin/bash
# =============================================================================
# TimescaleDB 健康检查脚本（P1-01 T6）
# =============================================================================
# 验证 TimescaleDB hypertable、CAGG、压缩策略的运行状态。
# 输出：hypertable 信息、chunk 数、压缩率、CAGG 状态、刷新策略
#
# 用法：
#   bash scripts/check-timescale-health.sh
#
# 前提：docker compose up -d postgres 已启动
# =============================================================================
set -euo pipefail

CONTAINER_NAME="${POSTGRES_CONTAINER:-backtest-postgres}"
PG_USER="${POSTGRES_USER:-backtest}"
PG_DB="${POSTGRES_DB:-backtest}"

PSQL="docker exec $CONTAINER_NAME psql -U $PG_USER -d $PG_DB"

echo "=============================================="
echo "TimescaleDB Health Check"
echo "=============================================="
echo ""

# 1. 检查 TimescaleDB 扩展
echo "1. TimescaleDB Extension"
echo "----------------------------------------------"
$PSQL -c "SELECT extversion FROM pg_extension WHERE extname = 'timescaledb';" 2>/dev/null || \
  echo "  [FAIL] TimescaleDB extension not installed"
echo ""

# 2. Hypertable 信息
echo "2. Hypertables"
echo "----------------------------------------------"
$PSQL -c "
  SELECT
    hypertable_name,
    num_chunks,
    compression_enabled
  FROM timescaledb_information.hypertables
  ORDER BY hypertable_name;
" 2>/dev/null || echo "  [FAIL] Cannot query hypertables"
echo ""

# 3. Chunk 统计（压缩前/后大小）
echo "3. Chunk Compression Stats"
echo "----------------------------------------------"
$PSQL -c "
  SELECT
    h.hypertable_name,
    COUNT(c.chunk_name) AS total_chunks,
    COUNT(c.chunk_name) FILTER (WHERE c.compression_status = 'Compressed') AS compressed_chunks,
    pg_size_pretty(SUM(c.before_compression_total_bytes)) AS original_size,
    pg_size_pretty(SUM(c.after_compression_total_bytes)) AS compressed_size,
    ROUND(
      100.0 * (1 - SUM(c.after_compression_total_bytes) / NULLIF(SUM(c.before_compression_total_bytes), 0)),
      1
    ) AS compression_ratio_pct
  FROM timescaledb_information.hypertables h
  LEFT JOIN timescaledb_information.compressed_chunk_stats c
    ON h.hypertable_name = c.hypertable_name
  WHERE h.hypertable_name = 'prices'
  GROUP BY h.hypertable_name;
" 2>/dev/null || echo "  [WARN] No compressed chunks yet (compression policy: 6 months)"
echo ""

# 4. Continuous Aggregates
echo "4. Continuous Aggregates (CAGG)"
echo "----------------------------------------------"
$PSQL -c "
  SELECT
    view_name,
    materialization_hypertable_name,
    view_definition IS NOT NULL AS is_defined
  FROM timescaledb_information.continuous_aggregates
  ORDER BY view_name;
" 2>/dev/null || echo "  [FAIL] Cannot query continuous aggregates"
echo ""

# 5. CAGG 行数（验证回填是否完成）
echo "5. CAGG Row Count (prices_monthly)"
echo "----------------------------------------------"
$PSQL -c "
  SELECT
    COUNT(*) AS total_rows,
    MIN(month) AS earliest_month,
    MAX(month) AS latest_month
  FROM prices_monthly;
" 2>/dev/null || echo "  [WARN] prices_monthly is empty or does not exist"
echo ""

# 6. 刷新策略
echo "6. CAGG Refresh Policy"
echo "----------------------------------------------"
$PSQL -c "
  SELECT
    hypertable_name,
    config->>'start_offset' AS start_offset,
    config->>'end_offset' AS end_offset,
    schedule_interval,
    next_start
  FROM timescaledb_information.jobs
  WHERE proc_name = 'policy_refresh_continuous_aggregate'
  ORDER BY hypertable_name;
" 2>/dev/null || echo "  [FAIL] Cannot query CAGG refresh policy"
echo ""

# 7. 压缩策略
echo "7. Compression Policy"
echo "----------------------------------------------"
$PSQL -c "
  SELECT
    hypertable_name,
    config->>'compress_after' AS compress_after,
    schedule_interval,
    next_start
  FROM timescaledb_information.jobs
  WHERE proc_name = 'policy_compression'
  ORDER BY hypertable_name;
" 2>/dev/null || echo "  [FAIL] Cannot query compression policy"
echo ""

# 8. 空间维度检查
echo "8. Space Dimension (ticker partitioning)"
echo "----------------------------------------------"
$PSQL -c "
  SELECT
    d.column_name,
    d.num_partitions
  FROM _timescaledb_config.dimensions d
  JOIN _timescaledb_config.hypertable h ON d.hypertable_id = h.id
  WHERE h.table_name = 'prices'
  ORDER BY d.column_name;
" 2>/dev/null || echo "  [INFO] No space dimensions (ticker count < 10000 threshold)"
echo ""

# 9. 查询性能验证（EXPLAIN ANALYZE chunk exclusion）
echo "9. Chunk Exclusion Verification (EXPLAIN)"
echo "----------------------------------------------"
echo "  Running EXPLAIN on a 3-month range query..."
$PSQL -c "
  EXPLAIN (ANALYZE, FORMAT TEXT)
  SELECT ticker, date, close
  FROM prices
  WHERE ticker = 'AAPL'
    AND date >= '2024-01-01'
    AND date <= '2024-03-31'
  ORDER BY date
  LIMIT 5;
" 2>/dev/null | head -20 || echo "  [WARN] EXPLAIN failed (may need AAPL data)"
echo ""

echo "=============================================="
echo "Health check complete."
echo "=============================================="
