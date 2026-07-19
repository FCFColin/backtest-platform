/**
 * 用量计量服务单元测试（ADR-037）
 *
 * 企业理由：用量是配额判定与计费对账的数据源，必须验证：
 * 1. recordUsage 双写明细 + 月度聚合（withTenant），并递增 Redis 快路径
 * 2. getMonthlyUsage 优先 Redis，缺失时回退 DB 并回填
 *
 * Mock 策略：mock db.withTenant（注入 fake client）、appRedis、planLimits.currentPeriod。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger } from '../../helpers/mockFactories.js';

const dbMocks = vi.hoisted(() => ({
  withTenant: vi.fn(),
  client: { query: vi.fn() },
}));
const redisMocks = vi.hoisted(() => ({
  incrby: vi.fn(),
  expire: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
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

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  withTenant: (tenantId: string, fn: (c: unknown) => Promise<unknown>) =>
    dbMocks.withTenant(tenantId, fn),
}));
vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  appRedis: redisMocks,
}));
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

import {
  recordUsage,
  getMonthlyUsage,
} from '../../../packages/backend/src/services/usageService.js';

const ORG = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.withTenant.mockImplementation(async (_t: string, fn: (c: unknown) => Promise<unknown>) =>
    fn(dbMocks.client),
  );
  dbMocks.client.query.mockResolvedValue({ rows: [] });
});

describe('recordUsage', () => {
  it('双写明细 + 聚合并递增 Redis', async () => {
    redisMocks.incrby.mockResolvedValueOnce(1);
    await recordUsage(ORG, 'backtest', 1, { path: '/x' });

    const sqls = dbMocks.client.query.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes('INSERT INTO usage_events'))).toBe(true);
    expect(sqls.some((s) => s.includes('INSERT INTO usage_counters'))).toBe(true);
    expect(redisMocks.incrby).toHaveBeenCalledWith(expect.stringContaining(`usage:${ORG}:`), 1);
    // 首次计数应设置 TTL
    expect(redisMocks.expire).toHaveBeenCalled();
  });

  it('DB 失败不抛出（容错）', async () => {
    dbMocks.withTenant.mockRejectedValueOnce(new Error('db down'));
    redisMocks.incrby.mockResolvedValueOnce(5);
    await expect(recordUsage(ORG, 'backtest')).resolves.toBeUndefined();
  });

  it('Redis incrby 失败应记录警告不抛出', async () => {
    redisMocks.incrby.mockRejectedValueOnce(new Error('redis down'));
    await expect(recordUsage(ORG, 'backtest')).resolves.toBeUndefined();
  });
});

describe('getMonthlyUsage', () => {
  it('Redis 命中时直接返回', async () => {
    redisMocks.get.mockResolvedValueOnce('42');
    expect(await getMonthlyUsage(ORG, 'backtest')).toBe(42);
    expect(dbMocks.withTenant).not.toHaveBeenCalled();
  });

  it('Redis 未命中回退 DB 并回填', async () => {
    redisMocks.get.mockResolvedValueOnce(null);
    dbMocks.client.query.mockResolvedValueOnce({ rows: [{ count: 7 }] });
    expect(await getMonthlyUsage(ORG, 'backtest')).toBe(7);
    expect(redisMocks.set).toHaveBeenCalled();
  });

  it('DB 无记录返回 0', async () => {
    redisMocks.get.mockResolvedValueOnce(null);
    dbMocks.client.query.mockResolvedValueOnce({ rows: [] });
    expect(await getMonthlyUsage(ORG, 'backtest')).toBe(0);
  });

  it('Redis get 异常应回退 DB', async () => {
    redisMocks.get.mockRejectedValueOnce(new Error('redis get down'));
    dbMocks.client.query.mockResolvedValueOnce({ rows: [{ count: 3 }] });
    expect(await getMonthlyUsage(ORG, 'backtest')).toBe(3);
  });

  it('回填 Redis 失败应忽略', async () => {
    redisMocks.get.mockResolvedValueOnce(null);
    dbMocks.client.query.mockResolvedValueOnce({ rows: [{ count: 7 }] });
    redisMocks.set.mockRejectedValueOnce(new Error('set failed'));
    expect(await getMonthlyUsage(ORG, 'backtest')).toBe(7);
  });

  it('DB 查询失败应返回 0 并记录错误', async () => {
    redisMocks.get.mockResolvedValueOnce(null);
    dbMocks.client.query.mockRejectedValueOnce(new Error('db error'));
    expect(await getMonthlyUsage(ORG, 'backtest')).toBe(0);
  });

  it('Redis 缓存值为非数字应回退 DB', async () => {
    redisMocks.get.mockResolvedValueOnce('NaN');
    dbMocks.client.query.mockResolvedValueOnce({ rows: [{ count: 5 }] });
    expect(await getMonthlyUsage(ORG, 'backtest')).toBe(5);
  });
});
