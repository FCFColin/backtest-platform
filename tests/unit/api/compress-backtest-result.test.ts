/**
 * compressBacktestResultForSync / extractBacktestSeries 单元测试
 */
import { describe, it, expect } from 'vitest';
import {
  compressBacktestResult,
  compressBacktestResultForSync,
  extractBacktestSeries,
  MAX_SYNC_CHART_POINTS,
} from '../../../api/utils/compressBacktestResult.js';
import type { BacktestResult, PortfolioResult } from '../../../shared/types.js';

function makePoint(i: number) {
  return { date: `2020-01-${String((i % 28) + 1).padStart(2, '0')}`, value: 100 + i };
}

function makePortfolio(name: string, n: number): PortfolioResult {
  const curve = Array.from({ length: n }, (_, i) => makePoint(i));
  return {
    name,
    growthCurve: curve,
    drawdownCurve: curve.map((p, i) => ({ date: p.date, value: -(i % 10) })),
    rollingReturns: curve.map((p, i) => ({ date: p.date, return: i * 0.001 })),
    annualReturns: [{ year: 2020, return: 0.1 }],
    monthlyReturns: [{ year: 2020, month: 1, return: 0.01 }],
    statistics: {} as PortfolioResult['statistics'],
    allocationHistory: curve.map((p, i) => ({
      date: p.date,
      weights: [0.6 + i * 0.0001, 0.4 - i * 0.0001],
    })),
    drawdownEpisodes: [
      {
        peakDate: '2020-01-01',
        troughDate: '2020-03-01',
        recoveryDate: '2020-06-01',
        depth: -0.15,
        timeToTrough: 60,
        recoveryTime: 90,
        totalTime: 150,
        recoveryFactor: 1.1,
        cagrDuring: -0.05,
        ulcerDuring: 0.02,
        returnFromPeakToTrough: -0.15,
      },
    ],
  };
}

function makeResult(n: number): BacktestResult {
  return {
    portfolios: [makePortfolio('P1', n)],
    correlations: [],
  };
}

describe('compressBacktestResultForSync', () => {
  it('downsamples curves to MAX_SYNC_CHART_POINTS and omits tab-only fields', () => {
    const full = makeResult(2000);
    const sync = compressBacktestResultForSync(full);
    const p = sync.portfolios[0];

    expect(p.growthCurve.length).toBe(MAX_SYNC_CHART_POINTS);
    expect(p.drawdownCurve.length).toBe(MAX_SYNC_CHART_POINTS);
    expect(p.rollingReturns).toBeUndefined();
    expect(p.allocationHistory).toBeUndefined();
    expect(p.drawdownEpisodes).toBeUndefined();
    expect(p.annualReturns).toEqual(full.portfolios[0].annualReturns);
    expect(p.statistics).toEqual(full.portfolios[0].statistics);
  });

  it('extractBacktestSeries returns requested fields from full result', () => {
    const full = compressBacktestResult(makeResult(2000));
    const slices = extractBacktestSeries(full, ['rollingReturns', 'allocationHistory']);

    expect(slices[0].rollingReturns.length).toBeLessThanOrEqual(800);
    expect(slices[0].allocationHistory?.length).toBeLessThanOrEqual(800);
    expect(slices[0].growthCurve).toBeUndefined();
  });

  it('sync payload is materially smaller than full compress profile', () => {
    const full = makeResult(2000);
    const fullBytes = JSON.stringify(compressBacktestResult(full)).length;
    const syncBytes = JSON.stringify(compressBacktestResultForSync(full)).length;
    expect(syncBytes).toBeLessThan(fullBytes * 0.6);
  });
});

describe('compressBacktestResult - 边界情况', () => {
  it('allocationHistory 缺失时不报错', () => {
    const p = makePortfolio('P1', 1000);
    delete p.allocationHistory;
    const result = compressBacktestResult({ portfolios: [p], correlations: [] });
    expect(result.portfolios[0].allocationHistory).toBeUndefined();
  });

  it('drag 存在时正确降采样', () => {
    const p = makePortfolio('P1', 1000);
    p.drag = {
      dragSeries: Array.from({ length: 1000 }, (_, i) => ({ date: `2020-01-${i + 1}`, value: i })),
      totalDrag: 0.05,
    };
    const result = compressBacktestResult({ portfolios: [p], correlations: [] });
    expect(result.portfolios[0].drag!.dragSeries.length).toBeLessThanOrEqual(800);
    expect(result.portfolios[0].drag!.totalDrag).toBe(0.05);
  });

  it('benchmarkGrowth 超过最大点数时降采样', () => {
    const result = compressBacktestResult({
      portfolios: [makePortfolio('P1', 100)],
      correlations: [],
      benchmarkGrowth: Array.from({ length: 1000 }, (_, i) => ({
        date: `2020-01-${i + 1}`,
        value: 100 + i,
      })),
    });
    expect(result.benchmarkGrowth!.length).toBeLessThanOrEqual(800);
  });
});
