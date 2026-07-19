/**
 * 邮件发送服务（nodemailer，ADR-035）
 *
 * 企业理由：自助注册 / 邀请流程依赖外发邮件投递验证与邀请链接。本服务封装可插拔传输：
 * - 生产（EMAIL_TRANSPORT=smtp）：经 SMTP 真实投递。
 * - 开发（EMAIL_TRANSPORT=console，默认）：不实际发信，将链接打印到日志，便于本地联调。
 *
 * 链接基于 config.APP_BASE_URL 构造，指向前端的验证 / 邀请接受页面。
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

let transporter: Transporter | null = null;

/** 懒初始化 nodemailer transport（按配置选择 SMTP 或 console 日志传输）。 */
function getTransporter(): Transporter | null {
  if (config.EMAIL_TRANSPORT !== 'smtp') return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: config.EMAIL_SMTP_HOST,
    port: config.EMAIL_SMTP_PORT,
    secure: config.EMAIL_SMTP_SECURE,
    auth: config.EMAIL_SMTP_USER
      ? { user: config.EMAIL_SMTP_USER, pass: config.EMAIL_SMTP_PASS }
      : undefined,
  });
  return transporter;
}

/** 单封邮件内容 */
interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * 发送一封邮件。console 传输下仅记录日志（含正文链接），不实际投递。
 *
 * @param msg - 邮件内容
 */
async function sendMail(msg: MailMessage): Promise<void> {
  const t = getTransporter();
  if (!t) {
    // 开发模式：将邮件内容（含链接）打印到日志，方便取用。
    logger.info(
      { module: 'mailService', to: msg.to, subject: msg.subject, body: msg.text },
      '[mailService] (console transport) 邮件未实际发送，内容见 body',
    );
    return;
  }
  await t.sendMail({
    from: config.EMAIL_FROM,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  });
  logger.info(
    { module: 'mailService', to: msg.to, subject: msg.subject },
    '[mailService] 邮件已发送',
  );
}

/**
 * 发送邮箱验证邮件。
 *
 * @param to - 收件邮箱
 * @param token - 明文验证令牌
 */
export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `${config.APP_BASE_URL}/verify-email?token=${encodeURIComponent(token)}`;
  await sendMail({
    to,
    subject: '验证你的邮箱 · Backtest Platform',
    text: `欢迎注册 Backtest Platform！请点击以下链接验证你的邮箱（24 小时内有效）：\n\n${link}\n\n如非本人操作，请忽略此邮件。`,
  });
}

/**
 * 发送组织邀请邮件。
 *
 * @param to - 受邀邮箱
 * @param orgName - 组织名称
 * @param token - 明文邀请令牌
 */
export async function sendInvitationEmail(
  to: string,
  orgName: string,
  token: string,
): Promise<void> {
  const link = `${config.APP_BASE_URL}/accept-invite?token=${encodeURIComponent(token)}`;
  await sendMail({
    to,
    subject: `你被邀请加入组织 ${orgName} · Backtest Platform`,
    text: `你被邀请加入组织「${orgName}」。请点击以下链接接受邀请（7 天内有效）：\n\n${link}\n\n若你尚无账户，请先注册后再打开此链接。`,
  });
}
