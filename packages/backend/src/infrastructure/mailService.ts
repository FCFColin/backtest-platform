// ADR-009: 生产走 SMTP，开发走 console（日志打印链接）
import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// 邮件头注入防护：subject 由用户可控输入拼接，CR/LF 会破坏 header（SMTP header injection）
const sanitizeHeader = (v: string): string => v.replace(/[\r\n]+/g, ' ').trim();

let transporter: Transporter | null = null;

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

interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

async function sendMail(msg: MailMessage): Promise<void> {
  const t = getTransporter();
  if (!t) {
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

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `${config.APP_BASE_URL}/verify-email?token=${encodeURIComponent(token)}`;
  await sendMail({
    to,
    subject: '验证你的邮箱 · Backtest Platform',
    text: `欢迎注册 Backtest Platform！请点击以下链接验证你的邮箱（24 小时内有效）：\n\n${link}\n\n如非本人操作，请忽略此邮件。`,
  });
}

export async function sendInvitationEmail(
  to: string,
  orgName: string,
  token: string,
): Promise<void> {
  const link = `${config.APP_BASE_URL}/accept-invite?token=${encodeURIComponent(token)}`;
  await sendMail({
    to,
    subject: `你被邀请加入组织 ${sanitizeHeader(orgName)} · Backtest Platform`,
    text: `你被邀请加入组织「${orgName}」。请点击以下链接接受邀请（7 天内有效）：\n\n${link}\n\n若你尚无账户，请先注册后再打开此链接。`,
  });
}
