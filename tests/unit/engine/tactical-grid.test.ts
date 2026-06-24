/**
 * 战术网格搜索（Tactical Grid Search）单元测试（T-P3-9）
 *
 * 企业理由：网格搜索遍历参数组合寻找最优策略参数，错误的指标计算、
 * 信号生成或排序逻辑会导致推荐次优参数。测试覆盖：
 * - 参数序列生成（generateRange）
 * - 指标计算（calcSMA/calcEMA/calcRSI）
 * - 信号生成（generateSignals：sma/ema/rsi）
 * - 合成价格构建（buildSyntheticPrices）
 * - 指标提取与目标排序（extractMetrics/getObjectiveValue）
 * - 网格搜索主流程（runGridSearch）
 * - 边界（空输入、单点、NaN/Infinity、step<=0）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted 确保 mock 在模块导入前注册
const mocks = vi.hoisted(() => ({
  runPortfolioBacktest: vi.fn(),
}));

// mock portfolio 模块，避免真实回测依赖
vi.mock('../../../api/engine/portfolio.js', () => ({
  runPortfolioBacktest: mocks.runPortfolioBacktest,
}));

import {
  generateRange,
  calcSMA,
  calcEMA,
  calcRSI,
  generateSignals,
  buildSyntheticPrices,
  extractMetrics,
  getObjectiveValue,
  runGridSearch,
} from '../../../api/engine/tacticalGrid.js';
import type { Statistics } from '../../../shared/types/statistics.js';
import type { GridCombinationMetrics, ObjectiveType, TacticalGridRequest } from '../../../api/engine/tacticalGrid.js';

// ===== 辅助函数 =====

function makeDates(n: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(2020, 0, 2 + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function makeUptrendPrices(n: number): number[] {
  const prices: number[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    p *= 1.01;
    prices.push(+p.toFixed(4));
  }
  return prices;
}

function makeDowntrendPrices(n: number): number[] {
  const prices: number[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    p *= 0.99;
    prices.push(+p.toFixed(4));
  }
  return prices;
}

function makeStats(overrides?: Partial<Statistics>): Statistics {
  return {
    cagr: 0.1,
    mwrr: 0.1,
    bestYear: 0.2,
    worstYear: -0.1,
    avgYear: 0.1,
    stdev: 0.15,
    maxDrawdown: -0.2,
    maxDrawdownDuration: 100,
    sharpe: 0.8,
    sortino: 1.0,
    calmar: 0.5,
    totalReturn: 0.3,
    ...overrides,
  };
}

// ===== 测试 =====

describe('generateRange - 参数序列生成', () => {
  it('应生成 [min, min+step, ..., max] 序列', () => {
    const result = generateRange(2, 10, 2);
    expect(result).toEqual([2, 4, 6, 8, 10]);
  });

  it('step=1 应生成整数序列', () => {
    const result = generateRange(1, 5, 1);
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  it('min === max 应返回单元素数组', () => {
    const result = generateRange(5, 5, 1);
    expect(result).toEqual([5]);
  });

  it('step <= 0 应返回 [min]', () => {
    expect(generateRange(1, 10, 0)).toEqual([1]);
    expect(generateRange(1, 10, -1)).toEqual([1]);
  });

  it('浮点 step 应正确生成并四舍五入到 3 位小数', () => {
    const result = generateRange(0.1, 0.3, 0.1);
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it('浮点累积误差应被 1e-9 容差处理', () => {
    // 0.1 + 0.1 + 0.1 = 0.30000000000000004，应仍包含 0.3
    const result = generateRange(0.1, 0.3, 0.1);
    expect(result[result.length - 1]).toBeCloseTo(0.3, 10);
    expect(result).toHaveLength(3);
  });
});

describe('calcSMA - 简单移动平均', () => {
  it('应正确计算 SMA', () => {
    const prices = [1, 2, 3, 4, 5];
    const result = calcSMA(prices, 3);
    // 前 2 个为 null，第 3 个开始有值
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBe(2); // (1+2+3)/3
    expect(result[3]).toBe(3); // (2+3+4)/3
    expect(result[4]).toBe(4); // (3+4+5)/3
  });

  it('period=1 应等于原价格序列', () => {
    const prices = [10, 20, 30];
    const result = calcSMA(prices, 1);
    expect(result).toEqual([10, 20, 30]);
  });

  it('period <= 0 应返回全 null', () => {
    const prices = [1, 2, 3];
    expect(calcSMA(prices, 0)).toEqual([null, null, null]);
    expect(calcSMA(prices, -1)).toEqual([null, null, null]);
  });

  it('空数组应返回空数组', () => {
    const result = calcSMA([], 3);
    expect(result).toEqual([]);
  });

  it('period 大于数组长度应返回全 null', () => {
    const prices = [1, 2];
    const result = calcSMA(prices, 5);
    expect(result).toEqual([null, null]);
  });
});

describe('calcEMA - 指数移动平均', () => {
  it('应正确计算 EMA（以 SMA 初始化）', () => {
    const prices = [1, 2, 3, 4, 5];
    const result = calcEMA(prices, 3);
    // 前 2 个为 null，第 3 个为 SMA(3) = 2
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBe(2); // SMA 初始值
    // k = 2/(3+1) = 0.5
    // EMA[3] = 4 * 0.5 + 2 * 0.5 = 3
    expect(result[3]).toBe(3);
    // EMA[4] = 5 * 0.5 + 3 * 0.5 = 4
    expect(result[4]).toBe(4);
  });

  it('period=1 应等于原价格序列', () => {
    const prices = [10, 20, 30];
    const result = calcEMA(prices, 1);
    // k = 2/(1+1) = 1，SMA[0] = 10，后续完全跟随
    expect(result[0]).toBe(10);
    expect(result[1]).toBe(20);
    expect(result[2]).toBe(30);
  });

  it('period <= 0 应返回全 null', () => {
    const prices = [1, 2, 3];
    expect(calcEMA(prices, 0)).toEqual([null, null, null]);
    expect(calcEMA(prices, -1)).toEqual([null, null, null]);
  });

  it('空数组应返回空数组', () => {
    const result = calcEMA([], 3);
    expect(result).toEqual([]);
  });

  it('period 大于数组长度应返回全 null', () => {
    const prices = [1, 2];
    const result = calcEMA(prices, 5);
    expect(result).toEqual([null, null]);
  });
});

describe('calcRSI - 相对强弱指数', () => {
  it('持续上涨应产生 RSI 接近 100', () => {
    const prices = makeUptrendPrices(20);
    const result = calcRSI(prices, 14);
    // 持续上涨，avgLoss = 0，RSI = 100
    expect(result[14]).toBe(100);
    expect(result[19]).toBe(100);
  });

  it('持续下跌应产生 RSI 接近 0', () => {
    const prices = makeDowntrendPrices(20);
    const result = calcRSI(prices, 14);
    // 持续下跌，avgGain = 0，RSI = 0
    expect(result[14]).toBeLessThan(5);
    expect(result[19]).toBeLessThan(5);
  });

  it('period <= 0 应返回全 null', () => {
    const prices = [1, 2, 3];
    expect(calcRSI(prices, 0)).toEqual([null, null, null]);
    expect(calcRSI(prices, -1)).toEqual([null, null, null]);
  });

  it('prices.length <= period 应返回全 null', () => {
    const prices = [1, 2, 3];
    const result = calcRSI(prices, 3);
    expect(result).toEqual([null, null, null]);
  });

  it('空数组应返回空数组', () => {
    const result = calcRSI([], 14);
    expect(result).toEqual([]);
  });

  it('RSI 值应在 [0, 100] 范围内', () => {
    const prices = [100, 102, 99, 101, 98, 103, 97, 100, 105, 95, 100, 102, 99, 101, 98, 103];
    const result = calcRSI(prices, 14);
    for (let i = 14; i < prices.length; i++) {
      expect(result[i]).not.toBeNull();
      expect(result[i] as number).toBeGreaterThanOrEqual(0);
      expect(result[i] as number).toBeLessThanOrEqual(100);
    }
  });
});

describe('generateSignals - 信号生成', () => {
  it('sma 指标：价格突破均线上沿应产生入场信号', () => {
    const prices = makeUptrendPrices(30);
    const dates = makeDates(30);
    const signals = generateSignals('sma', prices, dates, 5, 0, 'daily');
    // 上涨趋势中应最终持仓
    expect(signals.some((s) => s === true)).toBe(true);
    expect(signals[signals.length - 1]).toBe(true);
  });

  it('ema 指标：价格突破均线上沿应产生入场信号', () => {
    const prices = makeUptrendPrices(30);
    const dates = makeDates(30);
    const signals = generateSignals('ema', prices, dates, 5, 0, 'daily');
    expect(signals.some((s) => s === true)).toBe(true);
  });

  it('rsi 指标：超卖应产生入场信号', () => {
    const prices = makeDowntrendPrices(30);
    const dates = makeDates(30);
    // 超卖阈值 30，持续下跌 RSI < 30
    const signals = generateSignals('rsi', prices, dates, 14, 30, 'daily');
    expect(signals.some((s) => s === true)).toBe(true);
  });

  it('信号长度应与 prices 长度一致', () => {
    const prices = makeUptrendPrices(20);
    const dates = makeDates(20);
    const signals = generateSignals('sma', prices, dates, 5, 1, 'daily');
    expect(signals).toHaveLength(20);
  });

  it('空数组应返回空信号', () => {
    const signals = generateSignals('sma', [], [], 5, 1, 'daily');
    expect(signals).toEqual([]);
  });

  it('none 再平衡频率应仅在首日允许切换', () => {
    const prices = makeUptrendPrices(20);
    const dates = makeDates(20);
    const signals = generateSignals('sma', prices, dates, 5, 0, 'none');
    // none 模式下 prevDate=null 时首日可再平衡，之后不再触发
    expect(signals).toHaveLength(20);
  });
});

describe('buildSyntheticPrices - 合成价格构建', () => {
  it('全 true 信号应跟随实际收益', () => {
    const dates = ['2020-01-01', '2020-01-02', '2020-01-03'];
    const prices = [100, 110, 121]; // 10% 涨幅
    const signals = [false, true, true];
    const result = buildSyntheticPrices(dates, prices, signals);
    // 首日 = 100
    expect(result['2020-01-01']).toBe(100);
    // 第二日信号 true，跟随 10% 收益：100 * 1.1 = 110
    expect(result['2020-01-02']).toBeCloseTo(110, 10);
    // 第三日信号 true，跟随 10% 收益：110 * 1.1 = 121
    expect(result['2020-01-03']).toBeCloseTo(121, 10);
  });

  it('全 false 信号应保持现金（收益为 0）', () => {
    const dates = ['2020-01-01', '2020-01-02', '2020-01-03'];
    const prices = [100, 110, 121];
    const signals = [false, false, false];
    const result = buildSyntheticPrices(dates, prices, signals);
    expect(result['2020-01-01']).toBe(100);
    expect(result['2020-01-02']).toBe(100); // 无收益
    expect(result['2020-01-03']).toBe(100); // 无收益
  });

  it('空 dates 应返回空对象', () => {
    const result = buildSyntheticPrices([], [], []);
    expect(result).toEqual({});
  });

  it('单日数据应返回首日价格', () => {
    const result = buildSyntheticPrices(['2020-01-01'], [100], [false]);
    expect(result).toEqual({ '2020-01-01': 100 });
  });

  it('前价为 0 时应避免除零，收益为 0', () => {
    const dates = ['2020-01-01', '2020-01-02'];
    const prices = [0, 100];
    const signals = [false, true];
    const result = buildSyntheticPrices(dates, prices, signals);
    expect(result['2020-01-01']).toBe(0);
    expect(result['2020-01-02']).toBe(0); // 前价 0，收益 0
  });
});

describe('extractMetrics - 指标提取', () => {
  it('应从 Statistics 提取关键指标', () => {
    const stats = makeStats({
      cagr: 0.15,
      maxDrawdown: -0.25,
      sharpe: 1.2,
      totalReturn: 0.5,
      stdev: 0.18,
      calmar: 0.6,
    });
    const metrics = extractMetrics(stats);
    expect(metrics.cagr).toBe(0.15);
    expect(metrics.maxDrawdown).toBe(-0.25);
    expect(metrics.sharpe).toBe(1.2);
    expect(metrics.totalReturn).toBe(0.5);
    expect(metrics.stdev).toBe(0.18);
    expect(metrics.calmar).toBe(0.6);
  });

  it('NaN 值应通过 || 转为 0', () => {
    const stats = makeStats({
      cagr: NaN,
      maxDrawdown: NaN,
      sharpe: NaN,
      totalReturn: NaN,
      stdev: NaN,
      calmar: NaN,
    });
    const metrics = extractMetrics(stats);
    expect(metrics.cagr).toBe(0);
    expect(metrics.maxDrawdown).toBe(0);
    expect(metrics.sharpe).toBe(0);
    expect(metrics.totalReturn).toBe(0);
    expect(metrics.stdev).toBe(0);
    expect(metrics.calmar).toBe(0);
  });

  it('undefined 可选字段应转为 0', () => {
    const stats = makeStats({
      totalReturn: undefined,
      calmar: undefined,
    });
    const metrics = extractMetrics(stats);
    expect(metrics.totalReturn).toBe(0);
    expect(metrics.calmar).toBe(0);
  });
});

describe('getObjectiveValue - 优化目标排序值', () => {
  const metrics: GridCombinationMetrics = {
    param1: 5,
    param2: 2,
    cagr: 0.1,
    maxDrawdown: -0.2,
    sharpe: 1.5,
    totalReturn: 0.3,
    stdev: 0.15,
    calmar: 0.5,
  };

  it('maxCAGR 应返回 cagr', () => {
    expect(getObjectiveValue(metrics, 'maxCAGR')).toBe(0.1);
  });

  it('minDrawdown 应返回 -maxDrawdown（回撤越小越优）', () => {
    expect(getObjectiveValue(metrics, 'minDrawdown')).toBe(0.2);
  });

  it('maxSharpe 应返回 sharpe', () => {
    expect(getObjectiveValue(metrics, 'maxSharpe')).toBe(1.5);
  });

  it('未知目标应默认返回 cagr', () => {
    expect(getObjectiveValue(metrics, 'unknown' as ObjectiveType)).toBe(0.1);
  });
});

describe('runGridSearch - 网格搜索主流程', () => {
  function makeRequest(overrides?: Partial<TacticalGridRequest>): TacticalGridRequest {
    return {
      indicator: 'sma',
      param1: { min: 5, max: 10, step: 5 },
      param2: { min: 0, max: 2, step: 2 },
      tickers: ['TEST'],
      startDate: '2020-01-01',
      endDate: '2020-01-30',
      startingValue: 10000,
      rebalanceFrequency: 'daily',
      objective: 'maxCAGR',
      topN: 5,
      ...overrides,
    };
  }

  function makeBtResult(cagr: number, maxDrawdown: number, sharpe: number) {
    return {
      portfolios: [
        {
          statistics: makeStats({ cagr, maxDrawdown, sharpe }),
          growthCurve: [
            { date: '2020-01-01', value: 10000 },
            { date: '2020-01-02', value: 10100 },
          ],
        },
      ],
    };
  }

  beforeEach(() => {
    mocks.runPortfolioBacktest.mockReset();
  });

  it('应遍历所有参数组合并返回结果', () => {
    // param1: [5, 10], param2: [0, 2] → 4 组合
    mocks.runPortfolioBacktest.mockReturnValue(makeBtResult(0.1, -0.2, 1.0));

    const dates = makeDates(20);
    const prices = makeUptrendPrices(20);
    const result = runGridSearch(makeRequest(), { TEST: {} }, dates, prices, 'TEST');

    expect(result.totalCombinations).toBe(4);
    expect(result.allMetrics).toHaveLength(4);
    expect(result.topResults).toHaveLength(4);
    expect(mocks.runPortfolioBacktest).toHaveBeenCalledTimes(4);
  });

  it('应按优化目标排序（maxCAGR：cagr 降序）', () => {
    mocks.runPortfolioBacktest
      .mockReturnValueOnce(makeBtResult(0.05, -0.1, 0.5))
      .mockReturnValueOnce(makeBtResult(0.15, -0.3, 1.5))
      .mockReturnValueOnce(makeBtResult(0.10, -0.2, 1.0))
      .mockReturnValueOnce(makeBtResult(0.20, -0.4, 2.0));

    const dates = makeDates(20);
    const prices = makeUptrendPrices(20);
    const result = runGridSearch(makeRequest(), { TEST: {} }, dates, prices, 'TEST');

    // 按 cagr 降序：0.20, 0.15, 0.10, 0.05
    expect(result.allMetrics[0].cagr).toBe(0.2);
    expect(result.allMetrics[1].cagr).toBe(0.15);
    expect(result.allMetrics[2].cagr).toBe(0.1);
    expect(result.allMetrics[3].cagr).toBe(0.05);
  });

  it('topN 应限制返回结果数量', () => {
    mocks.runPortfolioBacktest.mockReturnValue(makeBtResult(0.1, -0.2, 1.0));

    const dates = makeDates(20);
    const prices = makeUptrendPrices(20);
    const result = runGridSearch(makeRequest({ topN: 2 }), { TEST: {} }, dates, prices, 'TEST');

    expect(result.topResults).toHaveLength(2);
  });

  it('bestCombination 应为排序后首个结果', () => {
    mocks.runPortfolioBacktest
      .mockReturnValueOnce(makeBtResult(0.05, -0.1, 0.5))
      .mockReturnValueOnce(makeBtResult(0.15, -0.3, 1.5));

    const dates = makeDates(20);
    const prices = makeUptrendPrices(20);
    const result = runGridSearch(
      makeRequest({ param1: { min: 5, max: 10, step: 5 }, param2: { min: 0, max: 0, step: 0 } }),
      { TEST: {} },
      dates,
      prices,
      'TEST',
    );

    expect(result.bestCombination.cagr).toBe(0.15);
  });

  it('回测异常时应使用 fallback 值（全 0）', () => {
    mocks.runPortfolioBacktest.mockImplementation(() => {
      throw new Error('回测失败');
    });

    const dates = makeDates(20);
    const prices = makeUptrendPrices(20);
    const result = runGridSearch(makeRequest(), { TEST: {} }, dates, prices, 'TEST');

    expect(result.allMetrics).toHaveLength(4);
    expect(result.allMetrics[0].cagr).toBe(0);
    expect(result.allMetrics[0].sharpe).toBe(0);
  });

  it('heatmap 矩阵应与参数网格对应', () => {
    mocks.runPortfolioBacktest.mockReturnValue(makeBtResult(0.1, -0.2, 1.0));

    const dates = makeDates(20);
    const prices = makeUptrendPrices(20);
    const result = runGridSearch(makeRequest(), { TEST: {} }, dates, prices, 'TEST');

    // param1: [5, 10], param2: [0, 2] → 2x2 矩阵
    expect(result.heatmap.matrix).toHaveLength(2);
    expect(result.heatmap.matrix[0]).toHaveLength(2);
    expect(result.heatmap.param1Values).toEqual([5, 10]);
    expect(result.heatmap.param2Values).toEqual([0, 2]);
  });

  it('rsi 指标应使用 RSI 标签', () => {
    mocks.runPortfolioBacktest.mockReturnValue(makeBtResult(0.1, -0.2, 1.0));

    const dates = makeDates(20);
    const prices = makeUptrendPrices(20);
    const result = runGridSearch(
      makeRequest({ indicator: 'rsi' }),
      { TEST: {} },
      dates,
      prices,
      'TEST',
    );

    expect(result.heatmap.param1Label).toBe('RSI 周期');
    expect(result.heatmap.param2Label).toBe('超卖阈值');
  });

  it('minDrawdown 目标应按 -maxDrawdown 排序（回撤越小越优）', () => {
    // maxDrawdown 在本代码库中为正值（0.4 = 40% 回撤）
    mocks.runPortfolioBacktest
      .mockReturnValueOnce(makeBtResult(0.1, 0.4, 1.0)) // 大回撤，objectiveValue = -0.4
      .mockReturnValueOnce(makeBtResult(0.1, 0.1, 1.0)); // 小回撤，objectiveValue = -0.1

    const dates = makeDates(20);
    const prices = makeUptrendPrices(20);
    const result = runGridSearch(
      makeRequest({
        objective: 'minDrawdown',
        param1: { min: 5, max: 10, step: 5 },
        param2: { min: 0, max: 0, step: 0 },
      }),
      { TEST: {} },
      dates,
      prices,
      'TEST',
    );

    // 回撤小（0.1）的 objectiveValue = -0.1 更大，应排前面
    expect(result.allMetrics[0].maxDrawdown).toBe(0.1);
    expect(result.allMetrics[1].maxDrawdown).toBe(0.4);
  });
});
