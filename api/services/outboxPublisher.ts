// Architecture: Outbox发布器，使用PostgreSQL LISTEN/NOTIFY监听新事件
// 企业为何需要：Outbox表需要被轮询或推送，LISTEN/NOTIFY是零依赖的推送方案
// 权衡：LISTEN/NOTIFY不支持跨进程负载均衡，当前单实例足够

import pg from 'pg';
import { logger } from '../utils/logger.js';

export class OutboxPublisher {
  private listener: pg.Client | null = null;
  private connectionString: string;

  constructor(private pool: pg.Pool) {
    // 从 Pool 配置中提取连接字符串
    this.connectionString = (pool.options as any).connectionString ?? '';
    logger.info({ module: 'outboxPublisher', hasConnectionString: !!this.connectionString }, 'OutboxPublisher constructed');
  }

  async start(): Promise<void> {
    // 使用专用 Client（非 Pool）建立持久连接，Pool 不转发 notification 事件
    logger.info({ module: 'outboxPublisher', connectionString: this.connectionString ? '[set]' : '[empty]' }, 'OutboxPublisher connecting via dedicated pg.Client...');
    this.listener = new pg.Client({ connectionString: this.connectionString });
    try {
      await this.listener.connect();
      logger.info({ module: 'outboxPublisher' }, 'OutboxPublisher pg.Client connected successfully');
    } catch (err) {
      logger.error({ module: 'outboxPublisher', err: (err as Error).message }, 'OutboxPublisher pg.Client connect FAILED');
      throw err;
    }
    await this.listener.query('LISTEN outbox_channel');
    logger.info({ module: 'outboxPublisher' }, 'OutboxPublisher LISTEN outbox_channel issued');
    this.listener.on('notification', (msg: { channel: string; payload?: string }) => {
      logger.debug({ module: 'outboxPublisher', channel: msg.channel, payloadLength: msg.payload?.length }, 'OutboxPublisher notification received');
      if (msg.channel === 'outbox_channel' && msg.payload) {
        this.handleNotification(msg.payload);
      }
    });
    this.listener.on('error', (err: Error) => {
      logger.error({ module: 'outboxPublisher', err: err.message }, 'OutboxPublisher pg.Client connection error');
    });
    this.listener.on('end', () => {
      logger.warn({ module: 'outboxPublisher' }, 'OutboxPublisher pg.Client connection ended');
    });
    logger.info({ module: 'outboxPublisher' }, 'OutboxPublisher started, listening on outbox_channel');
  }

  private handleNotification(payload: string): void {
    logger.debug({ module: 'outboxPublisher', payloadPreview: payload.substring(0, 200) }, 'OutboxPublisher handling notification payload');
    try {
      const event = JSON.parse(payload);
      logger.info({ module: 'outboxPublisher', eventType: event.event_type, aggregateId: event.aggregate_id }, 'Outbox event received');
      // TODO: Dispatch to event handlers
    } catch (error) {
      logger.error({ module: 'outboxPublisher', error: (error as Error).message, payloadPreview: payload.substring(0, 200) }, 'Failed to handle outbox notification');
    }
  }

  async stop(): Promise<void> {
    logger.info({ module: 'outboxPublisher', hasListener: !!this.listener }, 'OutboxPublisher stopping...');
    if (this.listener) {
      await this.listener.query('UNLISTEN outbox_channel');
      logger.info({ module: 'outboxPublisher' }, 'OutboxPublisher UNLISTEN issued');
      await this.listener.end();
      this.listener = null;
      logger.info({ module: 'outboxPublisher' }, 'OutboxPublisher stopped, pg.Client closed');
    }
  }
}
