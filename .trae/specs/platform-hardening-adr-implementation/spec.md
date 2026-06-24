# 平台加固与 ADR 落地 Spec

## Why

回测平台经过多轮迭代后，存在四类悬而未决的系统性问题：(1) 测试目录结构混乱、辅助函数大量重复、端口配置不一致、混沌实验游离于测试体系之外；(2) 威胁模型中 S-2/S-3/I-2/R-2 等高危项仍未缓解，engine-go 完全裸奔、docker 端口全开放、jobRoutes 存在 IDOR；(3) 混沌实验全部只打 `/api/health`、容器名不匹配、无熔断断言，验证效力不足；(4) ADR-013（DDD）和 ADR-014（Outbox）处于脚手架阶段，OutboxPublisher 是死代码，Application Service 是空壳。本 spec 一次性彻底解决这四类问题，使平台达到"可接受"安全级别并完成 ADR 落地闭环。

## What Changes

### 测试体系重构（任务 1）
- 抽取 `tests/helpers/` 共享模块，消除 `makePriceData`/`makeParams` 等辅助函数在 6 个文件中的重复
- 统一端口配置：修复 `api.enhanced.test.ts`（3001→5001）、`rust-engine.test.ts`（3002→5002）
- 合并重复测试：`api.test.ts` + `api.enhanced.test.ts` 合并；`sortino.edge.test.ts` 并入 `statistics.edge.test.ts`
- 修复 `idempotency.test.ts` mock 路径错误（2 级→3 级）
- 将 `tests/bench/statistics.bench.ts` 纳入 vitest 配置
- 将混沌实验重构为 vitest 集成测试，统一容器名、接入熔断断言、跨平台兼容
- 统一服务器不可用时的跳过策略（`it.skipIf`）
- 清理死代码 `optionalJwtAuth`（无任何调用方）

### 安全威胁彻底解决（任务 2）
- **S-2**：engine-go 添加 JWT 共享密钥认证 + 速率限制中间件
- **S-3**：data-fetcher 添加 JWT 共享密钥认证中间件（复用已有 limiter）
- **I-2**：docker-compose.yml 所有端口绑定改为 `127.0.0.1`
- **R-2**：jobRoutes 挂载 `optionalJwtAuth`（消除 IDOR）；移除死代码 `optionalJwtAuth` 改为在 jobRoutes 实际使用；backtest 路由从 `optionalApiKey` 升级为 `optionalJwtAuth`
- **S-4**：x-request-id 添加字符过滤（仅允许字母数字和连字符）
- **T-4/PG-1/PG-2**：文档化 TLS 要求 + .env.example 标注生产必须使用 TLS
- **R-3**：Python 子进程已消除（ADR-008），标记为已缓解

### 混沌工程彻底解决（任务 3）
- 修复容器名（`backtest-postgres-1`→`backtest-postgres` 等）
- 实验 1：改为打数据库依赖端点（`/api/v1/data/manage/*`），断言 `pgCircuitBreaker` 状态
- 实验 2：改为打 baostock 依赖端点，断言 `baoStockBreaker` 状态
- 实验 3：跨平台 SIGTERM 发送 + 验证 Node.js 侧 SIGTERM handler
- 添加 Node.js 侧 SIGTERM 优雅关闭处理器（当前缺失）
- 所有实验纳入 vitest 测试体系

### ADR 落地（任务 4）
- **ADR-009（zod）**：已落地，细化日期 schema（`z.string().date()`）
- **ADR-010（gitleaks）**：已落地于 CI，补充 pre-commit hook 配置
- **ADR-011（BullMQ）**：补全 `grid-search` 任务类型；添加指数退避重试（attempts:3）
- **ADR-012（SBOM+cosign）**：已落地于 CI，补充本地构建脚本文档
- **ADR-013（DDD）**：实现 `BacktestApplicationService.runBacktest` 业务逻辑下沉；实现 `DomainEventDispatcher` + 事件处理器；路由层接入 Application Service
- **ADR-014（Outbox）**：启用 `OutboxPublisher`（server.ts 启动时实例化）；实现事件 handler 分发 + `processed_at` 更新；实现事务双写（业务数据 + outbox 同事务）；领域事件接入 outbox

## Impact

- Affected specs: 无既有 spec 直接关联（comprehensive-codebase-self-audit 为审查类 spec，本 spec 为实施类）
- Affected code:
  - 测试：[tests/](file:///d:/Project/回测平台/tests) 全部文件
  - 安全：[docker-compose.yml](file:///d:/Project/回测平台/docker-compose.yml)、[api/app.ts](file:///d:/Project/回测平台/api/app.ts)、[api/middleware/jwtAuth.ts](file:///d:/Project/回测平台/api/middleware/jwtAuth.ts)、[api/routes/jobRoutes.ts](file:///d:/Project/回测平台/api/routes/jobRoutes.ts)、[engine-go/](file:///d:/Project/回测平台/engine-go)、[data-fetcher/main.go](file:///d:/Project/回测平台/data-fetcher/main.go)
  - ADR-011：[api/queues/worker.ts](file:///d:/Project/回测平台/api/queues/worker.ts)、[api/queues/backtestQueue.ts](file:///d:/Project/回测平台/api/queues/backtestQueue.ts)
  - ADR-013：[api/application/backtest-service.ts](file:///d:/Project/回测平台/api/application/backtest-service.ts)、[api/domain/events/](file:///d:/Project/回测平台/api/domain/events)、[api/routes/](file:///d:/Project/回测平台/api/routes)
  - ADR-014：[api/services/outboxPublisher.ts](file:///d:/Project/回测平台/api/services/outboxPublisher.ts)、[api/server.ts](file:///d:/Project/回测平台/api/server.ts)、[api/middleware/auditLog.ts](file:///d:/Project/回测平台/api/middleware/auditLog.ts)
  - 文档：[docs/threat-model.md](file:///d:/Project/回测平台/docs/threat-model.md)、[docs/chaos-experiments.md](file:///d:/Project/回测平台/docs/chaos-experiments.md)

## ADDED Requirements

### Requirement: 测试目录结构与共享设施
系统 SHALL 提供 `tests/helpers/` 共享模块，集中存放测试辅助函数（价格数据生成、参数构造、端口常量、服务器可用性检测），消除跨文件重复。所有测试文件 SHALL 使用一致的端口配置和统一的服务器不可用跳过策略。

#### Scenario: 辅助函数抽取
- **WHEN** 多个测试文件需要构造价格数据或回测参数
- **THEN** 从 `tests/helpers/fixtures.ts` 导入，禁止在单个测试文件内重复定义

#### Scenario: 端口一致性
- **WHEN** 测试连接 API 服务
- **THEN** 统一使用 `tests/helpers/constants.ts` 中定义的 `API_PORT=5001`、`ENGINE_PORT=5002`，禁止硬编码

#### Scenario: 混沌实验集成
- **WHEN** 运行 `npm run test:chaos`
- **THEN** vitest 执行 `tests/chaos/*.test.ts`，实验失败时产生标准 vitest 断言错误而非 process.exit

### Requirement: engine-go 服务认证与限流
系统 SHALL 为 engine-go 服务添加共享密钥认证中间件（校验 `X-Engine-Auth` 头）和速率限制中间件，消除匿名访问暴露面。

#### Scenario: 未认证请求
- **WHEN** 请求未携带 `X-Engine-Auth` 头或密钥不匹配
- **THEN** 返回 401 Unauthorized

#### Scenario: 速率限制
- **WHEN** 单 IP 在 1 分钟内发送超过 30 个计算请求
- **THEN** 返回 429 Too Many Requests

### Requirement: data-fetcher 服务认证
系统 SHALL 为 data-fetcher 服务添加共享密钥认证中间件（校验 `X-Data-Service-Auth` 头），与已有速率限制叠加。

#### Scenario: 未认证请求
- **WHEN** 请求未携带 `X-Data-Service-Auth` 头或密钥不匹配
- **THEN** 返回 401 Unauthorized

### Requirement: Docker 端口绑定收紧
系统 SHALL 将 docker-compose.yml 中所有服务端口绑定到 `127.0.0.1`，禁止绑定到 `0.0.0.0`。

#### Scenario: 端口绑定
- **WHEN** docker-compose up 启动服务
- **THEN** 所有端口映射格式为 `127.0.0.1:<host_port>:<container_port>`，外部网络不可达

### Requirement: jobRoutes 认证与 IDOR 修复
系统 SHALL 为 jobRoutes 挂载 `optionalJwtAuth` 中间件，使任务状态查询可关联用户身份，消除 IDOR 风险。

#### Scenario: 匿名查询
- **WHEN** 未认证用户查询 `/api/v1/jobs/:id`
- **THEN** 请求被放行但日志记录为匿名访问（保持向后兼容）

#### Scenario: 已认证查询
- **WHEN** 已认证用户查询 `/api/v1/jobs/:id`
- **THEN** 日志记录 userId，可追溯资源消耗者

### Requirement: x-request-id 字符过滤
系统 SHALL 对 `x-request-id` 请求头进行字符过滤，仅允许字母数字和连字符，防止日志注入。

#### Scenario: 合法 request-id
- **WHEN** 请求头 `x-request-id: abc-123-xyz`
- **THEN** 原样记录到日志

#### Scenario: 非法字符
- **WHEN** 请求头 `x-request-id: <script>alert(1)</script>`
- **THEN** 过滤为空或拒绝请求

### Requirement: Node.js SIGTERM 优雅关闭
系统 SHALL 在 Node.js API 服务注册 SIGTERM/SIGINT 信号处理器，实现优雅关闭（停止接收新请求 → 等待在途请求完成 → 关闭数据库连接 → 超时强制退出）。

#### Scenario: 优雅关闭
- **WHEN** 收到 SIGTERM 信号
- **THEN** 停止接受新连接，等待在途请求完成（最长 30s），关闭数据库连接池后退出

### Requirement: 混沌实验业务路径覆盖
系统 SHALL 将混沌实验从仅打 `/api/health` 升级为打真正受影响的业务端点，并断言熔断器状态变更。

#### Scenario: 数据库断开实验
- **WHEN** PostgreSQL 连接断开
- **THEN** 持续请求 `/api/v1/data/manage/*` 端点，断言 `pgCircuitBreaker` 状态转为 Open，API 返回 503 而非 500

#### Scenario: 外部服务延迟实验
- **WHEN** baostock 延迟注入 5s
- **THEN** 持续请求 baostock 依赖端点，断言 `baoStockBreaker` 状态转为 Open，降级到本地缓存

#### Scenario: 并发重启实验
- **WHEN** 100 并发请求进行中发送 SIGTERM
- **THEN** 在途请求完成率 > 95%，30s 内完成关闭，无僵尸进程

### Requirement: BullMQ grid-search 任务类型
系统 SHALL 在 BullMQ worker 中实现 `grid-search` 任务类型，将 tacticalGrid 路由从同步执行改为异步队列处理。

#### Scenario: 网格搜索提交
- **WHEN** 用户提交 tacticalGrid 请求
- **THEN** 返回 202 + jobId，任务在 worker 中异步执行

#### Scenario: 任务重试
- **WHEN** 任务执行失败
- **THEN** 按指数退避重试（最多 3 次），最终失败后保留失败记录

### Requirement: DDD Application Service 落地
系统 SHALL 实现 `BacktestApplicationService.runBacktest` 完整业务逻辑，将路由层业务逻辑下沉到 Application Service，路由仅负责 HTTP 适配。

#### Scenario: 路由调用 Application Service
- **WHEN** 收到回测请求
- **THEN** 路由层调用 `backtestApplicationService.runBacktest(params)`，不直接操作引擎模块

#### Scenario: 领域事件分发
- **WHEN** 回测完成
- **THEN** `BacktestCompleted` 事件经 `DomainEventDispatcher` 分发到注册的 handler（审计、outbox 发布）

### Requirement: Outbox 消费者启用与事务双写
系统 SHALL 在 server.ts 启动时实例化 `OutboxPublisher`，实现 LISTEN outbox_channel 消费；业务数据与 outbox 事件 SHALL 在同一数据库事务中写入。

#### Scenario: OutboxPublisher 启动
- **WHEN** API 服务启动
- **THEN** `OutboxPublisher.start()` 被调用，开始 LISTEN outbox_channel

#### Scenario: 事件消费与标记
- **WHEN** 收到 outbox 通知
- **THEN** 读取未处理事件，分发到 handler，成功后 `UPDATE outbox SET processed_at=NOW()`

#### Scenario: 事务双写
- **WHEN** 业务操作产生领域事件
- **THEN** 业务数据和 outbox 事件在同一 `BEGIN/COMMIT` 事务中写入，保证原子性

#### Scenario: 补偿扫描
- **WHEN** 定时任务扫描超时未处理事件（processed_at IS NULL AND created_at < NOW() - INTERVAL '5 minutes'）
- **THEN** 重新发布这些事件

## MODIFIED Requirements

### Requirement: 威胁模型状态更新
[docs/threat-model.md](file:///d:/Project/回测平台/docs/threat-model.md) SHALL 更新所有威胁项状态：S-2、S-3、I-2、R-2、S-4、R-3 标记为"✅ 已缓解"；优先级列表中 P0/P1 项全部移除或降级。

### Requirement: 混沌实验文档更新
[docs/chaos-experiments.md](file:///d:/Project/回测平台/docs/chaos-experiments.md) SHALL 更新"当前系统预期"列：所有 ❌ 改为 ✅，反映修复后的稳态行为。

## REMOVED Requirements

### Requirement: 死代码 optionalJwtAuth
**Reason**: `optionalJwtAuth` 中间件定义后无任何调用方，是死代码
**Migration**: 在 jobRoutes 和 backtest 路由实际使用该中间件，使其不再是死代码
