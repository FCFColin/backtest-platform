# 领域层重构路线图与完成定义（T-30，维度1）

> 长期演进文档。配套 ADR-013。定义限界上下文、CQRS 方向、充血模型迁移的**完成定义（DoD）**，作为渐进式重构的北极星。

## 1. 为什么

领域逻辑（统计计算、再平衡、信号）以过程式函数散落于 `engine/*`，路由层直接编排——典型**贫血模型**：数据（shared/types）与行为分离，导致规则变更需改多处、难单测、心智模型差。DDD 充血模型 + 限界上下文 + CQRS 是应对复杂度增长的行业标准。

## 2. 限界上下文

| 上下文                | 职责                       | 子域   | 当前代码                                                 |
| --------------------- | -------------------------- | ------ | -------------------------------------------------------- |
| **Backtesting**       | 组合回测、再平衡、现金流   | 核心域 | `engine/portfolio.ts`、`application/backtest-service.ts` |
| **Analytics**         | Sharpe/回撤/相关性/PCA     | 核心域 | `engine/statistics.ts`、`pca.ts`                         |
| **Strategy**          | 战术信号、网格搜索、择时   | 支撑域 | `engine/tactical*.ts`、`signal.ts`                       |
| **MarketData**        | 价格/指数/汇率获取与缓存   | 支撑域 | `services/dataService.ts`、`data-fetcher/`               |
| **Identity & Access** | 认证、RBAC、会话           | 通用域 | `middleware/jwtAuth.ts`、`rbac.ts`、`userService.ts`     |
| **Auditing**          | 审计日志、Outbox、领域事件 | 通用域 | `middleware/auditLog.ts`、`domain/events/`               |

## 3. CQRS 方向

Command 侧（写/计算）: 提交任务 → application service → 领域聚合 → BullMQ 异步执行。Query 侧（读）: 历史价格/任务结果走独立只读路径（可走 `DATABASE_READ_URL` 只读副本），可独立缓存/投影。

## 4. 充血模型迁移优先级

1. `Portfolio` 聚合（已存在 `domain/aggregates/portfolio.ts`）：权重归一化、再平衡触发内聚到聚合方法
2. 值对象固化：`Ticker`（已存在）、`Weight`、`DateRange`、`Price`（tests/unit/domain 有骨架）
3. `engine/*` 纯函数按上下文归类，以聚合方法/领域服务包裹，路由仅经 application service 调用

## 5. 完成定义（DoD）

- [~] 每上下文有明确模块边界（`application/*`），跨上下文经 service/事件通信
- [~] 路由层不再 import `engine/*`；核心域规则内聚到聚合/值对象并有单测
- [x] CQRS 接口约定 + query/command service 分离；[x] shared/types 为传输契约
- [~] 领域事件为跨上下文副作用通道（`RebalanceTriggered`、`BacktestCompleted` + Outbox）

### 剩余工作

- **MarketData / Identity & Access 尚未开始**：仅 Backtesting/Analytics/Strategy/Auditing 有 application service 骨架，另两个仍为过程式服务
- **3 个路由绕过 application 层**：仍直接 import `engine/*`，违反 CQRS 分层
- **Portfolio 聚合生产零引用**：已定义但无生产调用，规则内聚仅单测覆盖
- **publishRebalanceTriggered 零调用方**：事件通道实际未激活

## 6. 非目标 / 权衡

不追求一次性大爆炸重构（高风险），采用绞杀者模式（Strangler Fig）逐上下文迁移，每步保持绿灯。CQRS 完整投影/事件溯源当前规模为"超前实践"，但 Command/Query 分离的**接口约定**先行，为规模化保留扩展点。
