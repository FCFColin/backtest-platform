
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('pg', () => ({ default: { Pool: vi.fn() } }));
vi.mock('prom-client', () => ({ default: { Gauge: vi.fn(() => ({ set: vi.fn() })) } }));
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })) },
}));
vi.mock('../../../packages/backend/src/utils/metrics.js', () => ({ getPrometheusRegister: () => ({ registerMetric: vi.fn() }) }));
vi.mock('../../../packages/backend/src/domain/events/events.js', () => ({ eventDispatcher: { dispatch: vi.fn() } }));
vi.mock('../../../packages/backend/src/config/index.js', () => ({ config: { CDC_KAFKA_ENABLED: false } }));
vi.mock('../../../packages/backend/src/infrastructure/outboxKafkaConsumer.js', () => ({ OutboxKafkaConsumer: vi.fn() }));

import { OutboxPublisher } from '../../../packages/backend/src/infrastructure/outboxPublisher.js';
import type pg from 'pg';

describe('H-005: outboxPublisher SQL 参数化', () => {
  let publisher: OutboxPublisher;
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const mockPool = { query: mockQuery, options: { connectionString: 'postgresql://test:test@localhost:5432/test' } } as unknown as pg.Pool;
    publisher = new OutboxPublisher(mockPool);
  });

  it('cleanupProcessedOutboxEvents 应使用参数化查询（第二个参数为 [OUTBOX_RETENTION_DAYS]）', async () => {
    await publisher.cleanupProcessedOutboxEvents();
    expect(mockQuery).toHaveBeenCalled();
    const callArgs = mockQuery.mock.calls[0];
    expect(callArgs).toHaveLength(2);
    expect(Array.isArray(callArgs[1])).toBe(true);
    expect(callArgs[1]).toHaveLength(1);
    expect(callArgs[1][0]).toBe(7);
  });

  it('SQL 字符串中不包含 ${...} 模板插值（H-005 核心安全断言）', async () => {
    await publisher.cleanupProcessedOutboxEvents();
    const sqlString = mockQuery.mock.calls[0][0] as string;
    expect(sqlString).not.toContain('${');
  });

  it('SQL 字符串应包含 $1 参数占位符', async () => {
    await publisher.cleanupProcessedOutboxEvents();
    const sqlString = mockQuery.mock.calls[0][0] as string;
    expect(sqlString).toContain('$1');
    expect(sqlString).toContain("INTERVAL '1 day' * $1");
  });

  it('OUTBOX_RETENTION_DAYS 环境变量可配置且通过参数传递', async () => {
    const originalValue = process.env.OUTBOX_RETENTION_DAYS;
    process.env.OUTBOX_RETENTION_DAYS = '30';
    vi.resetModules();
    const { OutboxPublisher: FreshPublisher } = await import('../../../packages/backend/src/infrastructure/outboxPublisher.js');
    const freshPublisher = new FreshPublisher({ query: mockQuery, options: { connectionString: 'test' } } as unknown as pg.Pool);
    await freshPublisher.cleanupProcessedOutboxEvents();
    const callArgs = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
    expect(callArgs[1][0]).toBe(30);
    process.env.OUTBOX_RETENTION_DAYS = originalValue;
  });
});
