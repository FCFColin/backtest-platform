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
import { getPool } from '../../../db/index.js';
import type { EventHandler, DomainEvent } from '../EventDispatcher.js';

/**
 * BacktestCompleted 事件处理器
 *
 * 订阅 'BacktestCompleted' 事件，记录日志并写入 outbox 表，
 * 保证回测完成事件可被 OutboxPublisher 异步消费（如通知、统计）。
 */
export class BacktestCompletedHandler implements EventHandler {
  /** 订阅的事件类型，与 BacktestCompleted 接口的 type 字段一致 */
  readonly eventType = 'BacktestCompleted';

  /**
   * 处理 BacktestCompleted 事件
   *
   * 1. 记录结构化日志（含关键指标，便于排障与监控）
   * 2. 写入 outbox 表，由 OutboxPublisher 异步消费
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

    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO outbox (aggregate_type, aggregate_id, event_type, payload)
         VALUES ($1, $2, $3, $4)`,
        [
          event.aggregateType,
          event.aggregateId,
          'BacktestCompleted',
          {
            ...event.payload,
            occurredAt: event.occurredAt.toISOString(),
          },
        ],
      );

      // NOTIFY 不带 payload，由 OutboxPublisher 轮询 outbox 表读取新事件
      await pool.query('NOTIFY outbox_channel');

      logger.debug(
        { aggregateId: event.aggregateId },
        '[BacktestCompletedHandler] outbox 事件写入成功',
      );
    } catch (err) {
      // outbox 写入失败不阻塞事件分发，仅记录警告
      logger.warn(
        { err, aggregateId: event.aggregateId },
        '[BacktestCompletedHandler] outbox 事件写入失败',
      );
    }
  }
}
