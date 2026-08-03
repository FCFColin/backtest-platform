// Architecture: Outbox 发布器，使用 PostgreSQL LISTEN/NOTIFY 监听新事件。
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
const outboxUnprocessedCount = mkGauge(
  'outbox_unprocessed_count',
  'Number of unprocessed outbox events',
);
const outboxOldestUnprocessedAgeSeconds = mkGauge(
  'outbox_oldest_unprocessed_age_seconds',
  'Age in seconds of the oldest unprocessed outbox event',
);
const outboxTotalRows = mkGauge('outbox_total_rows', 'Total number of rows in the outbox table');

const OUTBOX_RETENTION_DAYS = parseInt(process.env.OUTBOX_RETENTION_DAYS || '7', 10);
/** 事件发布并发上限（D3-003：批量并发处理，避免串行阻塞） */
const OUTBOX_PUBLISH_CONCURRENCY = 10;

type LogLevel = 'info' | 'warn' | 'error' | 'debug';
function moduleLog(level: LogLevel, fields: Record<string, unknown>, msg: string): void {
  logger[level]({ module: 'outboxPublisher', ...fields }, msg);
}

/** outbox 表行（handleNotification 与事件路由共用） */
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
    this.connectionString = (pool.options as { connectionString?: string }).connectionString ?? '';
    logger.info(
      { module: 'outboxPublisher', hasConnectionString: !!this.connectionString },
      'OutboxPublisher constructed',
    );
  }

  async start(): Promise<void> {
    moduleLog(
      'info',
      { connectionString: this.connectionString ? '[set]' : '[empty]' },
      'OutboxPublisher connecting via dedicated pg.Client...',
    );
    this.listener = new pg.Client({ connectionString: this.connectionString });
    try {
      await this.listener.connect();
      moduleLog('info', {}, 'OutboxPublisher pg.Client connected successfully');
      await this.listener.query('LISTEN outbox_channel');
      this.listener.on('notification', (msg: { channel: string; payload?: string }) => {
        moduleLog(
          'debug',
          { channel: msg.channel, payloadLength: msg.payload?.length },
          'OutboxPublisher notification received',
        );
        if (msg.channel === 'outbox_channel')
          this.handleNotification().catch((err) =>
            moduleLog(
              'error',
              { err: (err as Error).message },
              'Unhandled error in handleNotification',
            ),
          );
      });
      this.listener.on('error', (err: Error) =>
        moduleLog('error', { err: err.message }, 'OutboxPublisher pg.Client connection error'),
      );
      this.listener.on('end', () =>
        moduleLog('warn', {}, 'OutboxPublisher pg.Client connection ended'),
      );
      moduleLog('info', {}, 'OutboxPublisher started, listening on outbox_channel');
    } catch (err) {
      moduleLog(
        'error',
        { err: (err as Error).message },
        'OutboxPublisher listener start failed, LISTEN disabled',
      );
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

  /**
   * 处理 outbox 通知：扫描未处理事件并路由到领域事件处理器。
   * NOTIFY 仅作唤醒信号，实际事件从 outbox 表读取；错过通知的事件由补偿扫描器拾取；单次上限 100 条避免长事务阻塞。
   */
  async handleNotification(): Promise<void> {
    try {
      const result = await this.pool.query(
        'SELECT id, aggregate_type, aggregate_id, event_type, payload, created_at, tenant_id FROM outbox WHERE processed_at IS NULL ORDER BY created_at ASC LIMIT 100',
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
      for (let i = 0; i < settled.length; i++) {
        const s = settled[i];
        if (s.status === 'fulfilled') {
          processedIds.push(s.value);
          moduleLog(
            'info',
            { eventId: s.value, eventType: events[i].event_type },
            'Outbox event processed',
          );
        } else {
          moduleLog(
            'error',
            { err: (s.reason as Error)?.message, eventId: events[i].id },
            'Failed to process outbox event',
          );
        }
      }
      if (processedIds.length > 0)
        await this.pool.query('UPDATE outbox SET processed_at = NOW() WHERE id = ANY($1)', [
          processedIds,
        ]);
    } catch (err) {
      moduleLog('error', { err: (err as Error).message }, 'Error in handleNotification');
    }
  }

  /** 将 outbox 事件路由到已注册的领域事件处理器。payload 兼容字符串场景做 JSON.parse。 */
  private async routeEvent(event: OutboxEventRow): Promise<void> {
    await eventDispatcher.dispatch({
      eventType: event.event_type,
      aggregateType: event.aggregate_type,
      aggregateId: event.aggregate_id,
      payload:
        typeof event.payload === 'string'
          ? JSON.parse(event.payload)
          : (event.payload as Record<string, unknown>),
      occurredAt: new Date(event.created_at),
    });
  }

  async stop(): Promise<void> {
    moduleLog('info', { hasListener: !!this.listener }, 'OutboxPublisher stopping...');
    this.stopCompensationScanner();
    if (this.listener) {
      try {
        await this.listener.query('UNLISTEN outbox_channel');
        moduleLog('info', {}, 'OutboxPublisher UNLISTEN issued');
        await this.listener.end();
      } catch (err) {
        moduleLog(
          'error',
          { err: (err as Error).message },
          'Error stopping OutboxPublisher listener',
        );
      }
      this.listener = null;
      moduleLog('info', {}, 'OutboxPublisher stopped, pg.Client closed');
    }
  }

  /** 补偿扫描器：每 60s 扫描超过 5 分钟仍未处理的事件重新触发（LISTEN 断开期间错过/处理失败的事件兜底）。 */
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
        moduleLog('error', { err: (err as Error).message }, 'Compensation scanner error');
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
      const oldestAge = oldestResult.rows[0]?.age;
      outboxOldestUnprocessedAgeSeconds.set(oldestAge ? Number(oldestAge) : 0);
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
        [OUTBOX_RETENTION_DAYS],
      );
      if (result.rowCount && result.rowCount > 0)
        moduleLog(
          'info',
          { deleted: result.rowCount, retentionDays: OUTBOX_RETENTION_DAYS },
          'Cleaned up processed outbox events',
        );
      return result.rowCount ?? 0;
    } catch (err) {
      moduleLog(
        'error',
        { err: (err as Error).message },
        'Failed to cleanup processed outbox events',
      );
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

/** 创建 Outbox 消费器。mode 显式指定通路（覆盖 CDC_KAFKA_ENABLED）：'listen' = LISTEN/NOTIFY，'kafka' = CDC/Kafka。 */
export function createOutboxConsumer(pool: pg.Pool, mode?: 'listen' | 'kafka'): OutboxConsumer {
  const useKafka = mode === 'kafka' || (mode === undefined && config.CDC_KAFKA_ENABLED);
  if (useKafka) {
    moduleLog(
      'info',
      { cdc: true },
      'createOutboxConsumer: 使用 CDC/Kafka 通路（OutboxKafkaConsumer）',
    );
    return new OutboxKafkaConsumer();
  }
  moduleLog(
    'info',
    { cdc: false },
    'createOutboxConsumer: 使用 LISTEN/NOTIFY 通路（OutboxPublisher）',
  );
  return new OutboxPublisher(pool);
}
