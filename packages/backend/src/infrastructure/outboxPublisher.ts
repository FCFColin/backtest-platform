// Architecture: Outbox发布器，使用PostgreSQL LISTEN/NOTIFY监听新事件
// 企业为何需要：Outbox表需要被轮询或推送，LISTEN/NOTIFY是零依赖的推送方案
// 权衡：LISTEN/NOTIFY不支持跨进程负载均衡，当前单实例足够

import pg from 'pg';
import client from 'prom-client';
import { logger } from '../utils/logger.js';
import { eventDispatcher } from '../domain/events/index.js';
import { config } from '../config/index.js';

// P1-05：Outbox 监控指标
const outboxUnprocessedCount = new client.Gauge({
  name: 'outbox_unprocessed_count',
  help: 'Number of unprocessed outbox events',
});

const outboxOldestUnprocessedAgeSeconds = new client.Gauge({
  name: 'outbox_oldest_unprocessed_age_seconds',
  help: 'Age in seconds of the oldest unprocessed outbox event',
});

const outboxTotalRows = new client.Gauge({
  name: 'outbox_total_rows',
  help: 'Total number of rows in the outbox table',
});

/** Outbox 清理保留天数，默认 7 天 */
const OUTBOX_RETENTION_DAYS = parseInt(
  process.env.OUTBOX_RETENTION_DAYS || '7',
  10,
);
// P3-05 CDC 替代通路：工厂按 CDC_KAFKA_ENABLED 选择实例化 OutboxKafkaConsumer。
// 运行时单向依赖（本模块 → outboxKafkaConsumer）；outboxKafkaConsumer 仅 type-only 引用本模块，无运行时循环。
import { OutboxKafkaConsumer } from './outboxKafkaConsumer.js';

/**
 * Webhook 触发回调类型（P2-02）。
 *
 * 企业理由：OutboxPublisher 处理完事件后，需将事件分发给匹配的 webhook 订阅。
 * 为避免 outboxPublisher 反向依赖 application/webhookService（违背分层：基础设施
 * 不应依赖应用层），采用回调注入——由 server.ts 启动时调用 setWebhookHandler 注册。
 * 未注册时（如测试环境）publisher 跳过 webhook 触发，零行为变更。
 */
export type WebhookHandler = (
  orgId: string,
  eventType: string,
  payload: unknown,
) => Promise<void>;

/**
 * Outbox 消费器公共接口（P3-05）。
 *
 * OutboxPublisher（LISTEN/NOTIFY）与 OutboxKafkaConsumer（CDC/Kafka）均实现此接口，
 * 由 createOutboxConsumer 工厂按 CDC_KAFKA_ENABLED 选择实现，server.ts 无需感知具体类型。
 */
export interface OutboxConsumer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** 已注册的 webhook 触发回调（由 server.ts 在启动时注入） */
let webhookHandler: WebhookHandler | null = null;

/**
 * 注册 webhook 触发回调。传 null 可清除注册（测试隔离用）。
 *
 * 解耦说明：publisher 不直接 import webhookService，而是由调用方注入回调，
 * 保持基础设施层 → 应用层的单向依赖。
 */
export function setWebhookHandler(fn: WebhookHandler | null): void {
  webhookHandler = fn;
  logger.info(
    { module: 'outboxPublisher', registered: fn !== null },
    'Webhook handler registered',
  );
}

/**
 * 获取当前已注册的 webhook 触发回调（P3-05）。
 *
 * OutboxKafkaConsumer 不能直接访问本模块的模块级 webhookHandler 变量（且为避免循环
 * 依赖不反向 import），故由 createOutboxConsumer 工厂将一个 getter 闭包注入消费器，
 * getter 内部调用此函数读取最新 handler。未注册时返回 null，消费器跳过 webhook 触发。
 */
export function getWebhookHandler(): WebhookHandler | null {
  return webhookHandler;
}

export class OutboxPublisher {
  private listener: pg.Client | null = null;
  private compensationInterval: NodeJS.Timeout | null = null;
  private connectionString: string;

  constructor(private pool: pg.Pool) {
    // 从 Pool 配置中提取连接字符串
    this.connectionString = (pool.options as { connectionString?: string }).connectionString ?? '';
    logger.info(
      { module: 'outboxPublisher', hasConnectionString: !!this.connectionString },
      'OutboxPublisher constructed',
    );
  }

  async start(): Promise<void> {
    // 使用专用 Client（非 Pool）建立持久连接，Pool 不转发 notification 事件
    logger.info(
      { module: 'outboxPublisher', connectionString: this.connectionString ? '[set]' : '[empty]' },
      'OutboxPublisher connecting via dedicated pg.Client...',
    );
    this.listener = new pg.Client({ connectionString: this.connectionString });
    try {
      await this.listener.connect();
      logger.info(
        { module: 'outboxPublisher' },
        'OutboxPublisher pg.Client connected successfully',
      );
      await this.listener.query('LISTEN outbox_channel');
      logger.info({ module: 'outboxPublisher' }, 'OutboxPublisher LISTEN outbox_channel issued');
      // NOTIFY 由 auditLog/handlers 发送时不带 payload，仅作为唤醒信号；
      // 收到通知后扫描 outbox 表读取未处理事件，避免依赖 payload 内容
      this.listener.on('notification', (msg: { channel: string; payload?: string }) => {
        logger.debug(
          { module: 'outboxPublisher', channel: msg.channel, payloadLength: msg.payload?.length },
          'OutboxPublisher notification received',
        );
        if (msg.channel === 'outbox_channel') {
          this.handleNotification().catch((err) => {
            logger.error(
              { module: 'outboxPublisher', err: (err as Error).message },
              'Unhandled error in handleNotification',
            );
          });
        }
      });
      this.listener.on('error', (err: Error) => {
        logger.error(
          { module: 'outboxPublisher', err: err.message },
          'OutboxPublisher pg.Client connection error',
        );
      });
      this.listener.on('end', () => {
        logger.warn({ module: 'outboxPublisher' }, 'OutboxPublisher pg.Client connection ended');
      });
      logger.info(
        { module: 'outboxPublisher' },
        'OutboxPublisher started, listening on outbox_channel',
      );
    } catch (err) {
      // 数据库不可用时优雅降级：记录错误但不抛出，补偿扫描器仍会重试
      logger.error(
        { module: 'outboxPublisher', err: (err as Error).message },
        'OutboxPublisher listener start failed, LISTEN disabled',
      );
      if (this.listener) {
        try {
          await this.listener.end();
        } catch {
          // ignore cleanup error
        }
        this.listener = null;
      }
    }
    // 始终启动补偿扫描器：它使用连接池而非 listener，DB 恢复后会自动处理积压事件
    this.startCompensationScanner();
  }

  /**
   * 处理 outbox 通知：扫描未处理事件并路由到已注册的领域事件处理器
   *
   * NOTIFY 仅作为唤醒信号，实际事件从 outbox 表读取，保证：
   * 1. 不依赖 NOTIFY payload 内容（auditLog/handlers 发送 NOTIFY 时不带 payload）
   * 2. 错过通知（连接断开期间）的事件会被补偿扫描器或下次通知拾取
   * 3. 单次处理上限 100 条，避免长事务阻塞
   */
  async handleNotification(): Promise<void> {
    try {
      const result = await this.pool.query(
        'SELECT id, aggregate_type, aggregate_id, event_type, payload, created_at, tenant_id FROM outbox WHERE processed_at IS NULL ORDER BY created_at ASC LIMIT 100',
      );

      const processedIds: string[] = [];
      for (const event of result.rows) {
        try {
          await this.routeEvent(event);
          // P2-02：事件路由后触发匹配的 webhook 订阅（回调由 server.ts 注入）。
          this.triggerWebhookSafely(event);
          processedIds.push(event.id);
          logger.info(
            { module: 'outboxPublisher', eventId: event.id, eventType: event.event_type },
            'Outbox event processed',
          );
        } catch (err) {
          logger.error(
            { module: 'outboxPublisher', err: (err as Error).message, eventId: event.id },
            'Failed to process outbox event',
          );
        }
      }
      if (processedIds.length > 0) {
        await this.pool.query('UPDATE outbox SET processed_at = NOW() WHERE id = ANY($1)', [
          processedIds,
        ]);
      }
    } catch (err) {
      logger.error(
        { module: 'outboxPublisher', err: (err as Error).message },
        'Error in handleNotification',
      );
    }
  }

  /**
   * P2-02：安全触发 webhook handler（失败不阻断 outbox 处理）。
   *
   * 仅当事件携带 tenant_id（租户归因）且已注册 handler 时触发；
   * webhook 投递异步、可独立重试，与 outbox 解耦。
   */
  private async triggerWebhookSafely(event: {
    id: string;
    event_type: string;
    payload: unknown;
    tenant_id?: string | null;
  }): Promise<void> {
    if (!webhookHandler || !event.tenant_id) return;
    try {
      await webhookHandler(event.tenant_id, event.event_type, event.payload);
    } catch (whErr) {
      logger.error(
        {
          module: 'outboxPublisher',
          err: (whErr as Error).message,
          eventId: event.id,
          eventType: event.event_type,
        },
        'Webhook trigger failed (outbox processing continues)',
      );
    }
  }

  /**
   * 将 outbox 事件路由到已注册的领域事件处理器
   *
   * payload 在 PostgreSQL 中以 JSONB 返回时已是对象，兼容字符串场景做 JSON.parse。
   */
  private async routeEvent(event: {
    event_type: string;
    aggregate_type: string;
    aggregate_id: string;
    payload: unknown;
    created_at: Date | string;
  }): Promise<void> {
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
    logger.info(
      { module: 'outboxPublisher', hasListener: !!this.listener },
      'OutboxPublisher stopping...',
    );
    this.stopCompensationScanner();
    if (this.listener) {
      try {
        await this.listener.query('UNLISTEN outbox_channel');
        logger.info({ module: 'outboxPublisher' }, 'OutboxPublisher UNLISTEN issued');
        await this.listener.end();
      } catch (err) {
        logger.error(
          { module: 'outboxPublisher', err: (err as Error).message },
          'Error stopping OutboxPublisher listener',
        );
      }
      this.listener = null;
      logger.info({ module: 'outboxPublisher' }, 'OutboxPublisher stopped, pg.Client closed');
    }
  }

  /**
   * 补偿扫描器：每 60s 扫描超过 5 分钟仍未处理的事件并重新触发处理
   *
   * 企业理由：LISTEN 连接断开期间错过的通知、处理器失败的事件，
   * 需要兜底机制保证最终一致性。扫描器使用连接池（非 listener），
   * 即使 listener 未连上也能独立工作。
   */
  private startCompensationScanner(): void {
    this.compensationInterval = setInterval(async () => {
      try {
        // P1-05：更新监控指标
        await this.updateOutboxMetrics();

        const result = await this.pool.query(
          "SELECT id FROM outbox WHERE processed_at IS NULL AND created_at < NOW() - INTERVAL '5 minutes' ORDER BY created_at ASC LIMIT 50",
        );
        if (result.rows.length > 0) {
          logger.warn(
            { module: 'outboxPublisher', count: result.rows.length },
            'Found stuck outbox events, reprocessing',
          );
          await this.handleNotification();
        }

        // P1-05：清理已处理的过期事件
        await this.cleanupProcessedOutboxEvents();
      } catch (err) {
        logger.error(
          { module: 'outboxPublisher', err: (err as Error).message },
          'Compensation scanner error',
        );
      }
    }, 60_000);
  }

  /**
   * P1-05：更新 Outbox 监控指标。
   *
   * 每次补偿扫描时执行，更新 3 个 Prometheus gauge：
   * - outbox_unprocessed_count：未处理事件数
   * - outbox_oldest_unprocessed_age_seconds：最老未处理事件年龄（秒）
   * - outbox_total_rows：outbox 表总行数
   */
  private async updateOutboxMetrics(): Promise<void> {
    try {
      const [unprocessedResult, oldestResult, totalResult] = await Promise.all([
        this.pool.query('SELECT COUNT(*) as count FROM outbox WHERE processed_at IS NULL'),
        this.pool.query(
          "SELECT EXTRACT(EPOCH FROM (NOW() - created_at)) as age FROM outbox WHERE processed_at IS NULL ORDER BY created_at ASC LIMIT 1",
        ),
        this.pool.query('SELECT COUNT(*) as count FROM outbox'),
      ]);

      outboxUnprocessedCount.set(Number(unprocessedResult.rows[0]?.count ?? 0));
      outboxTotalRows.set(Number(totalResult.rows[0]?.count ?? 0));
      const oldestAge = oldestResult.rows[0]?.age;
      outboxOldestUnprocessedAgeSeconds.set(oldestAge ? Number(oldestAge) : 0);
    } catch (err) {
      logger.debug(
        { module: 'outboxPublisher', err: (err as Error).message },
        'Failed to update outbox metrics (non-critical)',
      );
    }
  }

  /**
   * P1-05：清理已处理的过期 Outbox 事件。
   *
   * 删除 processed_at IS NOT NULL 且 created_at < NOW() - INTERVAL '7 days' 的行。
   * 每次最多删除 10000 行，避免长事务锁竞争。
   * 保留天数可通过 OUTBOX_RETENTION_DAYS 环境变量配置。
   */
  async cleanupProcessedOutboxEvents(): Promise<number> {
    try {
      const result = await this.pool.query(
        `DELETE FROM outbox
         WHERE id IN (
           SELECT id FROM outbox
           WHERE processed_at IS NOT NULL
             AND created_at < NOW() - INTERVAL '${OUTBOX_RETENTION_DAYS} days'
           ORDER BY created_at ASC
           LIMIT 10000
         )`,
      );
      if (result.rowCount && result.rowCount > 0) {
        logger.info(
          { module: 'outboxPublisher', deleted: result.rowCount, retentionDays: OUTBOX_RETENTION_DAYS },
          'Cleaned up processed outbox events',
        );
      }
      return result.rowCount ?? 0;
    } catch (err) {
      logger.error(
        { module: 'outboxPublisher', err: (err as Error).message },
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

// =============================================================================
// P3-05 替代通路：Outbox 消费器工厂（ADR-051）
// =============================================================================
// 企业为何需要：Outbox 默认走 LISTEN/NOTIFY（单实例，零依赖），但多 Pod 水平扩展时
// LISTEN/NOTIFY 无法跨进程负载均衡。CDC via Debezium → Kafka → 消费组提供水平扩展能力。
// 本工厂按 CDC_KAFKA_ENABLED 选择实现，server.ts 调用 createOutboxConsumer(getPool())
// 即可透明切换通路，无需感知具体消费器类型。
//
// 默认（CDC_KAFKA_ENABLED=false）：返回 OutboxPublisher（LISTEN/NOTIFY），行为与历史完全一致。
// 启用（CDC_KAFKA_ENABLED=true）：返回 OutboxKafkaConsumer（Kafka CDC），多 Pod 分区消费。

/**
 * 创建 Outbox 消费器实例。
 *
 * @param pool  PostgreSQL 连接池（LISTEN/NOTIFY 通路使用；CDC 通路由 Kafka offset 跟踪，不查询 DB）。
 * @param mode  显式指定通路，覆盖 CDC_KAFKA_ENABLED。'listen' = LISTEN/NOTIFY，'kafka' = CDC/Kafka。
 *              未传时读取 config.CDC_KAFKA_ENABLED 决定。
 * @returns 实现 OutboxConsumer 接口的消费器实例。
 */
export function createOutboxConsumer(
  pool: pg.Pool,
  mode?: 'listen' | 'kafka',
): OutboxConsumer {
  const useKafka = mode === 'kafka' || (mode === undefined && config.CDC_KAFKA_ENABLED);
  if (useKafka) {
    logger.info(
      { module: 'outboxPublisher', cdc: true },
      'createOutboxConsumer: 使用 CDC/Kafka 通路（OutboxKafkaConsumer）',
    );
    // 注入 getter 而非 handler 值：server.ts 在创建消费器后才 setWebhookHandler，
    // getter 保证每次事件处理时读取最新 handler；同时避免 outboxKafkaConsumer 反向依赖本模块。
    return new OutboxKafkaConsumer(() => webhookHandler);
  }
  logger.info(
    { module: 'outboxPublisher', cdc: false },
    'createOutboxConsumer: 使用 LISTEN/NOTIFY 通路（OutboxPublisher）',
  );
  return new OutboxPublisher(pool);
}
