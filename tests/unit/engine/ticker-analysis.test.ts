import { describe, it, expect } from 'vitest';
import { analyzeSingleTicker } from '../../../packages/backend/src/engine/tickerAnalysis.js';

describe('analyzeSingleTicker', () => {
  const defaultParams = {
    startDate: '2020-01-01',
    endDate: '2020-12-31',
    startingValue: 10000,
    rollingWindowMonths: 12,
  };

  it('价格不足 2 个返回空统计', () => {
    const result = analyzeSingleTicker({
      ticker: 'AAPL',
      tIdx: 0,
      prices: [100],
      dailyReturns: [],
      benchmarkReturns: [],
      filteredDates: ['2020-01-01'],
      params: defaultParams as never,
    });
    expect(result.ticker).toBe('AAPL');
    expect(result.statistics.cagr).toBe(0);
  });

  it('正常价格序列返回完整分析', () => {
    const prices = [100, 102, 101, 105, 107];
    const dates = ['2020-01-01', '2020-01-02', '2020-01-03', '2020-01-06', '2020-01-07'];
    const result = analyzeSingleTicker({
      ticker: 'AAPL',
      tIdx: 0,
      prices,
      dailyReturns: [0.02, -0.0098, 0.0396, 0.019],
      benchmarkReturns: [0.01, -0.005, 0.02, 0.015],
      filteredDates: dates,
      params: defaultParams as never,
    });
    expect(result.ticker).toBe('AAPL');
    expect(result.growthCurve).toHaveLength(5);
    expect(result.statistics.cagr).toBeGreaterThan(0);
  });

  it('tIdx=0 时 benchmark beta 为 1', () => {
    const prices = [100, 110];
    const result = analyzeSingleTicker({
      ticker: 'AAPL',
      tIdx: 0,
      prices,
      dailyReturns: [0.1],
      benchmarkReturns: [0.05],
      filteredDates: ['2020-01-01', '2020-01-02'],
      params: defaultParams as never,
    });
    expect(result.statistics.beta).toBe(1);
  });
});
