// Architecture: Outbox Kafka 消费器（P3-05 CDC 替代通路，ADR-051）
// 企业为何需要：LISTEN/NOTIFY 是单实例推送方案，多 Pod 水平扩展时每个 Pod 都会
// 收到同一通知并重复处理事件。CDC 经 Debezium 读 WAL → Kafka → 消费组，消费组内
// 分区消费天然实现跨 Pod 负载均衡。本消费器订阅 Debezium 投递的 backtest.* topic，
// 将消息还原为领域事件并交由同一 eventDispatcher 路由（与 OutboxPublisher 等价）。
//
// 权衡：
// - 依赖 kafkajs（运行时动态 import；未安装时降级为 no-op，避免阻断启动）。
// - 不更新 outbox.processed_at：CDC 源库的 UPDATE 会被 Debezium 再次捕获，
//   EventRouter SMT 仅期望 INSERT，写回会引入反馈环。进度由 Kafka 消费组 offset
//   跟踪；outbox 表增长由运维定期清理（见 runbook）。
// - 与 OutboxPublisher 互斥：由 CDC_KAFKA_ENABLED 决定走哪条通路（见 createOutboxConsumer）。

import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { eventDispatcher } from '../domain/events/events.js';
// type-only import：避免运行时与 outboxPublisher.ts 形成循环依赖
// （outboxPublisher.ts 的 factory 运行时 import 本模块，此处仅取类型，编译期擦除）。
import type { OutboxConsumer, WebhookHandler } from './outboxTypes.js';

/** topic 名前缀，与 connector 的 route.topic.replacement `backtest.${routedByValue}` 对齐。 */
const TOPIC_PREFIX = 'backtest.';

/**
 * Outbox Kafka 消费器：消费 Debezium Outbox Event Router 投递的事件。
 *
 * 消息形态（Outbox Event Router SMT 展平后）：
 * - topic: `backtest.<aggregate_type>`（由 route.by.field=aggregate_type 路由）
 * - key:   aggregate_id（由 table.field.event.key 指定）
 * - value: payload 列的 JSONB 内容（schemas.enable=false，纯 JSON）
 * - headers: event_type（事件类型）、tenant_id（additional.placement 注入）
 *
 * 与 OutboxPublisher 相同的 start()/stop() 接口，由 createOutboxConsumer 工厂按
 * CDC_KAFKA_ENABLED 选择实例化哪个实现。
 */
interface KafkaLike {
  consumer(opts: { groupId: string }): KafkaConsumerLike;
}
interface KafkaConsumerLike {
  connect(): Promise<void>;
  subscribe(opts: { topics: string[]; fromBeginning: boolean }): Promise<void>;
  run(opts: { eachMessage: (payload: KafkaMessage) => Promise<void> }): Promise<void>;
  disconnect(): Promise<void>;
}
interface KafkaMessage {
  topic: string;
  message: {
    key: Buffer | null;
    value: Buffer | null;
    headers?: Record<string, Buffer>;
    timestamp: string;
  };
}
type KafkaCtorType = new (opts: { clientId: string; brokers: string[] }) => KafkaLike;

export class OutboxKafkaConsumer implements OutboxConsumer {
  // kafkajs 实例类型以最小契约表达（P3-05：仅加入 package.json，未 pnpm install）。
  private kafka: KafkaLike | null = null;
  private consumer: KafkaConsumerLike | null = null;
  private running = false;

  /**
   * @param getWebhookHandler  webhook 触发回调 getter（由 factory 注入，避免循环依赖）。
   *   getter 形式而非直接值：server.ts 在创建消费器后才 setWebhookHandler，
   *   getter 保证每次事件处理时读取最新 handler。
   */
  constructor(private getWebhookHandler: () => WebhookHandler | null) {
    logger.info(
      { module: 'outboxKafkaConsumer', enabled: config.CDC_KAFKA_ENABLED },
      'OutboxKafkaConsumer constructed',
    );
  }

  async start(): Promise<void> {
    if (!config.CDC_KAFKA_ENABLED) {
      logger.info(
        { module: 'outboxKafkaConsumer' },
        'CDC_KAFKA_ENABLED=false，OutboxKafkaConsumer 未启动（保持 LISTEN/NOTIFY 默认通路）',
      );
      return;
    }
    let KafkaCtor: KafkaCtorType | null = null;
    try {
      const mod = await import('kafkajs');
      KafkaCtor = (mod as { Kafka: KafkaCtorType }).Kafka;
    } catch (err) {
      logger.warn(
        { module: 'outboxKafkaConsumer', err: (err as Error).message },
        'kafkajs 未安装，OutboxKafkaConsumer 降级为 no-op。请运行：pnpm --filter @backtest/backend add kafkajs',
      );
      return;
    }
    const brokers = config.KAFKA_BROKERS.split(',')
      .map((b) => b.trim())
      .filter(Boolean);
    this.kafka = new KafkaCtor({
      clientId: config.KAFKA_GROUP_ID,
      brokers,
    });
    this.consumer = this.kafka.consumer({ groupId: config.KAFKA_GROUP_ID });
    try {
      await this.consumer.connect();
      const topics = config.KAFKA_TOPICS.split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (topics.length === 0) {
        logger.warn({ module: 'outboxKafkaConsumer' }, 'KAFKA_TOPICS 为空，未订阅任何 topic');
        return;
      }
      await this.consumer.subscribe({ topics, fromBeginning: false });
      this.running = true;
      await this.consumer.run({
        eachMessage: async (payload: KafkaMessage) => {
          try {
            await this.handleMessage(payload);
          } catch (err) {
            logger.error(
              { module: 'outboxKafkaConsumer', err: (err as Error).message },
              'eachMessage 处理异常',
            );
          }
        },
      });
      logger.info(
        { module: 'outboxKafkaConsumer', brokers, topics },
        'OutboxKafkaConsumer started, consuming Debezium outbox events',
      );
    } catch (err) {
      logger.error(
        { module: 'outboxKafkaConsumer', err: (err as Error).message },
        'OutboxKafkaConsumer 启动失败（Kafka 不可用？），CDC 通路降级',
      );
      // 尝试清理已建立的连接
      if (this.consumer) {
        try {
          await this.consumer.disconnect();
        } catch {
          // disconnect 失败可忽略：启动已失败，consumer 即将置 null
        }
        this.consumer = null;
      }
      this.running = false;
    }
  }

  /**
   * 处理单条 Kafka 消息：还原领域事件 → eventDispatcher → 可选 webhook。
   *
   * aggregate_type 从 topic 名推导（backtest.<aggregate_type>）；
   * eventType 优先从消息 header 读取（兼容多种 SMT 配置），回退到 payload 字段。
   */
  private async handleMessage(payload: {
    topic: string;
    message: {
      key: Buffer | null;
      value: Buffer | null;
      headers?: Record<string, Buffer>;
      timestamp: string;
    };
  }): Promise<void> {
    const { topic, message } = payload;
    const aggregateType = topic.startsWith(TOPIC_PREFIX) ? topic.slice(TOPIC_PREFIX.length) : topic;
    const aggregateId = message.key ? message.key.toString('utf8') : '';
    const eventPayload = this.parsePayload(message.value);
    const eventType =
      this.extractHeader(message, 'event_type') ??
      this.extractHeader(message, 'type') ??
      this.extractHeader(message, '__event_type') ??
      (typeof eventPayload.eventType === 'string' ? eventPayload.eventType : null) ??
      (typeof eventPayload.event_type === 'string' ? eventPayload.event_type : null);
    const tenantId = this.extractHeader(message, 'tenant_id');
    const occurredAt = message.timestamp ? new Date(Number(message.timestamp)) : new Date();

    if (!eventType) {
      logger.warn(
        { module: 'outboxKafkaConsumer', topic, aggregateId },
        'Kafka 消息缺少 eventType（header 与 payload 均未提供），跳过',
      );
      return;
    }

    await eventDispatcher.dispatch({
      eventType,
      aggregateType,
      aggregateId,
      payload: eventPayload,
      occurredAt,
    });

    // webhook 触发（与 OutboxPublisher.triggerWebhookSafely 等价：失败不阻断主流程）
    const handler = this.getWebhookHandler();
    if (handler && tenantId) {
      try {
        await handler(tenantId, eventType, eventPayload);
      } catch (whErr) {
        logger.error(
          {
            module: 'outboxKafkaConsumer',
            err: (whErr as Error).message,
            eventType,
            tenantId,
          },
          'Webhook trigger failed (Kafka 消费继续)',
        );
      }
    }

    logger.info(
      { module: 'outboxKafkaConsumer', topic, eventType, aggregateId },
      'Kafka outbox event consumed',
    );
  }

  /** 解析 Kafka 消息 value（Debezium schemas.enable=false 时为纯 JSON）。 */
  private parsePayload(value: Buffer | null): Record<string, unknown> {
    if (!value) return {};
    try {
      const str = Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
      const parsed = JSON.parse(str);
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : { value: parsed };
    } catch {
      return { raw: Buffer.isBuffer(value) ? value.toString('utf8') : String(value) };
    }
  }

  /** 从 kafkajs 消息 header 提取字符串值（header 值为 Buffer）。 */
  private extractHeader(message: { headers?: Record<string, Buffer> }, key: string): string | null {
    const headers = message?.headers;
    if (!headers) return null;
    const val = headers[key];
    if (val == null) return null;
    return Buffer.isBuffer(val) ? val.toString('utf8') : String(val);
  }

  async stop(): Promise<void> {
    logger.info(
      { module: 'outboxKafkaConsumer', running: this.running },
      'OutboxKafkaConsumer stopping...',
    );
    this.running = false;
    if (this.consumer) {
      try {
        await this.consumer.disconnect();
        logger.info({ module: 'outboxKafkaConsumer' }, 'OutboxKafkaConsumer disconnected');
      } catch (err) {
        logger.error(
          { module: 'outboxKafkaConsumer', err: (err as Error).message },
          'Error stopping OutboxKafkaConsumer',
        );
      }
      this.consumer = null;
    }
    this.kafka = null;
  }
}