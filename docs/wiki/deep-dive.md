# 后端深度指南（API + Go 引擎 + 数据服务）

> 合并自: wiki/backend.md + wiki/engine.md

## 1. 后端目录结构 (packages/backend/src/)

    routes/          路由层（healthRoutes, dataRoutes, backtestRoutes, authRoutes 等）
    application/     应用服务（billing/, org/, auth/, backtest-service, orchestrator）
    infrastructure/  基础设施（dataFacade, dataQuery, dataCache, outboxWriter, redisClient）
    domain/          领域层（aggregates/, events/, services/, value-objects/）
    middleware/      中间件（auth, rbac, rateLimiter, idempotencyKey）
    repositories/    仓储层
    schemas/         Zod 验证 schema
    config/          配置（env, index, limits）
    db/              数据库连接池与迁移
    queues/          BullMQ 队列
    utils/           工具（logger, metrics, engineClient, errors）

## 2. 入口文件

- server.ts: HTTP 服务器启动 + graceful shutdown
- app.ts: Express 应用配置 + 路由挂载 + 中间件链
- tracing.ts: OpenTelemetry 初始化（OTLP HTTP 到 SaaS 后端）

## 3. 路由清单

| 路由文件                                   | 挂载点                            | 前置中间件                                 |
| ------------------------------------------ | --------------------------------- | ------------------------------------------ |
| healthRoutes                               | /api                              | 无（含 /metrics）                          |
| dataRoutes                                 | /api/v1/data                      | optionalJwtAuth + assignGuestReadonly      |
| backtestRoutes                             | /api/v1/backtest                  | computeMiddleware + computeLimiter(10/min) |
| backtestOptimizerRoutes                    | /api/v1/backtest-optimizer        | 同上                                       |
| tacticalRoutes / tacticalGridRoutes        | /api/v1/tactical*                 | 同上                                       |
| signalRoutes                               | /api/v1/signal                    | 同上                                       |
| analysisRoutes                             | /api/v1/{pca,letf,...}            | 同上                                       |
| authRoutes                                 | /api/v1/auth                      | 公开（登录/注册/验证）                     |
| apiKeyRoutes                               | /api/v1/keys                      | crudMiddleware(ADMIN_ACCESS)               |
| adminKeyRoutes                             | /api/v1/admin/keys                | jwtAuth + requirePlatformAdmin             |
| orgRoutes                                  | /api/v1/orgs                      | jwtAuth + resolveTenant                    |
| portfolioRoutes / configRoutes / runRoutes | /api/v1/{portfolios,configs,runs} | jwtAuth + resolveTenant + requireTenant    |
| billingRoutes                              | /api/v1/billing                   | jwtAuth + resolveTenant + requireTenant    |
| jobRoutes                                  | /api/v1/jobs                      | jwtAuth + 所有权校验                       |
| adminRoutes / auditRoutes / rbacRoutes     | /api/v1/admin                     | adminMiddleware + adminLimiter(30/min)     |
| webhookRoutes                              | /api/v1/webhooks                  | crudMiddleware(ADMIN_ACCESS)               |

> computeMiddleware = jwtAuth then resolveTenant then requirePermission then enforceQuota then auditLog
> crudMiddleware(X) = jwtAuth then resolveTenant then requirePermission(X) then auditLog then idempotencyKey

## 4. 中间件链

| 中间件               | 职责                                  |
| -------------------- | ------------------------------------- |
| helmet               | 安全头                                |
| cors                 | CORS_ORIGINS 白名单（生产 hard-fail） |
| express.json         | JSON 解析（限 10mb）                  |
| apiLimiter           | 全局限流（100 req/min）               |
| jwtAuth              | JWT 验证（jose, RS256）               |
| resolveTenant        | 从 JWT/API Key 解析 tenant_id         |
| requirePermission(X) | RBAC 权限校验                         |
| enforceQuota         | 按计划配额限制（ADR-036）             |
| auditLog             | 写操作审计（HMAC 签名）               |
| idempotencyKey       | 幂等性（Redis 存储）                  |

## 5. 应用服务层 (application/)

| 模块     | 关键文件                                        | 职责               |
| -------- | ----------------------------------------------- | ------------------ |
| auth     | userService, loginLockout                       | 用户CRUD, 登录锁定 |
| org      | membershipService, invitationService            | 成员/邀请管理      |
| billing  | billingService, usageService, planLimitsService | Stripe计费         |
| backtest | backtest-service, backtestCompletedHandler      | Run 聚合根驱动回测 |
| —        | analysis-orchestrator, signal-orchestrator      | 跨层编排           |

## 6. 领域层 (domain/)

- aggregates/run.ts: Run 聚合根（状态机 queued to running to completed/failed/cancelled）
- aggregates/portfolio.ts: Portfolio 聚合根（validateWeightSum）
- events/: RunStarted/RunCompleted/RunFailed/RunCancelled
- services/: grid-search, optimizer-domain
- value-objects/: ticker, weight

## 7. Outbox 模式 (ADR-014)

- outboxWriter.ts: 事务内写入 outbox 表（与业务数据原子）
- outboxPublisher.ts: LISTEN/NOTIFY 消费 + 幂等处理
- CDC 扩展: Debezium to Kafka（多 Pod 水平扩展, 见 runbooks/cdc-debezium.md）

## 8. 数据访问层

| 组件                   | 职责                                           |
| ---------------------- | ---------------------------------------------- |
| db/pool.ts             | PG 连接池（max=20）                            |
| dataQuery.ts           | 市场数据查询（goServiceSemaphore=10 并发限制） |
| goDataServiceClient.ts | Go 数据服务 HTTP 客户端                        |
| dataFacade.ts          | 数据门面（PG to Go 降级, 透传 degraded 标记）  |
| repositories/          | 仓储层（基于 withTenant RLS）                  |

## 9. 熔断与限流 (ADR-016)

| 服务       | 熔断器    | 策略                       |
| ---------- | --------- | -------------------------- |
| Go 引擎    | opossum   | fail-closed 503（ADR-031） |
| PostgreSQL | opossum   | 降级到 Go 数据服务         |
| BaoStock   | gobreaker | 数据获取降级               |

配置: 50% 失败率触发 Open, 10s 后 HalfOpen 探测。限流分层: apiLimiter(100/min) > computeLimiter(10/min) > adminLimiter(30/min)。Redis 不可用时 fail-closed。

## 10. Go 引擎 (engine-go/)

### 目录结构

    engine-go/
      cmd/server/main.go    入口
      internal/engine/       回测核心（gonum/stat）
      internal/montecarlo/   蒙特卡洛（gonum/stat/dist + sync.Pool）
      internal/optimizer/    Markowitz优化+有效前沿（gonum/optimize）
      internal/pca/          主成分分析
      internal/factorregression/  因子回归
      go-shared/             共享包（observability/otel.go）

### 失败策略 (ADR-031): callEngineStrict to Go to 503+Retry-After（同步）或 BullMQ 重试（异步）

### OTel: packages/go-shared/observability/otel.go, OTLP HTTP to SaaS 后端

## 11. Go 数据服务 (data-fetcher/)

### 职责

- 数据兜底: PostgreSQL 缺失时拉取（ticker 实时抓取）
- 多源拉取: BaoStock（A股） to Yahoo Finance（美股） to 缓存
- 行情缓存: TTL-based
- 信号量: 并发控制（默认 10, ADR-027）
- 熔断器: sony/gobreaker

### 多市场: A股(BaoStock) / 美股+港股(Yahoo Finance) / ETF(东方财富)

## 12. 多架构 Docker

- multi-stage build（scratch/alpine 最终镜像）
- amd64 + arm64（buildx）
- 供应链(ADR-052): SBOM(syft) + cosign Keyless 签名

## 13. 配置 (config/)

- env.ts: 环境变量加载 + Zod 验证
- index.ts: 配置导出（GO_ENGINE_URL, DATABASE_URL, REDIS_URL 等）
- limits.ts: 按计划配额定义（ADR-036）

## 14. 关键约束

- Go 引擎是唯一计算引擎（ADR-031），无 Node 降级
- 数据降级: PG to Go data-fetcher（缺失 ticker），透传 degraded: true
- x-api-key 路径: /api/v1/keys（非 /api/v1/api-keys）
- Worker 独立进程: BullMQ worker 与 API 分离部署
- Stripe Webhook: 独立挂载（Stripe 签名验证，无 jwtAuth）
