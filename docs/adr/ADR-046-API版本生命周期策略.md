# ADR-046: API 版本生命周期策略

## 状态：已接受

## 日期：2026-07-26

## 上下文

回测平台作为 B2C SaaS 服务，API Key 用户（其他开发者）会直接调用 REST API。
虽然目前无外部 SDK 计划，但建立版本废弃机制是 GA（General Availability）前必要的承诺，
确保 API 消费者在版本升级时有充足的迁移窗口。

当前所有 API 路由挂载在 `/api/v1/` 下，legacy `/api/` 路径已废弃。
废弃中间件 `deprecationHeaders.ts` 已实现 RFC 8594 标准的 `Deprecation`/`Sunset`/`Link` 响应头。

## 决策

### 版本维护承诺

- 当前版本 **v1** 至少维护至 v2 上线后 **12 个月**
- 废弃版本在 Response Header 中注明：
  - `Deprecation: true`（或 RFC 1123 日期）
  - `Sunset: <RFC 1123 日期>`（至少比 Deprecation 晚 12 个月）
  - `Link: </api/v2/...>; rel="successor-version"`
- 废弃通知提前 **90 天**通过 Webhook 推送（事件类型：`api.version.deprecated`）
- 破坏性变更必须创建新版本（v2），**不允许**在 v1 中引入

### 废弃中间件

使用 `packages/backend/src/middleware/deprecationHeaders.ts` 中的 `createDeprecationMiddleware`：

```typescript
import { createDeprecationMiddleware } from './middleware/deprecationHeaders.js';
app.use(
  '/api/v1/legacy-endpoint',
  createDeprecationMiddleware({
    deprecated: '2026-01-01',
    sunset: '2027-01-01',
    successor: '/api/v2/new-endpoint',
  }),
);
```

### Webhook 事件

当 API 版本废弃时，通过 Webhook 系统推送 `api.version.deprecated` 事件给所有有效订阅端点。
事件 payload 包含：

- `version`: 被废弃的版本号（如 `"v1"`）
- `deprecatedDate`: 废弃日期
- `sunsetDate`: 关闭日期
- `successorVersion`: 替代版本号（如 `"v2"`）

## 后果

- **正面**：API 消费者有明确的迁移窗口和自动化检测能力（通过响应头编程式检测废弃）
- **正面**：Webhook 订阅者可在版本废弃时收到主动通知，而非被动发现
- **负面**：每个破坏性变更需要创建新版本路由，增加路由维护成本
- **负面**：需维护多版本路由并存期间的测试覆盖

## 关联

- RFC 8594: The Deprecation HTTP Response Header Field
- RFC 7231: HTTP/1.1 Semantics and Content（Sunset 头）
- `packages/backend/src/middleware/deprecationHeaders.ts`（废弃中间件实现）
- `packages/backend/src/application/webhookService.ts`（Webhook 事件投递）
