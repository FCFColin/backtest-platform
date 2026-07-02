# ADR-025: 全局 apiLimiter fail-closed

| 字段 | 值                    |
| ---- | --------------------- |
| 编号 | ADR-025               |
| 状态 | 已接受                |
| 日期 | 2026-06-25            |
| 范围 | `api/app.ts` 全局限流 |

## Context

ADR-020 将全局 `apiLimiter` 保留为 fail-open，理由是只读路径可用性优先。
垂直审计 T-31 指出：攻击者仍可通过 Redis 抖动绕过 **100/15min** 全局配额，
对 `/api/v1/data/*` 等公开端点发起高频侦察与缓存穿透。

## Decision

将 `apiLimiter.passOnStoreError` 改为 `false`（fail-closed），与 auth/compute 一致。
Redis 不可用时返回 429/503，而非无限放行。

## Consequences

- 优势：消除全局限流绕过路径；纵深防御与 ADR-020 敏感端点策略一致。
- 劣势：Redis 故障期间只读 API 亦不可用——需 Redis HA（ADR-018 Sentinel/Cluster）。
- 监控：fail-closed 触发的 503 纳入 SLO 错误预算。
