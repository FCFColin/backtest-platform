#!/bin/bash
# =============================================================================
# 读写分离验证脚本（P1-02 T10，PostgreSQL 流复制验证）
# =============================================================================
# 验证 PostgreSQL 流复制读写分离链路：
#   1. 副本容器运行
#   2. 主库写入测试数据 → 副本可读
#   3. 副本为只读（写入被拒绝）
#   4. 复制延迟可查询
#
# 用法：
#   bash scripts/verify-replication.sh
#
# 前提：docker compose up -d postgres postgres-replica 已启动
# =============================================================================
set -euo pipefail

PG_USER="${POSTGRES_USER:-backtest}"
PG_DB="${POSTGRES_DB:-backtest}"
PRIMARY_CONTAINER="${POSTGRES_CONTAINER:-backtest-postgres}"
REPLICA_CONTAINER="${POSTGRES_REPLICA_CONTAINER:-backtest-postgres-replica}"

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
echo "Read Replica Verification"
echo "=============================================="
echo ""

# 1. 检查主库和副本容器运行
echo "1. Checking containers..."
if docker ps --format '{{.Names}}' | grep -q "^${PRIMARY_CONTAINER}$"; then
  ok "Primary container '${PRIMARY_CONTAINER}' is running"
else
  fail "Primary container '${PRIMARY_CONTAINER}' is NOT running"
  echo "   Start with: docker compose up -d postgres"
  exit 1
fi

if docker ps --format '{{.Names}}' | grep -q "^${REPLICA_CONTAINER}$"; then
  ok "Replica container '${REPLICA_CONTAINER}' is running"
else
  fail "Replica container '${REPLICA_CONTAINER}' is NOT running"
  echo "   Start with: docker compose up -d postgres-replica"
  exit 1
fi

# 2. 检查主库复制状态
echo ""
echo "2. Checking replication status on primary..."
REPL_STATE=$(docker exec "$PRIMARY_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc \
  "SELECT state FROM pg_stat_replication LIMIT 1" 2>/dev/null || echo "none")
if [ "$REPL_STATE" = "streaming" ]; then
  ok "Replication state: streaming"
else
  fail "Replication state: '$REPL_STATE' (expected 'streaming')"
  echo "   Check: docker exec $PRIMARY_CONTAINER psql -U $PG_USER -d $PG_DB -c 'SELECT * FROM pg_stat_replication'"
fi

# 3. 主库写入测试数据
echo ""
echo "3. Writing test data to primary..."
TEST_VALUE="replication-test-$(date +%s)"
docker exec "$PRIMARY_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -c \
  "CREATE TABLE IF NOT EXISTS replication_test (id SERIAL, val TEXT, created_at TIMESTAMPTZ DEFAULT NOW());" 2>/dev/null
docker exec "$PRIMARY_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -c \
  "INSERT INTO replication_test (val) VALUES ('${TEST_VALUE}');" 2>/dev/null
ok "Test data written to primary: ${TEST_VALUE}"

# 4. 等待复制传播
echo ""
echo "4. Waiting for replication (2s)..."
sleep 2

# 5. 副本读取测试数据
echo ""
echo "5. Reading test data from replica..."
REPLICA_RESULT=$(docker exec "$REPLICA_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc \
  "SELECT val FROM replication_test WHERE val = '${TEST_VALUE}'" 2>/dev/null || echo "")
if [ "$REPLICA_RESULT" = "$TEST_VALUE" ]; then
  ok "Replica contains test data: ${TEST_VALUE}"
else
  fail "Replica does NOT contain test data (got: '$REPLICA_RESULT')"
  echo "   Replication may not be working. Check pg_stat_replication on primary."
fi

# 6. 验证副本为只读
echo ""
echo "6. Verifying replica is read-only..."
REPLICA_WRITE=$(docker exec "$REPLICA_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -c \
  "INSERT INTO replication_test (val) VALUES ('should-fail');" 2>&1 || true)
if echo "$REPLICA_WRITE" | grep -qi "read-only\|cannot execute.*in a read-only transaction"; then
  ok "Replica is read-only (write rejected)"
else
  fail "Replica accepted write (expected read-only rejection)"
  echo "   Output: $REPLICA_WRITE"
fi

# 7. 复制延迟
echo ""
echo "7. Checking replication lag..."
REPL_LAG=$(docker exec "$PRIMARY_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc \
  "SELECT COALESCE(EXTRACT(EPOCH FROM (now() - replay_lag))::bigint, 0) FROM pg_stat_replication LIMIT 1" 2>/dev/null || echo "unknown")
if [ "$REPL_LAG" != "unknown" ] && [ "$REPL_LAG" -lt 10 ] 2>/dev/null; then
  ok "Replication lag: ${REPL_LAG}s (< 10s threshold)"
else
  echo "  [WARN] Replication lag: ${REPL_LAG}s (may be high or unavailable)"
fi

# 总结
echo ""
echo "=============================================="
echo "Summary: $PASS passed, $FAIL failed"
echo "=============================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
