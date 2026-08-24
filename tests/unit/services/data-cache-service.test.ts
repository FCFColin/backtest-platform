import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMetricsMocks } from '../../helpers/mockFactories.js';

const { redisStub, healthMock, markUnhealthy } = vi.hoisted(() => {
  const store = new Map<string, { value: string; expiresAt: number }>();
  const globToRegex = (pattern: string): RegExp =>
    new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  const redisStub = {
    store,
    get: vi.fn(async (key: string) => {
      const e = store.get(key);
      if (!e) return null;
      if (e.expiresAt !== 0 && e.expiresAt <= Date.now()) {
        store.delete(key);
        return null;
      }
      return e.value;
    }),
    set: vi.fn(async (key: string, value: string, ...rest: unknown[]) => {
      let expiresAt = 0;
      const exIdx = rest.indexOf('EX');
      if (exIdx >= 0 && typeof rest[exIdx + 1] === 'number') {
        expiresAt = Date.now() + (rest[exIdx + 1] as number) * 1000;
      }
      store.set(key, { value, expiresAt });
      return 'OK';
    }),
    del: vi.fn(async (...keys: string[]) => {
      let n = 0;
      for (const k of keys) if (store.delete(k)) n++;
      return n;
    }),
    scan: vi.fn(async (_cursor: string, ...args: unknown[]) => {
      const pattern = String(args[1]);
      const re = globToRegex(pattern);
      const matched = [...store.keys()].filter((k) => {
        const e = store.get(k)!;
        return re.test(k) && (e.expiresAt === 0 || e.expiresAt > Date.now());
      });
      return ['0', matched];
    }),
  };

  const healthMock = { getRedisHealth: vi.fn().mockResolvedValue(true) };
  const markUnhealthy = vi.fn();
  return { redisStub, healthMock, markUnhealthy };
});

vi.mock('../../../packages/backend/src/utils/metrics.js', () =>
  createMetricsMocks(['recordCacheHit', 'recordCacheEviction']),
);

vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  appRedis: redisStub,
  getRedisHealth: healthMock.getRedisHealth,
  markRedisUnhealthy: markUnhealthy,
}));

import {
  getCacheKey,
  readCache,
  writeCache,
  invalidateAllCache,
  HISTORY_CACHE_TTL_SEC,
} from '../../../packages/backend/src/infrastructure/dataCache.js';

beforeEach(async () => {
  vi.clearAllMocks();
  redisStub.store.clear();
  redisStub.get.mockClear();
  redisStub.set.mockClear();
  redisStub.del.mockClear();
  redisStub.scan.mockClear();
  healthMock.getRedisHealth.mockResolvedValue(true);
  await invalidateAllCache();
});

describe('getCacheKey', () => {
  it('应带 org 隔离前缀并按默认 orgId=shared 生成', () => {
    const key = getCacheKey('history', { tickers: 'SPY,VTI', start: '2024-01-01' });
    expect(key.startsWith('cache:org:shared:history:')).toBe(true);
  });

  it('应按参数名排序，保证相同参数集生成相同 key', () => {
    const k1 = getCacheKey('test', { b: '2', a: '1' });
    const k2 = getCacheKey('test', { a: '1', b: '2' });
    expect(k1).toBe(k2);
  });

  it('应清理非法字符', () => {
    const key = getCacheKey('test', { bad: '<script>alert(1)</script>' });
    expect(key).not.toContain('<');
    expect(key).not.toContain('>');
  });

  it('列表分隔符与真实 ticker 不应撞 key', () => {
    const listKey = getCacheKey('history', { tickers: 'SPY,AAPL' });
    const singleKey = getCacheKey('history', { tickers: 'SPY_AAPL' });
    expect(listKey).not.toBe(singleKey);
  });
});

describe('readCache', () => {
  it('L1 命中时不访问 Redis', async () => {
    const key = getCacheKey('history', { tickers: 'SPY' });
    await writeCache(key, { price: 100 }, HISTORY_CACHE_TTL_SEC);

    const got = await readCache(key);
    expect(got).toEqual({ price: 100 });
    expect(redisStub.get).not.toHaveBeenCalled();
  });

  it('L1 未命中但 L2 命中应回填 L1 并返回数据', async () => {
    const key = getCacheKey('history', { tickers: 'SPY' });
    redisStub.store.set(key, { value: JSON.stringify({ price: 200 }), expiresAt: 0 });

    const got = await readCache(key);
    expect(got).toEqual({ price: 200 });
    expect(redisStub.get).toHaveBeenCalledWith(key);
    redisStub.get.mockClear();
    const got2 = await readCache(key);
    expect(got2).toEqual({ price: 200 });
    expect(redisStub.get).not.toHaveBeenCalled();
  });

  it('L1 与 L2 均未命中应返回 null', async () => {
    const key = getCacheKey('history', { tickers: 'MISSING' });
    const got = await readCache(key);
    expect(got).toBeNull();
    expect(redisStub.get).toHaveBeenCalledWith(key);
  });

  it('L2 条目过期（Redis EX TTL）时返回 null', async () => {
    const key = getCacheKey('history', { tickers: 'SPY' });
    redisStub.store.set(key, { value: JSON.stringify({ price: 1 }), expiresAt: Date.now() - 1000 });
    const got = await readCache(key);
    expect(got).toBeNull();
  });

  it('Redis 命令抛错时降级返回 null 并标记不可用', async () => {
    redisStub.get.mockRejectedValueOnce(new Error('ECONNRESET'));
    const key = getCacheKey('history', { tickers: 'SPY' });
    const got = await readCache(key);
    expect(got).toBeNull();
    expect(markUnhealthy).toHaveBeenCalled();
  });

  it('Redis 不可用时应降级返回 null 且不抛出', async () => {
    healthMock.getRedisHealth.mockResolvedValue(false);
    const key = getCacheKey('history', { tickers: 'SPY' });
    const got = await readCache(key);
    expect(got).toBeNull();
    expect(redisStub.get).not.toHaveBeenCalled();
  });
});

describe('writeCache', () => {
  it('应同时写入 L1 和 L2（带 EX TTL）', async () => {
    const key = getCacheKey('history', { tickers: 'SPY' });
    await writeCache(key, { price: 100 }, HISTORY_CACHE_TTL_SEC);
    expect(redisStub.set).toHaveBeenCalledWith(
      key,
      JSON.stringify({ price: 100 }),
      'EX',
      HISTORY_CACHE_TTL_SEC,
    );
    redisStub.get.mockClear();
    const got = await readCache(key);
    expect(got).toEqual({ price: 100 });
    expect(redisStub.get).not.toHaveBeenCalled();
  });

  it('大于 1KB 的数据应 gzip 压缩（带 gzip: 前缀）', async () => {
    const key = getCacheKey('history', { tickers: 'SPY' });
    const big = { data: 'x'.repeat(2048) };
    await writeCache(key, big, HISTORY_CACHE_TTL_SEC);
    const stored = redisStub.store.get(key);
    expect(stored).toBeDefined();
    expect(stored!.value.startsWith('gzip:')).toBe(true);
    const got = await readCache(key);
    expect(got).toEqual(big);
  });

  it('Redis 不可用时仅写 L1 不抛出', async () => {
    healthMock.getRedisHealth.mockResolvedValue(false);
    const key = getCacheKey('history', { tickers: 'SPY' });
    await expect(writeCache(key, { price: 1 }, HISTORY_CACHE_TTL_SEC)).resolves.toBeUndefined();
    expect(redisStub.set).not.toHaveBeenCalled();
    redisStub.get.mockClear();
    const got = await readCache(key);
    expect(got).toEqual({ price: 1 });
  });
});

describe('invalidateAllCache', () => {
  it('应清空 L1 并删除所有 cache:org:* key', async () => {
    await writeCache(getCacheKey('history', { tickers: 'SPY' }), { x: 1 }, HISTORY_CACHE_TTL_SEC);
    expect(redisStub.store.size).toBeGreaterThan(0);

    await invalidateAllCache();
    expect(redisStub.store.size).toBe(0);
    redisStub.get.mockClear();
    const got = await readCache(getCacheKey('history', { tickers: 'SPY' }));
    expect(got).toBeNull();
    expect(redisStub.get).toHaveBeenCalled();
  });
});
