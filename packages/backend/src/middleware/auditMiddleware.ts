import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import type { PoolClient } from 'pg';
import { getPool } from '../db/pool.js';
import { writeEventInTransaction } from '../infrastructure/outbox.js';
import { auditOutboxWriteFailures } from '../utils/metrics.js';
import { sha256Hex } from '../utils/crypto.js';
import type { AuthenticatedRequest } from './authShared.js';

const auditLogger = logger.child({ audit: true, module: 'audit' });
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
function hashApiKey(apiKey: string | undefined): string {
  return apiKey ? sha256Hex(apiKey).slice(0, 16) : 'anonymous';
}
export async function writeOutboxEvent(
  auditEntry: Record<string, unknown>,
  client?: PoolClient,
): Promise<void> {
  const conn = client ?? getPool();
  const eventId = crypto.randomUUID();
  try {
    await writeEventInTransaction(conn, {
      aggregateType: 'audit',
      aggregateId: String(auditEntry.userId || 'unknown'),
      eventType: 'AuditEvent',
      payload: auditEntry,
      eventId,
    });
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
      requestId: req.id,
    };
    auditLogger.info(
      auditEntry,
      `[audit] ${req.method} ${req.originalUrl || req.url} → ${res.statusCode}`,
    );
    void writeOutboxEvent(auditEntry);
  });
  next();
}
