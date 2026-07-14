// DDD: Domain Events 模块入口
//
// 导出领域事件类型定义、事件分发器与处理器。
// - 类型定义（RebalanceTriggered/BacktestCompleted）：聚合根发布的事件契约
// - EventDispatcher：事件分发器，路由事件到已注册的处理器（ADR-013）
// - Handlers：事件处理器（可观测性 hook），记录结构化日志与监控指标（ADR-024）

// 现有领域事件类型定义
export type { RebalanceTriggered } from './rebalance-triggered.js';
export type { BacktestCompleted } from './backtest-completed.js';

// 事件分发器（ADR-013）
export type { DomainEvent, EventHandler } from './EventDispatcher.js';
export type { DomainLogger } from '../logger.js';
export { DomainEventDispatcher, eventDispatcher } from './EventDispatcher.js';

// 事件处理器
export { BacktestCompletedHandler } from './handlers/BacktestCompletedHandler.js';
export { RebalanceTriggeredHandler } from './handlers/RebalanceTriggeredHandler.js';
