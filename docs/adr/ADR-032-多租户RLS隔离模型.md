# ADR-032: 多租户 SaaS（RLS 隔离 + 服务端持久化 + BFF 认证 + 自助注册）

| 状态 | 已接受 | 日期 | 2026-06-25 | 合并 | 原 ADR-034/035 | 关联 | ADR-007, ADR-017 |

## Context

多租户 SaaS 需租户间数据隔离。组合/回测历史此前仅存 localStorage，跨设备不可用。SaaS 自助开通需邮箱注册与组织邀请。

## Decision

### 1. 多租户隔离：共享 schema + tenant_id + Postgres RLS

- 租户表含 tenant_id，RLS 策略 USING(tenant_id = current_setting('app.current_tenant_id'))
- withTenant(tenantId, fn)：事务内 SET LOCAL，自动复位防串租户
- 市场数据表（tickers/prices/cpi/exchange_rates）不启用 RLS——有意全局共享

### 2. 服务端持久化

- portfolios/saved_configs/backtest_runs（JSONB），CRUD 路由 + RLS 隔离

### 3. 前端认证（BFF 模式）

- Refresh Token 存 httpOnly Cookie（防 XSS），Access Token 存内存
- 401 自动刷新并重试；组织切换器；未登录回退 localStorage

### 4. 自助注册 + 邀请

- 邮箱注册 + 验证 + 组织邀请；nodemailer（console/smtp）

## Consequences

- (+) 纵深防御：查询遗漏 WHERE 时 RLS 仍拒绝跨租户行
- (-) 必须设上下文：忘记 withTenant 会报错（fail-safe）
- (-) 禁止用 SET（会话级），必须 SET LOCAL（事务级）防 PgBouncer 串租户
