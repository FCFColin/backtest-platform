/**
 * Outbox 事务写入器（Task 11.1）
 *
 * Architecture: Outbox Pattern — 事务双写
 * 企业为何需要：Outbox 模式要求业务数据与 outbox 事件在同一数据库事务中写入，
 * 保证"业务写入成功 ⟺ 事件已记录"的原子性。若 outbox 写在事务外，
 * 业务提交后、事件写入前崩溃会导致事件丢失；反之业务回滚但事件已写入会导致幻象事件。
 * 本模块提供 writeEventInTransaction，由调用方在已开启的事务中调用，
 * 与业务数据写入共享同一 PoolClient，从而保证 ACID。
 *
 * 权衡：
 * - 调用方需自行管理 BEGIN/COMMIT/ROLLBACK 与 client.release()，
 *   增加样板代码，但保留对事务边界的完全控制（可在同一事务中混入任意业务写入）。
 * - 不在此处发送 NOTIFY：事务内的 NOTIFY 会在 COMMIT 时才通知监听者，
 *   避免回滚后产生无效通知。调用方在 COMMIT 后按需发送 NOTIFY。
 */

import type { PoolClient } from 'pg';
import { logger } from '../utils/logger.js';

/** Outbox 事件描述（由调用方构造，与领域事件字段对齐） */
export interface OutboxEvent {
  /** 聚合根类型（如 'BacktestSession'、'audit'） */
  aggregateType: string;
  /** 聚合根 ID（如 'backtest-1700000000000'） */
  aggregateId: string;
  /** 事件类型（如 'BacktestCompleted'、'AuditEvent'） */
  eventType: string;
  /** 事件负载，序列化为 JSONB 存储 */
  payload: Record<string, unknown>;
}

/**
 * 在已存在的数据库事务中写入 outbox 事件
 *
 * 调用约定：
 * 1. 调用方必须已通过 `await client.query('BEGIN')` 开启事务
 * 2. 调用方负责在所有写入完成后执行 COMMIT，或在异常时 ROLLBACK
 * 3. 调用方负责在 finally 中 client.release()
 *
 * 本函数只负责 INSERT 一行到 outbox 表，不发送 NOTIFY
 * （NOTIFY 应在 COMMIT 后由调用方发送，避免回滚产生无效通知）。
 *
 * @param client - 已开启事务的 PoolClient
 * @param event - 待写入的 outbox 事件
 */
export async function writeEventInTransaction(
  client: PoolClient,
  event: OutboxEvent,
): Promise<void> {
  await client.query(
    `INSERT INTO outbox (aggregate_type, aggregate_id, event_type, payload, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [
      event.aggregateType,
      event.aggregateId,
      event.eventType,
      JSON.stringify(event.payload),
    ],
  );
  logger.debug(
    { eventType: event.eventType, aggregateId: event.aggregateId },
    'Outbox event written in transaction',
  );
}
