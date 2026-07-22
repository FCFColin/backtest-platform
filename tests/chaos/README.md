# Chaos 测试

验证系统在故障场景下的弹性:数据库断连、外部服务延迟、并发重启、Redis 故障、Go 引擎故障。

## 运行前置条件

- **Docker Desktop 已启动**(Windows 用 WSL2 后端)
  - 资源限制:至少分配 4GB 内存 + 2 CPU
- **完整应用栈运行**(通过 `docker compose up -d` 启动)
  - 必需容器:`backtest-postgres` / `backtest-redis` / `backtest-engine-go` / `backtest-data-fetcher` / `backtest-api`
- **后端 API 在 `http://127.0.0.1:5001` 可访问**(chaos 测试通过 `/api/health` 与 `/api/metrics` 探活与读取熔断器状态)
- **可选环境变量**:
  - `API_URL`:覆盖默认 API 地址(默认 `http://127.0.0.1:5001`)

## 运行命令

```powershell
# 1. 启动完整应用栈(若未启动)
docker compose up -d

# 2. 等待所有服务 healthy
docker compose ps

# 3. 运行 chaos 测试
npm run test:chaos
```

## 跳过条件

- **Docker 不可用**(`docker info` 失败)时,5 个 experiment 全部自动 skip(非缺陷,环境限制)
- **目标容器未运行**(如 `backtest-postgres` 不在 running 状态)时,对应 experiment 自动 skip
- 跳过由 `tests/helpers/chaos.ts` 的 `setupChaosFixture` 在 `beforeAll` 中检测,通过 `it.skipIf(!fixture.dockerAvailable || !fixture.containerRunning, ...)` 实现

## Experiment 列表

| Experiment                      | 故障场景            | 目标容器                              | 验证点                                 |
| ------------------------------- | ------------------- | ------------------------------------- | -------------------------------------- |
| experiment-1-db-disconnect      | PostgreSQL 网络分区 | `backtest-postgres`                   | DB 熔断器 Open → degraded 响应         |
| experiment-2-external-delay     | 外部数据服务延迟    | `backtest-data-fetcher`               | 超时熔断 + 降级                        |
| experiment-3-concurrent-restart | 并发服务重启        | `backtest-api` / `backtest-engine-go` | 重启期间无 5xx,恢复后正常              |
| experiment-4-redis-outage       | Redis 故障          | `backtest-redis`                      | 限流/会话降级到内存                    |
| experiment-5-go-engine-outage   | Go 引擎故障         | `backtest-engine-go`                  | fail-closed 503 + Retry-After(ADR-031) |

## CI 集成

CI chaos job 由 Task 1.4 配置(使用 Docker service container),本目录不维护 CI 配置。
