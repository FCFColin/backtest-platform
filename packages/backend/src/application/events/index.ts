// DDD: Application 层事件处理器模块入口
//
// 领域事件处理器属于 application 层（副作用层）：它们消费 domain 发布的事件，
// 执行持久化、可观测性等副作用。domain 层仅保留事件契约（类型）与分发器。
//
// - BacktestCompletedHandler：回测完成后持久化运行摘要到 backtest_runs（ADR-024）
export { BacktestCompletedHandler } from './handlers/BacktestCompletedHandler.js';
