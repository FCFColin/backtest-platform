#!/bin/bash
# =============================================================================
# APISIX 网关验证脚本（P2-01 T8）
# =============================================================================
# 用法：bash scripts/verify-apisix.sh
# 前置：docker compose up -d apisix（APISIX + API + frontend 已启动）
# 验证项：API 路由 / 限流 / 安全头 / Prometheus 指标
# =============================================================================
set -euo pipefail

APISIX_URL="${APISIX_URL:-http://localhost:9080}"
METRICS_URL="${METRICS_URL:-http://localhost:9091}"
PASS=0
FAIL=0

echo "=========================================="
echo "  APISIX 网关验证"
echo "=========================================="
echo ""

# 1. API 路由正常
echo -n "1. API 路由 (/api/health)... "
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${APISIX_URL}/api/health" 2>/dev/null || echo "000")
if [[ "$RESPONSE" == "200" ]]; then
  echo "✅ PASS (200)"
  PASS=$((PASS + 1))
else
  echo "❌ FAIL (HTTP $RESPONSE)"
  FAIL=$((FAIL + 1))
fi

# 2. 限流生效（发送 101 次请求，第 101 次应被限流）
echo -n "2. 限流 (100 req/min)... "
RATE_LIMITED="no"
for i in $(seq 1 101); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "${APISIX_URL}/api/v1/backtest/" 2>/dev/null || echo "000")
  if [[ "$CODE" == "429" ]]; then
    RATE_LIMITED="yes"
    break
  fi
done
if [[ "$RATE_LIMITED" == "yes" ]]; then
  echo "✅ PASS (429 triggered)"
  PASS=$((PASS + 1))
else
  echo "⚠️  WARN (rate limit not triggered, may need Redis)"
  FAIL=$((FAIL + 1))
fi

# 3. 安全头存在
echo -n "3. 安全头 (X-Frame-Options, X-Content-Type-Options)... "
HEADERS=$(curl -s -I "${APISIX_URL}/" 2>/dev/null || echo "")
if echo "$HEADERS" | grep -qE "X-Frame-Options" && echo "$HEADERS" | grep -qE "X-Content-Type-Options"; then
  echo "✅ PASS"
  PASS=$((PASS + 1))
else
  echo "❌ FAIL (missing security headers)"
  FAIL=$((FAIL + 1))
fi

# 4. Prometheus 指标可访问
echo -n "4. Prometheus 指标... "
METRICS=$(curl -s "${METRICS_URL}/apisix/prometheus/metrics" 2>/dev/null || echo "")
if echo "$METRICS" | grep -q "apisix_"; then
  echo "✅ PASS"
  PASS=$((PASS + 1))
else
  echo "❌ FAIL (no apisix_ metrics found)"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=========================================="
echo "  结果: ${PASS} passed, ${FAIL} failed"
echo "=========================================="

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
