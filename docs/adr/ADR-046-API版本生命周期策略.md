# ADR-046: API 版本生命周期策略

| 字段   | 值           |
| ------ | ------------ |
| 编号   | ADR-046      |
| 状态   | 已接受       |
| 日期   | 2026-07-26   |
| 决策者 | 架构组       |
| 范围   | API 版本管理 |

## Context

回测平台作为 B2C SaaS 服务，API Key 用户会直接调用 REST API。建立版本废弃机制是 GA 前必要的承诺，确保 API 消费者在版本升级时有充足的迁移窗口。当前所有 API 路由挂载在 /api/v1/ 下，legacy /api/ 路径已废弃。废弃中间件 deprecationHeaders.ts 已实现 RFC 8594 标准的 Deprecation/Sunset/Link 响应头。

## Decision

- 当前版本 v1 至少维护至 v2 上线后 12 个月
- 废弃版本在 Response Header 中注明：Deprecation: true（或 RFC 1123 日期）、Sunset: <RFC 1123 日期>（至少比 Deprecation 晚 12 个月）、Link: </api/v2/...>; rel="successor-version"
- 废弃通知提前 90 天通过 Webhook 推送（事件类型：api.version.deprecated）
- 破坏性变更必须创建新版本（v2），不允许在 v1 中引入
- 使用 packages/backend/src/middleware/deprecationHeaders.ts 中的 createDeprecationMiddleware

## Consequences

- (+) API 消费者有明确的迁移窗口和自动化检测能力（通过响应头编程式检测废弃）
- (+) Webhook 订阅者可在版本废弃时收到主动通知
- (-) 每个破坏性变更需要创建新版本路由，增加路由维护成本
- (-) 需维护多版本路由并存期间的测试覆盖
