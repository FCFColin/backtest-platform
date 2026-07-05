// Architecture: Outbox发布器，使用PostgreSQL LISTEN/NOTIFY监听新事件
// 企业为何需要：Outbox表需要被轮询或推送，LISTEN/NOTIFY是零依赖的推送方案
// 权衡：LISTEN/NOTIFY不支持跨进程负载均衡，当前单实例足够

import pg from 'pg';
import { logger } from '../utils/logger.js';
import { eventDispatcher } from '../domain/events/index.js';

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
        'SELECT id, aggregate_type, aggregate_id, event_type, payload, created_at FROM outbox WHERE processed_at IS NULL ORDER BY created_at ASC LIMIT 100',
      );

      const processedIds: string[] = [];
      for (const event of result.rows) {
        try {
          await this.routeEvent(event);
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
      } catch (err) {
        logger.error(
          { module: 'outboxPublisher', err: (err as Error).message },
          'Compensation scanner error',
        );
      }
    }, 60_000);
  }

  private stopCompensationScanner(): void {
    if (this.compensationInterval) {
      clearInterval(this.compensationInterval);
      this.compensationInterval = null;
    }
  }
}
