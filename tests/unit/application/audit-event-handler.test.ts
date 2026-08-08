import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loggerMocks } from '../../helpers/loggerFixture.js';

const poolMocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: vi.fn(() => poolMocks),
  withTenant: vi.fn((_orgId: string, fn: (client: unknown) => Promise<unknown>) => fn({})),
}));
vi.mock('../../../packages/backend/src/application/auditStorageService.js', () => ({
  writeAuditLog: vi.fn().mockResolvedValue('audit-1'),
}));

import { AuditEventHandler } from '../../../packages/backend/src/application/auditEventHandler.js';
import { writeAuditLog } from '../../../packages/backend/src/application/auditStorageService.js';
import type { DomainEvent } from '../../../packages/backend/src/domain/events/events.js';

function makeEvent(payload: Record<string, unknown> = {}): DomainEvent {
  return {
    eventType: 'AuditEvent',
    aggregateType: 'audit',
    aggregateId: 'unknown',
    payload: {
      timestamp: '2026-01-01T00:00:00Z',
      method: 'POST',
      path: '/api/v1/backtest',
      userId: 'u1',
      orgId: 'org-1',
      ip: '127.0.0.1',
      userAgent: 'test',
      statusCode: 200,
      result: 'success',
      ...payload,
    },
    occurredAt: new Date('2026-01-01T00:00:00Z'),
  };
}

describe('AuditEventHandler', () => {
  let handler: AuditEventHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new AuditEventHandler();
  });

  it('应订阅 AuditEvent 事件类型', () => {
    expect(handler.eventType).toBe('AuditEvent');
  });

  it('handle 应经 withTenant 写入 writeAuditLog（action 由 method 映射）', async () => {
    await handler.handle(makeEvent());

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'AuditEvent',
        userId: 'u1',
        orgId: 'org-1',
        action: 'CREATE',
        resourceType: '/api/v1/backtest',
        ipAddress: '127.0.0.1',
      }),
      {},
    );
  });

  it('PUT/PATCH/DELETE 应映射为 UPDATE/DELETE', async () => {
    await handler.handle(makeEvent({ method: 'PUT' }));
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE' }), {});
    await handler.handle(makeEvent({ method: 'DELETE' }));
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE' }), {});
  });

  it('缺少 orgId 时跳过持久化并告警', async () => {
    await handler.handle(makeEvent({ orgId: null }));

    expect(writeAuditLog).not.toHaveBeenCalled();
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  it('writeAuditLog 抛错时应向外传播（供 outbox 消费端重试）', async () => {
    vi.mocked(writeAuditLog).mockRejectedValueOnce(new Error('db down'));

    await expect(handler.handle(makeEvent())).rejects.toThrow('db down');
  });
});
