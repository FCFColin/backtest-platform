# ADR-041: 服务边界预切割策略

## Status
Proposed

## Date
2025-07-25

## Context
回测平台后端（`packages/backend/src/`）当前是单体应用，随着功能增长：
1. 模块间依赖混乱（auth 依赖 billing，data 依赖 backtest）
2. 代码合并冲突频繁（多团队同时修改同一目录）
3. 未来微服务化无清晰边界

## Decision

### 模块边界定义
将 `packages/backend/src/` 重组为模块化结构：

```
packages/backend/src/
├── modules/
│   ├── auth/          # 认证、授权、API Key、JWT
│   │   ├── index.ts   # 公共 API 导出
│   │   ├── routes/
│   │   ├── services/
│   │   └── repositories/
│   ├── billing/       # Stripe 计费、订阅、用量
│   ├── backtest/      # 回测引擎调用、Run 聚合根
│   ├── webhook/       # Webhook 端点管理、投递
│   ├── audit/         # 审计日志、链式校验
│   └── data/          # 市场数据、Ticker 管理
├── shared/            # 跨模块共享（logger, metrics, errors）
└── server.ts          # 启动入口
```

### 边界规则
1. **模块间只通过 `index.ts` 公共 API 调用**：禁止直接 import 内部文件
2. **不共享数据库表**：每个模块管理自己的表（通过 repository 隔离）
3. **优先用事件通信**：跨模块副作用通过 Outbox 事件
4. **共享代码提取到 `shared/`**：logger, metrics, error types

### 强制执行
- ESLint `no-restricted-imports` 规则禁止跨模块直接 import
- 每个模块的 `index.ts` 只导出公共 API（types, functions, classes）
- CI 检查：模块间依赖图无循环

### 不拆微服务
当前不拆分为独立微服务，但通过清晰的模块边界为未来拆分做准备：
- 每个模块可以独立部署（如果需要）
- 数据库表已按模块分组（RLS 策略兼容）
- 事件驱动通信已通过 Outbox 实现

## Consequences
- 代码重组需要大量迁移工作（分阶段进行）
- ESLint 规则可能需要临时例外（过渡期）
- 模块边界清晰后，团队可以按模块分工

## Related
- ADR-013: DDD 聚合根 + 事件溯源
- ADR-042: API 包合并
