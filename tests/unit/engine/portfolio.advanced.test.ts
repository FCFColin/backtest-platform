/**
 * portfolio 扩展指标与 drag 计算覆盖
 */
import { describe, it, expect } from 'vitest';
import {
  runPortfolioBacktest,
  runAnalysis,
  calculateDrag,
  type PriceData,
} from '../../../api/engine/portfolio.js';
import type { Portfolio } from '../../../shared/types/index.js';
import { makeLinearPriceData, makeParams } from '../../helpers/fixtures.js';

describe('portfolio 扩展覆盖', () => {
  it('calculateDrag 空序列应返回零', () => {
    const result = calculateDrag([], [], 'monthly');
    expect(result.totalDrag).toBe(0);
    expect(result.dragSeries).toEqual([]);
  });

  it('calculateDrag 应累积 drag 并计算年化 drag', () => {
    const values = Array.from({ length: 252 }, (_, i) => 10000 + i * 10);
    const result = calculateDrag(values, [], 'daily', 0.01);
    expect(result.dragSeries).toHaveLength(252);
    expect(result.totalDrag).toBeGreaterThan(0);
    expect(result.annualDrag).toBeGreaterThan(0);
  });

  it('runAnalysis 多标的应返回相关矩阵', () => {
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-12-31', 100, 0.001),
      B: makeLinearPriceData('B', '2020-01-02', '2020-12-31', 100, 0.002),
    };
    const analysis = runAnalysis(['A', 'B'], priceData, makeParams());
    expect(analysis.tickers).toHaveLength(2);
    expect(analysis.correlations).toHaveLength(2);
    expect(analysis.correlations[0][0]).toBe(1);
  });

  it('带 benchmark 的回测应填充 upside/downside capture', () => {
    const stockReturn = Math.pow(1.15, 1 / 252) - 1;
    const benchReturn = Math.pow(1.08, 1 / 252) - 1;
    const priceData: PriceData = {
      STOCK: makeLinearPriceData('STOCK', '2020-01-02', '2020-12-31', 100, stockReturn),
      BENCH: makeLinearPriceData('BENCH', '2020-01-02', '2020-12-31', 100, benchReturn),
    };
    const portfolio: Portfolio = {
      id: 'p1',
      name: 'Capture',
      assets: [{ ticker: 'STOCK', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest(
      [portfolio],
      priceData,
      makeParams({ benchmarkTicker: 'BENCH' }),
    );
    const stats = result.portfolios[0].statistics;
    expect(stats.upsideCapture).toBeDefined();
    expect(stats.downsideCapture).toBeDefined();
    expect(stats.informationRatio).toBeDefined();
    expect(stats.var5).toBeDefined();
    expect(stats.cvar5).toBeDefined();
  });

  it('双组合回测应产生非对角相关性', () => {
    const up = Math.pow(1.1, 1 / 252) - 1;
    const down = Math.pow(0.95, 1 / 252) - 1;
    const priceData: PriceData = {
      UP: makeLinearPriceData('UP', '2020-01-02', '2020-12-31', 100, up),
      DOWN: makeLinearPriceData('DOWN', '2020-01-02', '2020-12-31', 100, down),
    };
    const p1: Portfolio = {
      id: 'p1',
      name: 'Up',
      assets: [{ ticker: 'UP', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const p2: Portfolio = {
      id: 'p2',
      name: 'Down',
      assets: [{ ticker: 'DOWN', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([p1, p2], priceData, makeParams());
    expect(result.correlations[0][1]).not.toBe(1);
    expect(result.correlations[1][0]).toBe(result.correlations[0][1]);
  });

  it('通胀调整回测应产生有效结果', () => {
    const dailyReturn = Math.pow(1.08, 1 / 252) - 1;
    const priceData: PriceData = {
      STOCK: makeLinearPriceData('STOCK', '2020-01-02', '2020-12-31', 100, dailyReturn),
    };
    const cpiData: Record<string, number> = {};
    for (let m = 1; m <= 12; m++) {
      cpiData[`2020-${String(m).padStart(2, '0')}-01`] = 100 + m;
    }
    const portfolio: Portfolio = {
      id: 'p1',
      name: 'CPI',
      assets: [{ ticker: 'STOCK', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest(
      [portfolio],
      priceData,
      makeParams({ adjustForInflation: true, baseCurrency: 'usd' }),
      cpiData,
    );
    expect(result.portfolios[0].growthCurve.length).toBeGreaterThan(0);
  });

  it('runAnalysis 数据不足 ticker 应返回空统计', () => {
    const priceData: PriceData = { SHORT: { '2020-01-02': 100 } };
    const analysis = runAnalysis(['SHORT'], priceData, makeParams());
    expect(analysis.tickers[0].statistics.cagr).toBe(0);
    expect(analysis.tickers[0].growthCurve).toEqual([]);
  });

  it('cashflowLegs 应影响回测现金流', () => {
    const priceData: PriceData = {
      STOCK: makeLinearPriceData('STOCK', '2020-01-02', '2020-12-31', 100, 0.0005),
    };
    const portfolio: Portfolio = {
      id: 'p1',
      name: 'CF',
      assets: [{ ticker: 'STOCK', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const withCf = runPortfolioBacktest(
      [portfolio],
      priceData,
      makeParams({
        cashflowLegs: [
          {
            id: 'cf1',
            amount: 500,
            type: 'contribution',
            frequency: 'monthly',
            offset: 0,
          },
        ],
      }),
    );
    const withoutCf = runPortfolioBacktest([portfolio], priceData, makeParams());
    const finalWith = withCf.portfolios[0].growthCurve.at(-1)!.value;
    const finalWithout = withoutCf.portfolios[0].growthCurve.at(-1)!.value;
    expect(finalWith).not.toBeCloseTo(finalWithout, 0);
  });
});
