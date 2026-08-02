/**
 * P0-01 集成测试：dataCache Redis L1+L2 两级缓存。
 *
 * 三个核心场景：
 * 1. 缓存命中（L2 共享命中模拟多实例一致性 + L1 回填）
 * 2. 缓存未命中
 * 3. Redis 宕机降级（健康检查失败 + 命令抛错均不向上传播，返回 null）
 *
 * 说明：项目仅安装 `@testcontainers/postgresql`，未安装 `@testcontainers/redis`。
 * 此处使用 TTL 感知的内存 Redis stub 替代真实 Redis 容器——对上述三个场景而言
 * 行为等价，且无需 Docker、可在 CI 任意环境运行；"Redis 宕机"场景通过健康检查
 * 返回 false + 命令 throw 模拟，比 testcontainers 停容器更可控。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface StoredEntry {
  value: string;
  expiresAt: number; // epoch ms，0 表示无过期
}

/**
 * 所有被 vi.mock 工厂引用的对象必须在 vi.hoisted 内创建，否则 vi.mock 提升后
 * 会因 TDZ 报 "Cannot access 'X' before initialization"。
 */
const { loggerMocks, redisStub, healthMock, markUnhealthy } = vi.hoisted(() => {
  const loggerMocks = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  };

  const store = new Map<string, StoredEntry>();
  const globToRegex = (pattern: string): RegExp =>
    new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  const alive = (e: StoredEntry): boolean => e.expiresAt === 0 || e.expiresAt > Date.now();
  const redisStub = {
    store,
    get: vi.fn(async (key: string) => {
      const e = store.get(key);
      if (!e) return null;
      if (!alive(e)) {
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
      const matched = [...store.keys()].filter((k) => re.test(k) && alive(store.get(k)!));
      return ['0', matched];
    }),
  };

  const healthMock = { getRedisHealth: vi.fn().mockResolvedValue(true) };
  const markUnhealthy = vi.fn();
  return { loggerMocks, redisStub, healthMock, markUnhealthy };
});

vi.mock('../../packages/backend/src/utils/logger.js', () => ({ logger: loggerMocks }));
vi.mock('../../packages/backend/src/utils/metrics.js', () => ({
  recordCacheHit: vi.fn(),
  recordCacheEviction: vi.fn(),
}));
vi.mock('../../packages/backend/src/infrastructure/redisClient.js', () => ({
  appRedis: redisStub,
  getRedisHealth: healthMock.getRedisHealth,
  markRedisUnhealthy: markUnhealthy,
}));

import {
  getCacheKey,
  readCache,
  writeCache,
  setPriceCache,
  invalidateAllCache,
  PRICE_CACHE_TTL_SEC,
  HISTORY_CACHE_TTL_SEC,
} from '../../packages/backend/src/infrastructure/dataCache.js';

beforeEach(() => {
  vi.clearAllMocks();
  redisStub.store.clear();
  redisStub.get.mockClear();
  redisStub.set.mockClear();
  redisStub.del.mockClear();
  redisStub.scan.mockClear();
  healthMock.getRedisHealth.mockResolvedValue(true);
});

describe('P0-01 dataCache Redis L1+L2', () => {
  describe('场景 1：缓存命中', () => {
    it('L1 命中：同进程二次读不访问 Redis', async () => {
      const key = getCacheKey('history', {
        tickers: 'AAPL',
        start: '2024-01-01',
        end: '2024-01-31',
      });
      await writeCache(key, { AAPL: { '2024-01-02': 188 } }, HISTORY_CACHE_TTL_SEC);

      const got = await readCache(key);
      expect(got).toEqual({ AAPL: { '2024-01-02': 188 } });
      expect(redisStub.get).not.toHaveBeenCalled();
    });

    it('L2 命中回填 L1：模拟另一实例写入 Redis，本实例冷 L1 仍可命中（多实例一致性）', async () => {
      const key = getCacheKey('history', {
        tickers: 'MSFT',
        start: '2024-01-01',
        end: '2024-01-31',
      });
      redisStub.store.set(key, {
        value: JSON.stringify({ MSFT: { '2024-01-02': 380 } }),
        expiresAt: 0,
      });

      const got = await readCache(key);
      expect(got).toEqual({ MSFT: { '2024-01-02': 380 } });
      expect(redisStub.get).toHaveBeenCalledWith(key);
      redisStub.get.mockClear();
      const got2 = await readCache(key);
      expect(got2).toEqual({ MSFT: { '2024-01-02': 380 } });
      expect(redisStub.get).not.toHaveBeenCalled();
    });
  });

  describe('场景 2：缓存未命中', () => {
    it('L1 与 L2 均空时返回 null', async () => {
      const key = getCacheKey('history', { tickers: 'NOEXIST' });
      const got = await readCache(key);
      expect(got).toBeNull();
      expect(redisStub.get).toHaveBeenCalledWith(key);
    });

    it('TTL 过期后 L2 返回 null（验证 TTL 策略生效）', async () => {
      const key = getCacheKey('history', { tickers: 'EXPIRED' });
      redisStub.store.set(key, { value: JSON.stringify({ x: 1 }), expiresAt: Date.now() - 1000 });
      const got = await readCache(key);
      expect(got).toBeNull();
    });
  });

  describe('场景 3：Redis 宕机降级', () => {
    it('健康检查失败时 readCache 返回 null 且不抛出', async () => {
      healthMock.getRedisHealth.mockResolvedValue(false);
      const key = getCacheKey('history', { tickers: 'SPY' });
      await expect(readCache(key)).resolves.toBeNull();
      expect(redisStub.get).not.toHaveBeenCalled();
    });

    it('Redis 命令抛错时降级返回 null 并标记不可用', async () => {
      redisStub.get.mockRejectedValueOnce(new Error('ECONNRESET'));
      const key = getCacheKey('history', { tickers: 'SPY' });
      const got = await readCache(key);
      expect(got).toBeNull();
      expect(markUnhealthy).toHaveBeenCalled();
    });

    it('Redis 不可用时 writeCache 仅写 L1 不抛出', async () => {
      healthMock.getRedisHealth.mockResolvedValue(false);
      const key = getCacheKey('history', { tickers: 'SPY' });
      await expect(writeCache(key, { x: 1 }, HISTORY_CACHE_TTL_SEC)).resolves.toBeUndefined();
      expect(redisStub.set).not.toHaveBeenCalled();
      const got = await readCache(key);
      expect(got).toEqual({ x: 1 });
    });
  });

  describe('价格缓存 TTL 与失效', () => {
    it('setPriceCache 写入带 24h TTL', async () => {
      await setPriceCache('SPY', { '2024-01-02': 400 });
      expect(redisStub.set).toHaveBeenCalledWith(
        getCacheKey('price', { ticker: 'SPY' }),
        JSON.stringify({ '2024-01-02': 400 }),
        'EX',
        PRICE_CACHE_TTL_SEC,
      );
    });

    it('invalidateAllCache 清空所有 cache:org:* key', async () => {
      await setPriceCache('SPY', { '2024-01-02': 400 });
      await writeCache(getCacheKey('history', { tickers: 'SPY' }), { x: 1 }, HISTORY_CACHE_TTL_SEC);
      await invalidateAllCache();
      expect(redisStub.store.size).toBe(0);
    });
  });
});
