/**
 * BacktestCompleted 事件处理器
 *
 * ADR-013：领域事件处理器实现
 *
 * 企业为何需要：回测完成是高价值业务事件，需触发审计记录与后续副作用
 * （如通知、统计聚合）。通过事件处理器将副作用从回测引擎中解耦，
 * 回测引擎只负责发布事件，处理器负责落库审计与触发下游。
 *
 * 权衡：
 * - outbox 写入失败仅记录警告，不抛出错误（不阻塞其他处理器）。
 *   事件分发器的 Promise.allSettled 已保证隔离性，此处再防御性捕获
 *   避免数据库不可用时影响回测主流程。
 * - outbox event_type 使用 'BacktestCompleted'，与领域事件 type 一致，
 *   便于 OutboxPublisher 按类型路由到下游消费者。
 */

import { logger } from '../../../utils/logger.js';
import type { EventHandler, DomainEvent } from '../EventDispatcher.js';

/**
 * BacktestCompleted 事件处理器
 *
 * 订阅 'BacktestCompleted' 事件，仅执行**非 outbox** 的进程内副作用（结构化日志、监控指标）。
 *
 * ADR-024 / T-11：此处理器**不再写 outbox**。
 * - 原因（Chesterton 围栏）：outbox 写入此前由本处理器以非事务方式承担，与
 *   application/backtest-service 的事务性写入重复，且因 OutboxPublisher 会把读到的事件
 *   再次 dispatch 给本处理器，形成 "读取→分发→再写→NOTIFY→再读取" 的反馈环（无限增长）。
 * - 修复：outbox 的唯一写入点为 backtest-service 的事务写入（ADR-024）。本处理器退化为
 *   纯观测副作用，既消除重复写入与反馈环，也使领域层处理器不再直接依赖数据库（分层更纯）。
 */
export class BacktestCompletedHandler implements EventHandler {
  /** 订阅的事件类型，与 BacktestCompleted 接口的 type 字段一致 */
  readonly eventType = 'BacktestCompleted';

  /**
   * 处理 BacktestCompleted 事件：记录结构化日志（含关键指标，便于排障与监控）。
   *
   * @param event - 领域事件，payload 包含 totalReturn/maxDrawdown/sharpeRatio
   */
  async handle(event: DomainEvent): Promise<void> {
    logger.info(
      {
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        totalReturn: event.payload.totalReturn,
        maxDrawdown: event.payload.maxDrawdown,
        sharpeRatio: event.payload.sharpeRatio,
      },
      '[BacktestCompletedHandler] 回测完成事件已接收',
    );
  }
}
