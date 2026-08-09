#!/bin/bash
# =============================================================================
# WAL-G 恢复演练脚本（P0-06，等保三级 8.1.4 数据备份与恢复）
# =============================================================================
# 从最近的 WAL-G 备份恢复 PostgreSQL 数据。用于灾难恢复演练。
#
# 警告：此脚本会停止并重建 PostgreSQL 数据目录！
#   1. 停止 postgres 容器
#   2. 清空 PGDATA
#   3. 从备份恢复（backup-fetch + WAL replay）
#   4. 重启 postgres 容器
#
# 用法：
#   bash scripts/backup-restore.sh           # 恢复到最新（LATEST）
#   bash scripts/backup-restore.sh base_000  # 恢复到指定备份点
#
# RTO 目标：< 15 分钟（取决于数据量与网络带宽）
# =============================================================================
set -euo pipefail

BACKUP_NAME="${1:-LATEST}"
CONTAINER_NAME="${POSTGRES_CONTAINER:-backtest-postgres}"
PGDATA="${PGDATA:-/var/lib/postgresql/data}"
# Docker Compose 项目名（影响卷名：{project}_{volume}；须与 docker-compose.yml 顶层 name: 一致）
COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-backtest-platform}"
PGDATA_VOLUME="${COMPOSE_PROJECT}_pgdata"

echo "[backup-restore] !!! WARNING: This will DESTROY and RESTORE the PostgreSQL data directory !!!"
echo "[backup-restore] Target backup: $BACKUP_NAME"
echo "[backup-restore] Press Ctrl+C to cancel, or Enter to continue..."
read -r

# Step 1: 停止 PostgreSQL
echo "[backup-restore] Step 1: Stopping PostgreSQL container..."
docker stop "$CONTAINER_NAME"

# Step 2: 清空数据目录（在临时容器中执行，因原容器已停止）
echo "[backup-restore] Step 2: Clearing PGDATA ($PGDATA)..."
docker run --rm \
  -v "${PGDATA_VOLUME}:$PGDATA" \
  -v "$(pwd)/docker/wal-g/env:/etc/wal-g.d/env:ro" \
  --entrypoint bash \
  timescale/timescaledb:latest-pg16 \
  -c "rm -rf ${PGDATA:?}/* && echo 'PGDATA cleared'"

# Step 3: 从备份恢复数据
echo "[backup-restore] Step 3: Restoring from backup '$BACKUP_NAME'..."
docker run --rm \
  -v "${PGDATA_VOLUME}:$PGDATA" \
  -v "$(pwd)/docker/wal-g/env:/etc/wal-g.d/env:ro" \
  --entrypoint bash \
  -e PGDATA="$PGDATA" \
  timescale/timescaledb:latest-pg16 \
  -c "
    # 确保 WAL-G 可用（可能需要重新安装）
    if ! command -v wal-g >/dev/null 2>&1; then
      apt-get update -qq && apt-get install -y -qq curl ca-certificates >/dev/null
      curl -fsSL 'https://github.com/wal-g/wal-g/releases/download/v3.0.3/wal-g-pg-ubuntu-20.04-amd64.tar.gz' -o /tmp/wal-g.tar.gz
      tar -xzf /tmp/wal-g.tar.gz -C /usr/local/bin
      chmod +x /usr/local/bin/wal-g-pg-ubuntu-20.04-amd64
      mv /usr/local/bin/wal-g-pg-ubuntu-20.04-amd64 /usr/local/bin/wal-g
    fi
    # 恢复基础备份
    wal-g backup-fetch '$PGDATA' '$BACKUP_NAME'
    # 创建 recovery.signal 让 PostgreSQL 在启动时执行 WAL replay
    touch '$PGDATA/recovery.signal'
    echo 'restore_command = \"envdir /etc/wal-g.d/env wal-g wal-fetch %f %p\"' > '$PGDATA/postgresql.auto.conf'
    echo '[backup-restore] Base backup restored, WAL replay configured'
  "

# Step 4: 重启 PostgreSQL（会自动 replay WAL 到最新状态）
echo "[backup-restore] Step 4: Starting PostgreSQL container (WAL replay will complete on startup)..."
docker start "$CONTAINER_NAME"

# Step 5: 等待 PostgreSQL 就绪
echo "[backup-restore] Step 5: Waiting for PostgreSQL to become ready..."
sleep 5
for i in $(seq 1 30); do
  if docker exec "$CONTAINER_NAME" pg_isready -U backtest >/dev/null 2>&1; then
    echo "[backup-restore] PostgreSQL is ready!"
    break
  fi
  echo "  ...waiting ($i/30)"
  sleep 2
done

echo "[backup-restore] Restore completed at $(date '+%Y-%m-%d %H:%M:%S')"
echo "[backup-restore] Verify data integrity:"
echo "  docker exec $CONTAINER_NAME psql -U backtest -d backtest -c 'SELECT count(*) FROM tickers;'"
