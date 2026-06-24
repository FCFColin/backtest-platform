# Tasks

## 阶段一：安全威胁修复（P0，阻塞后续工作）

- [x] Task 1: engine-go 添加认证与限流中间件
  - [x] SubTask 1.1: 在 engine-go 添加 `internal/middleware/auth.go`，校验 `X-Engine-Auth` 头（共享密钥从环境变量 `ENGINE_AUTH_TOKEN` 读取，常量时间比较）
  - [x] SubTask 1.2: 在 engine-go 添加 `internal/middleware/ratelimit.go`，基于 `golang.org/x/time/rate` 的 IP 级令牌桶限流（30 req/min）
  - [x] SubTask 1.3: 在 `internal/server/router.go` 的 `SetupRouter()` 中挂载认证 + 限流中间件，`/api/engine/health` 端点豁免认证
  - [x] SubTask 1.4: docker-compose.yml 中 engine-go 服务添加 `ENGINE_AUTH_TOKEN` 环境变量，api 服务添加对应 `ENGINE_AUTH_TOKEN` 并在调用时注入 `X-Engine-Auth` 头
  - [x] SubTask 1.5: 编写 engine-go 中间件单元测试（认证通过/拒绝、限流触发）

- [x] Task 2: data-fetcher 添加认证中间件
  - [x] SubTask 2.1: 在 data-fetcher 添加 `auth.go` 中间件，校验 `X-Data-Service-Auth` 头（共享密钥从 `DATA_SERVICE_AUTH_TOKEN` 读取）
  - [x] SubTask 2.2: 在 `main.go` 的路由组挂载认证中间件，`/api/data/health` 端点豁免
  - [x] SubTask 2.3: docker-compose.yml 中 data-fetcher 服务添加 `DATA_SERVICE_AUTH_TOKEN`，api 服务添加对应变量并在 `dataService.ts` 调用时注入头
  - [x] SubTask 2.4: 编写 data-fetcher 认证中间件单元测试

- [x] Task 3: Docker 端口绑定收紧与配置加固
  - [x] SubTask 3.1: docker-compose.yml 中所有服务端口映射改为 `127.0.0.1:<port>:<port>`（postgres:5432、engine-go:5004、api:5001、data-fetcher:5003）
  - [x] SubTask 3.2: .env.example 添加 `ENGINE_AUTH_TOKEN`、`DATA_SERVICE_AUTH_TOKEN`、标注 `DATABASE_URL` 生产环境必须使用 TLS（`?sslmode=require`）
  - [x] SubTask 3.3: api/config/index.ts 的 `validateConfig()` 添加生产环境校验：`ENGINE_AUTH_TOKEN` 和 `DATA_SERVICE_AUTH_TOKEN` 必须非空

- [x] Task 4: 路由认证修复与 IDOR 消除
  - [x] SubTask 4.1: api/app.ts 中 jobRoutes 挂载 `optionalJwtAuth` 中间件
  - [x] SubTask 4.2: api/app.ts 中 backtest 路由组从 `computeAuth`（optionalApiKey）升级为 `optionalJwtAuth`
  - [x] SubTask 4.3: api/middleware/jwtAuth.ts 中 `optionalJwtAuth` 确保无 Bearer Token 时匿名放行但注入 `req.user = null`，有 Token 时验证并注入用户身份
  - [x] SubTask 4.4: x-request-id 字符过滤——在 api/utils/requestContext.ts 或 app.ts 中间件中添加正则校验 `/^[a-zA-Z0-9-]+$/`，不匹配时清空或生成新 UUID

## 阶段二：Node.js 优雅关闭与混沌实验修复

- [x] Task 5: Node.js API 服务 SIGTERM 优雅关闭
  - [x] SubTask 5.1: api/server.ts 添加 `setupGracefulShutdown(server)` 函数，注册 SIGTERM/SIGINT handler
  - [x] SubTask 5.2: 实现关闭流程：`server.close()` 停止接受新连接 → 等待在途请求（最长 30s 超时）→ `closeDb()` 关闭连接池 → `process.exit(0)`
  - [x] SubTask 5.3: 添加 BullMQ worker 优雅关闭（`worker.close()` on signal）
  - [x] SubTask 5.4: 编写单元测试验证关闭流程

- [x] Task 6: 混沌实验重构为 vitest 集成测试
  - [x] SubTask 6.1: 创建 tests/helpers/chaos.ts，封装 Docker 容器操作（disconnect/reconnect/获取容器名）跨平台兼容
  - [x] SubTask 6.2: 重构 experiment-1-db-disconnect.ts → experiment-1-db-disconnect.test.ts：改打 `/api/v1/data/manage/list` 端点，断言 503 响应，通过 `/metrics` 抓取 `circuit_breaker_state{name="pgCircuitBreaker"}` 验证 Open 状态
  - [x] SubTask 6.3: 重构 experiment-2-external-delay.ts → experiment-2-external-delay.test.ts：改打 baostock 依赖端点（`/api/v1/data/price/*`），断言降级行为，跨平台延迟注入（Linux 用 tc，Windows/Mac 用 mock fetch 延迟）
  - [x] SubTask 6.4: 重构 experiment-3-concurrent-restart.ts → experiment-3-concurrent-restart.test.ts：跨平台 SIGTERM 发送（Linux: `process.kill(pid, 'SIGTERM')`，Windows: `taskkill /PID`），验证在途请求完成率 > 95%
  - [x] SubTask 6.5: 修复容器名：从 docker-compose.yml 读取实际 container_name（`backtest-postgres`、`backtest-data-fetcher`、`backtest-api`）
  - [x] SubTask 6.6: package.json 添加 `test:chaos` 脚本，vitest.config.ts 添加 chaos 测试配置

## 阶段三：ADR-011 BullMQ grid-search 补全

- [x] Task 7: BullMQ grid-search 任务类型实现
  - [x] SubTask 7.1: api/queues/worker.ts 实现 `grid-search` job 类型处理分支，调用 `executeGridSearch` 逻辑
  - [x] SubTask 7.2: api/queues/backtestQueue.ts 的 `defaultJobOptions.attempts` 从 1 改为 3，添加 `backoff: { type: 'exponential', delay: 5000 }`
  - [x] SubTask 7.3: api/routes/tacticalGridRoutes.ts 改为提交 `grid-search` job 到队列，返回 202 + jobId（与 backtestOptimizerRoutes 模式一致）
  - [x] SubTask 7.4: 添加 Redis 不可用时的同步降级回退（与 backtestOptimizerRoutes 一致）
  - [x] SubTask 7.5: 编写 grid-search 任务单元测试

## 阶段四：ADR-013 DDD Application Service 落地

- [x] Task 8: DomainEventDispatcher 实现
  - [x] SubTask 8.1: 创建 api/domain/events/EventDispatcher.ts，实现 `DomainEventDispatcher` 类（`register(handler)`、`dispatch(event)`）
  - [x] SubTask 8.2: 定义 `EventHandler` 接口 `{ eventType: string; handle(event: DomainEvent): Promise<void> }`
  - [x] SubTask 8.3: 创建 api/domain/events/handlers/ 目录，实现 `BacktestCompletedHandler`（写 outbox + 审计日志）、`RebalanceTriggeredHandler`（日志记录）
  - [x] SubTask 8.4: api/domain/events/index.ts 导出 EventDispatcher 和 handler

- [x] Task 9: BacktestApplicationService 业务逻辑下沉
  - [x] SubTask 9.1: api/application/backtest-service.ts 实现 `runBacktest(params)`：参数校验（用 Value Object）→ 创建 Portfolio Aggregate → 调用引擎计算 → 分发 BacktestCompleted 事件 → 返回结果
  - [x] SubTask 9.2: api/routes/backtestRoutes.ts 的 POST `/backtest` 端点改为调用 `backtestApplicationService.runBacktest()`，路由仅做 HTTP 适配（解析请求、校验、调用 service、格式化响应）
  - [x] SubTask 9.3: 保持向后兼容——请求/响应格式不变，仅内部重构
  - [x] SubTask 9.4: 编写 Application Service 单元测试

## 阶段五：ADR-014 Outbox 消费者启用与事务双写

- [x] Task 10: OutboxPublisher 启用与 handler 实现
  - [x] SubTask 10.1: api/services/outboxPublisher.ts 完善 `handleNotification()`：从 outbox 表读取未处理事件 → 按 `event_type` 路由到 handler → 成功后 `UPDATE outbox SET processed_at=NOW() WHERE id=$1`
  - [x] SubTask 10.2: 实现事件 handler 注册机制（audit-event → 日志/告警，backtest-completed → 通知下游）
  - [x] SubTask 10.3: api/server.ts 启动时调用 `OutboxPublisher.start()`，注册 SIGTERM 时 `OutboxPublisher.stop()`
  - [x] SubTask 10.4: 实现补偿扫描定时任务（setInterval 每 60s 扫描 `processed_at IS NULL AND created_at < NOW() - INTERVAL '5 minutes'`）

- [x] Task 11: Outbox 事务双写实现
  - [x] SubTask 11.1: 创建 api/services/outboxWriter.ts，提供 `writeEventInTransaction(client, event)` 函数，在业务事务内 INSERT outbox 记录
  - [x] SubTask 11.2: api/middleware/auditLog.ts 的 `writeOutboxEvent` 改为接受可选 `client` 参数，有 client 时用同事务写入，无 client 时回退到独立连接（向后兼容）
  - [x] SubTask 11.3: api/application/backtest-service.ts 的 `runBacktest` 在事务内同时写入业务数据和 outbox 事件（BacktestCompleted）
  - [x] SubTask 11.4: 编写事务双写单元测试（验证业务回滚时 outbox 也回滚）

## 阶段六：ADR-009/010/012 收尾

- [x] Task 12: ADR-009 zod schema 细化
  - [x] SubTask 12.1: api/schemas/backtest.ts 中 `startDate`/`endDate` 从 `z.string()` 改为 `z.string().date()` 或 `z.coerce.date()`
  - [x] SubTask 12.2: 审查其他 schema 文件的日期字段，统一细化
  - [x] SubTask 12.3: 更新对应单元测试

- [x] Task 13: ADR-010 gitleaks pre-commit 配置
  - [x] SubTask 13.1: 检查 .pre-commit-config.yaml 是否已包含 gitleaks，若无则添加
  - [x] SubTask 13.2: 检查 .husky/pre-commit 是否调用 gitleaks（若已安装）
  - [x] SubTask 13.3: 创建 .gitleaks.toml 自定义规则（针对项目特有密钥格式：ENGINE_AUTH_TOKEN、DATA_SERVICE_AUTH_TOKEN、AUDIT_HMAC_KEY）

- [x] Task 14: ADR-012 SBOM+cosign 本地构建脚本
  - [x] SubTask 14.1: 创建 scripts/generate-sbom.sh，封装 `syft` 命令生成 CycloneDX 格式 SBOM
  - [x] SubTask 14.2: 创建 scripts/sign-image.sh，封装 `cosign sign` 命令
  - [x] SubTask 14.3: README.md 或 CONTRIBUTING.md 添加供应链安全说明（SBOM 生成、镜像签名验证流程）

## 阶段七：测试体系重构

- [x] Task 15: 创建 tests/helpers/ 共享模块
  - [x] SubTask 15.1: tests/helpers/fixtures.ts——抽取 `makePriceData`、`makeLinearPriceData`、`makeVolatilePriceData`、`makeParams` 等辅助函数
  - [x] SubTask 15.2: tests/helpers/constants.ts——定义 `API_PORT=5001`、`ENGINE_PORT=5002`、`API_BASE_URL`、`ENGINE_BASE_URL`
  - [x] SubTask 15.3: tests/helpers/server.ts——封装 `checkServerAvailable(url)` 和 `it.skipIf` 跳过辅助函数

- [x] Task 16: 测试文件重构与合并
  - [x] SubTask 16.1: 修复 tests/unit/middleware/idempotency.test.ts 的 mock 路径（`../../api/utils/logger.js` → `../../../api/utils/logger.js`）
  - [x] SubTask 16.2: 合并 tests/e2e/api.test.ts + api.enhanced.test.ts → tests/e2e/api.test.ts，消除重复用例，修复端口（3001→5001）
  - [x] SubTask 16.3: 合并 tests/unit/sortino.edge.test.ts → tests/unit/statistics.edge.test.ts
  - [x] SubTask 16.4: 修复 tests/rust-engine/rust-engine.test.ts 端口（3002→5002），使用 helpers/constants.ts
  - [x] SubTask 16.5: 修复 tests/e2e/engine-and-pages.test.ts 使用 helpers/constants.ts（已改用 API_BASE_URL + checkServerAvailable，移除 throw Error，添加 it.skipIf）
  - [x] SubTask 16.6: 所有 portfolio 测试文件（portfolio.test.ts、portfolio.edge.test.ts、portfolio.coverage.test.ts、bughunt.test.ts、engineConsistency.test.ts、rust-engine.test.ts）改用 helpers/fixtures.ts
  - [x] SubTask 16.7: 统一服务器不可用跳过策略为 `it.skipIf`（api.test.ts、rust-engine.test.ts、engineConsistency.test.ts、engine-and-pages.test.ts 全部完成）

- [x] Task 17: vitest 配置与 bench 集成
  - [x] SubTask 17.1: vitest.config.ts 的 `include` 添加 `tests/**/*.bench.ts`，或单独配置 bench 项目
  - [x] SubTask 17.2: package.json 添加 `test:bench` 脚本（`vitest bench`）
  - [x] SubTask 17.3: 验证 tests/bench/statistics.bench.ts 可被 vitest 执行

- [ ] Task 18: 测试目录结构整理
  - [ ] SubTask 18.1: tests/rust-engine/ 重命名为 tests/engine-integration/（Rust 引擎已迁移到 Go，但一致性测试仍对比 Rust↔JS）
  - [ ] SubTask 18.2: tests/e2e/ 下的 vitest 测试（api.test.ts、engine-and-pages.test.ts）移至 tests/integration/api.test.ts、tests/integration/pages.test.ts（它们实际是 HTTP 集成测试而非真正 E2E）
  - [ ] SubTask 18.3: tests/e2e/ 仅保留 Playwright UI 测试（.spec.ts）
  - [ ] SubTask 18.4: 更新 package.json 脚本路径（test:e2e → tests/integration，test:e2e:ui 不变）

## 阶段八：文档更新

- [x] Task 19: 威胁模型文档更新
  - [x] SubTask 19.1: docs/threat-model.md 中 S-2 状态改为"✅ 已缓解"（engine-go 已添加认证+限流）
  - [x] SubTask 19.2: S-3 状态改为"✅ 已缓解"（data-fetcher 已添加认证）
  - [x] SubTask 19.3: I-2 状态改为"✅ 已缓解"（端口绑定 127.0.0.1）
  - [x] SubTask 19.4: R-2 状态改为"✅ 已缓解"（jobRoutes + backtest 路由已升级为 optionalJwtAuth）
  - [x] SubTask 19.5: S-4 状态改为"✅ 已缓解"（x-request-id 字符过滤）
  - [x] SubTask 19.6: R-3 状态改为"✅ 已缓解"（Python 子进程已消除，数据写入通过 outbox 审计）
  - [x] SubTask 19.7: 优先级列表中 P0（S-3、D-4）、P1（I-2、S-2、PG-1）全部移除或标记为已解决
  - [x] SubTask 19.8: 架构安全现状总结表更新评分

- [x] Task 20: 混沌实验文档更新
  - [x] SubTask 20.1: docs/chaos-experiments.md 实验 1"当前系统预期"全部改为 ✅
  - [x] SubTask 20.2: 实验 2"当前系统预期"全部改为 ✅
  - [x] SubTask 20.3: 实验 3"当前系统预期"全部改为 ✅
  - [x] SubTask 20.4: 添加运行说明（`npm run test:chaos`）和前置条件（Docker 环境）

# Task Dependencies

- Task 1, 2, 3, 4 可并行（安全修复互不依赖）
- Task 5 依赖 Task 4 完成（SIGTERM handler 需要认证中间件就位）
- Task 6 依赖 Task 5 完成（混沌实验验证 SIGTERM 优雅关闭）
- Task 7 独立（BullMQ grid-search）
- Task 8 依赖 Task 7 完成（事件 dispatcher 需要队列就位）
- Task 9 依赖 Task 8 完成（Application Service 分发事件）
- Task 10 依赖 Task 8 完成（OutboxPublisher 分发到事件 handler）
- Task 11 依赖 Task 9, 10 完成（事务双写需要 Application Service + OutboxPublisher）
- Task 12, 13, 14 可并行（ADR 收尾互不依赖）
- Task 15 依赖 Task 6 完成（helpers/chaos.ts 需要混沌实验重构完成）
- Task 16, 17, 18 依赖 Task 15 完成（测试重构需要共享模块）
- Task 19 依赖 Task 1-5 完成（威胁模型更新需要安全修复落地）
- Task 20 依赖 Task 5, 6 完成（混沌文档更新需要实验修复完成）
