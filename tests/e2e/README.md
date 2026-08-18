# E2E 测试(Playwright)

通过 Playwright 在真实浏览器中验证用户端到端流程:回测、优化、蒙特卡洛、导航、登录、页面冒烟等。

## 运行前置条件

**必需服务**（需预先运行）：PostgreSQL、Redis、Go 引擎、Go 数据服务。端口与启动方式见 `docker-compose.yml`（本地 dev: PG `:15442`、Redis `:16381`、引擎 `:15004`、数据服务 `:15003`）。

Playwright 自动启动 Backend API（`webServer` 配置运行 `node scripts/e2e-servers.mjs`）和前端静态文件（`SERVE_STATIC=true`）。

环境变量: `DATABASE_URL`、`REDIS_URL`、`GO_ENGINE_URL`、`GO_DATA_SERVICE_URL`、`COMPUTE_RATE_LIMIT_MAX`(Playwright 已设 200)。

## 运行命令

```powershell
docker compose up -d postgres redis engine-go data-fetcher
docker compose ps  # 确认 healthy
pnpm test:e2e:ui   # 或 pnpm test:e2e:ui:headed 带浏览器 UI
```

**跳过条件**: PG/Redis 不可用 → webServer 健康检查失败；engine-go/data-fetcher 不可用 → 回测/优化 spec 503 fail-closed(ADR-008)。

## Spec 列表（位于 `tests/e2e/ui/`）

| Spec                            | 覆盖场景                                          |
| ------------------------------- | ------------------------------------------------- |
| `analysis.spec.ts`              | 资产分析页面                                      |
| `backtest.spec.ts`              | 回测主流程(含 T1 默认回测 + T16 跨页面状态持久化) |
| `backtest-performance.spec.ts`  | 回测首屏性能预算(`E2E_BACKTEST_PERF_MS`)          |
| `data-engine.spec.ts`           | 数据引擎页面                                      |
| `fuzz-random.spec.ts`           | 随机数据 fuzz 冒烟                                |
| `login.spec.ts`                 | 登录流程                                          |
| `monte-carlo.spec.ts`           | 蒙特卡洛模拟                                      |
| `navigation.spec.ts`            | 导航                                              |
| `optimizer.spec.ts`             | 组合优化                                          |
| `page-load-performance.spec.ts` | 页面加载性能预算                                  |
| `page-smoke.spec.ts`            | 页面冒烟                                          |
| `tactical.spec.ts`              | 战术分配页面                                      |
