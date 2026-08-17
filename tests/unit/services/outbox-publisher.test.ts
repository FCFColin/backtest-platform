import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type pg from 'pg';
import { createMockClient } from '../../helpers/mockFactories.js';
import { loggerMocks } from '../../helpers/loggerFixture.js';
import '../../helpers/loggerMock.js';

const eventMocks = vi.hoisted(() => ({ handleAuditEvent: vi.fn(async () => {}) }));
const clientMock = vi.hoisted(() => ({
  connect: vi.fn().mockResolvedValue(undefined),
  query: vi.fn().mockResolvedValue({ rows: [] }),
  end: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
}));

vi.mock('../../../packages/backend/src/application/auditEventHandler.js', () => ({
  AUDIT_EVENT_TYPE: 'AuditEvent',
  handleAuditEvent: eventMocks.handleAuditEvent,
}));
vi.mock('pg', () => ({
  default: { Client: vi.fn(() => clientMock), Pool: vi.fn() },
  __esModule: true,
}));
vi.mock('prom-client', () => ({ default: { Gauge: vi.fn(() => ({ set: vi.fn() })) } }));
vi.mock('../../../packages/backend/src/utils/metrics.js', () => ({
  getPrometheusRegister: () => ({ registerMetric: vi.fn() }),
}));
vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: { CDC_KAFKA_ENABLED: false, OUTBOX_RETENTION_DAYS: 7 },
}));
vi.mock('../../../packages/backend/src/infrastructure/outboxKafkaConsumer.js', () => ({
  OutboxKafkaConsumer: vi.fn(),
}));

import { OutboxPublisher } from '../../../packages/backend/src/infrastructure/outboxPublisher.js';
import {
  writeEventInTransaction,
  type OutboxEvent,
} from '../../../packages/backend/src/infrastructure/outbox.js';

function createMockPool() {
  const clientQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    connect: vi.fn().mockResolvedValue({ query: clientQuery, release: vi.fn() }),
    end: vi.fn(),
    on: vi.fn(),
    options: { connectionString: 'postgresql://test:test@localhost:5432/test' },
    __clientQuery: clientQuery,
  } as unknown as pg.Pool & {
    query: ReturnType<typeof vi.fn>;
    __clientQuery: ReturnType<typeof vi.fn>;
    options: { connectionString: string };
  };
}
function queueClientTxn(mock: ReturnType<typeof vi.fn>, selectRows: unknown): void {
  mock
    .mockResolvedValueOnce({ rows: [] }) // BEGIN
    .mockResolvedValueOnce(selectRows) // SELECT
    .mockResolvedValueOnce({ rows: [] }); // COMMIT
}
function createOutboxRow(overrides: Record<string, unknown> = {}) {
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
function makeEvent(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  return {
    aggregateType: 'BacktestSession',
    aggregateId: 'backtest-1700000000000',
    eventType: 'BacktestCompleted',
    payload: { totalReturn: 0.2, maxDrawdown: 0.15 },
    ...overrides,
  };
}
const findSqlCall = (calls: unknown[][], needle: string): string | undefined =>
  calls.find((c) => typeof c[0] === 'string' && (c[0] as string).includes(needle))?.[0] as
    string | undefined;
describe('OutboxPublisher', () => {
  let mockPool: ReturnType<typeof createMockPool>;
  let publisher: OutboxPublisher;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    clientMock.connect.mockResolvedValue(undefined);
    clientMock.query.mockResolvedValue({ rows: [] });
    clientMock.end.mockResolvedValue(undefined);
    clientMock.on.mockReset();
    mockPool = createMockPool();
    publisher = new OutboxPublisher(mockPool);
  });
  afterEach(() => vi.useRealTimers());
  describe('handleNotification', () => {
    it('应查询未处理事件并按 created_at 升序 LIMIT 100 且 SKIP LOCKED；空结果集时无副作用', async () => {
      mockPool.__clientQuery.mockResolvedValueOnce({ rows: [] }); // SELECT
      await publisher.handleNotification();
      const sql = findSqlCall(
        mockPool.__clientQuery.mock.calls as unknown[][],
        'processed_at IS NULL',
      );
      expect(sql).toContain('processed_at IS NULL');
      expect(sql).toContain('ORDER BY created_at ASC');
      expect(sql).toContain('LIMIT 100');
      expect(sql).toContain('FOR UPDATE SKIP LOCKED');
      expect(eventMocks.handleAuditEvent).not.toHaveBeenCalled();
    });
    it('应将 AuditEvent 路由到 handleAuditEvent（透传 __outboxEventId），其他类型跳过', async () => {
      mockPool.__clientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            createOutboxRow({ id: 1, event_type: 'BacktestCompleted' }),
            createOutboxRow({
              id: 2,
              event_type: 'AuditEvent',
              aggregate_type: 'audit',
              aggregate_id: 'user-123',
              payload: { action: 'login' },
            }),
          ],
        }) // SELECT
        .mockResolvedValueOnce({ rows: [] }) // UPDATE processed_at
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      await publisher.handleNotification();
      expect(eventMocks.handleAuditEvent).toHaveBeenCalledTimes(1);
      expect(eventMocks.handleAuditEvent).toHaveBeenNthCalledWith(1, {
        action: 'login',
        __outboxEventId: 2,
      });
    });
    it('处理成功后应更新 processed_at = NOW()', async () => {
      queueClientTxn(mockPool.__clientQuery, { rows: [createOutboxRow({ id: 42 })] });
      await publisher.handleNotification();
      const calls = mockPool.__clientQuery.mock.calls as unknown[][];
      const updateIdx = calls.findIndex((c) =>
        String(c[0]).includes('UPDATE outbox SET processed_at = NOW()'),
      );
      expect(updateIdx).toBeGreaterThan(-1);
      expect(calls[updateIdx][1]).toEqual([[42]]);
    });
    it('handler 失败时不应标记为已处理（不调用 UPDATE）', async () => {
      queueClientTxn(mockPool.__clientQuery, {
        rows: [createOutboxRow({ id: 99, event_type: 'AuditEvent' })],
      });
      eventMocks.handleAuditEvent.mockRejectedValueOnce(new Error('handler boom'));
      await publisher.handleNotification();
      expect(
        mockPool.__clientQuery.mock.calls.some((c) =>
          String(c[0]).includes('UPDATE outbox SET processed_at'),
        ),
      ).toBe(false);
      expect(loggerMocks.error).toHaveBeenCalled();
    });

    it.each([
      [
        'payload 为字符串时应 JSON.parse 后再分发',
        { id: 1, event_type: 'AuditEvent', payload: '{"foo":"bar"}' },
        { foo: 'bar', __outboxEventId: 1 },
      ],
      ['SELECT 查询失败时应记录错误且不抛出', null, null],
    ])('%s', async (_n, rowOrErr, expectedPayload) => {
      if (rowOrErr === null) {
        mockPool.__clientQuery
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockRejectedValueOnce(new Error('connection lost')); // SELECT
      } else {
        queueClientTxn(mockPool.__clientQuery, { rows: [createOutboxRow(rowOrErr)] });
      }
      await expect(publisher.handleNotification()).resolves.toBeUndefined();
      if (rowOrErr === null) {
        expect(loggerMocks.error).toHaveBeenCalled();
        expect(eventMocks.handleAuditEvent).not.toHaveBeenCalled();
      } else {
        expect(eventMocks.handleAuditEvent).toHaveBeenCalledWith(expectedPayload);
      }
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
      expect(loggerMocks.warn).toHaveBeenCalledWith(
        expect.objectContaining({ count: 3 }),
        expect.stringContaining('stuck outbox events'),
      );
      await publisher.stop();
    });
  });
  describe('start / stop 生命周期', () => {
    it('start 发送 LISTEN 并注册监听，stop 发送 UNLISTEN 并关闭 client', async () => {
      await publisher.start();
      expect(
        findSqlCall(clientMock.query.mock.calls as unknown[][], 'LISTEN outbox_channel'),
      ).toBeDefined();
      expect(clientMock.on).toHaveBeenCalledWith('notification', expect.any(Function));
      expect(clientMock.on).toHaveBeenCalledWith('error', expect.any(Function));
      await publisher.stop();
      expect(
        findSqlCall(clientMock.query.mock.calls as unknown[][], 'UNLISTEN outbox_channel'),
      ).toBeDefined();
      expect(clientMock.end).toHaveBeenCalled();
    });
    it('start 时 pg.Client 连接失败应优雅降级（不抛出），仍启动补偿扫描器', async () => {
      clientMock.connect.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(publisher.start()).resolves.toBeUndefined();
      expect(loggerMocks.error).toHaveBeenCalled();
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockPool.query).toHaveBeenCalled();
      await publisher.stop();
    });
    it('收到 notification 应触发 handleNotification；error/end 事件应记录日志', async () => {
      let notificationHandler: ((msg: { channel: string }) => void) | undefined;
      let errorHandler: ((err: Error) => void) | undefined;
      let endHandler: (() => void) | undefined;
      clientMock.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'notification')
          notificationHandler = handler as (msg: { channel: string }) => void;
        if (event === 'error') errorHandler = handler as (err: Error) => void;
        if (event === 'end') endHandler = handler as () => void;
      });
      await publisher.start();
      expect(notificationHandler).toBeDefined();
      mockPool.__clientQuery.mockResolvedValueOnce({ rows: [] }); // SELECT
      await notificationHandler!({ channel: 'outbox_channel' });
      await vi.waitFor(() =>
        expect(mockPool.__clientQuery).toHaveBeenCalledWith(
          expect.stringContaining('processed_at IS NULL'),
        ),
      );
      errorHandler!(new Error('connection reset'));
      endHandler!();
      expect(loggerMocks.error).toHaveBeenCalled();
      expect(loggerMocks.warn).toHaveBeenCalled();
      await publisher.stop();
    });
    it('stop 时 UNLISTEN 失败应记录 error 但不抛出', async () => {
      clientMock.query
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('unlisten failed'));
      await publisher.start();
      await expect(publisher.stop()).resolves.toBeUndefined();
      expect(loggerMocks.error).toHaveBeenCalled();
    });
  });
  describe('cleanupProcessedOutboxEvents (H-005 SQL 参数化)', () => {
    it('应使用参数化查询（$1 占位符 + 参数数组）且不含模板插值', async () => {
      await publisher.cleanupProcessedOutboxEvents();
      const callArgs = mockPool.query.mock.calls[0];
      const sqlString = callArgs[0] as string;
      expect(callArgs).toHaveLength(2);
      expect(Array.isArray(callArgs[1])).toBe(true);
      expect(callArgs[1]).toHaveLength(1);
      expect(callArgs[1][0]).toBe(7);
      expect(sqlString).not.toContain('${');
      expect(sqlString).toContain('$1');
      expect(sqlString).toContain("INTERVAL '1 day' * $1");
    });
    it('OUTBOX_RETENTION_DAYS 由 config 配置且通过参数传递（非硬编码）', async () => {
      vi.doMock('../../../packages/backend/src/config/index.js', () => ({
        config: { CDC_KAFKA_ENABLED: false, OUTBOX_RETENTION_DAYS: 30 },
      }));
      vi.resetModules();
      const { OutboxPublisher: FreshPublisher } =
        await import('../../../packages/backend/src/infrastructure/outboxPublisher.js');
      const freshPublisher = new FreshPublisher(mockPool);
      await freshPublisher.cleanupProcessedOutboxEvents();
      const callArgs = mockPool.query.mock.calls[mockPool.query.mock.calls.length - 1];
      expect(callArgs[1][0]).toBe(30);
    });
  });
});
describe('writeEventInTransaction', () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
  });
  it('应使用传入的 client 写入正确 INSERT（含 created_at/NOW()/JSON 序列化），且不调用 release', async () => {
    await writeEventInTransaction(
      client,
      makeEvent({
        aggregateType: 'audit',
        aggregateId: 'user-123',
        eventType: 'AuditEvent',
        payload: { totalReturn: 0.2, maxDrawdown: 0.15, sharpeRatio: 1.5 },
      }),
    );
    expect(client.query).toHaveBeenCalledTimes(1);
    const sqlArg = client.query.mock.calls[0][0] as string;
    const paramsArg = client.query.mock.calls[0][1] as unknown[];
    expect(sqlArg).toContain('INSERT INTO outbox');
    expect(sqlArg).toContain('created_at');
    expect(sqlArg).toContain('NOW()');
    expect(paramsArg).toEqual([
      'audit',
      'user-123',
      'AuditEvent',
      JSON.stringify({ totalReturn: 0.2, maxDrawdown: 0.15, sharpeRatio: 1.5 }),
      null,
    ]);
    expect((client as unknown as { release: () => void }).release).not.toHaveBeenCalled();
  });
  it('client.query 抛错时应向上传播（让调用方触发 ROLLBACK）', async () => {
    const dbError = new Error('connection lost');
    client.query.mockRejectedValueOnce(dbError);
    await expect(
      writeEventInTransaction(client, makeEvent({ aggregateId: 'backtest-fail' })),
    ).rejects.toThrow('connection lost');
  });
});
