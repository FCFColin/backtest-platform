# 后端深度指南（API + Go 引擎 + 数据服务）

> 合并自: wiki/backend.md + wiki/engine.md

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

| 路由文件                                   | 挂载点                                      | 前置中间件                                 |
| ------------------------------------------ | ------------------------------------------- | ------------------------------------------ |
| healthRoutes                               | /api                                        | 无（含 /metrics）                          |
| dataRoutes                                 | /api/v1/data                                | optionalJwtAuth + assignGuestReadonly      |
| backtestRoutes / backtestOptimizerRoutes   | /api/v1/backtest*                           | computeMiddleware + computeLimiter(10/min) |
| tactical* / signal / analysis              | /api/v1/tactical*, /signal, /{pca,letf,...} | 同上                                       |
| authRoutes                                 | /api/v1/auth                                | 公开（登录/注册/验证）                     |
| apiKeyRoutes / webhookRoutes               | /api/v1/keys, /webhooks                     | crudMiddleware(ADMIN_ACCESS)               |
| adminKeyRoutes                             | /api/v1/admin/keys                          | jwtAuth + requirePlatformAdmin             |
| orgRoutes / billingRoutes                  | /api/v1/orgs, /billing                      | jwtAuth + resolveTenant (+requireTenant)   |
| portfolioRoutes / configRoutes / runRoutes | /api/v1/{portfolios,configs,runs}           | jwtAuth + resolveTenant + requireTenant    |
| jobRoutes                                  | /api/v1/jobs                                | jwtAuth + 所有权校验                       |
| adminRoutes / auditRoutes / rbacRoutes     | /api/v1/admin                               | adminMiddleware + adminLimiter(30/min)     |

> computeMiddleware = jwtAuth → resolveTenant → requirePermission → enforceQuota → auditLog
> crudMiddleware(X) = jwtAuth → resolveTenant → requirePermission(X) → auditLog → idempotencyKey

## 4. 中间件链

| 中间件                                         | 职责                                           |
| ---------------------------------------------- | ---------------------------------------------- |
| helmet / cors                                  | 安全头 / CORS_ORIGINS 白名单（生产 hard-fail） |
| express.json / apiLimiter                      | JSON(10mb) / 全局限流(100 req/min)             |
| jwtAuth / resolveTenant / requirePermission(X) | JWT(jose RS256) / tenant_id 解析 / RBAC 校验   |
| enforceQuota / auditLog / idempotencyKey       | 计划配额(ADR-036) / 审计(HMAC) / 幂等(Redis)   |

## 5. 应用服务层 (application/)

| 模块       | 关键文件                                                         | 职责                          |
| ---------- | ---------------------------------------------------------------- | ----------------------------- |
| auth / org | userService, loginLockout / membershipService, invitationService | 用户CRUD、登录锁定 / 成员邀请 |
| billing    | billingService, usageService, planLimitsService                  | Stripe 计费                   |
| backtest   | backtest-service, backtestCompletedHandler                       | Run 聚合根驱动回测            |
| —          | analysis-orchestrator, signal-orchestrator                       | 跨层编排                      |

## 6. 领域层 (domain/)

- aggregates/run.ts: Run 聚合根（queued→running→completed/failed/cancelled）；portfolio.ts: validateWeightSum
- events/ RunStarted/Completed/Failed/Cancelled；services/ grid-search, optimizer-domain；value-objects/ ticker, weight

## 7. Outbox 模式 (ADR-014)

outboxWriter.ts（事务内写入, 与业务原子）→ outboxPublisher.ts（LISTEN/NOTIFY + 幂等）。
CDC 扩展: Debezium → Kafka（多 Pod 扩展, 见 runbooks/cdc-debezium.md）。

## 8. 数据访问层

| 组件                                  | 职责                                                           |
| ------------------------------------- | -------------------------------------------------------------- |
| db/pool.ts                            | PG 连接池（max=20）                                            |
| dataQuery.ts / goDataServiceClient.ts | 市场数据查询（semaphore=10 并发限制）/ Go 数据服务 HTTP 客户端 |
| dataFacade.ts                         | 数据门面（PG→Go 降级, 透传 degraded 标记）                     |
| repositories/                         | 仓储层（withTenant RLS）                                       |

## 9. 熔断与限流 (ADR-016)

Go 引擎/PostgreSQL: opossum（fail-closed 503 / 降级）；BaoStock: gobreaker。50% 失败率 Open, 10s HalfOpen。
限流分层: apiLimiter(100/min) > computeLimiter(10/min) > adminLimiter(30/min)。Redis 不可用 fail-closed。

## 10. Go 引擎 (engine-go/)

    cmd/server/main.go    入口
    internal/engine/       回测核心（gonum/stat）
    internal/montecarlo/   蒙特卡洛（gonum/stat/dist + sync.Pool）
    internal/optimizer/    Markowitz 优化+有效前沿（gonum/optimize）
    internal/pca/ internal/factorregression/  主成分分析 / 因子回归
    go-shared/             共享包（observability/otel.go）

失败策略 (ADR-031): callEngineStrict → 503+Retry-After（同步）或 BullMQ 重试（异步）。OTel → OTLP HTTP → SaaS。

## 11. Go 数据服务 (data-fetcher/)

数据兜底（PG 缺失 ticker 实时抓取）；多源: BaoStock(A股) / Yahoo(美股+港股) / 东方财富(ETF)；TTL 行情缓存；
信号量并发控制（默认 10）；sony/gobreaker 熔断。

## 12. 多架构 Docker 与配置

multi-stage build（scratch/alpine）+ amd64/arm64（buildx）；SBOM(syft) + cosign Keyless（ADR-052）。
config/: env.ts（Zod 验证）、index.ts（导出）、limits.ts（计划配额, ADR-036）。

## 13. 关键约束

- Go 引擎唯一（ADR-031），无 Node 降级；数据降级 PG→data-fetcher（degraded: true）
- x-api-key 路径 /api/v1/keys（非 /api/v1/api-keys）；Worker 独立进程；Stripe Webhook 独立挂载（签名验证, 无 jwtAuth）
