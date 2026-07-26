#!/bin/bash
# =============================================================================
# WAL-G 全量备份脚本（P0-06，等保三级 8.1.4 数据备份与恢复）
# =============================================================================
# 触发一次 PostgreSQL 全量基础备份（base backup），上传到 MinIO S3。
# 建议通过 cron 或 ofelia 调度器每日 02:00 CST 执行。
#
# 用法：
#   bash scripts/backup-full.sh
#
# 验证：
#   docker exec backtest-postgres wal-g backup-list
# =============================================================================
set -euo pipefail

CONTAINER_NAME="${POSTGRES_CONTAINER:-backtest-postgres}"
PGDATA="${PGDATA:-/var/lib/postgresql/data}"

echo "[backup-full] Starting WAL-G full backup at $(date '+%Y-%m-%d %H:%M:%S')..."

# 触发全量备份
docker exec "$CONTAINER_NAME" wal-g backup-push "$PGDATA"

# 验证备份
echo "[backup-full] Verifying backup..."
docker exec "$CONTAINER_NAME" wal-g backup-list

echo "[backup-full] Full backup completed at $(date '+%Y-%m-%d %H:%M:%S')"
echo "[backup-full] Latest backup:"
docker exec "$CONTAINER_NAME" wal-g backup-list | tail -5
