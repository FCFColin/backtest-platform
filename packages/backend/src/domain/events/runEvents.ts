// DDD: Run 领域事件契约（ADR-013 Phase 3 Domain Event）
//
// Run 聚合根在状态转换时产生以下事件：
//   - RunStarted:    create() 时产生
//   - RunCompleted: running → completed 时产生
//   - RunFailed:    running → failed 时产生
//   - RunCancelled: queued|running → cancelled 时产生
//
// 事件 payload 由聚合根构造（domain/aggregates/run.ts），此文件仅导出事件类型常量
// 供 EventHandler 订阅时引用，避免散落的字符串字面量。
//
// 设计取舍：未为每个事件定义独立 interface/class，因为事件 payload 已在聚合根内部
// 内联构造，重复定义 interface 会造成双重维护。常量 + DomainEvent 接口足够类型安全。

/** Run 聚合根事件类型常量 */
export const RUN_STARTED_EVENT = 'RunStarted' as const;
export const RUN_COMPLETED_EVENT = 'RunCompleted' as const;
export const RUN_FAILED_EVENT = 'RunFailed' as const;
export const RUN_CANCELLED_EVENT = 'RunCancelled' as const;

/** Run 聚合根类型（用于事件 aggregateType 字段） */
export const RUN_AGGREGATE_TYPE = 'Run' as const;

/** 所有 Run 事件类型字面量联合，用于 EventHandler eventType 类型约束 */
export type RunEventType =
  | typeof RUN_STARTED_EVENT
  | typeof RUN_COMPLETED_EVENT
  | typeof RUN_FAILED_EVENT
  | typeof RUN_CANCELLED_EVENT;
