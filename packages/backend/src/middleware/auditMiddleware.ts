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
  } catch (err) {
    if (client) {
      logger.error(
        { err, middleware: 'auditLog' },
        '[auditLog] outbox 事务写入失败，将触发事务回滚',
      );
      throw err;
    }
    // 路径 B（最小止血）：从"静默丢失"升格为"可见失败"。告警规则匹配 code=AUDIT_LOSS。
    // 完整修复方向：writeOutboxEvent 提升至业务事务内（finish 时业务事务已提交，无法回溯加入）。
    logger.error(
      { err, middleware: 'auditLog', code: 'AUDIT_LOSS' },
      '[auditLog] outbox 事件写入失败——该审计事件仅存于 pino 日志流，须人工补录',
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
