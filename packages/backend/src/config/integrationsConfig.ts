/**
 * 邮件与计费集成配置片段。
 *
 * 涵盖 SMTP 邮件投递（ADR-035）与 Stripe 计费（ADR-036）相关配置。
 */

/**
 * 邮件与 Stripe 计费配置片段。
 */
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

  /**
   * Stripe 密钥与价格配置（ADR-036，Phase 6 计费）。
   * 未配置时计费端点返回 503（计费未启用），不影响其余功能。
   */
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
  STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || '',
  /** Pro 方案的 Stripe Price ID（price_xxx）。 */
  STRIPE_PRICE_PRO: process.env.STRIPE_PRICE_PRO || '',
  /** Enterprise 方案的 Stripe Price ID。 */
  STRIPE_PRICE_ENTERPRISE: process.env.STRIPE_PRICE_ENTERPRISE || '',
};
