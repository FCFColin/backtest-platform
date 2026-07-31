import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createRedisModuleMock } from '../../helpers/mockFactories.js';

const redisMocks = vi.hoisted(() => ({}) as Record<string, unknown>);

vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () =>
  createRedisModuleMock(
    {
      methods: {
        ping: vi.fn().mockResolvedValue('PONG'),
        set: vi.fn().mockResolvedValue('OK'),
        get: vi.fn().mockResolvedValue(null),
        scan: vi.fn().mockResolvedValue(['0', []]),
      },
    },
    redisMocks,
  ),
);

import {
  backtestCacheKey,
  setBacktestResultCache,
  getBacktestResultCache,
  getOrCompute,
  clearBacktestResultCache,
} from '../../../packages/backend/src/application/backtest/backtestResultCache.js';
import type { BacktestResult, Portfolio, BacktestParameters } from '@backtest/shared';

const portfolios: Portfolio[] = [
  {
    id: 'p1',
    name: 'Test',
    assets: [{ id: 'a1', ticker: 'VTI', weight: 100 }],
    rebalanceFrequency: 'annual',
    rebalanceOffset: 0,
    drag: 0,
    totalReturn: true,
  },
];

const parameters: BacktestParameters = {
  startDate: '2010-01-01',
  endDate: '2020-01-01',
  startingValue: 10000,
  baseCurrency: 'usd',
  adjustForInflation: false,
  rollingWindowMonths: 12,
  benchmarkTicker: 'SPY',
  extendedWithdrawalStats: false,
  cashflowLegs: [],
  oneTimeCashflows: [],
};

const stubResult: BacktestResult = {
  portfolios: [],
  correlations: [],
};

const TENANT_A = '00000000-0000-4000-8000-000000000001';
const TENANT_B = '00000000-0000-4000-8000-000000000002';

describe('backtestResultCache', () => {
  beforeEach(() => {
    clearBacktestResultCache();
    vi.clearAllMocks();
    redisMocks.ping.mockResolvedValue('PONG');
    redisMocks.get.mockResolvedValue(null);
    redisMocks.set.mockResolvedValue('OK');
    redisMocks.scan.mockResolvedValue(['0', []]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hit returns stored result and refreshes LRU order', async () => {
    const key = backtestCacheKey(portfolios, parameters, TENANT_A);
    await setBacktestResultCache(key, stubResult);
    expect(await getBacktestResultCache(key)).toBe(stubResult);
  });

  it('miss after TTL expiry', async () => {
    vi.useFakeTimers();
    const key = backtestCacheKey(portfolios, parameters, TENANT_A);
    await setBacktestResultCache(key, stubResult);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(await getBacktestResultCache(key)).toBeNull();
  });

  it('stable key for identical request bodies', () => {
    const a = backtestCacheKey(portfolios, parameters, TENANT_A);
    const b = backtestCacheKey(portfolios, parameters, TENANT_A);
    expect(a).toBe(b);
  });

  it('miss returns null for unknown key', async () => {
    expect(await getBacktestResultCache('nonexistent')).toBeNull();
  });

  it('evicts oldest entries when cache exceeds MAX_ENTRIES', async () => {
    const keys: string[] = [];
    for (let i = 0; i < 55; i++) {
      const p: Portfolio[] = [{ ...portfolios[0], id: `e${i}` }];
      const key = backtestCacheKey(p, parameters, TENANT_A);
      await setBacktestResultCache(key, stubResult);
      keys.push(key);
    }
    expect(await getBacktestResultCache(keys[0])).toBeNull();
    expect(await getBacktestResultCache(keys[54])).toBe(stubResult);
  });

  it('different tenantId produces different cache keys (no cross-tenant leak)', () => {
    const keyA = backtestCacheKey(portfolios, parameters, TENANT_A);
    const keyB = backtestCacheKey(portfolios, parameters, TENANT_B);
    expect(keyA).not.toBe(keyB);
  });

  it('cross-tenant cache isolation: same portfolio+parameters, different tenants hit own entries', async () => {
    const resultA: BacktestResult = {
      portfolios: [{ id: 'pa', name: 'A', assets: [] }],
      correlations: [],
    };
    const resultB: BacktestResult = {
      portfolios: [{ id: 'pb', name: 'B', assets: [] }],
      correlations: [],
    };

    const keyA = backtestCacheKey(portfolios, parameters, TENANT_A);
    const keyB = backtestCacheKey(portfolios, parameters, TENANT_B);

    await setBacktestResultCache(keyA, resultA);
    await setBacktestResultCache(keyB, resultB);

    expect(await getBacktestResultCache(keyA)).toBe(resultA);
    expect(await getBacktestResultCache(keyB)).toBe(resultB);
    expect(await getBacktestResultCache(keyA)).not.toBe(resultB);
    expect(await getBacktestResultCache(keyB)).not.toBe(resultA);
  });

  it('undefined tenantId and defined tenantId produce different keys', () => {
    const keyAnon = backtestCacheKey(portfolios, parameters, undefined);
    const keyTenant = backtestCacheKey(portfolios, parameters, TENANT_A);
    expect(keyAnon).not.toBe(keyTenant);
  });

  it('same undefined tenantId produces stable key', () => {
    const a = backtestCacheKey(portfolios, parameters, undefined);
    const b = backtestCacheKey(portfolios, parameters, undefined);
    expect(a).toBe(b);
  });

  it('singleflight: 100 个相同 key 的并发请求只触发 1 次 compute', async () => {
    const key = backtestCacheKey(portfolios, parameters, TENANT_A);
    const sfResult: BacktestResult = {
      portfolios: [{ id: 'sf', name: 'Singleflight', assets: [] }],
      correlations: [],
    };
    const compute = vi.fn(async () => {
      // 模拟引擎计算延迟，确保 100 个请求在此期间重叠并发
      await new Promise((resolve) => setTimeout(resolve, 50));
      return sfResult;
    });

    const promises = Array.from({ length: 100 }, () => getOrCompute(key, compute));
    const results = await Promise.all(promises);

    // 引擎（compute）应只被调用 1 次
    expect(compute).toHaveBeenCalledTimes(1);
    // 100 个请求应全部返回同一结果引用（共享同一个 Promise）
    expect(results).toHaveLength(100);
    for (const r of results) {
      expect(r).toBe(sfResult);
    }
  });

  it('singleflight: compute 异常后清理 inFlight，后续请求可重试', async () => {
    const key = backtestCacheKey(portfolios, parameters, TENANT_A);
    let callCount = 0;
    const compute = vi.fn(async () => {
      callCount++;
      if (callCount === 1) throw new Error('engine down');
      return stubResult;
    });

    // 第一批：compute 抛异常，inFlight 应被 .finally 清理
    await expect(getOrCompute(key, compute)).rejects.toThrow('engine down');
    expect(compute).toHaveBeenCalledTimes(1);

    // 第二批：inFlight 已清理，可重新触发 compute 并成功
    const result = await getOrCompute(key, compute);
    expect(result).toBe(stubResult);
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
