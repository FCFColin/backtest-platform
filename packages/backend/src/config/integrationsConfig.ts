/**
 * 邮件与计费集成配置片段。
 *
 * 涵盖 SMTP 邮件投递（ADR-035）与 Stripe 计费（ADR-036）相关配置。
 */

/** 邮件与 Stripe 计费配置片段。 */
export const integrationsConfig = {
  /**
   * 邮件发送方式（ADR-035）。
   * - `smtp`：经 SMTP 真实投递（需配置 EMAIL_SMTP_*）。
   * - `console`：开发模式，将验证/邀请链接打印到日志，不实际发信（默认）。
   * @default "console"（开发）/ 生产建议 "smtp"
   */
  EMAIL_TRANSPORT: (process.env.EMAIL_TRANSPORT || 'console') as 'smtp' | 'console',

  /** 发件人地址（From 头），如 "Backtest <no-reply@backtest.platform>"。 */
  EMAIL_FROM: process.env.EMAIL_FROM || 'Backtest Platform <no-reply@backtest.local>',

  /** SMTP 主机（EMAIL_TRANSPORT=smtp 时必需）。 */
  EMAIL_SMTP_HOST: process.env.EMAIL_SMTP_HOST || '',
  /** SMTP 端口。@default 587 */
  EMAIL_SMTP_PORT: parseInt(process.env.EMAIL_SMTP_PORT || '587', 10),
  /** SMTP 是否使用 TLS（465 端口通常为 true）。@default false */
  EMAIL_SMTP_SECURE: process.env.EMAIL_SMTP_SECURE === 'true',
  /** SMTP 用户名（可空，取决于服务商）。 */
  EMAIL_SMTP_USER: process.env.EMAIL_SMTP_USER || '',
  /** SMTP 密码（可空）。 */
  EMAIL_SMTP_PASS: process.env.EMAIL_SMTP_PASS || '',

  /** Stripe 密钥与价格配置（ADR-036），未配置时计费端点返回 503。 */
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
  STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || '',
  /** Pro 方案的 Stripe Price ID（price_xxx）。 */
  STRIPE_PRICE_PRO: process.env.STRIPE_PRICE_PRO || '',
  /** Enterprise 方案的 Stripe Price ID。 */
  STRIPE_PRICE_ENTERPRISE: process.env.STRIPE_PRICE_ENTERPRISE || '',

  // ---------------------------------------------------------------------------
  // MinIO 对象存储配置（P2-03 不可篡改审计存储）
  // ---------------------------------------------------------------------------
  // 企业理由：审计日志导出至 MinIO Object Lock COMPLIANCE 模式（WORM），
  // 从存储层保证审计记录不可篡改。未配置时（fail-closed）审计日志仅留 DB，
  // HMAC 签名仍提供篡改检测能力。

  /** MinIO 端点（主机名或 IP）。未配置时审计导出静默跳过（fail-closed）。 */
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT || '',
  /** MinIO 端口。@default 9000 */
  MINIO_PORT: parseInt(process.env.MINIO_PORT || '9000', 10),
  /** MinIO Access Key。 */
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY || '',
  /** MinIO Secret Key。 */
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY || '',
  /** 是否启用 TLS。@default false（开发）/ 生产建议 true */
  MINIO_USE_SSL: process.env.MINIO_USE_SSL === 'true',

  // ---------------------------------------------------------------------------
  // CDC / Kafka 配置（P3-05 Debezium Outbox CDC）
  // ---------------------------------------------------------------------------
  // 企业理由：Outbox 默认走 LISTEN/NOTIFY（单实例），多 Pod 水平扩展需外部 pub-sub。
  // CDC 经 Debezium 读 WAL → Kafka → 消费组，支持跨 Pod 负载均衡。
  // 默认关闭，本地开发零额外依赖；生产多 Pod 部署时启用。详见 ADR-051。

  /**
   * 是否启用 Kafka CDC 投递通路（ADR-051 / P3-05）。
   * - `true`：OutboxKafkaConsumer 消费 Debezium 投递的 Kafka 事件。
   * - `false`（默认）：使用 PostgreSQL LISTEN/NOTIFY（单实例，零依赖）。
   * @default false
   */
  CDC_KAFKA_ENABLED: process.env.CDC_KAFKA_ENABLED === 'true',

  /**
   * Kafka broker 列表（逗号分隔），CDC 启用时由 OutboxKafkaConsumer 连接。
   * 本地 docker-compose 用 localhost:9092；K8s 内部用 kafka:29092。
   * @default "localhost:9092"
   */
  KAFKA_BROKERS: process.env.KAFKA_BROKERS || 'localhost:9092',

  /**
   * 订阅的 Kafka topic 列表（逗号分隔）。topic 名由 Debezium Outbox Event Router
   * SMT 按 aggregate_type 路由生成（backtest.<aggregate_type>）。
   * @default "backtest.Run,backtest.BacktestSession,backtest.audit"
   */
  KAFKA_TOPICS: process.env.KAFKA_TOPICS || 'backtest.Run,backtest.BacktestSession,backtest.audit',

  /**
   * Kafka 消费组 ID。同组内多 Pod 分区消费实现负载均衡；不同组各自全量消费。
   * @default "backtest-outbox-consumer"
   */
  KAFKA_GROUP_ID: process.env.KAFKA_GROUP_ID || 'backtest-outbox-consumer',
};
