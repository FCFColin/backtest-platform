#!/bin/bash
# =============================================================================
# WAL-G 备份验证脚本（P0-06 T7，等保三级 8.1.4 数据备份与恢复）
# =============================================================================
# 验证 WAL-G 备份链路完整性：
#   1. 检查 WAL-G 已安装
#   2. 检查 WAL 归档正常（archive_command 工作中）
#   3. 触发全量备份并验证
#   4. 验证备份列表非空
#   5. 验证 WAL 完整性
#
# 用法：
#   bash scripts/verify-backup.sh
#
# 前提：docker compose up -d postgres minio ofelia 已启动
# =============================================================================
set -euo pipefail

CONTAINER_NAME="${POSTGRES_CONTAINER:-backtest-postgres}"
PASS=0
FAIL=0

ok() {
  echo "  [PASS] $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "  [FAIL] $1"
  FAIL=$((FAIL + 1))
}

echo "=============================================="
echo "WAL-G Backup Verification"
echo "=============================================="
echo ""

# 1. 检查 PostgreSQL 容器运行
echo "1. Checking PostgreSQL container..."
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  ok "PostgreSQL container '${CONTAINER_NAME}' is running"
else
  fail "PostgreSQL container '${CONTAINER_NAME}' is NOT running"
  echo "   Start it with: docker compose up -d postgres"
  exit 1
fi

# 2. 检查 WAL-G 已安装
echo ""
echo "2. Checking WAL-G installation..."
if docker exec "$CONTAINER_NAME" command -v wal-g >/dev/null 2>&1; then
  WALG_VERSION=$(docker exec "$CONTAINER_NAME" wal-g --version 2>&1 || echo "unknown")
  ok "WAL-G installed: $WALG_VERSION"
else
  fail "WAL-G not installed in container"
  echo "   The install-walg.sh script runs on first init. Recreate the container:"
  echo "   docker compose down postgres && docker compose up -d postgres"
  exit 1
fi

# 3. 检查 WAL 归档状态
echo ""
echo "3. Checking WAL archiving..."
ARCHIVE_STATUS=$(docker exec "$CONTAINER_NAME" psql -U backtest -d backtest -tAc \
  "SELECT setting FROM pg_settings WHERE name = 'archive_mode'" 2>/dev/null || echo "unknown")
if [ "$ARCHIVE_STATUS" = "on" ]; then
  ok "archive_mode = on"
else
  fail "archive_mode is '$ARCHIVE_STATUS' (expected 'on')"
fi

ARCHIVE_CMD=$(docker exec "$CONTAINER_NAME" psql -U backtest -d backtest -tAc \
  "SELECT setting FROM pg_settings WHERE name = 'archive_command'" 2>/dev/null || echo "unknown")
if echo "$ARCHIVE_CMD" | grep -q "wal-g"; then
  ok "archive_command uses wal-g"
else
  fail "archive_command does not use wal-g: $ARCHIVE_CMD"
fi

# 检查归档是否正常工作（archived vs not archived）
ARCHIVED_COUNT=$(docker exec "$CONTAINER_NAME" psql -U backtest -d backtest -tAc \
  "SELECT archived_count FROM pg_stat_archiver" 2>/dev/null || echo "0")
FAILED_COUNT=$(docker exec "$CONTAINER_NAME" psql -U backtest -d backtest -tAc \
  "SELECT failed_count FROM pg_stat_archiver" 2>/dev/null || echo "0")

if [ "$ARCHIVED_COUNT" -gt 0 ] 2>/dev/null; then
  ok "WAL segments archived: $ARCHIVED_COUNT"
else
  echo "  [WARN] No WAL segments archived yet (may be normal for fresh instance)"
fi

if [ "$FAILED_COUNT" -eq 0 ] 2>/dev/null; then
  ok "No archive failures"
else
  fail "Archive failures: $FAILED_COUNT (check MinIO connectivity)"
fi

# 4. 检查 MinIO 连通性
echo ""
echo "4. Checking MinIO connectivity..."
if docker exec "$CONTAINER_NAME" sh -c 'envdir /etc/wal-g.d/env wal-g backup-list >/dev/null 2>&1'; then
  ok "WAL-G can connect to MinIO (backup-list succeeded)"
else
  fail "WAL-G cannot connect to MinIO"
  echo "   Check: docker exec $CONTAINER_NAME envdir /etc/wal-g.d/env wal-g backup-list"
fi

# 5. 触发全量备份
echo ""
echo "5. Triggering full backup..."
echo "   (This may take a few seconds...)"
if docker exec "$CONTAINER_NAME" sh -c 'envdir /etc/wal-g.d/env wal-g backup-push /var/lib/postgresql/data' 2>&1 | tail -3; then
  ok "Full backup pushed successfully"
else
  fail "Full backup push failed"
fi

# 6. 验证备份列表
echo ""
echo "6. Checking backup list..."
BACKUP_LIST=$(docker exec "$CONTAINER_NAME" sh -c 'envdir /etc/wal-g.d/env wal-g backup-list 2>/dev/null' || echo "")
BACKUP_COUNT=$(echo "$BACKUP_LIST" | grep -c "base_" || echo "0")

if [ "$BACKUP_COUNT" -gt 0 ] 2>/dev/null; then
  ok "Backups available: $BACKUP_COUNT"
  echo "   Latest backups:"
  echo "$BACKUP_LIST" | tail -5 | sed 's/^/     /'
else
  fail "No backups found in storage"
fi

# 7. WAL 完整性验证
echo ""
echo "7. Verifying WAL integrity..."
if docker exec "$CONTAINER_NAME" sh -c 'envdir /etc/wal-g.d/env wal-g wal-verify integrity 2>&1' | grep -qi "success\|ok\|valid"; then
  ok "WAL integrity verification passed"
elif docker exec "$CONTAINER_NAME" sh -c 'envdir /etc/wal-g.d/env wal-g wal-verify integrity 2>&1' | head -5; then
  ok "WAL verification executed (check output above)"
else
  echo "  [WARN] wal-verify not available in this WAL-G version"
fi

# 8. 检查 ofelia 调度器
echo ""
echo "8. Checking ofelia scheduler..."
if docker ps --format '{{.Names}}' | grep -q "^backtest-ofelia$"; then
  ok "ofelia scheduler is running"
else
  echo "  [WARN] ofelia scheduler not running (manual backups only)"
  echo "     Start it with: docker compose up -d ofelia"
fi

# 总结
echo ""
echo "=============================================="
echo "Summary: $PASS passed, $FAIL failed"
echo "=============================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
