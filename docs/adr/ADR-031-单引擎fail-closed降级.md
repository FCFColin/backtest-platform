# ADR-031: 单 Go 引擎 + Fail-Closed 降级

> **企业理由**：当平台从"本地免费工具"演进为"多租户付费 SaaS"后，"在引擎不可用时静默返回 Node 计算的、与主引擎数值不一致的结果"从一个可接受的可用性权衡，变成了一个**正确性事故**——付费用户在不同时刻对同一组合得到不同的回测数字，且仅凭一个 `degraded: true` 标记无从感知差异。本 ADR 取消正确性关键计算的静默降级，改为 fail-closed。

| 字段   | 值                                                           |
| ------ | ------------------------------------------------------------ |
| 状态   | 已接受                                                       |
| 日期   | 2026-06-25                                                   |
| 决策者 | 架构组                                                       |
| 范围   | 计算引擎、降级策略                                           |
| 取代   | ADR-003（Rust 主引擎 + Node 降级）                           |
| 关联   | ADR-008（Go 主引擎）、ADR-016（熔断器）、ADR-011（异步任务） |

## Context（背景和驱动力）

1. **单引擎收敛（ADR-008）**：架构已决定以 Go 引擎为唯一主计算引擎，Rust 引擎进入废弃迁移期，Node `api/engine/` 仅对"无引擎实现"的 Node-canonical 功能保留。
2. **静默降级的正确性风险**：旧 `callRustWithFallback` 在 Go/Rust 均不可用时，于 Node 进程内重算并返回结果，仅以 `degraded: true` 标记。Node 与 Go 在 drag（复利拖累）、CPI 通胀调整、汇率换算、现金流、glidepath、再平衡偏离带等高级功能上存在数值差异。
3. **付费产品的一致性契约**：SaaS 用户期望"同样的输入恒得同样的输出"。返回不一致的数字比返回明确的"暂不可用"更糟。
4. **同步与异步的不同诉求**：同步 HTTP 请求需要立即、明确的失败信号；异步任务（BullMQ）应能等待引擎恢复后重试，而非永久失败。

## Decision（决策内容）

### 调用优先级

```
callEngineStrict(endpoint, body)
  ├─ 1. Go 引擎（主）   ── 经 opossum 熔断器 + 指数退避重试
  ├─ 2. Rust 引擎（废弃迁移期保留） ── 经独立熔断器 + 重试
  └─ 3. 均不可用 ⇒ 抛出 EngineUnavailableError（fail-closed）
        └─ 不再静默降级到 Node 备用引擎
```

### 同步请求：503 + Retry-After

正确性关键端点（组合回测、蒙特卡洛、优化、有效前沿、单资产分析）在引擎不可用时，路由层捕获 `EngineUnavailableError`，返回：

- HTTP `503 Service Unavailable`
- `Retry-After: 30`（秒）
- RFC 7807 problem 体，`code: "ENGINE_UNAVAILABLE"`
- **绝不**包含 `degraded` 字段或 Node 计算结果

### 异步任务：入队 / 重试

异步回测任务（`backtest-compute` 队列）遇引擎不可用时，依赖 BullMQ 的重试 + 指数退避（见 ADR-011 / ADR-028），等待引擎恢复后重算，而非返回降级结果。

### Node-canonical 功能不受影响

`tactical`、`tacticalGrid`、`signal`、`goalOptimizer`、`pca`、`letf` 没有 Go/Rust 引擎实现，**Node 即权威实现**（canonical，非降级）。这些功能不经过 `callEngineStrict`，直接在 Node 计算，不标记 `degraded`。

### 代码落点

| 关注点                                        | 位置                                                           |
| --------------------------------------------- | -------------------------------------------------------------- |
| `EngineUnavailableError` / `callEngineStrict` | `api/utils/rustFallback.ts`                                    |
| 503 + Retry-After 翻译                        | `api/routes/backtestRoutes.ts`（`handleEngineUnavailable`）    |
| problem 响应附加头                            | `api/utils/errors.ts`（`sendProblem` 的 `headers` 参数）       |
| 引擎地址                                      | `api/config/index.ts`（`GO_ENGINE_URL` 默认 `127.0.0.1:5004`） |

`callRustWithFallback` / `unwrapFallbackResult` 标记 `@deprecated`，仅为迁移期向后兼容保留。

## Consequences（后果）

### 正面

- **正确性优先**：用户要么得到引擎计算的权威结果，要么得到明确的"暂不可用 + 重试提示"，杜绝静默的数值不一致。
- **可观测性**：503 与熔断器指标让降级/不可用率可监控、可告警，而非淹没在 `degraded` 标记中。
- **契约清晰**：同步 503 + `Retry-After`、异步入队重试，符合客户端的标准容错预期。

### 负面

- **可用性换正确性**：引擎全挂时，正确性关键端点直接不可用（旧方案仍能返回降级结果）。通过 Go 引擎多副本 + HPA + 熔断快速失败缓解。
- **客户端需处理 503**：前端与 SDK 必须实现 `Retry-After` 退避重试逻辑。
- **迁移期双引擎成本**：Rust 引擎在完全删除前仍作为二级回退保留，存在双份运行开销（见 ADR-008 迁移计划）。

## Follow-ups

- 扩展一致性测试至 Go↔Rust↔Node，证明数值 parity 后删除 `engine-rs/` 与 Rust 回退层。
- 前端在收到 503 时展示"计算引擎繁忙，请稍后重试"，并自动按 `Retry-After` 退避。
