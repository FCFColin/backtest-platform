# ADR-024: Transactional Outbox 强一致与消费者幂等

> **企业理由**：异步消息系统的两大正确性陷阱是"重复投递"与"丢失投递"。Outbox 模式解决丢失，去重键与消费者幂等解决重复。二者缺一，分布式系统就会出现数据不一致或重复副作用。

| 字段   | 值                           |
| ------ | ---------------------------- |
| 编号   | ADR-024                      |
| 状态   | 已接受                       |
| 日期   | 2026-06-25                   |
| 决策者 | 架构组                       |
| 范围   | Outbox / 事件分发 / 任务队列 |

## Context

审计（维度6 / 6.3-6.6）发现：

- 同一 `BacktestCompleted` 事件被写入 outbox **两次**：`application/backtest-service` 的事务写入，
  以及 `BacktestCompletedHandler` 的非事务写入。
- 更严重：`OutboxPublisher` 读取事件后 `dispatch` 给 `eventDispatcher`，后者又调用
  `BacktestCompletedHandler` → 再写一行 outbox → `NOTIFY` → publisher 再读取 → **反馈环（无限增长）**。
- outbox 无去重键/唯一约束，"基于内容幂等"的注释承诺并无对应实现。
- BullMQ 消费者无幂等契约（重试直接重算）。

## Decision

1. **单一写入点**：outbox 的唯一写入点为 `backtest-service` 的事务写入。
   `BacktestCompletedHandler` 重构为**纯观测副作用**（仅日志/指标），不再写 outbox。
   → 同时消除重复写入与反馈环，并使领域层处理器不再依赖数据库（分层更纯）。
2. **去重键（纵深防御）**：outbox 新增 `event_id UUID` + 部分唯一索引（`migrations/006`），
   写入侧 `ON CONFLICT (event_id) DO NOTHING`，使任何重复写入（重试、未来多路径）成为幂等 no-op。
3. **消费者幂等契约**：明确 optimizer/grid-search 为纯计算，重试安全；并在 `worker.ts` 注明
   未来引入带副作用任务时必须加入基于 `job.id` 的幂等守卫。

## Consequences

- 优势：消除重复事件与反馈环；写入幂等；分层纯净；为未来"业务+事件真正双写"留出清晰扩展点。
- 劣势：`event_id` 可空以兼容历史行——新代码应始终提供。
- 测试：更新 `BacktestCompletedHandler` 测试断言其不再访问数据库。
- 工程权衡（Chesterton 围栏）：先理解处理器为何也写 outbox（历史上是事件落库的唯一路径），
  确认事务写入引入后该职责已冗余，方才移除——而非盲目删除。
