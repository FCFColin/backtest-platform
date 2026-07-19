# ADR-024: Transactional Outbox 强一致、消费者幂等与重试边界

> **企业理由**：异步消息系统的两大正确性陷阱是"重复投递"与"丢失投递"。Outbox 模式解决丢失，去重键与消费者幂等解决重复。重试仅限幂等操作，否则重复副作用不可逆。三者缺一，分布式系统就会出现数据不一致或重复副作用。

| 字段   | 值                                      |
| ------ | --------------------------------------- |
| 编号   | ADR-024                                 |
| 状态   | 已接受                                  |
| 日期   | 2026-06-25                              |
| 决策者 | 架构组                                  |
| 范围   | Outbox / 事件分发 / 任务队列 / 重试策略 |
| 合并   | 原 ADR-028（重试与幂等边界）已并入      |

## Context

审计发现以下问题：

1. 同一 `BacktestCompleted` 事件被写入 outbox **两次**：`application/backtest-service` 的事务写入，以及 `BacktestCompletedHandler` 的非事务写入。
2. `OutboxPublisher` 读取事件后 `dispatch` 给 `eventDispatcher`，后者又调用 `BacktestCompletedHandler` → 再写一行 outbox → `NOTIFY` → publisher 再读取 → **反馈环（无限增长）**。
3. outbox 无去重键/唯一约束，"基于内容幂等"的注释承诺并无对应实现。
4. BullMQ 消费者无幂等契约（重试直接重算）。
5. 重试策略缺乏明确的幂等边界定义，可能导致非幂等操作被自动重试。

## Decision

### 1. 单一写入点

outbox 的唯一写入点为 `backtest-service` 的事务写入。`BacktestCompletedHandler` 重构为**纯观测副作用**（仅日志/指标），不再写 outbox。→ 同时消除重复写入与反馈环，并使领域层处理器不再依赖数据库（分层更纯）。

### 2. 去重键（纵深防御）

outbox 新增 `event_id UUID` + 部分唯一索引（`migrations/006`），写入侧 `ON CONFLICT (event_id) DO NOTHING`，使任何重复写入（重试、未来多路径）成为幂等 no-op。

### 3. 消费者幂等契约

明确 optimizer/grid-search 为纯计算，重试安全；并在 `worker.ts` 注明未来引入带副作用任务时必须加入基于 `job.id` 的幂等守卫。

### 4. 重试边界

#### 可安全重试（幂等或无副作用）

| 操作                                 | 机制                | 位置                        |
| ------------------------------------ | ------------------- | --------------------------- |
| 引擎 HTTP GET/只读 POST（相同 body） | 指数退避 + jitter   | Go akshare/yfinance         |
| BullMQ 任务失败                      | exponential backoff | `backtestQueue.ts`          |
| Redis 连接                           | retryStrategy       | `services/redisClient.ts`   |
| 外部 HTTP 读（akshare/yfinance）     | 最多 3 次 + jitter  | `akshare.go`, `yfinance.go` |

#### 禁止自动重试（非幂等）

| 操作                                   | 原因                | 替代                         |
| -------------------------------------- | ------------------- | ---------------------------- |
| 用户注册/登录                          | 副作用、锁定计数    | 客户端重试 + Idempotency-Key |
| 数据 manage POST（无 Idempotency-Key） | 可能重复写入        | `idempotency.ts` 中间件      |
| Outbox 消费                            | 由幂等 eventId 保证 | `jobIdempotency.ts`          |

**规则**：重试必须满足 — **仅幂等读/可去重写** + **指数退避 + jitter** + **熔断器上限**。

## Consequences

- (+) 消除重复事件与反馈环；写入幂等；分层纯净
- (+) 重试边界明确，非幂等操作不会被自动重试
- (+) 为未来"业务+事件真正双写"留出清晰扩展点
- (-) `event_id` 可空以兼容历史行 — 新代码应始终提供
- (-) 需 code review 确保新增的重试逻辑仅针对幂等操作
- (-) 测试需更新：`BacktestCompletedHandler` 测试断言其不再访问数据库
