import { logger } from '../utils/logger.js';
import { withTenant } from '../db/pool.js';
import { writeAuditLog } from './auditStorageService.js';
import type { AuditAction } from './auditStorageService.js';

export const AUDIT_EVENT_TYPE = 'AuditEvent';

const METHOD_ACTION: Record<string, AuditAction> = {
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
};

export interface AuditEventInput {
  orgId?: unknown;
  userId?: unknown;
  method?: unknown;
  path?: unknown;
  ip?: unknown;
  statusCode?: unknown;
  result?: unknown;
  userAgent?: unknown;
  timestamp?: unknown;
  __outboxEventId?: unknown;
}

/** 审计事件唯一消费者（P3-05）：由 outbox 消费端直接调用；失败向上抛供 outbox 不置 processed 重试。 */
export async function handleAuditEvent(input: AuditEventInput): Promise<void> {
  const orgId = typeof input.orgId === 'string' ? input.orgId : null;
  if (!orgId) {
    logger.warn(
      { outboxEventId: input.__outboxEventId },
      '[audit] 事件缺少 orgId，跳过持久化（仅 pino 日志）',
    );
    return;
  }
  const method = typeof input.method === 'string' ? input.method : '';
  const outboxEventId = typeof input.__outboxEventId === 'string' ? input.__outboxEventId : null;
  const entry = {
    eventType: AUDIT_EVENT_TYPE,
    userId: typeof input.userId === 'string' ? input.userId : null,
    orgId,
    ipAddress: typeof input.ip === 'string' ? input.ip : null,
    action: METHOD_ACTION[method] ?? 'READ',
    resourceType: typeof input.path === 'string' ? input.path : null,
    resourceId: null,
    payload: {
      method,
      statusCode: input.statusCode,
      result: input.result,
      userAgent: input.userAgent,
      timestamp: input.timestamp,
    },
  };
  await withTenant(orgId, (client) => writeAuditLog(entry, client, outboxEventId ?? undefined));
}
