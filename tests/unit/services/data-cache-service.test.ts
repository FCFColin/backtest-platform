import { describe, it, expect, vi, beforeEach } from 'vitest';

const { loggerMocks, redisStub, healthMock } = vi.hoisted(() => {
  const loggerMocks = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  };

  const store = new Map<string, string>();
  const globToRegex = (pattern: string): RegExp =>
    new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  const redisStub = {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
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
      const matched = [...store.keys()].filter((k) => re.test(k));
      return ['0', matched];
    }),
  };

  const healthMock = { getRedisHealth: vi.fn().mockResolvedValue(true) };
  return { loggerMocks, redisStub, healthMock };
});

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: loggerMocks,
}));

vi.mock('../../../packages/backend/src/utils/metrics.js', () => ({
  recordCacheHit: vi.fn(),
  recordCacheEviction: vi.fn(),
}));

vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  appRedis: redisStub,
  getRedisHealth: healthMock.getRedisHealth,
  markRedisUnhealthy: vi.fn(),
}));

import {
  getCacheKey,
  readCache,
  writeCache,
  deletePriceCache,
  setPriceCache,
  invalidateTickerCache,
  invalidateAllCache,
  PRICE_CACHE_TTL_SEC,
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

  it('应支持自定义 orgId 隔离不同租户', () => {
    const k1 = getCacheKey('price', { ticker: 'SPY' }, 'org-a');
    const k2 = getCacheKey('price', { ticker: 'SPY' }, 'org-b');
    expect(k1).not.toBe(k2);
    expect(k1.startsWith('cache:org:org-a:price:')).toBe(true);
    expect(k2.startsWith('cache:org:org-b:price:')).toBe(true);
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
    redisStub.store.set(key, JSON.stringify({ price: 200 }));

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
    expect(stored!.startsWith('gzip:')).toBe(true);
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

describe('price cache', () => {
  it('setPriceCache 写入 L1+L2，deletePriceCache 删除两者', async () => {
    await setPriceCache('SPY', { '2024-01-02': 400 });
    const key = getCacheKey('price', { ticker: 'SPY' });
    expect(redisStub.set).toHaveBeenCalledWith(
      key,
      JSON.stringify({ '2024-01-02': 400 }),
      'EX',
      PRICE_CACHE_TTL_SEC,
    );

    await deletePriceCache('SPY');
    expect(redisStub.store.has(key)).toBe(false);
  });
});

describe('invalidateAllCache', () => {
  it('应清空 L1 并删除所有 cache:org:* key', async () => {
    await setPriceCache('SPY', { '2024-01-02': 400 });
    await writeCache(getCacheKey('history', { tickers: 'SPY' }), { x: 1 }, HISTORY_CACHE_TTL_SEC);
    expect(redisStub.store.size).toBeGreaterThan(0);

    await invalidateAllCache();
    expect(redisStub.store.size).toBe(0);
    redisStub.get.mockClear();
    const got = await readCache(getCacheKey('price', { ticker: 'SPY' }));
    expect(got).toBeNull();
    expect(redisStub.get).toHaveBeenCalled();
  });
});

describe('invalidateTickerCache', () => {
  it('应删除该 ticker 的价格缓存并 best-effort 清理 history key', async () => {
    const priceKey = getCacheKey('price', { ticker: 'SPY' });
    const histKey = getCacheKey('history', { tickers: 'SPY,AAPL' });
    await setPriceCache('SPY', { '2024-01-02': 400 });
    await writeCache(histKey, { SPY: { '2024-01-02': 400 } }, HISTORY_CACHE_TTL_SEC);

    await invalidateTickerCache('SPY');

    expect(redisStub.store.has(priceKey)).toBe(false);
    expect(redisStub.store.has(histKey)).toBe(false);
  });

  it('Redis 不可用时仅清 L1 价格缓存且不抛出', async () => {
    healthMock.getRedisHealth.mockResolvedValue(false);
    await expect(invalidateTickerCache('SPY')).resolves.toBeUndefined();
  });
});
