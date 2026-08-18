# Chaos 测试

验证系统在故障场景下的弹性:数据库断连、外部服务延迟、并发重启、Redis 故障、Go 引擎故障。

## 运行前置条件

- Docker Desktop 已启动（WSL2 后端，≥4GB 内存 + 2 CPU）
- 完整应用栈运行（`docker compose up -d`）：backtest-postgres / backtest-redis / backtest-engine-go / backtest-data-fetcher / backtest-api
- 后端 API 在 `http://127.0.0.1:15001` 可访问（`DEV_SKIP_AUTH=true`，混沌测试无认证探活）
- 可选：`API_URL` 覆盖默认地址

## 运行命令

```powershell
docker compose up -d  # 启动完整应用栈
docker compose ps     # 等待 healthy
pnpm test:chaos       # 运行 chaos 测试
```

**跳过条件**: Docker 不可用 → 5 个 experiment 全 skip；目标容器非 running → 对应 experiment skip（`tests/helpers/chaos.ts` 的 `containerReady` 同步探测）。

## Experiment 列表

| Experiment                      | 故障场景            | 目标容器              | 验证点                                                         |
| ------------------------------- | ------------------- | --------------------- | -------------------------------------------------------------- |
| experiment-1-db-disconnect      | PostgreSQL 网络分区 | backtest-postgres     | /meta fail-open 不 5xx；/api/ready fail-closed 503；恢复后正常 |
| experiment-2-external-delay     | 数据服务停止        | backtest-data-fetcher | /api/ready goDataService=false；数据健康端点 503；恢复后正常   |
| experiment-3-concurrent-restart | 并发服务重启        | backtest-api          | 100 并发请求完成率 ≥95%,SIGTERM 干净退出并重启恢复             |
| experiment-4-redis-outage       | Redis 故障          | backtest-redis        | /api/ready 200 且 redis=false；登录拒绝放行                    |
| experiment-5-go-engine-outage   | Go 引擎故障         | backtest-engine-go    | /api/ready fail-closed 503 + Retry-After,无 degraded(ADR-008)  |

CI 侧由 `.github/workflows/nightly.yml` 的 `e2e-and-chaos` job 运行（E2E 先行、混沌后行）。
