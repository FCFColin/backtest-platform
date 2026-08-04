#!/bin/bash
# =============================================================================
# TimescaleDB 健康检查脚本（P1-01 T6）
# 用法：bash scripts/check-timescale-health.sh
# 前提：docker compose up -d postgres 已启动
# =============================================================================
set -euo pipefail

CONTAINER_NAME="${POSTGRES_CONTAINER:-backtest-postgres}"
PG_USER="${POSTGRES_USER:-backtest}"
PG_DB="${POSTGRES_DB:-backtest}"
PSQL="docker exec $CONTAINER_NAME psql -U $PG_USER -d $PG_DB"

# 参数：序号 标题 SQL 失败级别 失败消息 [head 行数]
run_check() {
  local n="$1" title="$2" sql="$3" level="$4" msg="$5" head_n="${6:-0}"
  echo "$n. $title"
  echo "----------------------------------------------"
  if [ "$head_n" -gt 0 ]; then
    $PSQL -c "$sql" 2>/dev/null | head -"$head_n" || echo "  [$level] $msg"
  else
    $PSQL -c "$sql" 2>/dev/null || echo "  [$level] $msg"
  fi
  echo ""
}

echo "=============================================="
echo "TimescaleDB Health Check"
echo "=============================================="
echo ""

run_check "1" "TimescaleDB Extension" \
  "SELECT extversion FROM pg_extension WHERE extname = 'timescaledb';" \
  "FAIL" "TimescaleDB extension not installed"

run_check "2" "Hypertables" \
  "SELECT hypertable_name, num_chunks, compression_enabled
   FROM timescaledb_information.hypertables ORDER BY hypertable_name;" \
  "FAIL" "Cannot query hypertables"

run_check "3" "Chunk Compression Stats" \
  "SELECT h.hypertable_name,
     COUNT(c.chunk_name) AS total_chunks,
     COUNT(c.chunk_name) FILTER (WHERE c.compression_status = 'Compressed') AS compressed_chunks,
     pg_size_pretty(SUM(c.before_compression_total_bytes)) AS original_size,
     pg_size_pretty(SUM(c.after_compression_total_bytes)) AS compressed_size,
     ROUND(100.0 * (1 - SUM(c.after_compression_total_bytes) / NULLIF(SUM(c.before_compression_total_bytes), 0)), 1) AS compression_ratio_pct
   FROM timescaledb_information.hypertables h
   LEFT JOIN timescaledb_information.compressed_chunk_stats c ON h.hypertable_name = c.hypertable_name
   WHERE h.hypertable_name = 'prices'
   GROUP BY h.hypertable_name;" \
  "WARN" "No compressed chunks yet (compression policy: 6 months)"

run_check "4" "Continuous Aggregates (CAGG)" \
  "SELECT view_name, materialization_hypertable_name, view_definition IS NOT NULL AS is_defined
   FROM timescaledb_information.continuous_aggregates ORDER BY view_name;" \
  "FAIL" "Cannot query continuous aggregates"

run_check "5" "CAGG Row Count (prices_monthly)" \
  "SELECT COUNT(*) AS total_rows, MIN(month) AS earliest_month, MAX(month) AS latest_month
   FROM prices_monthly;" \
  "WARN" "prices_monthly is empty or does not exist"

run_check "6" "CAGG Refresh Policy" \
  "SELECT hypertable_name, config->>'start_offset' AS start_offset, config->>'end_offset' AS end_offset,
     schedule_interval, next_start
   FROM timescaledb_information.jobs
   WHERE proc_name = 'policy_refresh_continuous_aggregate'
   ORDER BY hypertable_name;" \
  "FAIL" "Cannot query CAGG refresh policy"

run_check "7" "Compression Policy" \
  "SELECT hypertable_name, config->>'compress_after' AS compress_after, schedule_interval, next_start
   FROM timescaledb_information.jobs
   WHERE proc_name = 'policy_compression'
   ORDER BY hypertable_name;" \
  "FAIL" "Cannot query compression policy"

run_check "8" "Space Dimension (ticker partitioning)" \
  "SELECT d.column_name, d.num_partitions
   FROM _timescaledb_config.dimensions d
   JOIN _timescaledb_config.hypertable h ON d.hypertable_id = h.id
   WHERE h.table_name = 'prices'
   ORDER BY d.column_name;" \
  "INFO" "No space dimensions (ticker count < 10000 threshold)"

run_check "9" "Chunk Exclusion Verification (EXPLAIN)" \
  "EXPLAIN (ANALYZE, FORMAT TEXT)
   SELECT ticker, date, close FROM prices
   WHERE ticker = 'AAPL' AND date >= '2024-01-01' AND date <= '2024-03-31'
   ORDER BY date LIMIT 5;" \
  "WARN" "EXPLAIN failed (may need AAPL data)" 20

echo "=============================================="
echo "Health check complete."
echo "=============================================="
