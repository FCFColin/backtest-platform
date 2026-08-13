# Chaos 测试

验证系统在故障场景下的弹性:数据库断连、外部服务延迟、并发重启、Redis 故障、Go 引擎故障。

## 运行前置条件

- **Docker Desktop 已启动**(Windows 用 WSL2 后端)
  - 资源限制:至少分配 4GB 内存 + 2 CPU
- **完整应用栈运行**(通过 `docker compose up -d` 启动)
  - 必需容器:`backtest-postgres` / `backtest-redis` / `backtest-engine-go` / `backtest-data-fetcher` / `backtest-api`
  - compose `api` 容器以 `DEV_SKIP_AUTH=true` 运行(dev 编排已内置),混沌测试以无认证请求探活,故认证中间件须放行
- **后端 API 在 `http://127.0.0.1:15001` 可访问**(chaos 测试通过 `/api/health`、`/api/ready` 与 `/api/metrics` 探活与读取熔断器状态)
- **可选环境变量**:
  - `API_URL`:覆盖默认 API 地址(默认 `http://127.0.0.1:15001`)
  - `METRICS_AUTH_TOKEN`:/api/metrics 的 Bearer 令牌(默认 `dev-metrics-token`,与 compose `api` 容器一致;`tests/helpers/chaos.ts` 读取同变量作为请求头)

## 运行命令

```powershell
# 1. 启动完整应用栈(若未启动)
docker compose up -d

# 2. 等待所有服务 healthy
docker compose ps

# 3. 运行 chaos 测试
pnpm test:chaos
```

## 跳过条件

- **Docker 不可用**(`docker info` 失败)时,5 个 experiment 全部自动 skip(非缺陷,环境限制)
- **目标容器未运行**(如 `backtest-postgres` 不在 running 状态)时,对应 experiment 自动 skip
- 跳过由 `tests/helpers/chaos.ts` 的 `containerReady` getter 在收集期同步探测（docker 可用且容器 running），通过 `it.skipIf(!fixture.containerReady, ...)` 实现；避免 beforeAll 之前的异步探测导致 CI 空跑通过

## Experiment 列表

| Experiment                      | 故障场景            | 目标容器                              | 验证点                                                              |
| ------------------------------- | ------------------- | ------------------------------------- | ------------------------------------------------------------------- |
| experiment-1-db-disconnect      | PostgreSQL 网络分区 | `backtest-postgres`                   | `/meta` fail-open 不 5xx；`/api/ready` fail-closed 503；恢复后正常  |
| experiment-2-external-delay     | 数据服务停止        | `backtest-data-fetcher`               | `/api/ready` 标记 goDataService=false；数据健康端点 503；恢复后正常 |
| experiment-3-concurrent-restart | 并发服务重启        | `backtest-api` / `backtest-engine-go` | SIGTERM 期间在途请求完成率 ≥95%,重启恢复                            |
| experiment-4-redis-outage       | Redis 故障          | `backtest-redis`                      | `/api/ready` 200 且 redis=false；登录拒绝放行                       |
| experiment-5-go-engine-outage   | Go 引擎故障         | `backtest-engine-go`                  | `/api/ready` fail-closed 503 + Retry-After,无 degraded(ADR-008)     |

## 运行方式

通过 `pnpm test:chaos` 在本地 Docker 环境中手动执行；CI 侧由 `.github/workflows/nightly.yml` 的 `e2e-and-chaos` job 在完整 compose 栈上运行（E2E 先行、混沌后行，避免 15001 端口冲突）。
