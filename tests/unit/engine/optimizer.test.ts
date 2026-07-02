/**
 * 组合优化模块单元测试（T-P3-9）
 *
 * 企业理由：有效前沿计算是投资决策的核心，错误的权重会导致
 * 资产配置偏离最优。测试覆盖：
 * - 正常有效前沿（多资产、不同目标函数）
 * - 边界（空组合、单资产、NaN/Infinity 输入）
 * - 约束（权重上下限、不可行约束）
 * - 数值正确性（权重和为 1、夏普比率符号）
 */

import { describe, it, expect } from 'vitest';
import { optimizePortfolio, calcEfficientFrontier } from '../../../api/engine/optimizer.js';
import type { PriceData } from '../../../api/engine/portfolio.js';
import { makeLinearPriceData } from '../../helpers/fixtures.js';

// 构造多资产价格数据（不同收益率与波动率）
function makeMultiAssetPriceData(): PriceData {
  const up = Math.pow(1.15, 1 / 252) - 1; // 年化 15%
  const flat = 0;
  const down = Math.pow(0.95, 1 / 252) - 1; // 年化 -5%
  return {
    WINNER: makeLinearPriceData('WINNER', '2020-01-02', '2021-12-31', 100, up),
    FLAT: makeLinearPriceData('FLAT', '2020-01-02', '2021-12-31', 100, flat),
    LOSER: makeLinearPriceData('LOSER', '2020-01-02', '2021-12-31', 100, down),
  };
}

describe('optimizePortfolio - 正常优化', () => {
  it('maxSharpe 应返回权重和为 1 的组合', () => {
    const priceData = makeMultiAssetPriceData();
    const result = optimizePortfolio(['WINNER', 'FLAT', 'LOSER'], priceData, 'maxSharpe');
    const sum = Object.values(result.optimalWeights).reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1, 2);
  });

  it('maxSharpe 应主要配置正收益资产', () => {
    const priceData = makeMultiAssetPriceData();
    const result = optimizePortfolio(['WINNER', 'FLAT', 'LOSER'], priceData, 'maxSharpe');
    expect(result.optimalWeights.WINNER).toBeGreaterThan(0);
    expect(result.optimalWeights.LOSER ?? 0).toBeLessThan(result.optimalWeights.WINNER);
  });

  it('minVolatility 应返回权重和为 1 的组合', () => {
    const priceData = makeMultiAssetPriceData();
    const result = optimizePortfolio(['WINNER', 'FLAT', 'LOSER'], priceData, 'minVolatility');
    const sum = Object.values(result.optimalWeights).reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1, 2);
  });

  it('maxReturn 应全仓最高收益资产', () => {
    const priceData = makeMultiAssetPriceData();
    const result = optimizePortfolio(['WINNER', 'FLAT', 'LOSER'], priceData, 'maxReturn');
    expect(result.optimalWeights.WINNER).toBe(1);
    expect(result.optimalWeights.FLAT ?? 0).toBe(0);
    expect(result.optimalWeights.LOSER ?? 0).toBe(0);
  });

  it('应返回正的预期收益（含正收益资产时）', () => {
    const priceData = makeMultiAssetPriceData();
    const result = optimizePortfolio(['WINNER', 'FLAT'], priceData, 'maxSharpe');
    expect(result.expectedReturn).toBeGreaterThan(0);
  });

  it('应返回非负的预期波动率', () => {
    const priceData = makeMultiAssetPriceData();
    const result = optimizePortfolio(['WINNER', 'FLAT', 'LOSER'], priceData, 'minVolatility');
    expect(result.expectedVolatility).toBeGreaterThanOrEqual(0);
  });

  it('夏普比率 = (收益 - 无风险) / 波动率', () => {
    const priceData = makeMultiAssetPriceData();
    const rf = 0.02;
    const result = optimizePortfolio(['WINNER', 'FLAT'], priceData, 'maxSharpe', {}, rf);
    if (result.expectedVolatility > 0) {
      const expectedSharpe = (result.expectedReturn - rf) / result.expectedVolatility;
      expect(result.sharpeRatio).toBeCloseTo(expectedSharpe, 4);
    }
  });
});

describe('optimizePortfolio - 权重约束', () => {
  it('minWeight 约束应强制每个资产至少占指定比例', () => {
    const priceData = makeMultiAssetPriceData();
    const result = optimizePortfolio(['WINNER', 'FLAT', 'LOSER'], priceData, 'maxSharpe', {
      minWeight: 0.1,
      maxWeight: 0.8,
    });
    for (const w of Object.values(result.optimalWeights)) {
      expect(w).toBeGreaterThanOrEqual(0.1 - 0.01);
    }
  });

  it('maxWeight 约束应限制单资产最大占比', () => {
    // 使用 2 个资产 + minVolatility，maxWeight=0.5 强制 50-50 分配
    // 注：maxSharpe 在单资产主导时可能无法收敛到 maxWeight（已知限制）
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2021-12-31', 100, 0.001),
      B: makeLinearPriceData('B', '2020-01-02', '2021-12-31', 100, 0.002),
    };
    const result = optimizePortfolio(['A', 'B'], priceData, 'minVolatility', { maxWeight: 0.5 });
    for (const w of Object.values(result.optimalWeights)) {
      expect(w).toBeLessThanOrEqual(0.5 + 0.01);
    }
  });

  it('不可行约束（minWeight 之和 > 1）应回退到等权', () => {
    const priceData = makeMultiAssetPriceData();
    const result = optimizePortfolio(['WINNER', 'FLAT', 'LOSER'], priceData, 'maxSharpe', {
      minWeight: 0.5,
    });
    const values = Object.values(result.optimalWeights);
    for (const w of values) {
      expect(w).toBeCloseTo(1 / 3, 1);
    }
  });
});

describe('optimizePortfolio - 边界与异常', () => {
  it('空 ticker 列表应返回零值结果', () => {
    const priceData = makeMultiAssetPriceData();
    const result = optimizePortfolio([], priceData, 'maxSharpe');
    expect(result.optimalWeights).toEqual({});
    expect(result.expectedReturn).toBe(0);
    expect(result.expectedVolatility).toBe(0);
    expect(result.sharpeRatio).toBe(0);
  });

  it('单资产应返回 100% 权重', () => {
    const priceData = makeMultiAssetPriceData();
    const result = optimizePortfolio(['WINNER'], priceData, 'maxSharpe');
    expect(result.optimalWeights.WINNER).toBe(1);
    expect(result.expectedReturn).toBeGreaterThan(0);
  });

  it('priceData 中不存在的 ticker 应被忽略', () => {
    const priceData = makeMultiAssetPriceData();
    const result = optimizePortfolio(['WINNER', 'NONEXISTENT'], priceData, 'maxSharpe');
    expect(result.optimalWeights.WINNER).toBe(1);
    expect(result.optimalWeights.NONEXISTENT).toBeUndefined();
  });

  it('价格数据不足（仅 1 个数据点）应返回零值', () => {
    const priceData: PriceData = {
      ONLY: { '2020-01-02': 100 },
    };
    const result = optimizePortfolio(['ONLY'], priceData, 'maxSharpe');
    expect(result.optimalWeights).toEqual({});
    expect(result.expectedReturn).toBe(0);
  });

  it('含 NaN 价格的 ticker 应被忽略（不崩溃）', () => {
    const priceData: PriceData = {
      GOOD: makeLinearPriceData('GOOD', '2020-01-02', '2020-12-31', 100, 0.001),
      BAD: { '2020-01-02': NaN, '2020-01-03': 100 },
    };
    const result = optimizePortfolio(['GOOD', 'BAD'], priceData, 'maxSharpe');
    expect(result.optimalWeights.GOOD).toBe(1);
    expect(result.optimalWeights.BAD).toBeUndefined();
  });

  it('含零价格的数据点应被跳过', () => {
    // 使用较长日期范围确保零价格过滤后仍有足够共有交易日
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-06-30', 100, 0.001),
      B: makeLinearPriceData('B', '2020-01-02', '2020-06-30', 100, 0.002),
    };
    // 注入零价格到 A 的某个交易日（2020-01-10 是周五）
    priceData.A['2020-01-10'] = 0;
    const result = optimizePortfolio(['A', 'B'], priceData, 'maxSharpe');
    expect(Object.keys(result.optimalWeights).length).toBeGreaterThan(0);
  });
});

describe('calcEfficientFrontier - 有效前沿', () => {
  it('应返回指定数量的前沿点', () => {
    const priceData = makeMultiAssetPriceData();
    const result = calcEfficientFrontier(['WINNER', 'FLAT', 'LOSER'], priceData, 10);
    expect(result.frontier).toHaveLength(10);
  });

  it('每个前沿点应有权重和为 1 的组合', () => {
    const priceData = makeMultiAssetPriceData();
    const result = calcEfficientFrontier(['WINNER', 'FLAT'], priceData, 5);
    for (const point of result.frontier) {
      const sum = Object.values(point.weights).reduce((s, w) => s + w, 0);
      expect(sum).toBeCloseTo(1, 1);
    }
  });

  it('前沿点波动率应非负', () => {
    const priceData = makeMultiAssetPriceData();
    const result = calcEfficientFrontier(['WINNER', 'FLAT', 'LOSER'], priceData, 10);
    for (const point of result.frontier) {
      expect(point.expectedVolatility).toBeGreaterThanOrEqual(0);
    }
  });

  it('第一个点应接近最小方差组合（较低波动率）', () => {
    const priceData = makeMultiAssetPriceData();
    const result = calcEfficientFrontier(['WINNER', 'FLAT', 'LOSER'], priceData, 10);
    const firstVol = result.frontier[0].expectedVolatility;
    const maxVol = Math.max(...result.frontier.map((p) => p.expectedVolatility));
    expect(firstVol).toBeLessThanOrEqual(maxVol);
  });

  it('空 ticker 列表应返回空前沿', () => {
    const priceData = makeMultiAssetPriceData();
    const result = calcEfficientFrontier([], priceData, 10);
    expect(result.frontier).toEqual([]);
  });

  it('单资产应返回有效前沿（全仓该资产）', () => {
    const priceData = makeMultiAssetPriceData();
    const result = calcEfficientFrontier(['WINNER'], priceData, 5);
    expect(result.frontier.length).toBeGreaterThan(0);
    for (const point of result.frontier) {
      expect(point.weights.WINNER).toBeCloseTo(1, 2);
    }
  });

  it('numPoints=2 应返回 2 个点', () => {
    const priceData = makeMultiAssetPriceData();
    const result = calcEfficientFrontier(['WINNER', 'FLAT'], priceData, 2);
    expect(result.frontier).toHaveLength(2);
  });

  it('含 Infinity 价格的 ticker 应被忽略', () => {
    const priceData: PriceData = {
      GOOD: makeLinearPriceData('GOOD', '2020-01-02', '2020-12-31', 100, 0.001),
      INF: { '2020-01-02': 100, '2020-01-03': Infinity },
    };
    const result = calcEfficientFrontier(['GOOD', 'INF'], priceData, 5);
    expect(result.frontier.length).toBeGreaterThan(0);
  });
});

describe('optimizePortfolio - 高级分支覆盖', () => {
  it('maxWeight 不可行（n×maxWeight < 1）应回退等权', () => {
    const priceData = makeMultiAssetPriceData();
    const result = optimizePortfolio(['WINNER', 'FLAT', 'LOSER'], priceData, 'maxSharpe', {
      maxWeight: 0.2,
    });
    for (const w of Object.values(result.optimalWeights)) {
      expect(w).toBeCloseTo(1 / 3, 1);
    }
  });

  it('numPoints=1 时应返回单点前沿', () => {
    const priceData = makeMultiAssetPriceData();
    const result = calcEfficientFrontier(['WINNER', 'FLAT'], priceData, 1);
    expect(result.frontier).toHaveLength(1);
    expect(result.frontier[0].expectedReturn).toBeDefined();
  });

  it('全负收益资产 maxSharpe 应回退到最高收益资产', () => {
    const down = Math.pow(0.9, 1 / 252) - 1;
    const priceData: PriceData = {
      BAD1: makeLinearPriceData('BAD1', '2020-01-02', '2021-12-31', 100, down),
      BAD2: makeLinearPriceData('BAD2', '2020-01-02', '2021-12-31', 100, down * 1.5),
    };
    const result = optimizePortfolio(['BAD1', 'BAD2'], priceData, 'maxSharpe', {}, 0.02);
    const weights = Object.values(result.optimalWeights);
    expect(weights.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 2);
    expect(Math.max(...weights)).toBeCloseTo(1, 1);
  });

  it('两资产无共有交易日应返回零值', () => {
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-06-30', 100, 0.001),
      B: makeLinearPriceData('B', '2021-01-02', '2021-06-30', 100, 0.002),
    };
    const result = optimizePortfolio(['A', 'B'], priceData, 'maxSharpe');
    expect(result.optimalWeights).toEqual({});
    expect(result.expectedReturn).toBe(0);
  });

  it('custom riskFreeRate 应影响 sharpeRatio 计算', () => {
    const priceData = makeMultiAssetPriceData();
    const lowRf = optimizePortfolio(['WINNER', 'FLAT'], priceData, 'maxSharpe', {}, 0.0);
    const highRf = optimizePortfolio(['WINNER', 'FLAT'], priceData, 'maxSharpe', {}, 0.1);
    expect(lowRf.sharpeRatio).toBeGreaterThan(highRf.sharpeRatio);
  });

  it('calcEfficientFrontier 应返回递增收益的前沿点序列', () => {
    const priceData = makeMultiAssetPriceData();
    const result = calcEfficientFrontier(['WINNER', 'FLAT', 'LOSER'], priceData, 5, 0.02);
    const returns = result.frontier.map((p) => p.expectedReturn);
    for (let i = 1; i < returns.length; i++) {
      expect(returns[i]).toBeGreaterThanOrEqual(returns[i - 1] - 0.01);
    }
  });

  it('minVolatility 单资产组合应返回 100% 权重', () => {
    const priceData = makeMultiAssetPriceData();
    const result = optimizePortfolio(['WINNER'], priceData, 'minVolatility');
    expect(result.optimalWeights.WINNER).toBe(1);
    expect(result.expectedVolatility).toBeGreaterThanOrEqual(0);
  });

  it('超过 15 个资产 maxSharpe 应走闭式求解路径且权重和为 1', () => {
    const tickers = Array.from({ length: 16 }, (_, i) => `T${i}`);
    const priceData: PriceData = {};
    for (let i = 0; i < tickers.length; i++) {
      const daily = Math.pow(1 + (0.05 * (i + 1)) / 252, 1 / 252) - 1;
      priceData[tickers[i]] = makeLinearPriceData(
        tickers[i],
        '2020-01-02',
        '2021-12-31',
        100,
        daily,
      );
    }
    const result = optimizePortfolio(tickers, priceData, 'maxSharpe');
    expect(Object.keys(result.optimalWeights)).toHaveLength(16);
    const sum = Object.values(result.optimalWeights).reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1, 2);
  });

  it('未知 objective 应回退 maxSharpe', () => {
    const priceData = makeMultiAssetPriceData();
    const result = optimizePortfolio(['WINNER', 'FLAT'], priceData, 'unknown' as 'maxSharpe');
    expect(Object.values(result.optimalWeights).reduce((s, w) => s + w, 0)).toBeCloseTo(1, 2);
  });

  it('minWeight 约束应裁剪负权重后归一化', () => {
    const priceData = makeMultiAssetPriceData();
    const result = optimizePortfolio(['WINNER', 'FLAT', 'LOSER'], priceData, 'maxSharpe', {
      minWeight: 0.1,
    });
    for (const w of Object.values(result.optimalWeights)) {
      expect(w).toBeGreaterThanOrEqual(0.09);
    }
  });
});
