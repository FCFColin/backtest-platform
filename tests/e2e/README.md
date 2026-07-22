# E2E 测试(Playwright)

通过 Playwright 在真实浏览器中验证用户端到端流程:回测、优化、蒙特卡洛、导航、登录、i18n、页面冒烟等。

## 运行前置条件

### 必需服务(需预先运行)

| 服务                      | 端口                                                                 | 启动方式                                                                  |
| ------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| PostgreSQL                | `127.0.0.1:5442`(本地开发,见 `docker-compose.override.yml`)或 `5432` | `docker compose up -d postgres`                                           |
| Redis                     | `127.0.0.1:6380`(本地开发)或 `6379`                                  | `docker compose up -d redis`                                              |
| Go 引擎(engine-go)        | `127.0.0.1:5004`                                                     | `docker compose up -d engine-go` 或 `cd engine-go && go run ./cmd/server` |
| Go 数据服务(data-fetcher) | `127.0.0.1:5003`                                                     | `docker compose up -d data-fetcher` 或 `cd data-fetcher && go run .`      |

### 由 Playwright 自动启动

- **Backend API**:Playwright `webServer` 配置自动运行 `npx tsx packages/backend/src/server.ts`,监听 `http://localhost:5001/api/health`
- **前端静态文件**:由后端 API 服务(`SERVE_STATIC=true`,在 `playwright.config.ts` 的 `webServer.env` 中设置)

### 环境变量

- `DATABASE_URL`:PostgreSQL 连接串(默认 `postgresql://backtest:backtest@localhost:5432/backtest`,本地开发需指向 `5442` 端口)
- `REDIS_URL`:Redis 连接串(默认 `redis://localhost:6379`,本地开发需指向 `6380` 端口)
- `GO_ENGINE_URL`:Go 引擎地址(默认 `http://127.0.0.1:5004`)
- `GO_DATA_SERVICE_URL`:Go 数据服务地址(默认 `http://127.0.0.1:5003`)
- `COMPUTE_RATE_LIMIT_MAX`:回测限流(Playwright 已设为 `200`,避免 E2E 触发限流)

## 运行命令

```powershell
# 1. 启动依赖服务(若未启动)
docker compose up -d postgres redis engine-go data-fetcher

# 2. 等待服务就绪
docker compose ps  # 确认 postgres / redis / engine-go / data-fetcher healthy

# 3. 运行 E2E 测试(Playwright 会自动启动 backend API)
npm run test:e2e:ui

# 或带浏览器 UI 调试
npm run test:e2e:ui:headed
```

## 跳过条件

- **PostgreSQL / Redis 不可用**:`webServer` 健康检查失败,Playwright 启动超时(60s),所有 spec 失败
- **engine-go / data-fetcher 不可用**:回测/优化 spec 会因 503 fail-closed 失败(ADR-031)

## Spec 列表

| Spec                           | 覆盖场景                                          |
| ------------------------------ | ------------------------------------------------- |
| `analysis.spec.ts`             | 资产分析页面                                      |
| `backtest.spec.ts`             | 回测主流程(含 T1 默认回测 + T16 跨页面状态持久化) |
| `backtest-performance.spec.ts` | 回测首屏性能预算(`E2E_BACKTEST_PERF_MS`)          |
| `data-engine.spec.ts`          | 数据引擎页面                                      |
| `i18n.spec.ts`                 | 国际化(中英文切换)                                |
| `login.spec.ts`                | 登录流程                                          |
| `monte-carlo.spec.ts`          | 蒙特卡洛模拟                                      |
| `navigation.spec.ts`           | 导航                                              |
| `optimizer.spec.ts`            | 组合优化                                          |
| `page-smoke.spec.ts`           | 页面冒烟                                          |

## CI 集成

CI e2e job 由 Task 1.4 配置(启动完整应用栈 + Playwright),本目录不维护 CI 配置。
