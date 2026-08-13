import pg from 'pg';
import client from 'prom-client';
import { logger } from '../utils/logger.js';
import { getPrometheusRegister } from '../utils/metrics.js';
import { eventDispatcher } from '../domain/events/events.js';
import { config } from '../config/index.js';
import pLimit from 'p-limit';
import { OutboxKafkaConsumer } from './outboxKafkaConsumer.js';
import type { OutboxConsumer } from './outbox.js';

export type { OutboxConsumer } from './outbox.js';

const reg = getPrometheusRegister();
const mkGauge = (name: string, help: string): client.Gauge =>
  new client.Gauge({ name, help, registers: [reg] });
const outboxUnprocessedCount = mkGauge('outbox_unprocessed_count', 'Unprocessed outbox events');
const outboxOldestUnprocessedAgeSeconds = mkGauge(
  'outbox_oldest_unprocessed_age_seconds',
  'Age (s) of oldest unprocessed outbox event',
);
const outboxTotalRows = mkGauge('outbox_total_rows', 'Total outbox rows');

/** 事件发布并发上限（D3-003：批量并发处理，避免串行阻塞） */
const OUTBOX_PUBLISH_CONCURRENCY = 10;

type LogLevel = 'info' | 'warn' | 'error' | 'debug';
function moduleLog(level: LogLevel, fields: Record<string, unknown>, msg: string): void {
  logger[level]({ module: 'outboxPublisher', ...fields }, msg);
}

function logError(err: unknown, msg: string, extra: Record<string, unknown> = {}): void {
  moduleLog('error', { err: (err as Error)?.message, ...extra }, msg);
}

interface OutboxEventRow {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: unknown;
  created_at: Date | string;
  tenant_id?: string | null;
}

export class OutboxPublisher {
  private listener: pg.Client | null = null;
  private compensationInterval: NodeJS.Timeout | null = null;
  private connectionString: string;

  constructor(private pool: pg.Pool) {
    this.connectionString = config.DATABASE_URL;
  }

  async start(): Promise<void> {
    this.listener = new pg.Client({
      connectionString: this.connectionString,
      ssl: config.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
    });
    try {
      await this.listener.connect();
      await this.listener.query('LISTEN outbox_channel');
      this.listener.on('notification', (msg: { channel: string; payload?: string }) => {
        if (msg.channel === 'outbox_channel')
          this.handleNotification().catch((err) =>
            logError(err, 'Unhandled error in handleNotification'),
          );
      });
      this.listener.on('error', (err: Error) =>
        moduleLog('error', { err: err.message }, 'OutboxPublisher pg.Client connection error'),
      );
      this.listener.on('end', () =>
        moduleLog('warn', {}, 'OutboxPublisher pg.Client connection ended'),
      );
      moduleLog('info', {}, 'OutboxPublisher listening on outbox_channel');
    } catch (err) {
      logError(err, 'OutboxPublisher listener start failed, LISTEN disabled');
      if (this.listener) {
        try {
          await this.listener.end();
        } catch {
          /* 启动已失败，cleanup 可忽略 */
        }
        this.listener = null;
      }
    }
    this.startCompensationScanner();
  }

  async handleNotification(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // FOR UPDATE SKIP LOCKED：多实例同时消费时仅一个实例领取每行，避免重复分发与 lost-update
      const result = await client.query(
        'SELECT id, aggregate_type, aggregate_id, event_type, payload, created_at, tenant_id FROM outbox WHERE processed_at IS NULL ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 100',
      );
      const events = result.rows as OutboxEventRow[];
      const limit = pLimit(OUTBOX_PUBLISH_CONCURRENCY);
      const settled = await Promise.allSettled(
        events.map((event) =>
          limit(async () => {
            await this.routeEvent(event);
            return event.id;
          }),
        ),
      );
      const processedIds: string[] = [];
      settled.forEach((s, i) => {
        if (s.status === 'fulfilled') processedIds.push(s.value);
        else logError(s.reason, 'Failed to process outbox event', { eventId: events[i].id });
      });
      if (processedIds.length > 0)
        await client.query('UPDATE outbox SET processed_at = NOW() WHERE id = ANY($1)', [
          processedIds,
        ]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      logError(err, 'Error in handleNotification');
    } finally {
      client.release();
    }
  }

  private async routeEvent(event: OutboxEventRow): Promise<void> {
    const payload =
      typeof event.payload === 'string'
        ? JSON.parse(event.payload)
        : (event.payload as Record<string, unknown>);
    await eventDispatcher.dispatch({
      eventType: event.event_type,
      aggregateType: event.aggregate_type,
      aggregateId: event.aggregate_id,
      // 透传 outbox 行 id 供消费端幂等（ADR-014）：重复投递不再重复落库
      payload: { ...payload, __outboxEventId: event.id },
      occurredAt: new Date(event.created_at),
    });
  }

  async stop(): Promise<void> {
    this.stopCompensationScanner();
    if (this.listener) {
      try {
        await this.listener.query('UNLISTEN outbox_channel');
        await this.listener.end();
      } catch (err) {
        logError(err, 'Error stopping OutboxPublisher listener');
      }
      this.listener = null;
    }
  }

  private startCompensationScanner(): void {
    this.compensationInterval = setInterval(async () => {
      try {
        await this.updateOutboxMetrics();
        const result = await this.pool.query(
          "SELECT id FROM outbox WHERE processed_at IS NULL AND created_at < NOW() - INTERVAL '5 minutes' ORDER BY created_at ASC LIMIT 50",
        );
        if (result.rows.length > 0) {
          moduleLog(
            'warn',
            { count: result.rows.length },
            'Found stuck outbox events, reprocessing',
          );
          await this.handleNotification();
        }
        await this.cleanupProcessedOutboxEvents();
      } catch (err) {
        logError(err, 'Compensation scanner error');
      }
    }, 60_000);
  }

  private async updateOutboxMetrics(): Promise<void> {
    try {
      const [unprocessedResult, oldestResult, totalResult] = await Promise.all([
        this.pool.query('SELECT COUNT(*) as count FROM outbox WHERE processed_at IS NULL'),
        this.pool.query(
          'SELECT EXTRACT(EPOCH FROM (NOW() - created_at)) as age FROM outbox WHERE processed_at IS NULL ORDER BY created_at ASC LIMIT 1',
        ),
        this.pool.query('SELECT COUNT(*) as count FROM outbox'),
      ]);
      outboxUnprocessedCount.set(Number(unprocessedResult.rows[0]?.count ?? 0));
      outboxTotalRows.set(Number(totalResult.rows[0]?.count ?? 0));
      outboxOldestUnprocessedAgeSeconds.set(Number(oldestResult.rows[0]?.age ?? 0));
    } catch (err) {
      moduleLog(
        'debug',
        { err: (err as Error).message },
        'Failed to update outbox metrics (non-critical)',
      );
    }
  }

  /** P1-05：清理已处理的过期 Outbox 事件。每次最多删除 10000 行，避免长事务锁竞争。 */
  async cleanupProcessedOutboxEvents(): Promise<number> {
    try {
      const result = await this.pool.query(
        `DELETE FROM outbox WHERE id IN (SELECT id FROM outbox WHERE processed_at IS NOT NULL AND created_at < NOW() - INTERVAL '1 day' * $1 ORDER BY created_at ASC LIMIT 10000)`,
        [config.OUTBOX_RETENTION_DAYS],
      );
      if (result.rowCount && result.rowCount > 0)
        moduleLog(
          'info',
          { deleted: result.rowCount, retentionDays: config.OUTBOX_RETENTION_DAYS },
          'Cleaned up processed outbox events',
        );
      return result.rowCount ?? 0;
    } catch (err) {
      logError(err, 'Failed to cleanup processed outbox events');
      return 0;
    }
  }

  private stopCompensationScanner(): void {
    if (this.compensationInterval) {
      clearInterval(this.compensationInterval);
      this.compensationInterval = null;
    }
  }
}

// P3-05 替代通路（ADR-051）：默认 LISTEN/NOTIFY（单实例零依赖）；多 Pod 水平扩展时 CDC via Debezium → Kafka → 消费组。
// server.ts 调用 createOutboxConsumer(getPool()) 按 CDC_KAFKA_ENABLED 透明切换通路。

export function createOutboxConsumer(pool: pg.Pool, mode?: 'listen' | 'kafka'): OutboxConsumer {
  const useKafka = mode === 'kafka' || (mode === undefined && config.CDC_KAFKA_ENABLED);
  if (useKafka) {
    moduleLog('info', { cdc: true }, 'OutboxConsumer: CDC/Kafka 通路');
    return new OutboxKafkaConsumer();
  }
  return new OutboxPublisher(pool);
}
