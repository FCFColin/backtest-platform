#!/usr/bin/env bash
# =============================================================================
# P3-05 Debezium Outbox Connector 注册脚本
#
# 企业理由：Kafka Connect 的 connector 配置通过 REST API 注册，幂等注册避免
# `docker compose up` 重启后重复 POST 报 409。先 GET 查存在性，仅缺失时 POST。
#
# 用法：
#   ./docker/debezium/register-connectors.sh
#
# 前置：connect 服务已健康（http://localhost:8083），postgres-cdc 已启用
# wal_level=logical 且 outbox 表存在。
# =============================================================================
set -euo pipefail

CONNECT_URL="${CONNECT_URL:-http://localhost:8083}"
CONNECTOR_NAME="backtest-outbox-connector"
CONFIG_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/outbox-connector.json"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "❌ 连接器配置文件不存在: $CONFIG_FILE" >&2
  exit 1
fi

echo "→ 检查 Kafka Connect 健康: $CONNECT_URL/health"
if ! curl -sf "$CONNECT_URL/health" >/dev/null 2>&1; then
  echo "❌ Kafka Connect 不可用 ($CONNECT_URL)。请先启动 connect 服务：" >&2
  echo "  docker compose up -d connect" >&2
  exit 1
fi

echo "→ 检查连接器是否已存在: $CONNECTOR_NAME"
if curl -sf "$CONNECT_URL/connectors/$CONNECTOR_NAME" >/dev/null 2>&1; then
  echo "✓ 连接器 '$CONNECTOR_NAME' 已存在，跳过注册（幂等）。"
  echo "  如需更新配置：curl -X PUT -H 'Content-Type: application/json' \\"
  echo "    --data @\"$CONFIG_FILE\" $CONNECT_URL/connectors/$CONNECTOR_NAME/config"
  exit 0
fi

echo "→ 注册连接器: $CONNECTOR_NAME"
if curl -s -f -X POST \
  -H 'Content-Type: application/json' \
  --data @"$CONFIG_FILE" \
  "$CONNECT_URL/connectors"; then
  echo ""
  echo "✓ 连接器 '$CONNECTOR_NAME' 注册成功。"
else
  echo "❌ 连接器注册失败。请检查 connect 日志：" >&2
  echo "  docker compose logs connect --tail=100" >&2
  exit 1
fi
