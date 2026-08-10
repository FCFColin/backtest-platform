import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { PoolClient } from 'pg';
import { getPool } from '../db/pool.js';
import { writeEventInTransaction } from '../infrastructure/outbox.js';
import { auditOutboxWriteFailures } from '../utils/metrics.js';
import { safeEqual } from '../utils/crypto.js';
import type { AuthenticatedRequest } from './jwtAuth.js';

const auditLogger = logger.child({ audit: true, module: 'audit' });
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
function hashApiKey(apiKey: string | undefined): string {
  return apiKey
    ? crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 16)
    : 'anonymous';
}
function auditHmac(payload: string, warnMsg: string): string {
  const key = config.AUDIT_HMAC_KEY;
  if (!key) {
    logger.warn(warnMsg);
    return '';
  }
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}
function signPayload(payload: string): string {
  return auditHmac(payload, 'AUDIT_HMAC_KEY not set, audit log signing disabled');
}
export function verifyPayload(payload: string, signature: string): boolean {
  const expected = auditHmac(
    payload,
    'AUDIT_HMAC_KEY not set, audit payload verification fails closed (returns false)',
  );
  if (!expected) return false;
  return safeEqual(signature, expected);
}
export async function writeOutboxEvent(
  auditEntry: Record<string, unknown>,
  client?: PoolClient,
): Promise<void> {
  const conn = client ?? getPool();
  const payload = JSON.stringify(auditEntry);
  const signature = signPayload(payload);
  const eventId = crypto.randomUUID();
  try {
    await writeEventInTransaction(conn, {
      aggregateType: 'audit',
      aggregateId: String(auditEntry.userId || 'unknown'),
      eventType: 'AuditEvent',
      payload: { ...auditEntry, signature },
      eventId,
    });
    if (!client) await conn.query('NOTIFY outbox_channel');
    logger.debug(
      { middleware: 'auditLog', transactional: !!client },
      '[auditLog] outbox 事件写入成功',
    );
  } catch (err) {
    if (client) {
      logger.error(
        { err, middleware: 'auditLog' },
        '[auditLog] outbox 事务写入失败，将触发事务回滚',
      );
      throw err;
    }
    logger.warn(
      { err, middleware: 'auditLog' },
      '[auditLog] outbox 事件写入失败，审计日志仍已记录到 pino 日志流',
    );
    auditOutboxWriteFailures.inc();
  }
}
export function auditLog(req: Request, res: Response, next: NextFunction): void {
  if (!WRITE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }
  res.on('finish', () => {
    const jwtSub = (req as AuthenticatedRequest).user?.sub;
    const userId = jwtSub ?? hashApiKey(req.headers['x-api-key'] as string | undefined);
    const auditEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl || req.url,
      userId,
      orgId: (req as AuthenticatedRequest).tenantId ?? null,
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
    void writeOutboxEvent(auditEntry);
  });
  next();
}
