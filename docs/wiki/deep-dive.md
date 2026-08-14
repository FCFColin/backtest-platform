# 后端深度指南（API + Go 引擎 + 数据服务）

## 1. 目录结构 (packages/backend/src/)

    routes/          路由层（healthRoutes, dataRoutes, backtestRoutes, authRoutes 等）
    application/     应用服务（billing/, org/, auth/, backtest-service, orchestrator）
    infrastructure/  基础设施（dataFacade, dataQuery, dataCache, outboxWriter, redisClient）
    domain/          领域层（aggregates/, events/, services/, value-objects/）
    middleware/      中间件（auth, rbac, rateLimiter, idempotencyKey）
    repositories/    仓储层（withTenant RLS）    schemas/  Zod 验证
    config/          配置（env, index, limits）   db/  连接池与迁移
    queues/          BullMQ 队列                 utils/  logger, metrics, engineClient, errors

## 2. 入口文件

- server.ts: HTTP 启动 + graceful shutdown；app.ts: Express 配置 + 路由挂载；tracing.ts: OTel（OTLP 到 SaaS）

## 3. 路由清单

| 路由文件                  | 挂载点                                                | 前置中间件                                               |
| ------------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| healthRoutes              | /api                                                  | 无（含 /metrics, /ready）                                |
| dataRoutes                | /api/v1/data                                          | optionalJwtAuth + assignGuestReadonly                    |
| dataManageRoutes          | /api/v1/data/manage                                   | readOnlyAuth + DATA_READ + auditLog + 幂等               |
| backtestRoutes            | /api/v1/backtest                                      | computeMiddleware(BACKTEST_RUN) + computeLimiter(10/min) |
| analysisRoutes            | /api/v1/{pca,letf,goal-optimizer,tactical,signal,...} | 各路由独立链（ADR-011 合并）                             |
| authRoutes                | /api/v1/auth                                          | 公开（登录/注册/验证）+ 独立限流                         |
| apiKeyRoutes              | /api/v1/keys, /api/v1/admin/keys                      | crudMiddleware(ADMIN_ACCESS)                             |
| workspaceRoutes           | /api/v1/{runs,configs,portfolios,tactical/configs}    | crudMiddleware（tenantCrudRoutes 工厂）                  |
| jobRoutes                 | /api/v1/jobs                                          | jwtAuth + 所有权校验                                     |
| platformRoutes            | /api/v1/{announcements,errors}                        | 公开读 + adminMiddleware 写                              |
| adminRoutes               | /api/v1/admin                                         | adminMiddleware + adminLimiter(30/min)                   |
| orgRoutes / billingRoutes | /api/v1/orgs, /billing                                | jwtAuth + resolveTenant (+requireTenant)                 |

> computeMiddleware(p) = jwtAuth → resolveTenant → requireTenant → requirePermission(p) → enforceQuota → auditLog
> crudMiddleware(p) = jwtAuth → resolveTenant → requireTenant → requirePermission(p)
> adminMiddleware() = jwtAuth → resolveTenant → requirePermission(ADMIN_ACCESS) → auditLog → 幂等

## 4. 中间件链

| 中间件                                         | 职责                                                           |
| ---------------------------------------------- | -------------------------------------------------------------- |
| helmet / cors                                  | 安全头 / CORS_ORIGINS 白名单（生产 hard-fail）                 |
| express.json / apiLimiter                      | JSON(10mb) / 全局限流(100 req/15min)                           |
| jwtAuth / resolveTenant / requirePermission(X) | JWT(jose, prod RS256 / dev HS256) / tenant_id 解析 / RBAC 校验 |
| enforceQuota / auditLog / idempotencyKey       | 计划配额(ADR-010) / 审计(HMAC) / 幂等(Redis)                   |

## 5. 应用服务层 (application/)

| 模块       | 关键文件                                                         | 职责                                          |
| ---------- | ---------------------------------------------------------------- | --------------------------------------------- |
| auth / org | userService, loginLockout / membershipService, invitationService | 用户CRUD、登录锁定 / 成员邀请                 |
| billing    | billingService, usageService, planLimitsService                  | Stripe 计费                                   |
| backtest   | backtest-service                                                 | 编排 + worker 落库（Run 聚合已退役, ADR-012） |
| —          | analysis-orchestrator, signal-orchestrator                       | 跨层编排                                      |

## 6. 领域层 (domain/)

- aggregates/portfolio.ts: fromDTO + validateWeightSum 不变量（Run 聚合根已退役, ADR-012）；events/events.ts: 通用 DomainEvent + 调度器（仅 AuditEvent, ADR-005 现状确认）
- services/ grid-search, optimizer-domain；value-objects/ ticker, weight

## 7. Outbox 模式 (ADR-005)

outboxWriter.ts（事务内写入, 与业务原子）→ outboxPublisher.ts（LISTEN/NOTIFY + 幂等）。
CDC 扩展: Debezium → Kafka（多 Pod 扩展, 见 runbooks/cdc-debezium.md）。

## 8. 数据访问层

| 组件                                  | 职责                                                           |
| ------------------------------------- | -------------------------------------------------------------- |
| db/pool.ts                            | PG 连接池（max=20）                                            |
| dataQuery.ts / goDataServiceClient.ts | 市场数据查询（semaphore=10 并发限制）/ Go 数据服务 HTTP 客户端 |
| dataFacade.ts                         | 数据门面（PG→Go 降级, 透传 degraded 标记）                     |
| repositories/                         | 仓储层（withTenant RLS）                                       |

## 9. 熔断与限流（DADR-016 已删除，行为保留）

Go 引擎/PostgreSQL: opossum（fail-closed 503 / 降级）；数据服务上游: gobreaker。50% 失败率 Open；HalfOpen: 引擎 30s / PG 10s。
限流分层: apiLimiter(100/15min) > computeLimiter(10/min) > adminLimiter(30/min)。Redis 不可用 fail-closed。

## 10. Go 引擎 (engine-go/)

    cmd/server/main.go    入口
    internal/engine/       回测核心 + 统计（gonum/stat）；tactical/ 战术回测
    internal/montecarlo/   块自助法模拟（NumCPU worker）
    internal/optimizer/    Markowitz 优化+有效前沿
    internal/analysis/     PCA / LETF / 因子回归
    internal/{signal,goaloptimizer,calculators,indicators}/  信号/目标优化/计算器/指标
    packages/go-shared/    共享包（observability/otel.go）

失败策略 (ADR-008): callEngineStrict → 503+Retry-After（同步）或 BullMQ 重试（异步）。OTel → OTLP HTTP → SaaS。

## 11. Go 数据服务 (data-fetcher/)

数据兜底（PG 缺失 ticker 实时抓取）；多源: yfinance(美股+港股) / finnhub / twelvedata / akshare(东方财富 A股)；批量端信号量并发控制（默认 10）；sony/gobreaker 熔断。

## 12. 多架构与配置

multi-stage（alpine 单架构）；SBOM(CycloneDX, nightly)。config/: env.ts（手写 helper）、limits.ts（ADR-010）。

## 13. 关键约束

- 引擎 fail-closed 503（无 degraded）；数据服务 degraded: true（见 [ARCHITECTURE.md §3](../ARCHITECTURE.md#3-降级策略)）
- x-api-key 路径 /api/v1/keys；Stripe Webhook 独立挂载（签名验证, 无 jwtAuth）
