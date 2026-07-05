// DDD: Domain Events 模块入口
//
// 导出领域事件类型定义、事件分发器与处理器。
// - 类型定义（RebalanceTriggered/BacktestCompleted）：聚合根发布的事件契约
// - EventDispatcher：事件分发器，路由事件到已注册的处理器（ADR-013）
// - Handlers：事件处理器，执行事件触发的副作用（审计、日志等）

// 现有领域事件类型定义
export type { RebalanceTriggered } from './rebalance-triggered.js';
export type { BacktestCompleted } from './backtest-completed.js';

// 事件分发器（ADR-013）
export type { DomainEvent, EventHandler } from './EventDispatcher.js';
export { DomainEventDispatcher, eventDispatcher } from './EventDispatcher.js';

// 事件处理器
export { BacktestCompletedHandler } from './handlers/BacktestCompletedHandler.js';
export { RebalanceTriggeredHandler } from './handlers/RebalanceTriggeredHandler.js';
