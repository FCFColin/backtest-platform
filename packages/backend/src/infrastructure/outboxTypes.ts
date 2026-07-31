/**
 * Outbox 共享类型定义（打破循环依赖）。
 *
 * 原先 `WebhookHandler` 与 `OutboxConsumer` 定义在 `outboxPublisher.ts`，
 * 而 `outboxKafkaConsumer.ts` 仅需这两个类型（type-only import），
 * 同时 `outboxPublisher.ts` 又 import `OutboxKafkaConsumer` 的值，
 * 形成双向循环依赖。将类型提取到本文件后，依赖方向变为单向：
 *   outboxKafkaConsumer -> outboxTypes
 *   outboxPublisher -> outboxKafkaConsumer（值）+ outboxTypes（类型）
 */

/**
 * Webhook 触发回调类型（P2-02）。
 *
 * 企业理由：OutboxPublisher 处理完事件后，需将事件分发给匹配的 webhook 订阅。
 * 为避免 outboxPublisher 反向依赖 application/webhookService（违背分层：基础设施
 * 不应依赖应用层），采用回调注入——由 server.ts 启动时调用 setWebhookHandler 注册。
 * 未注册时（如测试环境）publisher 跳过 webhook 触发，零行为变更。
 */
export type WebhookHandler = (orgId: string, eventType: string, payload: unknown) => Promise<void>;

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