// Architecture: Outbox Kafka 消费器（P3-05 CDC 替代通路，ADR-051）
// 多 Pod 场景下 LISTEN/NOTIFY 会重复处理事件；CDC 经 Debezium 读 WAL → Kafka → 消费组实现跨 Pod 负载均衡。
// 权衡：kafkajs 运行时动态 import，未安装时降级 no-op；不更新 outbox.processed_at（写回会被 Debezium 再捕获形成反馈环），
// 进度由消费组 offset 跟踪；与 OutboxPublisher 互斥，由 CDC_KAFKA_ENABLED 决定通路。
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { eventDispatcher } from '../domain/events/events.js';
// type-only import：避免运行时与 outboxPublisher.ts 形成循环依赖（factory 运行时 import 本模块，类型在编译期擦除）
import type { OutboxConsumer, WebhookHandler } from './outbox.js';

/** topic 名前缀，与 connector 的 route.topic.replacement `backtest.${routedByValue}` 对齐。 */
const TOPIC_PREFIX = 'backtest.';

// 消息形态（Outbox Event Router SMT 展平后）：topic=backtest.<aggregate_type>，key=aggregate_id，
// value=payload 列 JSONB 内容（schemas.enable=false），headers=event_type / tenant_id（additional.placement 注入）
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
  // kafkajs 实例类型以最小契约表达（P3-05：仅加入 package.json，未 pnpm install）
  private kafka: KafkaLike | null = null;
  private consumer: KafkaConsumerLike | null = null;
  private running = false;

  /** @param getWebhookHandler webhook 回调 getter（factory 注入）：server.ts 创建消费器后才 setWebhookHandler，getter 保证读到最新值且避免循环依赖 */
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
    this.kafka = new KafkaCtor({ clientId: config.KAFKA_GROUP_ID, brokers });
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
          /* 启动已失败，disconnect 可忽略 */
        }
        this.consumer = null;
      }
      this.running = false;
    }
  }

  /** 处理单条消息：还原领域事件 → eventDispatcher → 可选 webhook。aggregate_type 从 topic 推导，eventType 优先 header（兼容多种 SMT 配置）回退 payload 字段。 */
  private async handleMessage(payload: KafkaMessage): Promise<void> {
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
          { module: 'outboxKafkaConsumer', err: (whErr as Error).message, eventType, tenantId },
          'Webhook trigger failed (Kafka 消费继续)',
        );
      }
    }
    logger.info(
      { module: 'outboxKafkaConsumer', topic, eventType, aggregateId },
      'Kafka outbox event consumed',
    );
  }

  /** 解析 value（Debezium schemas.enable=false 时为纯 JSON）。 */
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
