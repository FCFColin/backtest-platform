/**
 * backtestResultCache LRU + TTL 单元测试
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  backtestCacheKey,
  setBacktestResultCache,
  getBacktestResultCache,
  clearBacktestResultCache,
} from '../../../packages/backend/src/utils/backtestResultCache.js';
import type { BacktestResult, Portfolio, BacktestParameters } from '../../../shared/types.js';

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
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hit returns stored result and refreshes LRU order', () => {
    const key = backtestCacheKey(portfolios, parameters, TENANT_A);
    setBacktestResultCache(key, stubResult);
    expect(getBacktestResultCache(key)).toBe(stubResult);
  });

  it('miss after TTL expiry', () => {
    const key = backtestCacheKey(portfolios, parameters, TENANT_A);
    setBacktestResultCache(key, stubResult);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(getBacktestResultCache(key)).toBeNull();
  });

  it('stable key for identical request bodies', () => {
    const a = backtestCacheKey(portfolios, parameters, TENANT_A);
    const b = backtestCacheKey(portfolios, parameters, TENANT_A);
    expect(a).toBe(b);
  });

  it('miss returns null for unknown key', () => {
    expect(getBacktestResultCache('nonexistent')).toBeNull();
  });

  it('evicts oldest entries when cache exceeds MAX_ENTRIES', () => {
    const keys = Array.from({ length: 55 }, (_, i) => {
      const p: Portfolio[] = [{ ...portfolios[0], id: `e${i}` }];
      const key = backtestCacheKey(p, parameters, TENANT_A);
      setBacktestResultCache(key, stubResult);
      return key;
    });
    expect(getBacktestResultCache(keys[0])).toBeNull();
    expect(getBacktestResultCache(keys[54])).toBe(stubResult);
  });

  it('different tenantId produces different cache keys (no cross-tenant leak)', () => {
    const keyA = backtestCacheKey(portfolios, parameters, TENANT_A);
    const keyB = backtestCacheKey(portfolios, parameters, TENANT_B);
    expect(keyA).not.toBe(keyB);
  });

  it('cross-tenant cache isolation: same portfolio+parameters, different tenants hit own entries', () => {
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

    setBacktestResultCache(keyA, resultA);
    setBacktestResultCache(keyB, resultB);

    expect(getBacktestResultCache(keyA)).toBe(resultA);
    expect(getBacktestResultCache(keyB)).toBe(resultB);
    expect(getBacktestResultCache(keyA)).not.toBe(resultB);
    expect(getBacktestResultCache(keyB)).not.toBe(resultA);
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
});
