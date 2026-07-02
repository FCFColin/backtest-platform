# ADR-020: 限流 fail-open / fail-closed 分级策略

> **企业理由**：限流的失败模式（Redis 不可用时放行还是拒绝）是安全与可用性的根本权衡。一刀切 fail-open 会让攻击者通过制造依赖抖动绕过所有限流，发起暴力破解与资源耗尽 DoS。

| 字段   | 值             |
| ------ | -------------- |
| 编号   | ADR-020        |
| 状态   | 已接受         |
| 日期   | 2026-06-25     |
| 决策者 | 安全/架构组    |
| 范围   | API 限流中间件 |

## Context

所有限流器统一使用 `passOnStoreError: true`（`api/app.ts`），即 Redis 不可用时放行请求。
审计（维度8 / A04，HIGH）指出：攻击者只需令 Redis 短暂不可用（或利用正常网络抖动），
即可绕过登录限流进行暴力破解、绕过 compute 限流发起资源耗尽型 DoS。

`passOnStoreError` 是 `express-rate-limit` 的故障策略开关：

- `true`（fail-open）：依赖故障时放行——可用性优先。
- `false`（fail-closed）：依赖故障时拒绝（503/429）——安全优先。

## Decision

按端点风险分级设定故障策略：

| 端点类别                                          | 策略                       | 理由                                                     |
| ------------------------------------------------- | -------------------------- | -------------------------------------------------------- |
| `/api/v1/auth/login`、`/auth/refresh`             | **fail-closed**            | 暴力破解/重放是直接攻击面，限流失效后果严重              |
| compute（`/api/backtest`、`/backtest-optimizer`） | **fail-closed**            | 资源耗尽 DoS，CPU/内存代价高                             |
| 全局 `apiLimiter`（只读 API）                     | **fail-closed**（ADR-025） | Redis 抖动可绕过全局配额滥用 /data；与敏感端点策略对齐   |
| `adminLimiter`、`data/manage`                     | fail-open                  | 已由 `jwtAuth` + RBAC 前置保护，限流为纵深防御非唯一防线 |

## Consequences

- 优势：消除"抖动绕过限流"攻击路径；安全敏感端点在依赖故障时安全地降级（拒绝）。
- 劣势：Redis 故障期间登录/计算端点不可用——这是刻意的安全权衡，且 Redis 应有 Sentinel/Cluster 高可用（ADR-018）。
- 监控：fail-closed 触发的 503 应纳入 SLO 错误预算并告警（区别于业务 429）。
- 工程权衡：纵深防御（jwtAuth 已保护的端点保留 fail-open）避免过度牺牲可用性。
