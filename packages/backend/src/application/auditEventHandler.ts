import { logger } from '../utils/logger.js';
import { withTenant } from '../db/pool.js';
import { writeAuditLog } from './auditStorageService.js';
import type { AuditAction } from './auditStorageService.js';
import type { EventHandler, DomainEvent } from '../domain/events/events.js';

const METHOD_ACTION: Record<string, AuditAction> = {
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
};

export class AuditEventHandler implements EventHandler {
  readonly eventType = 'AuditEvent';

  async handle(event: DomainEvent): Promise<void> {
    const p = event.payload;
    const orgId = typeof p.orgId === 'string' ? p.orgId : null;
    if (!orgId) {
      logger.warn(
        { aggregateId: event.aggregateId },
        '[AuditEventHandler] 事件缺少 orgId，跳过持久化（仅 pino 日志）',
      );
      return;
    }
    const method = typeof p.method === 'string' ? p.method : '';
    const entry = {
      eventType: 'AuditEvent',
      userId: typeof p.userId === 'string' ? p.userId : null,
      orgId,
      ipAddress: typeof p.ip === 'string' ? p.ip : null,
      action: METHOD_ACTION[method] ?? 'READ',
      resourceType: typeof p.path === 'string' ? p.path : null,
      resourceId: null,
      payload: {
        method,
        statusCode: p.statusCode,
        result: p.result,
        userAgent: p.userAgent,
        timestamp: p.timestamp,
      },
    };
    try {
      await withTenant(orgId, (client) => writeAuditLog(entry, client));
    } catch (err) {
      logger.error(
        { err, aggregateId: event.aggregateId },
        '[AuditEventHandler] 持久化审计日志失败',
      );
    }
  }
}
