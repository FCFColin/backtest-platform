# ADR-036: 计费与配额（Stripe + 按计划配额 + 公平调度）

> **企业理由**：SaaS 变现需要把组织映射到 Stripe 的 customer/subscription，支持自助订阅与管理。分层变现与滥用防护要求把"按计划限制资源消耗"落到请求与任务路径上；共享 worker 不能被单个租户占满而饿死他人。

| 字段   | 值                                     |
| ------ | -------------------------------------- |
| 编号   | ADR-036                                |
| 状态   | 已接受                                 |
| 日期   | 2026-06-25                             |
| 决策者 | 架构组                                 |
| 范围   | 计费、配额、计量、调度、多租户         |
| 合并   | 原 ADR-037（配额计量与公平调度）已并入 |
| 关联   | ADR-032（多租户 RLS）                  |

## Decision

### 1. Stripe 计费

- 采用官方 stripe SDK，密钥用 test-mode（sk_test_/pk_test_/whsec_），未配置时计费端点返回 503（计费未启用），不影响其余功能
- 数据（迁移 011_billing.sql）：stripe_customers(org_id PK, stripe_customer_id)、subscriptions(org_id, stripe_subscription_id UNIQUE, plan, status, current_period_end, cancel_at_period_end)。两表属计费控制平面，不启用 RLS（webhook 回调时无租户上下文，需按 stripe_customer_id 反查组织）
- billingService.ts：ensureCustomer、createCheckoutSession、createPortalSession、constructWebhookEvent（签名校验）、handleWebhookEvent（同步 subscriptions + 回写 organizations.plan/status，取消时计划回落 free）
- 路由：GET /subscription、POST /checkout、POST /portal（auth+tenant，写操作要求 ADMIN_ACCESS）
- webhook 关键点：POST /api/v1/billing/webhook 用 express.raw 在全局 express.json 之前挂载，以原始字节做签名校验；处理失败返回 5xx 让 Stripe 重试

### 2. 按计划配额定义

- 每计划：backtestsPerMonth、maxTickers、asyncConcurrency、rateLimitPerMin。free/pro/enterprise 三档，未知计划回落 free（最严格，fail-safe）
- 配额表在 config/planLimits.ts；查表函数 getPlanLimits 与计费周期工具 currentPeriod 见 planLimitsService.ts

### 3. 用量计量

- 迁移 012_usage.sql：usage_events（明细，审计/BI）+ usage_counters（按 org/period/metric 月度聚合，配额权威）；两表启用 RLS
- 双写 DB + Redis 月度计数器（快路径读，DB 兜底跨实例一致性），任一失败不阻断主流程

### 4. 配额中间件

- 计算/入队前校验单次标的数（超 422）与月度用量（达上限 402），放行后计量一次
- 无活跃租户（匿名本地开发）与 platform_admin 放行
- 速率限制按租户：computeRateLimitKey 优先 req.tenantId，使同组织成员共享配额

### 5. 租户公平调度

- 每租户在途任务计数（Redis inflight:org），超过 asyncConcurrency 时 DelayedError 延迟重试，让出名额；处理结束释放。Redis 异常时跳过门控（计数失效优于任务卡死）

## Consequences

- (+) 自助订阅/管理闭环，订阅状态由 webhook 权威同步，不依赖前端回调可靠性
- (+) 变现分层与滥用防护可执行；用量可计费对账；单租户无法饿死共享队列
- (+) 计费未配置时优雅降级（503），不阻断核心功能与本地开发
- (-) webhook 原始体顺序是经典坑点，必须在 json 解析前挂载（已隔离为独立路由）
- (-) 计量在放行后乐观计数，可能计入随后失败的计算（配额按"尝试"计，可接受）
- (-) 公平调度依赖 Redis 计数；其不可用时退化为仅 worker 全局并发上限
- (-) 与 Stripe API 版本耦合，升级 SDK 需回归
