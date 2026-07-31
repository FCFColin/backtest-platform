import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type pg from 'pg';
import { mockLogger } from '../../helpers/mockFactories.js';

const eventMocks = vi.hoisted(() => ({ dispatch: vi.fn(async () => {}) }));
const loggerMocks = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })) }));
const mockClient = vi.hoisted(() => ({ connect: vi.fn().mockResolvedValue(undefined), query: vi.fn().mockResolvedValue({ rows: [] }), end: vi.fn().mockResolvedValue(undefined), on: vi.fn() }));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: mockLogger(loggerMocks) }));
vi.mock('../../../packages/backend/src/domain/events/events.js', () => ({ eventDispatcher: { dispatch: eventMocks.dispatch } }));
vi.mock('pg', () => ({ default: { Client: vi.fn(() => mockClient), Pool: vi.fn() }, __esModule: true }));

import { OutboxPublisher } from '../../../packages/backend/src/infrastructure/outboxPublisher.js';

function createMockPool() {
  return { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }), connect: vi.fn(), end: vi.fn(), on: vi.fn(), options: { connectionString: 'postgresql://test:test@localhost:5432/test' } } as unknown as pg.Pool & { query: ReturnType<typeof vi.fn>; options: { connectionString: string } };
}

function createOutboxRow(overrides: Record<string, unknown> = {}) {
  return { id: 1, aggregate_type: 'BacktestSession', aggregate_id: 'backtest-1700000000000', event_type: 'BacktestCompleted', payload: { totalReturn: 0.2, maxDrawdown: 0.15 }, created_at: new Date('2024-01-01T00:00:00Z'), ...overrides };
}

function findSqlCall(calls: unknown[][], needle: string): string | undefined {
  return calls.find((c) => typeof c[0] === 'string' && (c[0] as string).includes(needle))?.[0] as string | undefined;
}

describe('OutboxPublisher', () => {
  let mockPool: ReturnType<typeof createMockPool>;
  let publisher: OutboxPublisher;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.query.mockResolvedValue({ rows: [] });
    mockClient.end.mockResolvedValue(undefined);
    mockClient.on.mockReset();
    mockPool = createMockPool();
    publisher = new OutboxPublisher(mockPool);
  });
  afterEach(() => vi.useRealTimers());

  describe('handleNotification', () => {
    it('应查询未处理事件并按 created_at 升序 LIMIT 100', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await publisher.handleNotification();
      const sql = mockPool.query.mock.calls[0][0] as string;
      expect(sql).toContain('processed_at IS NULL');
      expect(sql).toContain('ORDER BY created_at ASC');
      expect(sql).toContain('LIMIT 100');
    });

    it('应将每个事件路由到 eventDispatcher.dispatch', async () => {
      const event1 = createOutboxRow({ id: 1, event_type: 'BacktestCompleted' });
      const event2 = createOutboxRow({ id: 2, event_type: 'AuditEvent', aggregate_type: 'audit', aggregate_id: 'user-123', payload: { action: 'login' } });
      mockPool.query.mockResolvedValueOnce({ rows: [event1, event2] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
      await publisher.handleNotification();
      expect(eventMocks.dispatch).toHaveBeenCalledTimes(2);
      expect(eventMocks.dispatch).toHaveBeenNthCalledWith(1, { eventType: 'BacktestCompleted', aggregateType: 'BacktestSession', aggregateId: 'backtest-1700000000000', payload: { totalReturn: 0.2, maxDrawdown: 0.15 }, occurredAt: new Date('2024-01-01T00:00:00Z') });
      expect(eventMocks.dispatch).toHaveBeenNthCalledWith(2, { eventType: 'AuditEvent', aggregateType: 'audit', aggregateId: 'user-123', payload: { action: 'login' }, occurredAt: new Date('2024-01-01T00:00:00Z') });
    });

    it('处理成功后应更新 processed_at = NOW()', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [createOutboxRow({ id: 42 })] }).mockResolvedValueOnce({ rows: [] });
      await publisher.handleNotification();
      expect(mockPool.query).toHaveBeenNthCalledWith(2, expect.stringContaining('UPDATE outbox SET processed_at = NOW()'), [[42]]);
    });

    it('handler 失败时不应标记为已处理（不调用 UPDATE）', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [createOutboxRow({ id: 99 })] });
      eventMocks.dispatch.mockRejectedValueOnce(new Error('handler boom'));
      await publisher.handleNotification();
      expect(mockPool.query).toHaveBeenCalledTimes(1);
      expect(mockPool.query).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE outbox SET processed_at'), expect.anything());
      expect(loggerMocks.error).toHaveBeenCalled();
    });

    it('payload 为字符串时应 JSON.parse 后再分发', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [createOutboxRow({ id: 1, payload: '{"foo":"bar"}' })] }).mockResolvedValueOnce({ rows: [] });
      await publisher.handleNotification();
      expect(eventMocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: { foo: 'bar' } }));
    });

    it('SELECT 查询失败时应记录错误且不抛出', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('connection lost'));
      await expect(publisher.handleNotification()).resolves.toBeUndefined();
      expect(loggerMocks.error).toHaveBeenCalled();
      expect(eventMocks.dispatch).not.toHaveBeenCalled();
    });

    it('空结果集时不应调用 dispatch 或 UPDATE', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await publisher.handleNotification();
      expect(eventMocks.dispatch).not.toHaveBeenCalled();
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('compensation scanner', () => {
    it('应查找超过 5 分钟未处理的事件', async () => {
      await publisher.start();
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await vi.advanceTimersByTimeAsync(60_000);
      const sql = findSqlCall(mockPool.query.mock.calls as unknown[][], "INTERVAL '5 minutes'");
      expect(sql).toBeDefined();
      expect(sql).toContain('processed_at IS NULL');
      expect(sql).toContain("created_at < NOW() - INTERVAL '5 minutes'");
      expect(sql).toContain('LIMIT 50');
      await publisher.stop();
    });

    it('发现积压事件时应触发 handleNotification 重新处理', async () => {
      await publisher.start();
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }, { id: 3 }] })
        .mockResolvedValueOnce({ rows: [] });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(loggerMocks.warn).toHaveBeenCalledWith(expect.objectContaining({ count: 3 }), expect.stringContaining('stuck outbox events'));
      await publisher.stop();
    });
  });

  describe('start / stop 生命周期', () => {
    it('start 应通过 pg.Client 发送 LISTEN outbox_channel', async () => {
      await publisher.start();
      expect(findSqlCall(mockClient.query.mock.calls as unknown[][], 'LISTEN outbox_channel')).toBeDefined();
      await publisher.stop();
    });

    it('start 应注册 notification 与 error 事件监听器', async () => {
      await publisher.start();
      expect(mockClient.on).toHaveBeenCalledWith('notification', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      await publisher.stop();
    });

    it('stop 应发送 UNLISTEN 并关闭 client', async () => {
      await publisher.start();
      await publisher.stop();
      expect(findSqlCall(mockClient.query.mock.calls as unknown[][], 'UNLISTEN outbox_channel')).toBeDefined();
      expect(mockClient.end).toHaveBeenCalled();
    });

    it('start 时 pg.Client 连接失败应优雅降级（不抛出），仍启动补偿扫描器', async () => {
      mockClient.connect.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(publisher.start()).resolves.toBeUndefined();
      expect(loggerMocks.error).toHaveBeenCalled();
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockPool.query).toHaveBeenCalled();
      await publisher.stop();
    });

    it('收到 notification 时应触发 handleNotification', async () => {
      let notificationHandler: ((msg: { channel: string }) => void) | undefined;
      mockClient.on.mockImplementation((event: string, handler: (msg: { channel: string }) => void) => { if (event === 'notification') notificationHandler = handler; });
      await publisher.start();
      expect(notificationHandler).toBeDefined();
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await notificationHandler!({ channel: 'outbox_channel' });
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('processed_at IS NULL'));
      await publisher.stop();
    });

    it('listener error/end 事件应记录日志', async () => {
      let errorHandler: ((err: Error) => void) | undefined;
      let endHandler: (() => void) | undefined;
      mockClient.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'error') errorHandler = handler as (err: Error) => void;
        if (event === 'end') endHandler = handler as () => void;
      });
      await publisher.start();
      errorHandler!(new Error('connection reset'));
      endHandler!();
      expect(loggerMocks.error).toHaveBeenCalled();
      expect(loggerMocks.warn).toHaveBeenCalled();
      await publisher.stop();
    });

    it('stop 时 UNLISTEN 失败应记录 error 但不抛出', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error('unlisten failed'));
      await publisher.start();
      await expect(publisher.stop()).resolves.toBeUndefined();
      expect(loggerMocks.error).toHaveBeenCalled();
    });
  });
});