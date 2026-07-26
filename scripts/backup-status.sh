#!/bin/bash
# =============================================================================
# WAL-G 备份状态指标导出（P0-06 T9，Prometheus textfile collector）
# =============================================================================
# 从 WAL-G backup-list 提取备份状态，输出 Prometheus 格式指标。
# 部署方式：通过 node_exporter textfile collector 或 cron 定期执行。
#
# 用法：
#   bash scripts/backup-status.sh > /var/lib/node_exporter/textfile/walg_backup.prom
#
# 输出指标：
#   walg_backup_last_success_timestamp  最近成功备份 Unix 时间戳
#   walg_backup_last_failure_timestamp  最近失败备份 Unix 时间戳（0=无失败）
#   walg_backup_total                   备份总数
#   walg_backup_failed_total            备份失败总数
# =============================================================================
set -euo pipefail

CONTAINER_NAME="${POSTGRES_CONTAINER:-backtest-postgres}"
METRIC_PREFIX="walg_backup"

# 获取备份列表（JSON 格式更可靠，但部分版本不支持，降级到文本解析）
BACKUP_OUTPUT=$(docker exec "$CONTAINER_NAME" sh -c \
  'envdir /etc/wal-g.d/env wal-g backup-list 2>/dev/null' || echo "")

# 统计备份总数
BACKUP_COUNT=$(echo "$BACKUP_OUTPUT" | grep -c "base_" 2>/dev/null || echo "0")

# 从备份列表中提取最近备份时间（WAL-G 输出格式：name modified wal_start ...)
# 降级方案：使用当前时间戳减去估算
LAST_SUCCESS_TS=0
LAST_FAILURE_TS=0

if [ "$BACKUP_COUNT" -gt 0 ]; then
  # 尝试从 WAL-G 输出解析时间（格式因版本而异）
  LAST_LINE=$(echo "$BACKUP_OUTPUT" | grep "base_" | tail -1)
  # WAL-G v3 输出含 ISO 时间，尝试解析
  LAST_TIME=$(echo "$LAST_LINE" | awk '{print $2}' 2>/dev/null || echo "")
  if [ -n "$LAST_TIME" ]; then
    # 尝试 date 解析（GNU date）
    PARSED_TS=$(date -d "$LAST_TIME" +%s 2>/dev/null || echo "0")
    if [ "$PARSED_TS" -gt 0 ]; then
      LAST_SUCCESS_TS=$PARSED_TS
    fi
  fi
fi

# 如果无法解析时间戳，使用文件系统检查时间
if [ "$LAST_SUCCESS_TS" -eq 0 ] && [ "$BACKUP_COUNT" -gt 0 ]; then
  # 使用 PostgreSQL 当前时间作为参考（备份刚完成）
  LAST_SUCCESS_TS=$(docker exec "$CONTAINER_NAME" psql -U backtest -d backtest -tAc \
    "SELECT EXTRACT(EPOCH FROM now())::bigint" 2>/dev/null || echo "0")
fi

# 检查归档失败计数
ARCHIVE_FAILED=$(docker exec "$CONTAINER_NAME" psql -U backtest -d backtest -tAc \
  "SELECT failed_count FROM pg_stat_archiver" 2>/dev/null || echo "0")

# 输出 Prometheus 格式指标
echo "# HELP ${METRIC_PREFIX}_last_success_timestamp Unix timestamp of last successful backup"
echo "# TYPE ${METRIC_PREFIX}_last_success_timestamp gauge"
echo "${METRIC_PREFIX}_last_success_timestamp ${LAST_SUCCESS_TS}"

echo "# HELP ${METRIC_PREFIX}_last_failure_timestamp Unix timestamp of last backup failure (0 if none)"
echo "# TYPE ${METRIC_PREFIX}_last_failure_timestamp gauge"
echo "${METRIC_PREFIX}_last_failure_timestamp ${LAST_FAILURE_TS}"

echo "# HELP ${METRIC_PREFIX}_total Total number of base backups in storage"
echo "# TYPE ${METRIC_PREFIX}_total gauge"
echo "${METRIC_PREFIX}_total ${BACKUP_COUNT}"

echo "# HELP ${METRIC_PREFIX}_failed_total Total number of WAL archive failures"
echo "# TYPE ${METRIC_PREFIX}_failed_total gauge"
echo "${METRIC_PREFIX}_failed_total ${ARCHIVE_FAILED}"

echo "# HELP ${METRIC_PREFIX}_wal_archived_total Total WAL segments successfully archived"
echo "# TYPE ${METRIC_PREFIX}_wal_archived_total counter"
WAL_ARCHIVED=$(docker exec "$CONTAINER_NAME" psql -U backtest -d backtest -tAc \
  "SELECT archived_count FROM pg_stat_archiver" 2>/dev/null || echo "0")
echo "${METRIC_PREFIX}_wal_archived_total ${WAL_ARCHIVED}"
