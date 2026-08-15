# E2E 测试(Playwright)

通过 Playwright 在真实浏览器中验证用户端到端流程:回测、优化、蒙特卡洛、导航、登录、页面冒烟等。

## 运行前置条件

### 必需服务(需预先运行)

| 服务                      | 端口                                                                  | 启动方式                                                                  |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| PostgreSQL                | `127.0.0.1:15442`(本地开发,见 `docker-compose.override.yml`)或 `5432` | `docker compose up -d postgres`                                           |
| Redis                     | `127.0.0.1:16381`(本地开发)或 `6379`                                  | `docker compose up -d redis`                                              |
| Go 引擎(engine-go)        | `127.0.0.1:15004`                                                     | `docker compose up -d engine-go` 或 `cd engine-go && go run ./cmd/server` |
| Go 数据服务(data-fetcher) | `127.0.0.1:15003`                                                     | `docker compose up -d data-fetcher` 或 `cd data-fetcher && go run .`      |

### 由 Playwright 自动启动

- **Backend API**:Playwright `webServer` 配置自动运行 `node scripts/e2e-servers.mjs`(wrapper 拉起后端并轮询 `http://localhost:15001/api/health`)
- **前端静态文件**:由后端 API 服务(`SERVE_STATIC=true`,在 `playwright.config.ts` 的 `webServer.env` 中设置)

### 环境变量

- `DATABASE_URL`:PostgreSQL 连接串(默认 `postgresql://backtest_app:backtest_app_dev@localhost:15442/backtest`)
- `REDIS_URL`:Redis 连接串(默认 `redis://localhost:16381`)
- `GO_ENGINE_URL`:Go 引擎地址(默认 `http://127.0.0.1:15004`)
- `GO_DATA_SERVICE_URL`:Go 数据服务地址(默认 `http://127.0.0.1:15003`)
- `COMPUTE_RATE_LIMIT_MAX`:回测限流(Playwright 已设为 `200`,避免 E2E 触发限流)

## 运行命令

```powershell
# 1. 启动依赖服务(若未启动)
docker compose up -d postgres redis engine-go data-fetcher

# 2. 等待服务就绪
docker compose ps  # 确认 postgres / redis / engine-go / data-fetcher healthy

# 3. 运行 E2E 测试(Playwright 会自动启动 backend API)
pnpm test:e2e:ui

# 或带浏览器 UI 调试
pnpm test:e2e:ui:headed
```

## 跳过条件

- **PostgreSQL / Redis 不可用**:`webServer` 健康检查失败,Playwright 启动超时(60s),所有 spec 失败
- **engine-go / data-fetcher 不可用**:回测/优化 spec 会因 503 fail-closed 失败(ADR-008)

## Spec 列表（位于 `tests/e2e/ui/`）

| Spec                               | 覆盖场景                                          |
| ---------------------------------- | ------------------------------------------------- |
| `ui/analysis.spec.ts`              | 资产分析页面                                      |
| `ui/backtest.spec.ts`              | 回测主流程(含 T1 默认回测 + T16 跨页面状态持久化) |
| `ui/backtest-performance.spec.ts`  | 回测首屏性能预算(`E2E_BACKTEST_PERF_MS`)          |
| `ui/data-engine.spec.ts`           | 数据引擎页面                                      |
| `ui/fuzz-random.spec.ts`           | 随机数据 fuzz 冒烟                                |
| `ui/login.spec.ts`                 | 登录流程                                          |
| `ui/monte-carlo.spec.ts`           | 蒙特卡洛模拟                                      |
| `ui/navigation.spec.ts`            | 导航                                              |
| `ui/optimizer.spec.ts`             | 组合优化                                          |
| `ui/page-load-performance.spec.ts` | 页面加载性能预算                                  |
| `ui/page-smoke.spec.ts`            | 页面冒烟                                          |
| `ui/tactical.spec.ts`              | 战术分配页面                                      |
