/**
 * outboxWriter 单元测试（Task 11.4）
 *
 * 企业理由：outboxWriter.writeEventInTransaction 是事务双写的核心原语，
 * 必须保证：
 * 1. 使用调用方传入的 PoolClient（而非自行从连接池获取），确保参与事务
 * 2. SQL 与参数正确（aggregate_type/aggregate_id/event_type/payload/created_at）
 * 3. payload 被 JSON.stringify 序列化（pg JSONB 列要求字符串或对象，此处验证序列化契约）
 *
 * 权衡：仅验证 client.query 调用契约，不验证真实数据库行为（属于集成测试范畴）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PoolClient } from 'pg';

// Mock logger：避免 pino 初始化与 OTel 依赖
vi.mock('../../../api/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn() })),
  },
}));

import { writeEventInTransaction, type OutboxEvent } from '../../../api/services/outboxWriter.js';

/** 构造一个 mock PoolClient，记录所有 query 调用 */
function createMockClient(): PoolClient & { query: ReturnType<typeof vi.fn> } {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
    release: vi.fn(),
  } as unknown as PoolClient & { query: ReturnType<typeof vi.fn> };
}

describe('writeEventInTransaction', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
  });

  it('应使用传入的 client 调用 query（参与调用方事务）', async () => {
    const event: OutboxEvent = {
      aggregateType: 'BacktestSession',
      aggregateId: 'backtest-1700000000000',
      eventType: 'BacktestCompleted',
      payload: { totalReturn: 0.2, maxDrawdown: 0.15 },
    };

    await writeEventInTransaction(mockClient, event);

    // 必须调用传入的 client.query，而非 getPool()
    expect(mockClient.query).toHaveBeenCalledTimes(1);
  });

  it('应使用正确的 INSERT SQL 与参数', async () => {
    const event: OutboxEvent = {
      aggregateType: 'BacktestSession',
      aggregateId: 'backtest-1700000000000',
      eventType: 'BacktestCompleted',
      payload: { totalReturn: 0.2, maxDrawdown: 0.15 },
    };

    await writeEventInTransaction(mockClient, event);

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO outbox'),
      [
        'BacktestSession',
        'backtest-1700000000000',
        'BacktestCompleted',
        JSON.stringify({ totalReturn: 0.2, maxDrawdown: 0.15 }),
      ],
    );
  });

  it('SQL 应包含 created_at 与 NOW()（保证事件时间由数据库生成）', async () => {
    const event: OutboxEvent = {
      aggregateType: 'audit',
      aggregateId: 'user-123',
      eventType: 'AuditEvent',
      payload: { action: 'login' },
    };

    await writeEventInTransaction(mockClient, event);

    const sqlArg = mockClient.query.mock.calls[0][0] as string;
    expect(sqlArg).toContain('created_at');
    expect(sqlArg).toContain('NOW()');
  });

  it('payload 应被 JSON.stringify 序列化（保证 JSONB 列存储格式）', async () => {
    const payload = { totalReturn: 0.2, maxDrawdown: 0.15, sharpeRatio: 1.5 };
    const event: OutboxEvent = {
      aggregateType: 'BacktestSession',
      aggregateId: 'backtest-1700000000000',
      eventType: 'BacktestCompleted',
      payload,
    };

    await writeEventInTransaction(mockClient, event);

    const paramsArg = mockClient.query.mock.calls[0][1] as unknown[];
    // 第 4 个参数是 payload，应为字符串（JSON.stringify 结果）
    expect(typeof paramsArg[3]).toBe('string');
    expect(paramsArg[3]).toBe(JSON.stringify(payload));
  });

  it('client.query 抛错时应向上传播（让调用方触发 ROLLBACK）', async () => {
    const event: OutboxEvent = {
      aggregateType: 'BacktestSession',
      aggregateId: 'backtest-fail',
      eventType: 'BacktestCompleted',
      payload: { totalReturn: 0.2 },
    };

    const dbError = new Error('connection lost');
    mockClient.query.mockRejectedValueOnce(dbError);

    // 期望异常向上传播，调用方 catch 后执行 ROLLBACK
    await expect(writeEventInTransaction(mockClient, event)).rejects.toThrow('connection lost');
  });

  it('不应调用 client.release（由调用方管理连接生命周期）', async () => {
    const event: OutboxEvent = {
      aggregateType: 'BacktestSession',
      aggregateId: 'backtest-1700000000000',
      eventType: 'BacktestCompleted',
      payload: { totalReturn: 0.2 },
    };

    await writeEventInTransaction(mockClient, event);

    // release 应由调用方在 finally 中调用，writeEventInTransaction 不应触碰
    expect((mockClient as any).release).not.toHaveBeenCalled();
  });
});
