/**
 * 目标优化（Goal Optimizer）模块单元测试（T-P3-9）
 *
 * 企业理由：目标优化为用户提供达成财务目标的概率与建议配置，
 * 错误的模拟或约束过滤会误导用户决策。测试覆盖：
 * - 组合日收益率计算
 * - 蒙特卡洛模拟（路径长度、终值分布）
 * - 概率分布曲线与最优路径
 * - 建议定期投入金额计算
 * - 完整目标优化流程
 * - 边界（空资产、NaN、约束全过滤、Fix-4 安全默认值）
 *
 * 注意：runGoalSimulation 内部使用 Math.random，验证统计性质而非具体值。
 */

import { describe, it, expect } from 'vitest';
import {
  calcPortfolioDailyReturns,
  runGoalSimulation,
  buildProbabilityCurve,
  buildOptimalPath,
  calcRequiredContribution,
  optimizeGoals,
} from '../../../api/engine/goalOptimizer.js';
import type { GoalOptimizerRequest } from '../../../shared/types/goal.js';

function makePriceData(): Record<string, Record<string, number>> {
  const data: Record<string, number> = {};
  let price = 100;
  for (let i = 0; i < 300; i++) {
    const d = new Date(2020, 0, 2 + i);
    price *= 1.0005; // 年化约 13%
    data[d.toISOString().slice(0, 10)] = +price.toFixed(4);
  }
  return { STOCK: data };
}

function makeRequest(overrides?: Partial<GoalOptimizerRequest>): GoalOptimizerRequest {
  return {
    targetAmount: 20000,
    initialAmount: 10000,
    years: 5,
    assets: [{ ticker: 'STOCK', weight: 1 }],
    numSimulations: 50,
    ...overrides,
  };
}

describe('calcPortfolioDailyReturns - 组合日收益率', () => {
  it('应返回正确的日收益率序列', () => {
    const priceData = {
      A: { '2020-01-02': 100, '2020-01-03': 101, '2020-01-04': 102 },
    };
    const returns = calcPortfolioDailyReturns(
      [{ ticker: 'A', weight: 1 }],
      priceData,
      '2020-01-02',
      '2020-01-04',
    );
    expect(returns).toHaveLength(2);
    expect(returns[0]).toBeCloseTo(0.01, 4); // (101-100)/100
    expect(returns[1]).toBeCloseTo(1 / 101, 4); // (102-101)/101
  });

  it('多资产应按权重加权', () => {
    const priceData = {
      A: { '2020-01-02': 100, '2020-01-03': 110 }, // +10%
      B: { '2020-01-02': 100, '2020-01-03': 90 }, // -10%
    };
    const returns = calcPortfolioDailyReturns(
      [
        { ticker: 'A', weight: 0.5 },
        { ticker: 'B', weight: 0.5 },
      ],
      priceData,
      '2020-01-02',
      '2020-01-03',
    );
    // 50% * 10% + 50% * (-10%) = 0
    expect(returns[0]).toBeCloseTo(0, 4);
  });

  it('空资产列表应返回空数组', () => {
    const returns = calcPortfolioDailyReturns([], {}, '2020-01-02', '2020-12-31');
    expect(returns).toEqual([]);
  });

  it('priceData 中不存在的 ticker 应被过滤', () => {
    const returns = calcPortfolioDailyReturns(
      [{ ticker: 'NONEXISTENT', weight: 1 }],
      {},
      '2020-01-02',
      '2020-12-31',
    );
    expect(returns).toEqual([]);
  });

  it('全零权重应返回空数组', () => {
    const priceData = {
      A: { '2020-01-02': 100, '2020-01-03': 101 },
    };
    const returns = calcPortfolioDailyReturns(
      [{ ticker: 'A', weight: 0 }],
      priceData,
      '2020-01-02',
      '2020-01-03',
    );
    expect(returns).toEqual([]);
  });

  it('日期不足 2 个应返回空数组', () => {
    const priceData = { A: { '2020-01-02': 100 } };
    const returns = calcPortfolioDailyReturns(
      [{ ticker: 'A', weight: 1 }],
      priceData,
      '2020-01-02',
      '2020-12-31',
    );
    expect(returns).toEqual([]);
  });

  it('负权重应被归一化为正权重（绝对值）', () => {
    const priceData = {
      A: { '2020-01-02': 100, '2020-01-03': 110 },
    };
    const returns = calcPortfolioDailyReturns(
      [{ ticker: 'A', weight: -1 }],
      priceData,
      '2020-01-02',
      '2020-01-03',
    );
    // 负权重归一化后为 1，应返回正常收益率
    expect(returns).toHaveLength(1);
    expect(returns[0]).toBeCloseTo(0.1, 4);
  });
});

describe('runGoalSimulation - 蒙特卡洛模拟', () => {
  it('应返回指定数量的路径', () => {
    const request = makeRequest({ numSimulations: 20, years: 3 });
    const { paths, metrics } = runGoalSimulation(request, 0.0005, 0.01);
    expect(paths).toHaveLength(20);
    expect(metrics).toHaveLength(20);
  });

  it('每条路径长度应为 years * 252 + 1', () => {
    const request = makeRequest({ numSimulations: 5, years: 3 });
    const { paths } = runGoalSimulation(request, 0.0005, 0.01);
    const expectedLen = Math.round(3 * 252) + 1;
    for (const path of paths) {
      expect(path).toHaveLength(expectedLen);
    }
  });

  it('路径首值应为初始金额', () => {
    const request = makeRequest({ initialAmount: 10000, numSimulations: 5 });
    const { paths } = runGoalSimulation(request, 0.0005, 0.01);
    for (const path of paths) {
      expect(path[0]).toBe(10000);
    }
  });

  it('正均值收益路径终值应大多为正', () => {
    const request = makeRequest({ numSimulations: 50, years: 5 });
    const { metrics } = runGoalSimulation(request, 0.001, 0.01);
    const positiveCount = metrics.filter((m) => m.finalValue > 0).length;
    expect(positiveCount).toBeGreaterThan(40); // 大多数应为正
  });

  it('每条路径的 maxDrawdown 应在 [0, 1] 范围内', () => {
    const request = makeRequest({ numSimulations: 20, years: 3 });
    const { metrics } = runGoalSimulation(request, 0.0005, 0.01);
    for (const m of metrics) {
      expect(m.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(m.maxDrawdown).toBeLessThanOrEqual(1);
    }
  });

  it('numSimulations 上限为 10000', () => {
    const request = makeRequest({ numSimulations: 99999, years: 1 });
    const { paths } = runGoalSimulation(request, 0.0005, 0.01);
    expect(paths).toHaveLength(10000);
  });

  it('numSimulations 下限为 1', () => {
    const request = makeRequest({ numSimulations: 0, years: 1 });
    const { paths } = runGoalSimulation(request, 0.0005, 0.01);
    expect(paths).toHaveLength(1);
  });

  it('零波动率路径终值应确定（无随机性）', () => {
    const request = makeRequest({ numSimulations: 5, years: 1, initialAmount: 10000 });
    const { metrics } = runGoalSimulation(request, 0.0005, 0);
    // std=0 时所有路径相同
    const finalValues = metrics.map((m) => m.finalValue);
    const allSame = finalValues.every((v) => Math.abs(v - finalValues[0]) < 1e-6);
    expect(allSame).toBe(true);
  });
});

describe('buildProbabilityCurve - 概率分布曲线', () => {
  it('应返回 50 个 bin 的概率分布', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const curve = buildProbabilityCurve(values);
    expect(curve).toHaveLength(50);
    const totalProb = curve.reduce((s, p) => s + p.probability, 0);
    expect(totalProb).toBeCloseTo(1, 6);
  });

  it('空数组应返回空曲线', () => {
    const curve = buildProbabilityCurve([]);
    expect(curve).toEqual([]);
  });

  it('所有值相同应返回单点概率 1', () => {
    const curve = buildProbabilityCurve([5, 5, 5]);
    expect(curve).toHaveLength(1);
    expect(curve[0].probability).toBe(1);
  });

  it('每个 bin 的概率应在 [0, 1] 范围内', () => {
    const values = Array.from({ length: 100 }, (_, i) => i);
    const curve = buildProbabilityCurve(values);
    for (const point of curve) {
      expect(point.probability).toBeGreaterThanOrEqual(0);
      expect(point.probability).toBeLessThanOrEqual(1);
    }
  });
});

describe('buildOptimalPath - 最优路径', () => {
  it('应返回 years+1 个采样点', () => {
    const paths = [Array.from({ length: 253 }, (_, i) => 10000 * (1 + i * 0.001))];
    const result = buildOptimalPath(paths, 1);
    expect(result).toHaveLength(2); // year 0 和 year 1
  });

  it('每个点应包含 median/p10/p90', () => {
    const paths = [
      Array.from({ length: 1261 }, (_, i) => 10000 * (1 + i * 0.001)),
      Array.from({ length: 1261 }, (_, i) => 10000 * (1 + i * 0.002)),
    ];
    const result = buildOptimalPath(paths, 5);
    for (const point of result) {
      expect(point).toHaveProperty('median');
      expect(point).toHaveProperty('p10');
      expect(point).toHaveProperty('p90');
      expect(point).toHaveProperty('year');
    }
  });

  it('p10 应 <= median <= p90', () => {
    const paths = Array.from({ length: 50 }, (_, k) =>
      Array.from({ length: 1261 }, (_, i) => 10000 * (1 + (i * 0.001 * (k + 1)) / 50)),
    );
    const result = buildOptimalPath(paths, 5);
    for (const point of result) {
      expect(point.p10).toBeLessThanOrEqual(point.median);
      expect(point.median).toBeLessThanOrEqual(point.p90);
    }
  });
});

describe('calcRequiredContribution - 建议投入金额', () => {
  it('中位数终值 >= 目标时应返回 0（无需追加）', () => {
    const contribution = calcRequiredContribution(10000, 20000, 5, 25000);
    expect(contribution).toBe(0);
  });

  it('中位数终值 < 目标时应返回正数（需追加投入）', () => {
    const contribution = calcRequiredContribution(10000, 20000, 5, 15000);
    expect(contribution).toBeGreaterThan(0);
  });

  it('零增长（medianFinalValue === initialAmount）应线性分摊', () => {
    const contribution = calcRequiredContribution(10000, 20000, 5, 10000);
    // gap = 20000 - 10000 = 10000, 线性分摊 10000/5 = 2000
    expect(contribution).toBeCloseTo(2000, 0);
  });

  it('years=0 应不崩溃（返回 Infinity 为已知限制）', () => {
    const contribution = calcRequiredContribution(10000, 20000, 0, 15000);
    // years=0 时 gap/years = 10000/0 = Infinity（源码已知限制，不修改源码）
    expect(typeof contribution).toBe('number');
    expect(contribution).toBe(Infinity);
  });
});

describe('optimizeGoals - 完整目标优化', () => {
  it('应返回完整的优化结果', () => {
    const priceData = makePriceData();
    const request = makeRequest({ numSimulations: 30 });
    const result = optimizeGoals(request, priceData, '2020-01-02', '2021-12-31');

    expect(result).toHaveProperty('successProbability');
    expect(result).toHaveProperty('probabilityCurve');
    expect(result).toHaveProperty('optimalPath');
    expect(result).toHaveProperty('recommendation');
    expect(result.recommendation).toHaveProperty('expectedReturn');
    expect(result.recommendation).toHaveProperty('requiredContribution');
    expect(result.recommendation).toHaveProperty('successRate');
  });

  it('successProbability 应在 [0, 1] 范围内', () => {
    const priceData = makePriceData();
    const request = makeRequest({ numSimulations: 30 });
    const result = optimizeGoals(request, priceData, '2020-01-02', '2021-12-31');
    expect(result.successProbability).toBeGreaterThanOrEqual(0);
    expect(result.successProbability).toBeLessThanOrEqual(1);
  });

  it('正收益资产 + 适度目标应有正的成功概率', () => {
    const priceData = makePriceData();
    const request = makeRequest({
      targetAmount: 12000, // 适度目标
      initialAmount: 10000,
      years: 5,
      numSimulations: 100,
    });
    const result = optimizeGoals(request, priceData, '2020-01-02', '2021-12-31');
    expect(result.successProbability).toBeGreaterThan(0);
  });

  it('空 assets 应返回零成功概率（不崩溃）', () => {
    const request = makeRequest({ assets: [], numSimulations: 10 });
    const result = optimizeGoals(request, {}, '2020-01-02', '2020-12-31');
    // 空资产：calcPortfolioDailyReturns 返回 []，mean=0 std=0
    // 模拟仍运行（0均值0标准差），终值=初始金额 < 目标，故成功概率为 0
    expect(result.successProbability).toBe(0);
    // 概率曲线非空（所有终值相同，单点概率 1）
    expect(result.probabilityCurve.length).toBeGreaterThan(0);
    // 最优路径仍生成（years+1 个采样点）
    expect(result.optimalPath.length).toBeGreaterThan(0);
  });

  it('所有路径被约束过滤时应返回安全默认值（Fix-4）', () => {
    // 使用带波动的价格数据，使模拟路径有非零波动率和回撤
    const volatileData: Record<string, number> = {};
    let price = 100;
    for (let i = 0; i < 300; i++) {
      const d = new Date(2020, 0, 2 + i);
      price *= i % 2 === 0 ? 1.02 : 0.98; // 交替涨跌产生波动
      volatileData[d.toISOString().slice(0, 10)] = +price.toFixed(4);
    }
    const priceData = { STOCK: volatileData };
    const request = makeRequest({
      numSimulations: 20,
      constraints: {
        maxDrawdown: 0.0001, // 极严格约束，几乎所有路径都被过滤
        maxVolatility: 0.0001,
      },
    });
    const result = optimizeGoals(request, priceData, '2020-01-02', '2021-12-31');
    // 所有路径被过滤，应返回安全默认值
    expect(result.successProbability).toBe(0);
    expect(result.probabilityCurve).toEqual([]);
    expect(result.optimalPath).toEqual([]);
    expect(result.recommendation.requiredContribution).toBe(0);
    expect(result.recommendation.successRate).toBe(0);
  });

  it('NaN 约束值应正确处理（不崩溃）', () => {
    const priceData = makePriceData();
    const request = makeRequest({
      numSimulations: 10,
      constraints: {
        maxDrawdown: NaN,
        maxVolatility: NaN,
      },
    });
    // NaN 比较恒为 false，所有路径都应通过过滤
    expect(() => optimizeGoals(request, priceData, '2020-01-02', '2021-12-31')).not.toThrow();
  });

  it('空 ticker 的资产应被过滤', () => {
    const priceData = makePriceData();
    const request = makeRequest({
      assets: [
        { ticker: '', weight: 1 },
        { ticker: '  ', weight: 1 },
        { ticker: 'STOCK', weight: 1 },
      ],
      numSimulations: 10,
    });
    const result = optimizeGoals(request, priceData, '2020-01-02', '2021-12-31');
    expect(result).toBeDefined();
  });

  it('单年目标应正常工作', () => {
    const priceData = makePriceData();
    const request = makeRequest({
      years: 1,
      numSimulations: 20,
    });
    const result = optimizeGoals(request, priceData, '2020-01-02', '2021-12-31');
    expect(result.optimalPath).toHaveLength(2); // year 0 + year 1
  });
});
