import { describe, it, expect } from 'vitest';
import {
  runPortfolioBacktest,
  runAnalysis,
  calculateDrag,
} from '../../../packages/backend/src/engine/backtestRunner.js';

describe('runPortfolioBacktest', () => {
  it('空组合列表返回空结果', () => {
    const result = runPortfolioBacktest([], {}, {} as never);
    expect(result.portfolios).toEqual([]);
    expect(result.correlations).toEqual([]);
  });

  it('带有效组合回测', () => {
    const portfolios = [{ name: 'p1', assets: [{ ticker: 'AAPL', weight: 100 }] }];
    const priceData = {
      AAPL: { '2020-01-02': 100, '2020-01-03': 102, '2020-01-06': 101 },
    };
    const params = {
      startDate: '2020-01-02',
      endDate: '2020-01-06',
      startingValue: 10000,
      rollingWindowMonths: 12,
      adjustForInflation: false,
    };
    const result = runPortfolioBacktest(portfolios as never, priceData, params as never);
    expect(result.portfolios).toHaveLength(1);
    expect(result.portfolios[0].name).toBe('p1');
    expect(result.portfolios[0].growthCurve.length).toBeGreaterThan(0);
  });
});

describe('runAnalysis', () => {
  it('单个 ticker 分析', () => {
    const tickers = ['AAPL'];
    const priceData = {
      AAPL: { '2020-01-02': 100, '2020-01-03': 102, '2020-01-06': 101 },
    };
    const params = {
      startDate: '2020-01-02',
      endDate: '2020-01-06',
      startingValue: 10000,
      rollingWindowMonths: 12,
    };
    const result = runAnalysis(tickers, priceData, params as never);
    expect(result.tickers).toHaveLength(1);
    expect(result.correlations).toHaveLength(1);
    expect(result.correlations[0][0]).toBe(1);
  });

  it('空 tickers 返回空结果', () => {
    const result = runAnalysis([], {}, {} as never);
    expect(result.tickers).toEqual([]);
    expect(result.correlations).toEqual([]);
  });
});

describe('calculateDrag (re-export)', () => {
  it('从 backtestRunner 导出拖拽计算', () => {
    const result = calculateDrag([100, 100], [], 'none');
    expect(result.totalDrag).toBeGreaterThan(0);
    expect(result.dragSeries).toHaveLength(2);
  });
});
