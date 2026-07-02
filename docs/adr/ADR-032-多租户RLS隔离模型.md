# ADR-032: 多租户隔离模型（共享 Schema + tenant_id + Postgres RLS）

> **企业理由**：平台演进为多租户 SaaS 后，租户间数据隔离是**安全与合规的红线**。在应用层手写 `WHERE tenant_id = ?` 依赖"开发者永不遗漏"，任一遗漏即导致跨租户数据泄露。将隔离下沉到数据库（Postgres 行级安全 RLS）后，即使查询忘记过滤，数据库也会拒绝返回他租户行——隔离由 Postgres 强制，而非靠记忆。

| 字段   | 值                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------- |
| 状态   | 已接受                                                                                         |
| 日期   | 2026-06-25                                                                                     |
| 决策者 | 架构组                                                                                         |
| 范围   | 数据模型、鉴权、持久化                                                                         |
| 关联   | ADR-007（PostgreSQL）、ADR-017（认证授权）、ADR-018（Redis 会话）、ADR-019（异步任务越权防护） |

## Context（背景和驱动力）

1. **隔离强度 vs 运维成本**：常见多租户隔离方案有三种：
   - **独立数据库 / 独立 schema per tenant**：隔离最强，但租户数上千后迁移、连接池、备份运维爆炸。
   - **共享 schema + tenant_id + 应用层过滤**：成本低，但隔离完全依赖应用层不遗漏，风险高。
   - **共享 schema + tenant_id + Postgres RLS**：成本低，隔离由数据库强制，兼顾二者。
2. **现有基建**：已采用 PostgreSQL（ADR-007）、最小权限运行角色 `backtest_app`（迁移 `007_least_privilege.sql`）、Outbox 审计（ADR-014/024）。RLS 可直接复用。
3. **市场数据是公共的**：`tickers`、`prices`、`cpi_data`、`exchange_rates` 是跨租户共享的公开市场数据，**不应**进入租户隔离。

## Decision（决策内容）

采用 **共享 schema + `tenant_id` + Postgres Row-Level Security**。

### 数据模型（迁移 `009_tenancy.sql`）

- `organizations`（id UUID、name、slug、plan、status、created_at）—— 租户实体。
- `memberships`（org_id、user_id、role，PK(org_id,user_id)）—— 一个用户可属于多个组织，各组织内角色不同。
- `api_keys`（id、org_id、name、key_hash、last_used_at、revoked_at）—— 取代单一 `ADMIN_API_KEY`，按组织、可吊销、哈希存储。
- 租户拥有的数据表，每张含 `tenant_id UUID NOT NULL`：`portfolios`、`saved_configs`、`backtest_runs`（持久化结果/历史）。
- 现有 per-tenant 数据与 `outbox` 审计行补充 `tenant_id`。

### RLS 策略

对每张租户作用域表：

```sql
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolios FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON portfolios
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

- 运行角色 `backtest_app` **不得** 拥有 `BYPASSRLS`。
- 市场数据表（`tickers`/`prices`/`cpi_data`/`exchange_rates`）**不启用** RLS、**不加** `tenant_id`——有意全局共享。

### 租户上下文（每请求）

`api/db/index.ts` 新增 `withTenant(tenantId, fn)`：在事务内执行 `SET LOCAL app.current_tenant_id = $1`，使 RLS 策略在该事务内生效。所有租户作用域查询都经由它。`SET LOCAL` 随事务结束自动复位，避免连接池串租户。

### 租户感知鉴权

- JWT 载荷扩展 `tenant_id`（当前活跃组织）与该组织内的 `role`。
- 中间件从 JWT（或 API key 所属组织）解析 `tenant_id`，调用 `withTenant`。
- `POST /api/v1/auth/switch-org` 为另一 membership 签发新 token。

## Consequences（后果）

### 正面

- **纵深防御**：即便某查询遗漏 `WHERE tenant_id`，Postgres 仍拒绝跨租户行。
- **低运维成本**：单库单 schema，迁移/备份/连接池不随租户数膨胀。
- **可验证**：可用专门的跨租户隔离测试套件验证 RLS（租户 A 的连接读不到租户 B 的行）。

### 负面

- **必须设上下文**：任何忘记 `withTenant` 的租户查询会因 `app.current_tenant_id` 未设置而报错——这是 fail-safe（拒绝优于泄露），但需开发者理解。
- **连接池纪律**：必须使用 `SET LOCAL`（事务级），禁止 `SET`（会话级），否则 PgBouncer 复用连接会串租户。
- **平台级查询需显式提权**：运维/平台管理类跨租户查询需用独立的、受控的提权路径（platform_admin），不能依赖普通运行角色。

## Follow-ups

- 跨租户隔离测试套件（A 读不到 B）。
- 平台管理员（platform_admin）跨租户运维路径设计。
- 配额/计量（ADR 待定）按 `tenant_id` 聚合。
