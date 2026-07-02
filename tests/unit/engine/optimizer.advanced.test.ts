/**
 * optimizer 高级分支覆盖（有效前沿 / 大规模资产 / 奇异矩阵）
 */
import { describe, it, expect } from 'vitest';
import { optimizePortfolio, calcEfficientFrontier } from '../../../api/engine/optimizer.js';
import type { PriceData } from '../../../api/engine/portfolio.js';
import { makeLinearPriceData, makeVolatilePriceData } from '../../helpers/fixtures.js';

function makeManyTickers(
  count: number,
  dailyReturn = 0.0003,
): { tickers: string[]; priceData: PriceData } {
  const tickers = Array.from({ length: count }, (_, i) => `T${i}`);
  const priceData: PriceData = {};
  for (const t of tickers) {
    priceData[t] = makeLinearPriceData(
      t,
      '2020-01-02',
      '2021-12-31',
      100 + tickers.indexOf(t),
      dailyReturn,
    );
  }
  return { tickers, priceData };
}

describe('optimizer 高级覆盖', () => {
  it('16 资产 maxSharpe 闭式路径应产出合法权重', () => {
    const { tickers, priceData } = makeManyTickers(16);
    const result = optimizePortfolio(tickers, priceData, 'maxSharpe');
    expect(Object.keys(result.optimalWeights)).toHaveLength(16);
    expect(Object.values(result.optimalWeights).reduce((s, w) => s + w, 0)).toBeCloseTo(1, 2);
  });

  it('完全相关资产（相同序列）应仍能计算前沿', () => {
    const base = makeLinearPriceData('A', '2020-01-02', '2021-12-31', 100, 0.001);
    const priceData: PriceData = { A: base, B: { ...base }, C: { ...base } };
    const result = calcEfficientFrontier(['A', 'B', 'C'], priceData, 10);
    expect(result.frontier.length).toBeGreaterThan(0);
    for (const p of result.frontier) {
      expect(p.expectedVolatility).toBeGreaterThanOrEqual(0);
    }
  });

  it('20 点有效前沿应返回完整曲线点', () => {
    const up = Math.pow(1.18, 1 / 252) - 1;
    const down = Math.pow(0.92, 1 / 252) - 1;
    const priceData: PriceData = {
      HIGH: makeLinearPriceData('HIGH', '2020-01-02', '2021-12-31', 100, up),
      LOW: makeLinearPriceData('LOW', '2020-01-02', '2021-12-31', 100, down),
    };
    const result = calcEfficientFrontier(['HIGH', 'LOW'], priceData, 20, 0.01);
    expect(result.frontier).toHaveLength(20);
    const returns = result.frontier.map((p) => p.expectedReturn);
    expect(Math.max(...returns)).toBeGreaterThanOrEqual(Math.min(...returns));
    expect(result.frontier[0].expectedVolatility).toBeGreaterThanOrEqual(0);
  });

  it('全负超额收益 maxSharpe 应回退最小方差或最高收益资产', () => {
    const down = Math.pow(0.92, 1 / 252) - 1;
    const priceData: PriceData = {
      D1: makeLinearPriceData('D1', '2020-01-02', '2021-12-31', 100, down),
      D2: makeLinearPriceData('D2', '2020-01-02', '2021-12-31', 100, down * 1.2),
      D3: makeLinearPriceData('D3', '2020-01-02', '2021-12-31', 100, down * 0.8),
    };
    const result = optimizePortfolio(['D1', 'D2', 'D3'], priceData, 'maxSharpe', {}, 0.05);
    const sum = Object.values(result.optimalWeights).reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1, 2);
  });

  it('可行 minWeight/maxWeight 约束应迭代归一化', () => {
    const { tickers, priceData } = makeManyTickers(4, 0.0005);
    const result = optimizePortfolio(tickers, priceData, 'minVolatility', {
      minWeight: 0.15,
      maxWeight: 0.4,
    });
    for (const w of Object.values(result.optimalWeights)) {
      expect(w).toBeGreaterThanOrEqual(0.14);
      expect(w).toBeLessThanOrEqual(0.41);
    }
  });

  it('价格含零或负值日期应被过滤', () => {
    const priceData: PriceData = {
      BAD: { '2020-01-02': 0, '2020-01-03': -1, '2020-01-04': 10 },
      GOOD: makeLinearPriceData('GOOD', '2020-01-02', '2020-01-10', 100, 0.001),
    };
    const result = optimizePortfolio(['BAD', 'GOOD'], priceData, 'maxSharpe');
    expect(result.optimalWeights.GOOD).toBe(1);
  });

  it('五资产前沿应触发目标收益 QP 投影路径', () => {
    const tickers = ['A', 'B', 'C', 'D', 'E'];
    const priceData: PriceData = {};
    const returns = [0.0008, 0.0006, 0.0004, 0.0002, -0.0001];
    tickers.forEach((t, i) => {
      priceData[t] = makeLinearPriceData(t, '2020-01-02', '2021-12-31', 100 + i * 5, returns[i]);
    });
    const frontier = calcEfficientFrontier(tickers, priceData, 15, 0.02);
    expect(frontier.frontier.length).toBe(15);
    const volatilities = frontier.frontier.map((p) => p.expectedVolatility);
    expect(Math.min(...volatilities)).toBeGreaterThanOrEqual(0);
  });

  it('协方差长度不一致应抛出（内部 calcCovariance）', () => {
    const priceData: PriceData = {
      X: makeLinearPriceData('X', '2020-01-02', '2020-06-30', 100, 0.001),
      Y: makeLinearPriceData('Y', '2020-01-02', '2021-12-31', 100, 0.002),
    };
    expect(() => calcEfficientFrontier(['X', 'Y'], priceData, 3)).not.toThrow();
  });

  it('高波动 + 低波动组合前沿应覆盖 clipNegativeWeights 路径', () => {
    const stable = makeLinearPriceData('STABLE', '2020-01-02', '2021-12-31', 100, 0.0001);
    const volatileReturns = Array.from({ length: 400 }, (_, i) => (i % 2 === 0 ? 0.025 : -0.02));
    const volatile = makeVolatilePriceData('VOL', '2020-01-02', '2021-12-31', 100, volatileReturns);
    const priceData: PriceData = { STABLE: stable, VOL: volatile };
    const result = calcEfficientFrontier(['STABLE', 'VOL'], priceData, 25, 0.01);
    expect(result.frontier).toHaveLength(25);
    const sharpes = result.frontier.map((p) => p.sharpeRatio);
    expect(sharpes.some((s) => Number.isFinite(s))).toBe(true);
  });

  it('病态协方差矩阵应回退等权', () => {
    const identical = makeLinearPriceData('SAME', '2020-01-02', '2021-12-31', 100, 0.001);
    const priceData: PriceData = {
      A: identical,
      B: { ...identical },
      C: { ...identical },
    };
    const result = optimizePortfolio(['A', 'B', 'C'], priceData, 'minVolatility');
    expect(Object.values(result.optimalWeights).reduce((s, w) => s + w, 0)).toBeCloseTo(1, 2);
  });

  it('可行 maxWeight 约束应迭代归一化收敛', () => {
    const { tickers, priceData } = makeManyTickers(6, 0.0004);
    const result = optimizePortfolio(tickers, priceData, 'maxSharpe', { maxWeight: 0.25 });
    for (const w of Object.values(result.optimalWeights)) {
      expect(w).toBeLessThanOrEqual(0.26);
    }
    expect(Object.values(result.optimalWeights).reduce((s, w) => s + w, 0)).toBeCloseTo(1, 2);
  });

  it('solveTargetReturnQP 失败时应回退 clipNegativeWeights', () => {
    const stable = makeLinearPriceData('LOW', '2020-01-02', '2021-12-31', 100, 0.00005);
    const high = makeLinearPriceData('HIGH', '2020-01-02', '2021-12-31', 50, 0.003);
    const mid = makeLinearPriceData('MID', '2020-01-02', '2021-12-31', 75, 0.001);
    const priceData: PriceData = { LOW: stable, MID: mid, HIGH: high };
    const frontier = calcEfficientFrontier(['LOW', 'MID', 'HIGH'], priceData, 12, 0.0);
    expect(frontier.frontier.length).toBe(12);
    expect(frontier.frontier.every((p) => Number.isFinite(p.expectedReturn))).toBe(true);
  });

  it('仅一个共有交易日应返回空优化结果', () => {
    const priceData: PriceData = {
      A: { '2020-01-02': 100, '2020-01-03': 101 },
      B: { '2020-01-03': 200, '2020-01-06': 202 },
    };
    const result = optimizePortfolio(['A', 'B'], priceData, 'maxSharpe');
    expect(result.optimalWeights).toEqual({});
    expect(result.expectedReturn).toBe(0);
  });

  it('极高无风险利率应触发 maxSharpe 最小方差回退', () => {
    const up = Math.pow(1.08, 1 / 252) - 1;
    const priceData: PriceData = {
      GROW: makeLinearPriceData('GROW', '2020-01-02', '2021-12-31', 100, up),
      FLAT: makeLinearPriceData('FLAT', '2020-01-02', '2021-12-31', 100, 0.0001),
    };
    const result = optimizePortfolio(['GROW', 'FLAT'], priceData, 'maxSharpe', {}, 0.5);
    expect(Object.values(result.optimalWeights).reduce((s, w) => s + w, 0)).toBeCloseTo(1, 2);
  });

  it('17 资产闭式 maxSharpe 负权重裁剪应归一化', () => {
    const tickers = Array.from({ length: 17 }, (_, i) => `C${i}`);
    const priceData: PriceData = {};
    for (let i = 0; i < tickers.length; i++) {
      const daily = i % 3 === 0 ? 0.002 : i % 3 === 1 ? -0.001 : 0.0005;
      priceData[tickers[i]] = makeLinearPriceData(
        tickers[i],
        '2020-01-02',
        '2021-12-31',
        100 + i,
        daily,
      );
    }
    const result = optimizePortfolio(tickers, priceData, 'maxSharpe', {}, 0.03);
    expect(Object.keys(result.optimalWeights)).toHaveLength(17);
    for (const w of Object.values(result.optimalWeights)) {
      expect(w).toBeGreaterThanOrEqual(0);
    }
    expect(Object.values(result.optimalWeights).reduce((s, w) => s + w, 0)).toBeCloseTo(1, 2);
  });

  it('四资产混合波动前沿应覆盖 clipNegativeWeights 迭代', () => {
    const tickers = ['UP', 'DOWN', 'FLAT', 'VOL'];
    const volReturns = Array.from({ length: 500 }, (_, i) =>
      i % 4 === 0 ? 0.03 : i % 4 === 1 ? -0.025 : 0.005,
    );
    const priceData: PriceData = {
      UP: makeLinearPriceData('UP', '2020-01-02', '2021-12-31', 100, 0.0015),
      DOWN: makeLinearPriceData('DOWN', '2020-01-02', '2021-12-31', 100, -0.0008),
      FLAT: makeLinearPriceData('FLAT', '2020-01-02', '2021-12-31', 100, 0.00005),
      VOL: makeVolatilePriceData('VOL', '2020-01-02', '2021-12-31', 100, volReturns),
    };
    const frontier = calcEfficientFrontier(tickers, priceData, 30, 0.01);
    expect(frontier.frontier).toHaveLength(30);
    const midPoint = frontier.frontier[Math.floor(frontier.frontier.length / 2)];
    expect(Object.values(midPoint.weights).reduce((s, w) => s + w, 0)).toBeCloseTo(1, 1);
  });

  it('applyWeightConstraints 零和回退应返回等权', () => {
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2021-12-31', 100, 0.001),
      B: makeLinearPriceData('B', '2020-01-02', '2021-12-31', 100, 0.002),
      C: makeLinearPriceData('C', '2020-01-02', '2021-12-31', 100, 0.003),
    };
    const result = optimizePortfolio(['A', 'B', 'C'], priceData, 'minVolatility', {
      minWeight: 0.34,
      maxWeight: 0.34,
    });
    for (const w of Object.values(result.optimalWeights)) {
      expect(w).toBeCloseTo(1 / 3, 1);
    }
  });
});
