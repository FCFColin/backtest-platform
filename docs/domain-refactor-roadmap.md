# 领域层重构路线图与完成定义（T-30，维度1）

> 长期演进文档。配套 ADR-013（领域模型重构策略）。本文件定义限界上下文、CQRS 方向、
> 充血模型迁移的**完成定义（DoD）**，作为渐进式重构的北极星，避免"重构无终点"。

## 1. 为什么（企业工程原理）

当前领域逻辑（统计计算、再平衡、信号）大量以过程式函数散落于 `packages/backend/src/engine/*`，
路由层直接编排引擎调用。这是典型的**贫血模型**：数据（shared/types）与行为（engine 函数）分离。
随业务增长，规则散落导致：一处规则变更需改多个调用点、难以单测、新人难以建立心智模型。
DDD 充血模型 + 限界上下文 + CQRS 是应对领域复杂度增长的行业标准（市场价值：高级/架构岗核心能力）。

## 2. 限界上下文（Bounded Contexts）

| 上下文                        | 职责                          | 子域类型 | 当前代码                                                                                           |
| ----------------------------- | ----------------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| **Backtesting**（回测）       | 组合回测、再平衡、现金流      | 核心域   | `packages/backend/src/engine/portfolio.ts`、`packages/backend/src/application/backtest-service.ts` |
| **Analytics**（统计分析）     | Sharpe/回撤/相关性/PCA 等指标 | 核心域   | `packages/backend/src/engine/statistics.ts`、`pca.ts`                                              |
| **Strategy**（策略/信号）     | 战术信号、网格搜索、择时      | 支撑域   | `packages/backend/src/engine/tactical*.ts`、`signal.ts`                                            |
| **MarketData**（行情数据）    | 价格/指数/汇率获取与缓存      | 支撑域   | `packages/backend/src/services/dataService.ts`、`data-fetcher/`                                    |
| **Identity & Access**（身份） | 认证、RBAC、会话              | 通用域   | `packages/backend/src/middleware/jwtAuth.ts`、`rbac.ts`、`userService.ts`                          |
| **Auditing**（审计/事件）     | 审计日志、Outbox、领域事件    | 通用域   | `packages/backend/src/middleware/auditLog.ts`、`packages/backend/src/domain/events/`               |

## 3. CQRS 方向

- **Command 侧**（写/计算）：提交回测/优化任务 → 经 application service → 领域聚合 → 经 BullMQ 异步执行。
- **Query 侧**（读）：历史价格、任务结果、统计读取走独立只读路径（可走 `DATABASE_READ_URL` 只读副本）。
- 读写模型分离后，读侧可独立缓存/投影，不被写侧事务约束拖累。

## 4. 充血模型迁移优先级

1. `Portfolio` 聚合（已存在 `packages/backend/src/domain/aggregates/portfolio.ts`）：将权重归一化、再平衡触发等规则内聚到聚合方法。
2. 值对象固化：`Ticker`（已存在）、`Weight`、`DateRange`、`Price`（已有单测骨架，见 tests/unit/domain）。
3. 将 `engine/*` 的纯函数按上下文归类，逐步以聚合方法或领域服务包裹，路由仅经 application service 调用。

## 5. 完成定义（DoD）—— 何时算"迁移完成"

- [~] 每个限界上下文有明确的模块边界（`packages/backend/src/application/*`），跨上下文经 service/事件通信
- [~] 路由层不再 import `packages/backend/src/engine/*`（类型 re-export 经 application 层）
- [~] 核心域规则内聚到聚合/值对象（权重、Ticker、再平衡事件）并有单测
- [x] CQRS 接口约定 + query/command service 分离（`cqrs.ts`、`backtest-query-service`）
- [~] 领域事件为跨上下文副作用通道（`RebalanceTriggered`、`BacktestCompleted` + Outbox）
- [x] shared/types 为传输契约，domain/application 承载行为

### 剩余工作

- **MarketData / Identity & Access 两个限界上下文尚未开始**：当前仅 Backtesting、Analytics、Strategy、Auditing 四个上下文有 application service 骨架，MarketData 与 Identity&Access 仍以过程式服务存在，未抽取聚合/事件。
- **3 个路由绕过 application 层**：部分路由仍直接 import `packages/backend/src/engine/*` 而非经 application service 编排，违反 CQRS 分层约定。
- **Portfolio 聚合生产零引用**：`packages/backend/src/domain/aggregates/portfolio.ts` 已定义但无生产代码调用，规则内聚仅为单测覆盖，未接入实际回测流程。
- **publishRebalanceTriggered 零调用方**：`RebalanceTriggered` 事件的发布方法已实现但无任何调用方，事件通道实际未激活。

## 6. 非目标 / 权衡

- 不追求一次性大爆炸重构（高风险）。采用绞杀者模式（Strangler Fig）逐上下文迁移，每步保持绿灯。
- 当前规模下 CQRS 完整投影/事件溯源为"超前实践"，但 Command/Query 路径分离的**接口约定**先行，
  为未来规模化保留扩展点（符合"行业标准实践即使超前也应注明并奠基"的原则）。
