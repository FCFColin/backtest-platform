# 平台加固与 ADR 落地验证清单

## 阶段一：安全威胁修复

- [ ] engine-go 添加了 `X-Engine-Auth` 认证中间件，未携带/错误密钥返回 401
- [ ] engine-go 添加了 IP 级速率限制（30 req/min），超限返回 429
- [ ] engine-go 的 `/api/engine/health` 端点豁免认证（健康检查不需要）
- [ ] data-fetcher 添加了 `X-Data-Service-Auth` 认证中间件，未携带/错误密钥返回 401
- [ ] data-fetcher 的 `/api/data/health` 端点豁免认证
- [ ] docker-compose.yml 所有端口映射格式为 `127.0.0.1:<port>:<port>`（postgres、engine-go、api、data-fetcher）
- [ ] .env.example 包含 `ENGINE_AUTH_TOKEN`、`DATA_SERVICE_AUTH_TOKEN` 配置项
- [ ] .env.example 标注 `DATABASE_URL` 生产环境必须使用 `?sslmode=require`
- [ ] api/config/index.ts 的 `validateConfig()` 生产环境校验 `ENGINE_AUTH_TOKEN` 和 `DATA_SERVICE_AUTH_TOKEN` 非空
- [ ] api/app.ts 中 jobRoutes 挂载了 `optionalJwtAuth` 中间件
- [ ] api/app.ts 中 backtest 路由组从 `optionalApiKey` 升级为 `optionalJwtAuth`
- [ ] x-request-id 请求头添加了字符过滤（仅允许 `[a-zA-Z0-9-]`）
- [ ] api 调用 engine-go 时注入 `X-Engine-Auth` 头（rustFallback.ts 或 dataService.ts）
- [ ] api 调用 data-fetcher 时注入 `X-Data-Service-Auth` 头（dataService.ts）

## 阶段二：Node.js 优雅关闭与混沌实验

- [ ] api/server.ts 注册了 SIGTERM/SIGINT 信号处理器
- [ ] 优雅关闭流程：停止接受新连接 → 等待在途请求（30s 超时）→ closeDb() → process.exit(0)
- [ ] BullMQ worker 在 SIGTERM 时调用 `worker.close()`
- [ ] 混沌实验 1 改为打数据库依赖端点（非 `/api/health`）
- [ ] 混沌实验 1 断言 `pgCircuitBreaker` 状态转为 Open
- [ ] 混沌实验 1 断言 API 返回 503 而非 500
- [ ] 混沌实验 2 改为打 baostock 依赖端点
- [ ] 混沌实验 2 断言 `baoStockBreaker` 状态转为 Open
- [ ] 混沌实验 2 跨平台兼容（Linux tc + Windows/Mac mock）
- [ ] 混沌实验 3 跨平台 SIGTERM 发送
- [ ] 混沌实验 3 验证在途请求完成率 > 95%
- [ ] 混沌实验容器名与 docker-compose.yml 一致（`backtest-postgres`、`backtest-data-fetcher`、`backtest-api`）
- [ ] 混沌实验文件后缀为 `.test.ts`，可通过 `npm run test:chaos` 执行
- [ ] 混沌实验失败时产生 vitest 断言错误而非 process.exit

## 阶段三：ADR-011 BullMQ grid-search

- [x] api/queues/worker.ts 实现了 `grid-search` job 类型处理分支
- [x] api/queues/backtestQueue.ts 的 `attempts` 改为 3，配置了指数退避 `backoff`
- [x] api/routes/tacticalGridRoutes.ts 改为提交 job 到队列，返回 202 + jobId
- [x] Redis 不可用时 tacticalGridRoutes 回退到同步执行
- [x] grid-search 任务单元测试通过

## 阶段四：ADR-013 DDD Application Service

- [ ] api/domain/events/EventDispatcher.ts 实现了 `register(handler)` 和 `dispatch(event)`
- [ ] 定义了 `EventHandler` 接口
- [ ] 实现了 `BacktestCompletedHandler`（写 outbox + 审计）
- [ ] 实现了 `RebalanceTriggeredHandler`（日志记录）
- [ ] api/application/backtest-service.ts 的 `runBacktest` 实现完整业务逻辑（非空壳）
- [ ] api/routes/backtestRoutes.ts 调用 `backtestApplicationService.runBacktest()`
- [ ] 回测完成后分发 `BacktestCompleted` 事件
- [ ] 请求/响应格式向后兼容（仅内部重构）
- [ ] Application Service 单元测试通过

## 阶段五：ADR-014 Outbox 消费者启用

- [ ] api/services/outboxPublisher.ts 的 `handleNotification` 实现事件分发（非 TODO 注释）
- [ ] 事件处理成功后 `UPDATE outbox SET processed_at=NOW()`
- [ ] api/server.ts 启动时调用 `OutboxPublisher.start()`
- [ ] api/server.ts SIGTERM 时调用 `OutboxPublisher.stop()`
- [ ] 补偿扫描定时任务每 60s 扫描超时未处理事件
- [ ] api/services/outboxWriter.ts 提供 `writeEventInTransaction(client, event)`
- [ ] api/middleware/auditLog.ts 的 `writeOutboxEvent` 支持可选 client 参数（事务双写）
- [ ] api/application/backtest-service.ts 在事务内同时写入业务数据和 outbox 事件
- [ ] 事务双写单元测试验证：业务回滚时 outbox 也回滚

## 阶段六：ADR-009/010/012 收尾

- [ ] api/schemas/backtest.ts 日期字段使用 `z.string().date()` 或 `z.coerce.date()`
- [ ] 其他 schema 文件的日期字段统一细化
- [ ] .pre-commit-config.yaml 包含 gitleaks 配置
- [ ] .gitleaks.toml 包含项目特有密钥规则（ENGINE_AUTH_TOKEN、DATA_SERVICE_AUTH_TOKEN、AUDIT_HMAC_KEY）
- [ ] scripts/generate-sbom.sh 封装 syft 命令
- [ ] scripts/sign-image.sh 封装 cosign 命令
- [ ] README.md 或 CONTRIBUTING.md 包含供应链安全说明

## 阶段七：测试体系重构

- [ ] tests/helpers/fixtures.ts 存在并导出 `makePriceData`、`makeParams` 等辅助函数
- [ ] tests/helpers/constants.ts 存在并导出 `API_PORT`、`ENGINE_PORT`、`API_BASE_URL`、`ENGINE_BASE_URL`
- [ ] tests/helpers/server.ts 存在并导出 `checkServerAvailable`
- [ ] tests/unit/middleware/idempotency.test.ts 的 logger mock 路径为 3 级（`../../../api/utils/logger.js`）
- [ ] tests/e2e/api.test.ts 与 api.enhanced.test.ts 已合并，无重复用例
- [ ] tests/e2e/api.test.ts 端口为 5001（非 3001）
- [ ] tests/unit/sortino.edge.test.ts 已并入 statistics.edge.test.ts
- [ ] tests/rust-engine/rust-engine.test.ts 端口为 5002（非 3002）
- [ ] 所有 portfolio 测试文件使用 helpers/fixtures.ts（无重复辅助函数定义）
- [ ] 服务器不可用跳过策略统一为 `it.skipIf` 或 `ctx.skip()`
- [ ] vitest.config.ts 的 include 包含 `tests/**/*.bench.ts` 或配置了 bench 项目
- [ ] package.json 包含 `test:bench` 脚本
- [ ] tests/bench/statistics.bench.ts 可被 vitest 执行
- [ ] tests/rust-engine/ 已重命名为 tests/engine-integration/（或保留但文档说明）
- [ ] tests/e2e/ 仅包含 Playwright UI 测试（.spec.ts）
- [ ] HTTP 集成测试（原 tests/e2e/*.test.ts）移至 tests/integration/
- [ ] package.json 脚本路径已更新

## 阶段八：文档更新

- [ ] docs/threat-model.md 中 S-2 状态为"✅ 已缓解"
- [ ] docs/threat-model.md 中 S-3 状态为"✅ 已缓解"
- [ ] docs/threat-model.md 中 I-2 状态为"✅ 已缓解"
- [ ] docs/threat-model.md 中 R-2 状态为"✅ 已缓解"
- [ ] docs/threat-model.md 中 S-4 状态为"✅ 已缓解"
- [ ] docs/threat-model.md 中 R-3 状态为"✅ 已缓解"
- [ ] docs/threat-model.md 优先级列表中 P0/P1 项已移除或标记已解决
- [ ] docs/threat-model.md 架构安全现状总结表评分已更新
- [ ] docs/chaos-experiments.md 实验 1"当前系统预期"全部为 ✅
- [ ] docs/chaos-experiments.md 实验 2"当前系统预期"全部为 ✅
- [ ] docs/chaos-experiments.md 实验 3"当前系统预期"全部为 ✅
- [ ] docs/chaos-experiments.md 包含运行说明和前置条件

## 最终验证

- [ ] `npm run check` 通过（TypeScript 类型检查）
- [ ] `npm run lint` 通过（ESLint）
- [ ] `npm run test:unit` 通过（单元测试）
- [ ] `npm run test:bench` 可执行（基准测试）
- [ ] `npm run build` 通过（构建）
- [ ] 无死代码 `optionalJwtAuth`（已在 jobRoutes/backtest 路由实际使用）
- [ ] 无死代码 `OutboxPublisher`（已在 server.ts 启动）
- [ ] 无重复辅助函数（所有测试使用 tests/helpers/）
- [ ] 无端口硬编码（所有测试使用 tests/helpers/constants.ts）
