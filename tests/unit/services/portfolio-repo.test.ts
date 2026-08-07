import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createConfigMocks, createPoolModuleMock } from '../../helpers/mockFactories.js';
import { loggerMocks } from '../../helpers/loggerFixture.js';

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
  withTenant: vi.fn(),
}));

vi.mock('../../../packages/backend/src/db/pool.js', () => createPoolModuleMock(dbMocks));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: loggerMocks }));

vi.mock('../../../packages/backend/src/config/env.js', () => ({
  config: createConfigMocks({ REDIS_URL: 'redis://localhost:6379' }),
  requireSecret: vi.fn(),
  parseCorsOrigins: vi.fn(),
  resolveJwtAlgorithm: vi.fn(),
}));

// redisClient 断言依赖模块加载期（import 时）记录的 IORedis 构造调用。
// ADR-045 后 redisClient.ts 统一使用 (options) 单参数形式（buildRedisBaseOptions）。
const ioredisMocks = vi.hoisted(() => {
  const instances: Array<{ options: Record<string, unknown>; on: ReturnType<typeof vi.fn> }> = [];
  return {
    instances,
    IORedis: vi.fn(function (this: unknown, ...args: unknown[]) {
      const opts =
        args.length >= 1 && typeof args[0] === 'object' && args[0] !== null
          ? { ...(args[0] as Record<string, unknown>) }
          : { url: args[0], ...((args[1] as Record<string, unknown>) ?? {}) };
      const instance = { options: opts, on: vi.fn() };
      instances.push(instance);
      return instance;
    }),
  };
});

vi.mock('ioredis', () => ({
  default: ioredisMocks.IORedis,
}));

import {
  getPortfolio,
  listPortfolios,
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
} from '../../../packages/backend/src/repositories/portfolioRepo.js';
import {
  redisConnection,
  appRedis,
} from '../../../packages/backend/src/infrastructure/redisClient.js';

describe('redisConnection（BullMQ 专用）', () => {
  it('应导出实例并使用解析自 REDIS_URL 的 host/port 连接（单实例模式）', () => {
    expect(redisConnection).toBeDefined();
    expect(typeof redisConnection.on).toBe('function');
    expect(ioredisMocks.IORedis).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'localhost',
        port: 6379,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      }),
    );
  });
});
describe('appRedis（应用层通用）', () => {
  const instance = () => ioredisMocks.instances[1];

  it.each([
    ['maxRetriesPerRequest 应为 3（有限重试）', 'maxRetriesPerRequest', 3],
    ['enableReadyCheck 应为 true', 'enableReadyCheck', true],
    ['lazyConnect 应为 true（延迟连接）', 'lazyConnect', true],
  ])('%s', (_n, key, expected) => {
    expect(instance().options[key]).toBe(expected);
  });
  it('retryStrategy 应返回指数退避延迟（上限 5000ms）', () => {
    const retryStrategy = instance().options.retryStrategy as (times: number) => number;
    expect(retryStrategy(1)).toBe(200); // 1 * 200 = 200
    expect(retryStrategy(2)).toBe(400); // 2 * 200 = 400
    expect(retryStrategy(5)).toBe(1000); // 5 * 200 = 1000
    expect(retryStrategy(25)).toBe(5000); // 25 * 200 = 5000，但上限 5000
    expect(retryStrategy(100)).toBe(5000); // 100 * 200 = 20000，但上限 5000
  });

  it.each([
    ['error', 'error'],
    ['connect', 'connect'],
    ['reconnecting', 'reconnecting'],
    ['ready', 'ready'],
    ['end', 'end'],
  ])('应注册 %s 事件回调（健康监测）', (_n, event) => {
    expect(instance().on).toHaveBeenCalledWith(event, expect.any(Function));
  });

  it.each([
    ['error 事件回调应记录 warn 日志', 'error', 'appRedis 连接错误', 'warn'],
    ['connect 事件回调应记录 info 日志', 'connect', 'appRedis 连接成功', 'info'],
    ['reconnecting 事件回调应记录 info 日志', 'reconnecting', 'appRedis 重连中', 'info'],
  ])('%s', (_n, event, message, level) => {
    const call = instance().on.mock.calls.find((c: unknown[]) => c[0] === event);
    const callback = call![1] as (err?: Error) => void;
    callback(event === 'error' ? new Error('ECONNREFUSED') : undefined);
    const fn = loggerMocks[level as 'info' | 'warn'];
    if (event === 'error') {
      expect(fn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.stringContaining('ECONNREFUSED') }),
        expect.stringContaining(message),
      );
    } else {
      expect(fn).toHaveBeenCalledWith(expect.stringContaining(message));
    }
  });
});

describe('redisConnection 与 appRedis 配置隔离', () => {
  it('两个连接应是不同实例且使用不同的 maxRetriesPerRequest 配置', () => {
    expect(redisConnection).not.toBe(appRedis);
    expect(ioredisMocks.instances[0].options.maxRetriesPerRequest).toBeNull();
    expect(ioredisMocks.instances[1].options.maxRetriesPerRequest).toBe(3);
  });
});

// ADR-045：Sentinel 模式连接选项

describe('Redis Sentinel 模式（ADR-045）', () => {
  it('配置 REDIS_SENTINELS 时应使用 Sentinel 连接选项', async () => {
    vi.resetModules();
    const sentinelConfig = createConfigMocks({
      REDIS_SENTINELS: 'sentinel-0:26379,sentinel-1:26379,sentinel-2:26379',
      REDIS_SENTINEL_NAME: 'mymaster',
      REDIS_PASSWORD: 'secret',
    });
    vi.doMock('../../../packages/backend/src/config/env.js', () => ({
      config: sentinelConfig,
      requireSecret: vi.fn(),
      parseCorsOrigins: vi.fn(),
      resolveJwtAlgorithm: vi.fn(),
    }));

    const sentinelInstances: Array<{ options: Record<string, unknown> }> = [];
    vi.doMock('ioredis', () => ({
      default: vi.fn(function (this: unknown, ...args: unknown[]) {
        const opts =
          args.length >= 1 && typeof args[0] === 'object' && args[0] !== null
            ? { ...(args[0] as Record<string, unknown>) }
            : {};
        const instance = { options: opts, on: vi.fn() };
        sentinelInstances.push(instance);
        return instance;
      }),
    }));

    const { buildRedisBaseOptions, isSentinelMode } =
      await import('../../../packages/backend/src/infrastructure/redisClient.js');

    expect(isSentinelMode).toBe(true);
    const opts = buildRedisBaseOptions();
    expect(opts.sentinels).toEqual([
      { host: 'sentinel-0', port: 26379 },
      { host: 'sentinel-1', port: 26379 },
      { host: 'sentinel-2', port: 26379 },
    ]);
    expect(opts.name).toBe('mymaster');
    expect(opts.password).toBe('secret');
    expect(opts.sentinelPassword).toBe('secret');

    expect(sentinelInstances).toHaveLength(2);
    expect(sentinelInstances[0].options.sentinels).toEqual(opts.sentinels);
    expect(sentinelInstances[0].options.name).toBe('mymaster');
    expect(sentinelInstances[1].options.sentinels).toEqual(opts.sentinels);

    vi.doUnmock('../../../packages/backend/src/config/env.js');
    vi.doUnmock('ioredis');
  });
});

const TENANT = '11111111-1111-1111-1111-111111111111';
const PORTFOLIO_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const baseRow = {
  id: PORTFOLIO_ID,
  name: 'Test Portfolio',
  assets: [
    { ticker: 'SPY', weight: 60 },
    { ticker: 'BND', weight: 40 },
  ],
  rebalance_frequency: 'quarterly',
  owner_user_id: 'u1',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-06-01T00:00:00.000Z'),
};

describe('portfolioRepo CRUD', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('getPortfolio', () => {
    it('应返回完整 PortfolioRecord', async () => {
      dbMocks.query.mockResolvedValueOnce({ rows: [baseRow] });
      const r = await getPortfolio(TENANT, PORTFOLIO_ID);
      expect(r).not.toBeNull();
      expect(r!.id).toBe(PORTFOLIO_ID);
      expect(r!.name).toBe('Test Portfolio');
      expect(r!.assets).toHaveLength(2);
      expect(r!.rebalanceFrequency).toBe('quarterly');
      expect(r!.ownerUserId).toBe('u1');
      expect(r!.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(r!.updatedAt).toBe('2026-06-01T00:00:00.000Z');
      expect(dbMocks.withTenant).toHaveBeenCalledWith(TENANT);
    });

    it('不存在应返回 null', async () => {
      dbMocks.query.mockResolvedValueOnce({ rows: [] });
      const r = await getPortfolio(TENANT, PORTFOLIO_ID);
      expect(r).toBeNull();
    });
  });

  describe('deletePortfolio', () => {
    it('删除成功应返回 true，且按 tenant 隔离 DELETE', async () => {
      dbMocks.query.mockResolvedValueOnce({ rowCount: 1 });
      const r = await deletePortfolio(TENANT, PORTFOLIO_ID);
      expect(r).toBe(true);
      expect(dbMocks.withTenant).toHaveBeenCalledWith(TENANT);
      expect(dbMocks.query).toHaveBeenCalledWith('DELETE FROM portfolios WHERE id = $1', [
        PORTFOLIO_ID,
      ]);
    });

    it.each([0, undefined] as const)('rowCount=%s 应返回 false', async (rowCount) => {
      dbMocks.query.mockResolvedValueOnce({ rowCount });
      await expect(deletePortfolio(TENANT, PORTFOLIO_ID)).resolves.toBe(false);
    });
  });

  describe('listPortfolios — LIMIT 与分页', () => {
    async function callList(limit?: number, offset?: number): Promise<unknown[]> {
      dbMocks.query.mockResolvedValueOnce({ rows: [] });
      await listPortfolios(TENANT, limit, offset);
      return dbMocks.query.mock.calls[0][1] as unknown[];
    }

    it.each<[string, number | undefined, number | undefined, unknown[]]>([
      ['默认 limit 50 / offset 0', undefined, undefined, [50, 0]],
      ['limit 上限钳制 200', 9999, undefined, [200, 0]],
      ['自定义 limit/offset', 25, 100, [25, 100]],
      ['负 offset 钳制为 0', 50, -5, [50, 0]],
      ['limit 为 0 传 0', 0, undefined, [0, 0]],
    ])('%s', async (_n, limit, offset, expected) => {
      expect(await callList(limit, offset)).toEqual(expected);
    });

    it('空数据库应返回空数组', async () => {
      dbMocks.query.mockResolvedValueOnce({ rows: [] });
      const r = await listPortfolios(TENANT);
      expect(r).toEqual([]);
    });

    it('应返回映射后的 PortfolioRecord 数组', async () => {
      dbMocks.query.mockResolvedValueOnce({
        rows: [baseRow, { ...baseRow, id: 'bbbb', name: 'Portfolio 2' }],
      });
      const r = await listPortfolios(TENANT);
      expect(r).toHaveLength(2);
      expect(r[0].name).toBe('Test Portfolio');
      expect(r[1].name).toBe('Portfolio 2');
    });
  });

  describe('createPortfolio', () => {
    it.each([
      ['默认 rebalanceFrequency 为 none', 'none', {}],
      ['指定 rebalanceFrequency 为 monthly', 'monthly', { rebalanceFrequency: 'monthly' }],
    ] as const)('%s', async (_n, expected, extra) => {
      dbMocks.query.mockResolvedValueOnce({ rows: [baseRow] });
      await createPortfolio(TENANT, 'u1', {
        name: 'Test',
        assets: [{ ticker: 'SPY', weight: 100 }],
        ...extra,
      });
      const insertParams = dbMocks.query.mock.calls[0][1];
      expect(insertParams[4]).toBe(expected);
    });

    it('空 ownerUserId 应返回 null ownerUserId 字段', async () => {
      dbMocks.query.mockResolvedValueOnce({ rows: [{ ...baseRow, owner_user_id: null }] });
      const r = await createPortfolio(TENANT, null, {
        name: 'Test',
        assets: [
          { ticker: 'SPY', weight: 60 },
          { ticker: 'BND', weight: 40 },
        ],
      });
      expect(r.ownerUserId).toBeNull();
    });

    it('应序列化 assets 为 JSONB 参数并按 tenant 隔离', async () => {
      dbMocks.query.mockResolvedValueOnce({ rows: [baseRow] });
      await createPortfolio(TENANT, null, { name: 'X', assets: [{ ticker: 'QQQ', weight: 100 }] });
      const params = dbMocks.query.mock.calls[0][1];
      expect(params[0]).toBe(TENANT);
      expect(params[3]).toBe(JSON.stringify([{ ticker: 'QQQ', weight: 100 }]));
      expect(params[4]).toBe('none');
    });
  });

  describe('updatePortfolio', () => {
    it('应更新并返回新记录', async () => {
      dbMocks.query.mockResolvedValueOnce({
        rows: [{ ...baseRow, name: 'Updated', rebalance_frequency: 'annually' }],
      });
      const r = await updatePortfolio(TENANT, PORTFOLIO_ID, {
        name: 'Updated',
        assets: [{ ticker: 'VTI', weight: 100 }],
        rebalanceFrequency: 'annually',
      });
      expect(r).not.toBeNull();
      expect(r!.name).toBe('Updated');
      expect(r!.rebalanceFrequency).toBe('annually');
    });

    it('不存在应返回 null', async () => {
      dbMocks.query.mockResolvedValueOnce({ rows: [] });
      const r = await updatePortfolio(TENANT, PORTFOLIO_ID, {
        name: 'X',
        assets: [{ ticker: 'A', weight: 100 }],
      });
      expect(r).toBeNull();
    });
  });
});
