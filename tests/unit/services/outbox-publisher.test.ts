/**
 * OutboxPublisher 单元测试（Task 10）
 *
 * 企业理由：OutboxPublisher 是事件溯源最终一致性的核心发布器，
 * 必须保证：
 * 1. handleNotification 正确扫描未处理事件并路由到事件分发器
 * 2. 处理成功后更新 processed_at（避免重复处理）
 * 3. 处理失败时不标记为已处理（补偿扫描器重试）
 * 4. 补偿扫描器查找超过 5 分钟未处理的事件
 * 5. start/stop 正确管理 pg.Client 的 LISTEN/UNLISTEN 生命周期
 *
 * 权衡：仅验证 SQL 契约与路由逻辑，不验证真实数据库行为（属于集成测试范畴）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type pg from 'pg';
import { mockLogger } from '../../helpers/mockFactories.js';

// ===== vi.hoisted：保证 mock 引用在 vi.mock 工厂执行前就绑定 =====
const eventMocks = vi.hoisted(() => ({
  dispatch: vi.fn(async () => {}),
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// 单例 mock pg.Client：所有 new pg.Client() 返回同一实例，便于断言
const mockClient = vi.hoisted(() => ({
  connect: vi.fn().mockResolvedValue(undefined),
  query: vi.fn().mockResolvedValue({ rows: [] }),
  end: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
}));

// ===== Mock 模块 =====

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

vi.mock('../../../packages/backend/src/domain/events/index.js', () => ({
  eventDispatcher: {
    dispatch: eventMocks.dispatch,
  },
}));

// Mock pg：拦截 new pg.Client(...) 构造，返回单例 mock client
vi.mock('pg', () => {
  const Client = vi.fn(() => mockClient);
  return {
    default: { Client, Pool: vi.fn() },
    __esModule: true,
  };
});

import { OutboxPublisher } from '../../../packages/backend/src/services/outboxPublisher.js';

/** 构造一个 mock pg.Pool，记录 query 调用 */
function createMockPool(): pg.Pool & {
  query: ReturnType<typeof vi.fn>;
  options: { connectionString: string };
} {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    connect: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
    options: { connectionString: 'postgresql://test:test@localhost:5432/test' },
  } as unknown as pg.Pool & {
    query: ReturnType<typeof vi.fn>;
    options: { connectionString: string };
  };
}

/** 构造一个 outbox 事件行（模拟 PostgreSQL 返回） */
function createOutboxRow(
  overrides: Partial<{
    id: number;
    aggregate_type: string;
    aggregate_id: string;
    event_type: string;
    payload: unknown;
    created_at: Date;
  }> = {},
) {
  return {
    id: 1,
    aggregate_type: 'BacktestSession',
    aggregate_id: 'backtest-1700000000000',
    event_type: 'BacktestCompleted',
    payload: { totalReturn: 0.2, maxDrawdown: 0.15 },
    created_at: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('OutboxPublisher', () => {
  let mockPool: ReturnType<typeof createMockPool>;
  let publisher: OutboxPublisher;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // 重置单例 client 的 mock 实现
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.query.mockResolvedValue({ rows: [] });
    mockClient.end.mockResolvedValue(undefined);
    mockClient.on.mockReset();
    mockPool = createMockPool();
    publisher = new OutboxPublisher(mockPool);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('handleNotification', () => {
    it('应查询未处理事件（processed_at IS NULL）并按 created_at 升序排列', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await publisher.handleNotification();

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('processed_at IS NULL'));
      const sql = mockPool.query.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY created_at ASC');
      expect(sql).toContain('LIMIT 100');
    });

    it('应将每个事件路由到 eventDispatcher.dispatch', async () => {
      const event1 = createOutboxRow({ id: 1, event_type: 'BacktestCompleted' });
      const event2 = createOutboxRow({
        id: 2,
        event_type: 'AuditEvent',
        aggregate_type: 'audit',
        aggregate_id: 'user-123',
        payload: { action: 'login' },
      });
      mockPool.query
        .mockResolvedValueOnce({ rows: [event1, event2] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await publisher.handleNotification();

      expect(eventMocks.dispatch).toHaveBeenCalledTimes(2);
      expect(eventMocks.dispatch).toHaveBeenNthCalledWith(1, {
        eventType: 'BacktestCompleted',
        aggregateType: 'BacktestSession',
        aggregateId: 'backtest-1700000000000',
        payload: { totalReturn: 0.2, maxDrawdown: 0.15 },
        occurredAt: new Date('2024-01-01T00:00:00Z'),
      });
      expect(eventMocks.dispatch).toHaveBeenNthCalledWith(2, {
        eventType: 'AuditEvent',
        aggregateType: 'audit',
        aggregateId: 'user-123',
        payload: { action: 'login' },
        occurredAt: new Date('2024-01-01T00:00:00Z'),
      });
    });

    it('处理成功后应更新 processed_at = NOW()', async () => {
      const event = createOutboxRow({ id: 42 });
      mockPool.query.mockResolvedValueOnce({ rows: [event] }).mockResolvedValueOnce({ rows: [] });

      await publisher.handleNotification();

      expect(mockPool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('UPDATE outbox SET processed_at = NOW()'),
        [[42]],
      );
    });

    it('handler 失败时不应标记为已处理（不调用 UPDATE）', async () => {
      const event = createOutboxRow({ id: 99 });
      mockPool.query.mockResolvedValueOnce({ rows: [event] });
      eventMocks.dispatch.mockRejectedValueOnce(new Error('handler boom'));

      await publisher.handleNotification();

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      expect(mockPool.query).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE outbox SET processed_at'),
        expect.anything(),
      );
      expect(loggerMocks.error).toHaveBeenCalled();
    });

    it('payload 为字符串时应 JSON.parse 后再分发', async () => {
      const event = createOutboxRow({
        id: 1,
        payload: '{"foo":"bar"}',
      });
      mockPool.query.mockResolvedValueOnce({ rows: [event] }).mockResolvedValueOnce({ rows: [] });

      await publisher.handleNotification();

      expect(eventMocks.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: { foo: 'bar' },
        }),
      );
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
    it('应查找超过 5 分钟未处理的事件（created_at < NOW() - INTERVAL 5 minutes）', async () => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.query.mockResolvedValue({ rows: [] });

      await publisher.start();

      // 补偿扫描器每 60s 执行一次，手动推进定时器
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await vi.advanceTimersByTimeAsync(60_000);

      // 验证补偿扫描 SQL 包含 5 分钟间隔条件
      const compensationCall = mockPool.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' && (call[0] as string).includes("INTERVAL '5 minutes'"),
      );
      expect(compensationCall).toBeDefined();
      const compensationSql = compensationCall![0] as string;
      expect(compensationSql).toContain('processed_at IS NULL');
      expect(compensationSql).toContain("created_at < NOW() - INTERVAL '5 minutes'");
      expect(compensationSql).toContain('LIMIT 50');

      await publisher.stop();
    });

    it('发现积压事件时应触发 handleNotification 重新处理', async () => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.query.mockResolvedValue({ rows: [] });

      await publisher.start();

      // 补偿扫描发现 3 条积压事件
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }, { id: 3 }] })
        .mockResolvedValueOnce({ rows: [] });

      await vi.advanceTimersByTimeAsync(60_000);

      expect(loggerMocks.warn).toHaveBeenCalledWith(
        expect.objectContaining({ count: 3 }),
        expect.stringContaining('stuck outbox events'),
      );

      await publisher.stop();
    });
  });

  describe('start / stop 生命周期', () => {
    it('start 应通过 pg.Client 发送 LISTEN outbox_channel', async () => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.query.mockResolvedValue({ rows: [] });

      await publisher.start();

      // 应调用 LISTEN outbox_channel
      const listenCall = mockClient.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' && (call[0] as string).includes('LISTEN outbox_channel'),
      );
      expect(listenCall).toBeDefined();

      await publisher.stop();
    });

    it('start 应注册 notification 事件监听器', async () => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.query.mockResolvedValue({ rows: [] });

      await publisher.start();

      expect(mockClient.on).toHaveBeenCalledWith('notification', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function));

      await publisher.stop();
    });

    it('stop 应发送 UNLISTEN 并关闭 client', async () => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.query.mockResolvedValue({ rows: [] });

      await publisher.start();
      await publisher.stop();

      const unlistenCall = mockClient.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' && (call[0] as string).includes('UNLISTEN outbox_channel'),
      );
      expect(unlistenCall).toBeDefined();
      expect(mockClient.end).toHaveBeenCalled();
    });

    it('start 时 pg.Client 连接失败应优雅降级（不抛出），仍启动补偿扫描器', async () => {
      mockClient.connect.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(publisher.start()).resolves.toBeUndefined();
      expect(loggerMocks.error).toHaveBeenCalled();
      // 补偿扫描器仍应启动
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockPool.query).toHaveBeenCalled();

      await publisher.stop();
    });

    it('收到 notification 时应触发 handleNotification', async () => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.query.mockResolvedValue({ rows: [] });
      let notificationHandler: ((msg: { channel: string }) => void) | undefined;
      mockClient.on.mockImplementation(
        (event: string, handler: (msg: { channel: string }) => void) => {
          if (event === 'notification') notificationHandler = handler;
        },
      );

      await publisher.start();
      expect(notificationHandler).toBeDefined();

      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await notificationHandler!({ channel: 'outbox_channel' });

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('processed_at IS NULL'));

      await publisher.stop();
    });

    it('listener error/end 事件应记录日志', async () => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.query.mockResolvedValue({ rows: [] });
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
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // LISTEN
        .mockRejectedValueOnce(new Error('unlisten failed'));

      await publisher.start();
      await expect(publisher.stop()).resolves.toBeUndefined();
      expect(loggerMocks.error).toHaveBeenCalled();
    });
  });
});
