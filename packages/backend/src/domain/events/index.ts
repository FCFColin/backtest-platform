// DDD: Domain Events 模块入口
//
// 导出领域事件分发器。
// - EventDispatcher：事件分发器，路由事件到已注册的处理器（ADR-013）
//
// 注意：事件处理器（Handlers）位于 application/ 层（如 backtestCompletedHandler.ts），
// 因为它们执行持久化、日志等副作用；domain 层不依赖 services（ADR-013 分层约束）。

// 事件分发器（ADR-013）
export { eventDispatcher } from './EventDispatcher.js';
