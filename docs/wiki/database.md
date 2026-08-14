# 数据库与共享层指南

## 1. PostgreSQL Schema 概览

| 类别              | 关键表                                               | 说明                                                    |
| ----------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| 用户与身份        | users                                                | username, password_hash(argon2id), role, is_active      |
| 租户与成员        | organizations, memberships                           | org(id,name,slug,plan), membership(org_id,user_id,role) |
| 鉴权与 API Key    | api_keys, email_verification_tokens, invitations     | argon2id 校验 + SHA-256 查询索引                        |
| 业务数据          | portfolios, saved_configs, backtest_runs             | JSONB 载荷, tenant_id 隔离                              |
| 市场数据          | tickers, prices, cpi_data, exchange_rates            | 全局共享, 无 RLS                                        |
| 事件与投递 / 计费 | outbox / subscriptions, usage_events, usage_counters | LISTEN/NOTIFY + CDC / Stripe                            |
| RBAC / 审计       | roles, role_permissions, user_roles / audit_logs     | 三角色×七权限 / HMAC 链式 hash                          |

## 2. 迁移与索引

migrations/ 由自研 runner（packages/backend/src/db/migrations.ts, schema_migrations 追踪）管理 Up/Down；CI check-migrations 验证命名/连续性/UP-DOWN 配对。PgBouncer: transaction 模式 + RLS 兼容（SET LOCAL, 禁 SET 会话级）。

| 表                         | 索引                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| prices                     | (ticker,date) 复合, date BRIN                                                                                           |
| tickers / users / api_keys | search_vector GIN / username UNIQUE / key_hash UNIQUE                                                                   |
| audit_logs / outbox        | org_id+created_at DESC, chain(created_at,id) btree, metadata GIN, unexported / unprocessed(created_at), event_id UNIQUE |

## 3. 行级安全 (RLS) — ADR-009

- 会话变量: app.current_tenant_id（SET LOCAL）
- 策略: USING(tenant_id = current_setting(...)) WITH CHECK 同条件
- FORCE RLS: backtest_app 不得 BYPASSRLS；001 末段循环对所有 ENABLE RLS 表统一 FORCE（含 audit_logs/webhook/billing，003 经平台 admin 角色策略逃逸）
- 不启用 RLS: tickers, prices, cpi_data, exchange_rates, outbox（有意为之）

## 4. Redis 用途

| 用途                              | TTL                      | 降级            |
| --------------------------------- | ------------------------ | --------------- |
| Refresh Token / 限流计数 / 幂等键 | 7d / 60s / 1h            | fail-closed 503 |
| 数据缓存                          | 86400(历史) / 3600(搜索) | 跳过缓存        |

requireRedis 封装: Redis 不可用显式 503（非内存降级，见 infra/redisClient.ts）。

## 5. 共享类型 (packages/shared/types/)

Barrel export from index.ts。关键类型: Portfolio, BacktestParameters, Statistics(60+字段), MonteCarloParameters, OptimizationResult, CHART_COLORS。

## 6. ProblemDetails 错误格式 (RFC 7807)

`{ success: false, error: { type, title, status, code, detail } }`。
类型化错误: AppError 基类 → ValidationError/AuthError/EngineUnavailableError 等；ErrorCodes 常量。
降级差异: 数据服务 degraded: true + degradedWarning；引擎 503 无 degraded（ADR-008）。

## 7. 关键 ADR 对照

ADR-002 PostgreSQL / 004 DDD / 005 Outbox+CDC / 007 JWT+RBAC+API Key / 009 多租户 RLS。完整索引见 [ARCHITECTURE.md](../ARCHITECTURE.md#11-adr-索引)。
