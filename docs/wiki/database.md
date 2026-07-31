# 数据库与共享层指南

> 精简自: wiki/database.md（374行 to 150行）

## 1. PostgreSQL Schema 概览

| 类别           | 关键表                                           | 说明                                                         |
| -------------- | ------------------------------------------------ | ------------------------------------------------------------ |
| 用户与身份     | users                                            | username, password_hash(argon2id), role, is_active           |
| 租户与成员     | organizations, memberships                       | org(id, name, slug, plan), membership(org_id, user_id, role) |
| 鉴权与 API Key | api_keys, email_verification_tokens, invitations | SHA-256 哈希存储                                             |
| 业务数据       | portfolios, saved_configs, backtest_runs         | JSONB 载荷, tenant_id 隔离                                   |
| 市场数据       | tickers, prices, cpi_data, exchange_rates        | 全局共享, 无 RLS                                             |
| 事件与投递     | outbox                                           | LISTEN/NOTIFY + CDC(Debezium)                                |
| 计费与用量     | billing_subscriptions, usage_records             | Stripe 集成                                                  |
| RBAC           | roles, permissions, role_permissions             | RBAC 三角色 x 七权限                                         |
| 审计           | audit_logs                                       | HMAC-SHA256 链式 hash 校验                                   |

## 2. 迁移文件 (001-045)

迁移文件在 migrations/ 目录，golang-migrate 管理 Up/Down。CI migration-rollback job 验证 up to down to up 循环。

PgBouncer 配置: transaction 模式 + RLS 兼容（SET LOCAL 事务级, 禁止 SET 会话级）。

## 3. 索引清单

| 表         | 索引                                 |
| ---------- | ------------------------------------ |
| prices     | (ticker, date) 复合, date BRIN       |
| tickers    | search_vector tsvector + GIN         |
| users      | username UNIQUE                      |
| api_keys   | key_hash UNIQUE                      |
| audit_logs | created_at, user_id                  |
| outbox     | processed_at, idempotency_key UNIQUE |

## 4. 行级安全 (RLS) — ADR-032

- 会话变量: app.current_tenant_id（SET LOCAL 设置）
- RLS 策略: USING(tenant_id = current_setting('app.current_tenant_id')::uuid) WITH CHECK 同条件
- FORCE RLS: 运行角色 backtest_app 不得拥有 BYPASSRLS（迁移 031）
- 不启用 RLS 的表: tickers, prices, cpi_data, exchange_rates, audit_logs, outbox（有意为之）

## 5. Redis 用途

| 用途          | TTL   | 降级            |
| ------------- | ----- | --------------- |
| Refresh Token | 7d    | fail-closed 503 |
| 限流计数      | 60s   | fail-closed     |
| 幂等键        | 24h   | fail-closed     |
| 数据缓存      | 3600s | 跳过缓存        |

requireRedis 封装: Redis 不可用时显式 503（非内存降级, ADR-018/045）。

## 6. 共享类型 (packages/shared/types/)

Barrel export from index.ts。关键类型: Portfolio, BacktestParameters, Statistics(60+字段), MonteCarloParameters, OptimizationResult, CHART_COLORS。

## 7. ProblemDetails 错误格式 (RFC 7807)

格式: { success: false, error: { type, title, status, code, detail } }

类型化错误层级: AppError 基类 to 具体错误(ValidationError, AuthError, EngineUnavailableError 等)。ErrorCodes 常量定义所有错误码。

降级响应差异: 数据服务降级包含 degraded: true + degradedWarning; 引擎不可用是 503（无 degraded 字段, ADR-031）。

## 8. 测试

| 类型  | 目录               | 说明                       |
| ----- | ------------------ | -------------------------- |
| 集成  | tests/integration/ | testcontainers PG + Redis  |
| 单元  | tests/unit/        | mocks, 无 DB               |
| Chaos | tests/chaos/       | 网络分区, 容器重启         |
| 契约  | tests/contract/    | OpenAPI 3.0, 覆盖率 >= 95% |

覆盖率门控: lines >= 80%, functions >= 80%, branches >= 70% (scripts/check-coverage.mjs)。

## 9. 关键 ADR 对照

| ADR     | 主题                          |
| ------- | ----------------------------- |
| ADR-007 | PostgreSQL 迁移               |
| ADR-013 | DDD 领域模型                  |
| ADR-014 | Outbox + CDC                  |
| ADR-017 | JWT + RBAC + API Key          |
| ADR-032 | 多租户 RLS                    |
| ADR-045 | Redis fail-closed vs 降级分化 |
