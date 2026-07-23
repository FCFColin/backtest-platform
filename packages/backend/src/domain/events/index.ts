// DDD: Domain Events 模块入口
//
// 导出领域事件分发器与 Run 聚合根事件契约常量。
// - EventDispatcher：事件分发器，路由事件到已注册的处理器（ADR-013）
// - Run 事件常量：RunStarted/Completed/Failed/Cancelled，供 EventHandler 订阅引用
//
// 注意：事件处理器（Handlers）位于 application/ 层（如 backtestCompletedHandler.ts），
// 因为它们执行持久化、日志等副作用；domain 层不依赖 services（ADR-013 分层约束）。

// 事件分发器（ADR-013）
export { eventDispatcher } from './EventDispatcher.js';
// Run 聚合根事件契约常量（ADR-013 Phase 3）
export {
  RUN_STARTED_EVENT,
  RUN_COMPLETED_EVENT,
  RUN_FAILED_EVENT,
  RUN_CANCELLED_EVENT,
  RUN_AGGREGATE_TYPE,
  type RunEventType,
} from './EventDispatcher.js';
