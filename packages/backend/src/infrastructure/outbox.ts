/**
 * Outbox 共享类型与写入器（ADO-024 / P3-05）。
 *
 * 合并 outboxTypes.ts 与 outboxWriter.ts 消除双向类型依赖。
 * outboxTypes 提供 WebhookHandler / OutboxConsumer 接口；
 * outboxWriter 提供 OutboxEvent 接口与 writeEventInTransaction 函数。
 */

import type { PoolClient } from 'pg';
import { logger } from '../utils/logger.js';

/**
 * Webhook 触发回调类型（P2-02）。
 */
export type WebhookHandler = (orgId: string, eventType: string, payload: unknown) => Promise<void>;

/**
 * Outbox 消费器公共接口（P3-05）。
 */
export interface OutboxConsumer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** Outbox 事件描述（由调用方构造，与领域事件字段对齐） */
export interface OutboxEvent {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  eventId?: string;
}

/**
 * 在已存在的数据库事务中写入 outbox 事件。
 *
 * @param client - 已开启事务的 PoolClient
 * @param event - 待写入的 outbox 事件
 */
export async function writeEventInTransaction(
  client: PoolClient,
  event: OutboxEvent,
): Promise<void> {
  await client.query(
    `INSERT INTO outbox (aggregate_type, aggregate_id, event_type, payload, event_id, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING`,
    [
      event.aggregateType,
      event.aggregateId,
      event.eventType,
      JSON.stringify(event.payload),
      event.eventId ?? null,
    ],
  );
  logger.debug(
    { eventType: event.eventType, aggregateId: event.aggregateId },
    'Outbox event written in transaction',
  );
}
