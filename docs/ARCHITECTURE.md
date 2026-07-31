# 系统架构（权威拓扑源）

## 1. 架构概览

4 服务, 2 语言（TS/Go）: 前端 to Express API to Go 引擎 + Go 数据服务

    前端(Vite:15173) -> Express API(:15001) -> Go 引擎(:15004)    [回测/MC/优化/PCA]
                            |
                            +-> Go 数据服务(:15003)              [数据兜底/多源拉取]
                            |
                            +-> PostgreSQL(:5432) + Redis(:6379)

## 2. 技术栈

| 层        | 技术                                                                 |
| --------- | -------------------------------------------------------------------- |
| 前端      | React 18 + TypeScript + Vite 6 + Tailwind CSS 3 + Zustand + Recharts |
| 后端 API  | Express 4 + TypeScript(ESM) + tsx                                    |
| 引擎      | Go(engine-go, gin + gonum) — 唯一计算引擎                            |
| 数据服务  | Go(data-fetcher, gin)                                                |
| 数据库    | PostgreSQL(pg, node-postgres)                                        |
| 缓存/认证 | Redis(ioredis + BullMQ)                                              |
| 验证      | Zod v4                                                               |
| 可观测性  | pino + OpenTelemetry + prom-client                                   |

## 3. 降级策略

| 场景              | 策略                                     | 响应                                |
| ----------------- | ---------------------------------------- | ----------------------------------- |
| 引擎不可用        | fail-closed(ADR-031)                     | 503 + Retry-After, 无 degraded 字段 |
| PostgreSQL 不可用 | 降级到 Go 数据服务(缺失 ticker 实时抓取) | degraded: true + degradedWarning    |
| Redis 不可用      | fail-closed(ADR-018/045)                 | 503(认证/限流), 跳过缓存(数据)      |

## 4. 服务与端口

| 端口  | 服务        | 暴露              |
| ----- | ----------- | ----------------- |
| 15173 | 前端 Vite   | 公网(APISIX)      |
| 15001 | 后端 API    | 内网(APISIX 代理) |
| 15004 | Go 引擎     | 内网              |
| 15003 | Go 数据服务 | 内网              |
| 5432  | PostgreSQL  | 内网(TLS)         |
| 6379  | Redis       | 内网(TLS)         |

## 5. 顶层目录结构

| 目录                | 内容                                                   |
| ------------------- | ------------------------------------------------------ |
| packages/frontend/  | React 前端                                             |
| packages/backend/   | Express API + 领域层 + 基础设施                        |
| packages/shared/    | 共享类型 + Zod schema                                  |
| engine-go/          | Go 回测/蒙特卡洛/优化引擎                              |
| data-fetcher/       | Go 数据服务                                            |
| packages/go-shared/ | Go 共享包(observability)                               |
| data/               | 标的行情 JSON(仅 import:tickers, 非运行时降级)         |
| migrations/         | PostgreSQL 版本化迁移                                  |
| tests/              | 全量测试(unit/integration/contract/chaos/property/e2e) |

## 6. 后端分层

| 层       | 目录            | 职责                                  |
| -------- | --------------- | ------------------------------------- |
| 路由     | routes/         | HTTP 端点 + 中间件链                  |
| 应用     | application/    | 用例编排(billing/org/auth/backtest)   |
| 领域     | domain/         | 聚合根(Run/Portfolio) + 事件 + 值对象 |
| 基础设施 | infrastructure/ | dataFacade/dataQuery/outbox/redis     |
| 仓储     | repositories/   | 基于 withTenant(RLS) 的持久化         |

> 详见 [wiki/deep-dive.md](./wiki/deep-dive.md)

## 7. 认证授权 (ADR-017)

| 维度    | 实现                                             |
| ------- | ------------------------------------------------ |
| 认证    | JWT(jose, RS256), Access Token 15min             |
| Refresh | 7d + 轮换, Redis 存储(httpOnly Cookie, BFF 模式) |
| 兼容    | x-api-key -> analyst 角色                        |
| 授权    | RBAC 三角色(ADMIN/ANALYST/READONLY) x 七权限     |
| 幂等    | Idempotency-Key 中间件, Redis                    |
| 多租户  | tenant_id + Postgres RLS(ADR-032)                |

## 8. 可观测性 (ADR-015)

| 支柱 | Node.js                 | Go                       |
| ---- | ----------------------- | ------------------------ |
| 日志 | pino(JSON)              | slog(JSON)               |
| 指标 | prom-client             | prometheus/client_golang |
| 追踪 | @opentelemetry/sdk-node | otelgin + OTLP           |

Trace: 各服务 -> OTLP HTTP -> SaaS 后端(Honeycomb/Datadog/Axiom)。Go OTel 收口到 packages/go-shared/observability/otel.go。

## 9. 熔断器 (ADR-016)

| 服务       | 熔断器        | 保护               |
| ---------- | ------------- | ------------------ |
| Go 引擎    | opossum(Node) | fail-closed 503    |
| PostgreSQL | opossum(Node) | 降级到 Go 数据服务 |
| BaoStock   | gobreaker(Go) | 数据获取降级       |

配置: 50% 失败率 Open, 10s HalfOpen 探测。

## 10. 数据存储演进

JSON(ADR-002) -> SQLite(ADR-006) -> PostgreSQL(ADR-007)。JSON 仅用于 pnpm import:tickers, 非运行时降级。

## 11. ADR 索引

> 完整索引见 [adr/README.md](./adr/README.md)

| ADR     | 主题                   | 状态   |
| ------- | ---------------------- | ------ |
| ADR-004 | Express 选型           | 已接受 |
| ADR-007 | PostgreSQL 迁移        | 已接受 |
| ADR-008 | Go+TS 精简             | 已接受 |
| ADR-013 | DDD 渐进重构           | 已接受 |
| ADR-014 | Outbox + CDC           | 已接受 |
| ADR-015 | 可观测性选型           | 已接受 |
| ADR-016 | 熔断器 + 限流          | 已接受 |
| ADR-017 | JWT + RBAC + API Key   | 已接受 |
| ADR-018 | Redis + Sentinel       | 已接受 |
| ADR-023 | 数据隐私 + GDPR        | 已接受 |
| ADR-031 | 单引擎 fail-closed     | 已接受 |
| ADR-032 | 多租户 RLS             | 已接受 |
| ADR-036 | Stripe 计费            | 已接受 |
| ADR-038 | 灾难恢复               | 已接受 |
| ADR-046 | API 版本生命周期       | 已接受 |
| ADR-047 | 后端模块化             | 已接受 |
| ADR-050 | Module Federation 预留 | 已接受 |
| ADR-052 | CI 分层 + 供应链安全   | 已实施 |
| ADR-053 | Node 层库选型          | 已接受 |

## 12. 容量扩展瓶颈

| 顺序 | 瓶颈                  | 指标                       | 缓解                       |
| ---- | --------------------- | -------------------------- | -------------------------- |
| 1    | Compute/Node 事件循环 | node_eventloop_lag_seconds | BullMQ + HPA + Go 引擎扩展 |
| 2    | PG 连接池             | pg_pool_waiting_count      | PgBouncer + 读副本         |
| 3    | 数据服务 + 外部 API   | data_service_semaphore_*   | 缓存 + gobreaker           |
| 4    | Redis                 | 503 限流                   | Sentinel/Cluster           |

详见 [ops/capacity-planning.md](./capacity-planning.md)。
