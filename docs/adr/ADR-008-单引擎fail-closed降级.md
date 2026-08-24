# ADR-008: 单 Go 引擎 + Fail-Closed 降级

| 状态 | 已接受 | 日期 | 2026-06-25 | 取代 | DADR-003 | 关联 | ADR-003, DADR-016 |

## Context

SaaS 付费用户期望"同输入恒得同输出"。旧 callRustWithFallback 在引擎不可用时静默降级到 Node 计算，Node 与 Go 在 drag/CPI/汇率/现金流等存在数值差异，构成正确性风险。

## Decision

取消正确性关键计算的静默降级，改为 fail-closed。

- callEngineStrict：Go 引擎（主）→ 不可用抛 EngineUnavailableError（不降级到 Node）
- 同步请求：503 + Retry-After: 30 + RFC 7807 problem（code: ENGINE_UNAVAILABLE）
- 异步任务：BullMQ 重试 + 指数退避，等待引擎恢复
- 所有计算端点统一走 callEngineStrict
- 代码：engineClient.ts（callEngineStrict / EngineUnavailableError）、routeUtils.ts（503 + Retry-After）

## Consequences

- (+) 正确性优先：权威结果或明确"暂不可用"，杜绝数值不一致
- (-) 引擎全挂时计算端点不可用（通过 Go 多副本 + HPA + 熔断缓解）
- (-) 客户端需处理 503 + Retry-After 退避重试

## 补充（2026-08-24，C-023 裁决）

compute 端点可透传 data.degraded 标记，语义为"所用行情数据存在缺失"，
与计算服务自身的 fail-closed 行为正交。compute 自身失败仍须 503，
不得以 degraded 代替成功。载体：jobSubmission.ts 队列不可用同步兜底路径
（P-2 要求 degraded 三处一致可见，压制将致 grid 页静默展示不可信结果）。
