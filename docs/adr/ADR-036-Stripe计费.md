# ADR-036: 订阅计费（Stripe 官方 SDK，test-mode）

> **企业理由**：SaaS 变现需要把组织（租户）映射到 Stripe 的 customer/subscription，支持自助订阅（Checkout）、自助管理（Billing Portal），并以 webhook 把订阅状态权威同步回本地，驱动按计划的配额与功能门控。

| 字段   | 值                                         |
| ------ | ------------------------------------------ |
| 状态   | 已接受                                     |
| 日期   | 2026-06-25                                 |
| 决策者 | 架构组                                     |
| 范围   | 计费、多租户                               |
| 关联   | ADR-032（多租户 RLS）、ADR-037（配额计量） |

## Decision（决策内容）

- 采用官方 `stripe` SDK，密钥用 test-mode（`sk_test_` / `pk_test_` / `whsec_`），未配置时计费端点返回 503（计费未启用），不影响其余功能。
- 数据（迁移 `011_billing.sql`）：`stripe_customers(org_id PK, stripe_customer_id)`、`subscriptions(org_id, stripe_subscription_id UNIQUE, plan, status, current_period_end, cancel_at_period_end)`。两表属计费控制平面，不启用 RLS（webhook 回调时无租户上下文，需按 `stripe_customer_id` 反查组织）。
- `api/services/billingService.ts`：`ensureCustomer`、`createCheckoutSession`、`createPortalSession`、`constructWebhookEvent`（签名校验）、`handleWebhookEvent`（同步 `subscriptions` + 回写 `organizations.plan/status`，取消时计划回落 `free`）。
- `api/routes/billingRoutes.ts`：`GET /subscription`、`POST /checkout`、`POST /portal`（auth+tenant，写操作要求 ADMIN_ACCESS）。
- **webhook 关键点**：`POST /api/v1/billing/webhook` 用 `express.raw({ type: 'application/json' })` 在全局 `express.json` **之前**挂载，以原始字节做签名校验；处理失败返回 5xx 让 Stripe 重试。
- 前端 `BillingPage`：选择计划跳 Checkout、管理跳 Portal。

## Consequences（后果）

### 正面

- 自助订阅/管理闭环，订阅状态由 webhook 权威同步，不依赖前端回调可靠性。
- 计费未配置时优雅降级（503），不阻断核心功能与本地开发。

### 负面

- webhook 原始体顺序是经典坑点，必须在 json 解析前挂载（已隔离为独立路由）。
- 与 Stripe API 版本耦合（如 `current_period_end` 位于 subscription item），升级 SDK 需回归。
