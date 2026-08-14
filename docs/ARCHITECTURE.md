# 系统架构（权威拓扑源）

## 1. 架构概览

4 服务 + worker, 2 语言（TS/Go）: 前端 → Express API + worker → Go 引擎 + Go 数据服务

    前端(Vite:15173) -> Express API(:15001) -> Go 引擎(:15004)    [回测/MC/优化/PCA]
                            |
                            +-> Go 数据服务(:15003)              [数据兜底/多源拉取]
                            |
                            +-> PostgreSQL(:5432) + Redis(:6379)
                            |
                            +-> worker(BullMQ)                    [异步回测/幂等消费]

## 2. 技术栈

| 层              | 技术                                                    |
| --------------- | ------------------------------------------------------- |
| 前端            | React 19 + TS + Vite 6 + Tailwind 3 + Zustand + ECharts |
| 后端 API        | Express 4 + TS(ESM) + tsx                               |
| 引擎            | Go(engine-go, gin + gonum) — 唯一计算引擎               |
| 数据服务        | Go(data-fetcher, gin)                                   |
| 数据库 / 缓存   | PostgreSQL(pg) / Redis(ioredis + BullMQ)                |
| 验证 / 可观测性 | Zod v4 / pino + OTel + prom-client                      |

## 3. 降级策略

| 场景              | 策略                                     | 响应                                |
| ----------------- | ---------------------------------------- | ----------------------------------- |
| 引擎不可用        | fail-closed(ADR-008)                     | 503 + Retry-After, 无 degraded 字段 |
| PostgreSQL 不可用 | 降级到 Go 数据服务(缺失 ticker 实时抓取) | degraded: true + degradedWarning    |
| Redis 不可用      | fail-closed                              | 503(认证/限流), 跳过缓存(数据)      |

## 4. 服务与端口

| 端口  | 服务                  | 暴露                  | 端口  | 服务        | 暴露      |
| ----- | --------------------- | --------------------- | ----- | ----------- | --------- |
| 15173 | 前端 Vite(仅本地 dev) | 不暴露(生产 nginx:80) | 15003 | Go 数据服务 | 内网      |
| 15001 | 后端 API              | 内网(APISIX 代理)     | 5432  | PostgreSQL  | 内网(TLS) |
| 15004 | Go 引擎               | 内网                  | 6379  | Redis       | 内网(TLS) |
| —     | worker(BullMQ)        | 内网(无 HTTP 端口)    |       |             |           |

## 5. 顶层目录结构

| 目录                                  | 内容                                         |
| ------------------------------------- | -------------------------------------------- |
| packages/frontend/, backend/, shared/ | React 前端 / Express API + 领域层 / 共享类型 |
| engine-go/ / data-fetcher/            | Go 回测·MC·优化引擎 / Go 数据服务            |
| packages/go-shared/                   | Go 共享包(observability)                     |
| data/                                 | 运行期缓存（gitignored，非运行时降级源）     |
| migrations/ / tests/                  | 版本化迁移 / 全量测试                        |

## 6. 后端分层

| 层              | 目录                            | 职责                                                |
| --------------- | ------------------------------- | --------------------------------------------------- |
| 路由            | routes/                         | HTTP 端点 + 中间件链                                |
| 应用            | application/                    | 用例编排(billing/org/auth/backtest)                 |
| 领域            | domain/                         | 聚合根(Portfolio) + 事件 + 值对象                   |
| 基础设施 / 仓储 | infrastructure/ / repositories/ | dataFacade/dataQuery/outbox；withTenant(RLS) 持久化 |

> 详见 [wiki/deep-dive.md](./wiki/deep-dive.md)

## 7. 认证授权 (ADR-007)

JWT(jose) Access 15min（prod RS256，dev 默认 HS256）；Refresh 7d + 轮换（Redis, httpOnly Cookie, BFF）；
x-api-key → analyst 角色；RBAC 三角色 × 七权限；Idempotency-Key 中间件；tenant_id + RLS(ADR-009)。

## 8. 可观测性 (ADR-006)

| 支柱        | Node.js                  | Go                         |
| ----------- | ------------------------ | -------------------------- |
| 日志 / 指标 | pino(JSON) / prom-client | slog(JSON) / client_golang |
| 追踪        | @opentelemetry/sdk-node  | otelgin + OTLP             |

Trace: 各服务 → OTLP HTTP → SaaS 后端。Go OTel 收口到 packages/go-shared/observability/otel.go。

## 9. 熔断器（DADR-016 已删除，行为保留）

| 服务         | 熔断器        | 保护               |
| ------------ | ------------- | ------------------ |
| Go 引擎      | opossum(Node) | fail-closed 503    |
| PostgreSQL   | opossum(Node) | 降级到 Go 数据服务 |
| 数据服务上游 | gobreaker(Go) | 数据获取降级       |

配置: 50% 失败率 Open, 10s HalfOpen 探测。

## 10. 数据存储演进

JSON(DADR-002) → SQLite(DADR-006) → PostgreSQL(ADR-002)。行情持久化于 PostgreSQL，data/ 仅作运行期缓存。

## 11. ADR 索引

> 完整索引（含已删除/合并记录）见 [adr/README.md](./adr/README.md)。

核心 ADR: 001 Express / 002 PostgreSQL / 003 Go+TS / 004 DDD+Outbox / 005 Outbox+CDC / 006 可观测性 / 007 认证授权 / 008 单引擎 fail-closed / 009 多租户 RLS / 010 Stripe / 011 模块化 / 012 退役零消费者子系统 / 013 死 schema 退役 / 014 未实现引擎字段退役 / 015 data-fetcher worker CLI 退役。

## 12. 容量扩展瓶颈

| 顺序 | 瓶颈                  | 指标                       | 缓解                       |
| ---- | --------------------- | -------------------------- | -------------------------- |
| 1    | Compute/Node 事件循环 | node_eventloop_lag_seconds | BullMQ + HPA + Go 引擎扩展 |
| 2    | PG 连接池             | pg_pool_waiting_count      | 读副本                     |
| 3    | 数据服务 + 外部 API   | data_service_semaphore_*   | 缓存 + gobreaker           |
| 4    | Redis                 | 503 限流                   | Sentinel/Cluster           |
