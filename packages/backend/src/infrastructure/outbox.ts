import type { PoolClient } from 'pg';
import { logger } from '../utils/logger.js';

export interface OutboxConsumer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface OutboxEvent {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  eventId?: string;
}

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
