/**
 * 审计日志中间件
 *
 * 对管理端点的写操作（POST/PUT/PATCH/DELETE）记录审计日志，
 * 在响应完成后捕获 statusCode，输出到 pino 日志流并标记 audit: true。
 * 同时写入 outbox 表，保证审计事件与业务数据的事务一致性。
 *
 * 企业理由：管理端点的写操作（增删改数据/配置）属于高风险操作，
 * 必须留存审计记录以满足合规要求（如 SOC 2、ISO 27001），
 * 并在安全事件发生时提供可追溯的操作链。无审计日志时，
 * 数据被篡改或误操作后无法定位责任人和操作时间。
 * 权衡：仅记录写操作（跳过 GET/HEAD/OPTIONS），避免海量读请求日志
 * 淹没关键审计信息，同时减少 I/O 开销。userId 使用 API Key 的 SHA-256
 * 哈希而非明文，避免在日志中泄露凭证。
 */

import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { PoolClient } from 'pg';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getPool } from '../db/index.js';

/** 审计日志专用子 logger，带 audit: true 标记，便于日志采集系统过滤 */
const auditLogger = logger.child({ audit: true, module: 'audit' });

/** 写操作 HTTP 方法集合 */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * 对 API Key 进行 SHA-256 哈希，避免日志中记录明文凭证。
 * 无 Key 时返回 'anonymous'。
 */
function hashApiKey(apiKey: string | undefined): string {
  if (!apiKey) return 'anonymous';
  return crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
}

// Security: HMAC签名防止审计日志被篡改
// 企业为何需要：审计日志是合规基础（SOX/GDPR），篡改检测是必要保障
// 权衡：增加计算开销可忽略，但需安全管理HMAC密钥

/**
 * 对审计日志 payload 进行 HMAC-SHA256 签名，防止篡改。
 * 未配置 AUDIT_HMAC_KEY 时返回空字符串并输出警告。
 */
function signPayload(payload: string): string {
  const key = config.AUDIT_HMAC_KEY;
  if (!key) {
    logger.warn('AUDIT_HMAC_KEY not set, audit log signing disabled');
    return '';
  }
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

/**
 * 验证审计日志 payload 的 HMAC 签名。
 * 未配置 AUDIT_HMAC_KEY 时返回 true（无密钥=不验证）。
 */
export function verifyPayload(payload: string, signature: string): boolean {
  const key = config.AUDIT_HMAC_KEY;
  if (!key) return true; // No key = no verification
  const expected = crypto.createHmac('sha256', key).update(payload).digest('hex');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

/**
 * 将审计事件写入 outbox 表
 *
 * Architecture: Audit Log + Outbox 双写模式（Task 11.2 支持事务双写）
 * 企业为何需要：直接发送事件可能在业务数据写入后、事件发送前崩溃，导致数据不一致。
 * Outbox 表与业务数据在同一事务中写入，保证最终一致性。
 *
 * 两种调用模式：
 * 1. 独立模式（无 client）：使用连接池自行写入 + NOTIFY，向后兼容中间件异步调用。
 *    存在极短窗口的不一致（日志写入成功但 outbox 写入失败），
 *    但 outbox 的核心价值在于事件消费者的幂等处理，而非与业务数据的强一致。
 * 2. 事务模式（传入 client）：参与调用方的事务，与业务数据原子提交。
 *    不在此处发送 NOTIFY —— 事务内的 NOTIFY 会在 COMMIT 时才通知监听者，
 *    避免回滚产生无效通知；调用方应在 COMMIT 后按需发送 NOTIFY。
 *
 * @param auditEntry - 审计日志条目
 * @param client - 可选的事务连接。传入时参与调用方事务；不传时使用连接池（独立模式）
 */
export async function writeOutboxEvent(
  auditEntry: Record<string, unknown>,
  client?: PoolClient,
): Promise<void> {
  // 独立模式：使用连接池；事务模式：使用调用方传入的 client
  const conn = client ?? getPool();
  const payload = JSON.stringify(auditEntry);
  const signature = signPayload(payload);

  try {
    await conn.query(
      `INSERT INTO outbox (aggregate_type, aggregate_id, event_type, payload)
       VALUES ($1, $2, $3, $4)`,
      ['audit', String(auditEntry.userId || 'unknown'), 'AuditEvent', { ...auditEntry, signature }],
    );

    // 仅在独立模式下发送 NOTIFY：
    // 事务模式下 NOTIFY 应由调用方在 COMMIT 后发送，避免回滚产生无效通知
    if (!client) {
      // NOTIFY 不带 payload，由 OutboxPublisher 轮询 outbox 表读取新事件，
      // 避免 payload 字符串拼接的潜在风险
      await conn.query('NOTIFY outbox_channel');
    }

    logger.debug(
      { middleware: 'auditLog', transactional: !!client },
      '[auditLog] outbox 事件写入成功',
    );
  } catch (err) {
    if (client) {
      // 事务模式：让异常向上传播，触发调用方的 ROLLBACK，保证事务一致性
      logger.error(
        { err, middleware: 'auditLog' },
        '[auditLog] outbox 事务写入失败，将触发事务回滚',
      );
      throw err;
    }
    // 独立模式：outbox 写入失败不应阻塞响应，仅记录警告
    logger.warn(
      { err, middleware: 'auditLog' },
      '[auditLog] outbox 事件写入失败，审计日志仍已记录到 pino 日志流',
    );
  }
}

/**
 * 审计日志 Express 中间件
 *
 * 仅对写操作（POST/PUT/PATCH/DELETE）生效，
 * 在响应完成后记录完整审计信息并写入 outbox。
 */
export function auditLog(req: Request, res: Response, next: NextFunction): void {
  // 仅记录写操作
  if (!WRITE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  // 在响应完成后记录（此时 statusCode 可用）
  res.on('finish', () => {
    // Security (T-16 / OWASP A09): 审计身份优先取 JWT 主体（req.user.sub）。
    // 企业为何需要：此前仅取 x-api-key 哈希，JWT 登录用户全部记为匿名，审计无法回溯到具体用户，
    // 违背"可追溯性"（SOC 2 / GDPR Art.30）。优先 JWT 身份，回退到 API Key 哈希，再回退 anonymous。
    const jwtSub = (req as Request & { user?: { sub?: string } }).user?.sub;
    const userId = jwtSub ?? hashApiKey(req.headers['x-api-key'] as string | undefined);
    const auditEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl || req.url,
      userId,
      ip: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      statusCode: res.statusCode,
      result: res.statusCode < 400 ? 'success' : 'failure',
    };

    logger.info(
      {
        middleware: 'auditLog',
        method: req.method,
        path: req.path,
        userId,
        statusCode: res.statusCode,
        requestId: req.id,
        audit: true,
      },
      '[auditLog] 审计记录写入',
    );
    auditLogger.info(
      auditEntry,
      `[audit] ${req.method} ${req.originalUrl || req.url} → ${res.statusCode}`,
    );

    // 异步写入 outbox 表（不阻塞响应）
    writeOutboxEvent(auditEntry);
  });

  next();
}
