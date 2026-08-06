import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  compressBacktestResult,
  compressBacktestResultForSync,
  backtestCacheKey,
  MAX_SYNC_CHART_POINTS,
} from '../../packages/backend/src/application/backtest/backtestResultUtils.js';
import { getCacheKey } from '../../packages/backend/src/infrastructure/dataCache.js';
import type { PortfolioResult } from '@backtest/shared';
import { check } from './pbtHelpers.js';

function makePortfolio(n: number): PortfolioResult {
  const curve = Array.from({ length: n }, (_, i) => ({
    date: `2020-${String(i).padStart(2, '0')}-01`,
    value: 100 + i,
  }));
  return {
    name: 'P',
    growthCurve: curve,
    drawdownCurve: curve.map((p) => ({ date: p.date, value: -p.value })),
    rollingReturns: curve.map((p) => ({ date: p.date, return: 0.01 })),
    annualReturns: [],
    monthlyReturns: [],
    statistics: {} as PortfolioResult['statistics'],
    allocationHistory: curve.map((p) => ({ date: p.date, weights: [0.5, 0.5] })),
    drawdownEpisodes: [],
  };
}

function makeResult(n: number) {
  return { portfolios: [makePortfolio(n)], correlations: [] };
}

describe('PBT: compressBacktestResult 降采样不变量', () => {
  it('压缩后 growthCurve 长度不超过 maxPoints', () => {
    check([fc.integer({ min: 1, max: 2000 }), fc.integer({ min: 10, max: 800 })], (n, max) => {
      const result = compressBacktestResult(makeResult(n), max);
      expect(result.portfolios[0].growthCurve.length).toBeLessThanOrEqual(max);
    });
  });

  it('原始长度 <= maxPoints 时不压缩（保持原样）', () => {
    check([fc.integer({ min: 1, max: 100 })], (n) => {
      const result = compressBacktestResult(makeResult(n), 200);
      expect(result.portfolios[0].growthCurve.length).toBe(n);
    });
  });

  it('压缩后首尾数据点与原始一致', () => {
    check([fc.integer({ min: 101, max: 2000 })], (n) => {
      const original = makePortfolio(n);
      const result = compressBacktestResult(makeResult(n), 100);
      const compressed = result.portfolios[0];
      expect(compressed.growthCurve[0]).toEqual(original.growthCurve[0]);
      expect(compressed.growthCurve[compressed.growthCurve.length - 1]).toEqual(
        original.growthCurve[n - 1],
      );
    });
  });

  it('压缩后所有曲线长度一致', () => {
    check([fc.integer({ min: 101, max: 1000 })], (n) => {
      const result = compressBacktestResult(makeResult(n), 100);
      const p = result.portfolios[0];
      expect(p.growthCurve.length).toBe(p.drawdownCurve?.length);
      expect(p.growthCurve.length).toBe(p.rollingReturns?.length);
      expect(p.growthCurve.length).toBe(p.allocationHistory?.length);
    });
  });

  it('benchmarkGrowth 也应被压缩', () => {
    check([fc.integer({ min: 101, max: 1000 })], (n) => {
      const bench = Array.from({ length: n }, (_, i) => 100 + i);
      const result = compressBacktestResult({ ...makeResult(10), benchmarkGrowth: bench }, 50);
      expect(result.benchmarkGrowth!.length).toBeLessThanOrEqual(50);
    });
  });

  it('compressBacktestResultForSync 应省略 sync 字段且不超过 MAX_SYNC_CHART_POINTS', () => {
    check([fc.integer({ min: 1, max: 1000 })], (n) => {
      const result = compressBacktestResultForSync(makeResult(n));
      const p = result.portfolios[0];
      expect(p.growthCurve.length).toBeLessThanOrEqual(MAX_SYNC_CHART_POINTS);
      expect(p.allocationHistory).toBeUndefined();
      expect(p.drawdownEpisodes).toBeUndefined();
      expect(p.rollingReturns).toBeUndefined();
    });
  });
});

describe('PBT: backtestCacheKey 确定性与唯一性', () => {
  const portfolioArb = fc.record({
    id: fc.option(fc.string()),
    name: fc.option(fc.string()),
    assets: fc.array(fc.record({ ticker: fc.string({ minLength: 1 }), weight: fc.float() })),
    rebalanceFrequency: fc.string(),
  });

  const paramsArb = fc.record({
    startDate: fc.string(),
    endDate: fc.string(),
    startingValue: fc.option(fc.float()),
  });

  const keyArbs = [
    fc.array(portfolioArb, { minLength: 1 }),
    paramsArb,
    fc.option(fc.string()),
  ] as const;

  it('相同输入应产生相同 key', () => {
    check(keyArbs, (portfolios, params, tenantId) => {
      const k1 = backtestCacheKey(portfolios, params, tenantId);
      const k2 = backtestCacheKey(portfolios, params, tenantId);
      expect(k1).toBe(k2);
    });
  });

  it('不同 tenantId 应产生不同 key', () => {
    check(
      [
        fc.array(portfolioArb, { minLength: 1 }),
        paramsArb,
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
      ],
      (portfolios, params, t1, t2) => {
        fc.pre(t1 !== t2);
        const k1 = backtestCacheKey(portfolios, params, t1);
        const k2 = backtestCacheKey(portfolios, params, t2);
        expect(k1).not.toBe(k2);
      },
    );
  });

  it('key 应为 64 字符 hex（SHA-256）', () => {
    check(keyArbs, (portfolios, params, tenantId) => {
      const key = backtestCacheKey(portfolios, params, tenantId);
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});

describe('PBT: getCacheKey 参数顺序无关性', () => {
  const strArb = fc.string({ minLength: 1 }).filter((s) => !s.includes('&') && !s.includes('='));

  it('参数顺序不同时应产生相同 key', () => {
    check([strArb, strArb, strArb], (a, b, c) => {
      const k1 = getCacheKey('history', { tickers: a, start: b, end: c });
      const k2 = getCacheKey('history', { start: b, end: c, tickers: a });
      expect(k1).toBe(k2);
    });
  });

  it('不同 type 应产生不同 key', () => {
    check([fc.string({ minLength: 1 })], (ticker) => {
      const k1 = getCacheKey('history', { ticker });
      const k2 = getCacheKey('price', { ticker });
      expect(k1).not.toBe(k2);
    });
  });

  it('不同 orgId 应产生不同 key', () => {
    check(
      [fc.stringMatching(/[a-zA-Z0-9]{1,30}/), fc.stringMatching(/[a-zA-Z0-9]{1,30}/)],
      (org1, org2) => {
        fc.pre(org1 !== org2);
        const k1 = getCacheKey('price', { ticker: 'AAPL' }, org1);
        const k2 = getCacheKey('price', { ticker: 'AAPL' }, org2);
        expect(k1).not.toBe(k2);
      },
    );
  });
});
