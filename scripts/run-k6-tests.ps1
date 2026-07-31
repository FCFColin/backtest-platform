# 运行 k6 负载测试（需要 Docker 全栈 + Docker Desktop）
# 用法: .\scripts\run-k6-tests.ps1
param([switch]$SkipBuild)

# 1. 停止可能冲突的服务
docker stop backtest-postgres backtest-redis 2>$null

# 2. 启动 Docker 全栈
docker compose -p backtest up -d postgres redis engine-go data-fetcher api

# 3. 等待 API 就绪
Write-Host "Waiting for API to be ready..."
do {
  Start-Sleep -Seconds 2
  $health = curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/api/health 2>$null
} while ($health -ne "200" -and $health -ne "302")

Write-Host "API ready! Running k6 tests..."

# 4. 运行 k6 测试
docker compose -p backtest run --rm k6 run /scripts/backtest-submit.js
docker compose -p backtest run --rm k6 run /scripts/price-history.js
docker compose -p backtest run --rm k6 run /scripts/optimizer.js

Write-Host "=== k6 tests complete ==="
