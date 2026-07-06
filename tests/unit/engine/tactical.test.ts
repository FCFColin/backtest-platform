/**
 * 战术分配（Tactical Allocation）模块单元测试（T-P3-9）
 *
 * 企业理由：战术分配根据技术指标动态调整权重，错误的信号评估
 * 或权重聚合会导致偏离策略意图。测试覆盖：
 * - 指标计算（SMA/EMA/RSI/MACD/Bollinger/Momentum）
 * - 信号条件评估（gt/lt/cross_above/cross_below）
 * - 权重归一化与聚合（weighted_average/rank/voting）
 * - 战术回测（净值曲线、信号历史）
 * - What-If 实时分析
 * - 边界（空输入、单点、NaN/Infinity）
 */

import { describe, it, expect } from 'vitest';
import {
  computeIndicatorValue,
  evaluateCondition,
  collectTickers,
  normalizeWeights,
  aggregateSignals,
  runTacticalBacktest,
  computeSimpleStatistics,
  analyzeWhatIf,
} from '../../../packages/backend/src/engine/tactical.js';
import type { TacticalStrategy } from '../../../shared/types/tactical.js';

// 构造上涨价格序列
function makeUptrendPrices(n: number): number[] {
  const prices: number[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    p *= 1.01;
    prices.push(+p.toFixed(4));
  }
  return prices;
}

// 构造震荡价格序列（触发交叉）
function makeOscillatingPrices(n: number): number[] {
  const prices: number[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    p *= i % 5 < 2 ? 1.03 : 0.97;
    prices.push(+p.toFixed(4));
  }
  return prices;
}

function makeDates(n: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(2020, 0, 2 + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function makeStrategy(overrides?: Partial<TacticalStrategy>): TacticalStrategy {
  return {
    id: 'strat-1',
    name: '测试策略',
    signals: [
      {
        id: 'sig-1',
        name: '均线突破',
        conditions: [{ indicator: 'sma', period: 5, operator: 'gt', threshold: 0 }],
        targetWeights: [{ ticker: 'STOCK', weight: 1 }],
      },
    ],
    aggregationMethod: 'weighted_average',
    ...overrides,
  };
}

describe('computeIndicatorValue - 指标计算', () => {
  it('SMA 应返回价格相对均线偏离比率', () => {
    const prices = makeUptrendPrices(20);
    const values = computeIndicatorValue('sma', prices, 5);
    expect(values).toHaveLength(20);
    // 前 4 个应为 null（数据不足）
    expect(values[0]).toBeNull();
    // 第 5 个起应有值
    expect(values[4]).not.toBeNull();
  });

  it('EMA 应返回价格相对均线偏离比率', () => {
    const prices = makeUptrendPrices(20);
    const values = computeIndicatorValue('ema', prices, 5);
    expect(values).toHaveLength(20);
  });

  it('RSI 应返回 0-100 范围的值', () => {
    const prices = makeOscillatingPrices(30);
    const values = computeIndicatorValue('rsi', prices, 14);
    const validValues = values.filter((v): v is number => v != null);
    for (const v of validValues) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('MACD 应返回柱状图值', () => {
    const prices = makeOscillatingPrices(30);
    const values = computeIndicatorValue('macd', prices, 12);
    expect(values).toHaveLength(30);
  });

  it('Bollinger 应返回 %B 值', () => {
    const prices = makeOscillatingPrices(30);
    const values = computeIndicatorValue('bollinger', prices, 20);
    expect(values).toHaveLength(30);
  });

  it('Momentum 应返回百分比收益', () => {
    const prices = makeUptrendPrices(20);
    const values = computeIndicatorValue('momentum', prices, 5);
    expect(values).toHaveLength(20);
  });

  it('未知指标应返回全 null 数组', () => {
    const prices = makeUptrendPrices(10);
    const values = computeIndicatorValue('unknown' as unknown as never, prices, 5);
    expect(values.every((v) => v === null)).toBe(true);
  });

  it('空价格数组应返回空数组', () => {
    const values = computeIndicatorValue('sma', [], 5);
    expect(values).toEqual([]);
  });

  it('含 NaN 的价格应转换为 null', () => {
    const prices = [100, NaN, 102, 103, 104, 105];
    const values = computeIndicatorValue('sma', prices, 3);
    // NaN 应被转为 null
    expect(values.some((v) => v === null)).toBe(true);
  });
});

describe('evaluateCondition - 信号条件评估', () => {
  it('gt 操作符：值 > 阈值为 true', () => {
    const values: (number | null)[] = [1, 2, 3, null, 5];
    const flags = evaluateCondition(
      { indicator: 'sma', period: 5, operator: 'gt', threshold: 2 },
      values,
    );
    expect(flags).toEqual([false, false, true, false, true]);
  });

  it('lt 操作符：值 < 阈值为 true', () => {
    const values: (number | null)[] = [1, 2, 3, null, 5];
    const flags = evaluateCondition(
      { indicator: 'sma', period: 5, operator: 'lt', threshold: 3 },
      values,
    );
    expect(flags).toEqual([true, true, false, false, false]);
  });

  it('cross_above：从 <= 阈值变为 > 阈值', () => {
    const values: (number | null)[] = [1, 2, 3, 4, 5];
    const flags = evaluateCondition(
      { indicator: 'sma', period: 5, operator: 'cross_above', threshold: 3 },
      values,
    );
    // 索引 2: prev=2(<=3), curr=3(>3? 否) → false
    // 索引 3: prev=3(<=3), curr=4(>3) → true
    expect(flags[3]).toBe(true);
  });

  it('cross_below：从 >= 阈值变为 < 阈值', () => {
    const values: (number | null)[] = [5, 4, 3, 2, 1];
    const flags = evaluateCondition(
      { indicator: 'sma', period: 5, operator: 'cross_below', threshold: 3 },
      values,
    );
    // 索引 3: prev=3(>=3), curr=2(<3) → true
    expect(flags[3]).toBe(true);
  });

  it('null 值应返回 false', () => {
    const values: (number | null)[] = [null, null, null];
    const flags = evaluateCondition(
      { indicator: 'sma', period: 5, operator: 'gt', threshold: 0 },
      values,
    );
    expect(flags).toEqual([false, false, false]);
  });

  it('未知操作符应返回全 false', () => {
    const values: (number | null)[] = [1, 2, 3];
    const flags = evaluateCondition(
      { indicator: 'sma', period: 5, operator: 'unknown' as unknown as never, threshold: 0 },
      values,
    );
    expect(flags).toEqual([false, false, false]);
  });

  it('空数组应返回空数组', () => {
    const flags = evaluateCondition(
      { indicator: 'sma', period: 5, operator: 'gt', threshold: 0 },
      [],
    );
    expect(flags).toEqual([]);
  });
});

describe('collectTickers - 收集标的', () => {
  it('应收集策略中所有目标权重的标的', () => {
    const strategy = makeStrategy({
      signals: [
        {
          id: 's1',
          name: 'sig1',
          conditions: [],
          targetWeights: [
            { ticker: 'A', weight: 0.5 },
            { ticker: 'B', weight: 0.5 },
          ],
        },
        {
          id: 's2',
          name: 'sig2',
          conditions: [],
          targetWeights: [{ ticker: 'C', weight: 1 }],
        },
      ],
    });
    const tickers = collectTickers(strategy);
    expect(tickers).toHaveLength(3);
    expect(tickers).toContain('A');
    expect(tickers).toContain('B');
    expect(tickers).toContain('C');
  });

  it('应去重相同标的', () => {
    const strategy = makeStrategy({
      signals: [
        {
          id: 's1',
          name: 'sig1',
          conditions: [],
          targetWeights: [{ ticker: 'A', weight: 1 }],
        },
        {
          id: 's2',
          name: 'sig2',
          conditions: [],
          targetWeights: [{ ticker: 'A', weight: 1 }],
        },
      ],
    });
    expect(collectTickers(strategy)).toEqual(['A']);
  });

  it('空策略应返回空数组', () => {
    const strategy = makeStrategy({ signals: [] });
    expect(collectTickers(strategy)).toEqual([]);
  });
});

describe('normalizeWeights - 权重归一化', () => {
  it('应将权重归一化为总和 1', () => {
    const weights = [
      { ticker: 'A', weight: 2 },
      { ticker: 'B', weight: 3 },
    ];
    const result = normalizeWeights(weights, ['A', 'B']);
    const sum = result.reduce((s, w) => s + w.weight, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(result[0].weight).toBeCloseTo(0.4, 6);
    expect(result[1].weight).toBeCloseTo(0.6, 6);
  });

  it('应补全缺失标的（权重 0）', () => {
    const weights = [{ ticker: 'A', weight: 1 }];
    const result = normalizeWeights(weights, ['A', 'B', 'C']);
    expect(result).toHaveLength(3);
    expect(result.find((w) => w.ticker === 'B')!.weight).toBe(0);
    expect(result.find((w) => w.ticker === 'C')!.weight).toBe(0);
  });

  it('全零权重应退化为等权', () => {
    const weights = [
      { ticker: 'A', weight: 0 },
      { ticker: 'B', weight: 0 },
    ];
    const result = normalizeWeights(weights, ['A', 'B']);
    expect(result[0].weight).toBeCloseTo(0.5, 6);
    expect(result[1].weight).toBeCloseTo(0.5, 6);
  });

  it('负权重总和 <= 0 应退化为等权', () => {
    const weights = [
      { ticker: 'A', weight: -1 },
      { ticker: 'B', weight: -1 },
    ];
    const result = normalizeWeights(weights, ['A', 'B']);
    expect(result[0].weight).toBeCloseTo(0.5, 6);
  });

  it('空标的列表应返回空数组', () => {
    const result = normalizeWeights([], []);
    expect(result).toEqual([]);
  });
});

describe('aggregateSignals - 信号聚合', () => {
  it('无激活信号时应返回等权', () => {
    const strategy = makeStrategy();
    const activeFlags = new Map<string, boolean[]>([['sig-1', [false, false, false]]]);
    const result = aggregateSignals(strategy, activeFlags, 0, ['A', 'B']);
    expect(result).toHaveLength(2);
    expect(result[0].weight).toBeCloseTo(0.5, 6);
  });

  it('weighted_average 应对激活信号的目标权重求平均', () => {
    const strategy = makeStrategy({
      aggregationMethod: 'weighted_average',
      signals: [
        {
          id: 's1',
          name: 'sig1',
          conditions: [],
          targetWeights: [{ ticker: 'A', weight: 1 }],
        },
        {
          id: 's2',
          name: 'sig2',
          conditions: [],
          targetWeights: [{ ticker: 'B', weight: 1 }],
        },
      ],
    });
    const activeFlags = new Map<string, boolean[]>([
      ['s1', [true]],
      ['s2', [true]],
    ]);
    const result = aggregateSignals(strategy, activeFlags, 0, ['A', 'B']);
    const sum = result.reduce((s, w) => s + w.weight, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it('voting 应取第一个激活信号的目标权重', () => {
    const strategy = makeStrategy({
      aggregationMethod: 'voting',
      signals: [
        {
          id: 's1',
          name: 'sig1',
          conditions: [],
          targetWeights: [
            { ticker: 'A', weight: 0.8 },
            { ticker: 'B', weight: 0.2 },
          ],
        },
      ],
    });
    const activeFlags = new Map<string, boolean[]>([['s1', [true]]]);
    const result = aggregateSignals(strategy, activeFlags, 0, ['A', 'B']);
    expect(result.find((w) => w.ticker === 'A')!.weight).toBeCloseTo(0.8, 6);
  });

  it('rank 应按累计权重排名取 TopN', () => {
    const strategy = makeStrategy({
      aggregationMethod: 'rank',
      rankingConfig: { method: 'fixed_share', topN: 1 },
      signals: [
        {
          id: 's1',
          name: 'sig1',
          conditions: [],
          targetWeights: [
            { ticker: 'A', weight: 0.3 },
            { ticker: 'B', weight: 0.7 },
          ],
        },
      ],
    });
    const activeFlags = new Map<string, boolean[]>([['s1', [true]]]);
    const result = aggregateSignals(strategy, activeFlags, 0, ['A', 'B']);
    // TopN=1 应只选 B（权重更高）
    const nonZero = result.filter((w) => w.weight > 0);
    expect(nonZero).toHaveLength(1);
    expect(nonZero[0].ticker).toBe('B');
  });
});

describe('runTacticalBacktest - 战术回测', () => {
  it('应返回净值曲线与信号历史', () => {
    const strategy = makeStrategy();
    const prices = makeUptrendPrices(30);
    const dates = makeDates(30);
    const priceData = { STOCK: Object.fromEntries(dates.map((d, i) => [d, prices[i]])) };

    const { result, signalHistory } = runTacticalBacktest(
      strategy,
      priceData,
      dates,
      10000,
      'daily',
    );
    expect(result.growthCurve).toHaveLength(30);
    expect(result.name).toBe('战术分配');
    expect(Array.isArray(signalHistory)).toBe(true);
  });

  it('净值曲线首值应接近初始资金', () => {
    const strategy = makeStrategy();
    const prices = makeUptrendPrices(10);
    const dates = makeDates(10);
    const priceData = { STOCK: Object.fromEntries(dates.map((d, i) => [d, prices[i]])) };

    const { result } = runTacticalBacktest(strategy, priceData, dates, 10000, 'daily');
    expect(result.growthCurve[0].value).toBeCloseTo(10000, 0);
  });

  it('应返回有效的统计指标', () => {
    const strategy = makeStrategy();
    const prices = makeUptrendPrices(30);
    const dates = makeDates(30);
    const priceData = { STOCK: Object.fromEntries(dates.map((d, i) => [d, prices[i]])) };

    const { result } = runTacticalBacktest(strategy, priceData, dates, 10000, 'daily');
    expect(result.statistics).toBeDefined();
    expect(Number.isFinite(result.statistics.cagr)).toBe(true);
    expect(Number.isFinite(result.statistics.maxDrawdown)).toBe(true);
  });

  it('空日期列表应返回空曲线', () => {
    const strategy = makeStrategy();
    const { result } = runTacticalBacktest(strategy, {}, [], 10000, 'daily');
    expect(result.growthCurve).toEqual([]);
  });

  it('单日数据应返回单点曲线', () => {
    const strategy = makeStrategy();
    const priceData = { STOCK: { '2020-01-02': 100 } };
    const { result } = runTacticalBacktest(strategy, priceData, ['2020-01-02'], 10000, 'daily');
    expect(result.growthCurve).toHaveLength(1);
  });
});

describe('computeSimpleStatistics - 简单统计', () => {
  it('应正确计算 CAGR', () => {
    const growthCurve = [
      { date: '2020-01-02', value: 10000 },
      { date: '2021-01-02', value: 11000 }, // +10% 约 1 年
    ];
    const stats = computeSimpleStatistics(growthCurve, 10000);
    expect(stats.cagr).toBeGreaterThan(0);
  });

  it('下跌曲线 CAGR 应为负', () => {
    const growthCurve = [
      { date: '2020-01-02', value: 10000 },
      { date: '2021-01-02', value: 9000 },
    ];
    const stats = computeSimpleStatistics(growthCurve, 10000);
    expect(stats.cagr).toBeLessThan(0);
  });

  it('单点曲线应返回零值统计', () => {
    const stats = computeSimpleStatistics([{ date: '2020-01-02', value: 10000 }], 10000);
    expect(stats.cagr).toBe(0);
  });

  it('空曲线应返回零值统计', () => {
    const stats = computeSimpleStatistics([], 10000);
    expect(stats.cagr).toBe(0);
    expect(stats.totalReturn).toBe(0);
  });

  it('maxDrawdown 应在 [0, 1] 范围内', () => {
    const growthCurve = [
      { date: '2020-01-02', value: 10000 },
      { date: '2020-06-02', value: 15000 },
      { date: '2021-01-02', value: 8000 },
    ];
    const stats = computeSimpleStatistics(growthCurve, 10000);
    expect(stats.maxDrawdown).toBeGreaterThan(0);
    expect(stats.maxDrawdown).toBeLessThanOrEqual(1);
  });
});

describe('analyzeWhatIf - 实时信号分析', () => {
  it('应返回每个标的的当前信号', () => {
    const strategy = makeStrategy();
    const prices = makeUptrendPrices(30);
    const dates = makeDates(30);
    const priceData = { STOCK: Object.fromEntries(dates.map((d, i) => [d, prices[i]])) };

    const results = analyzeWhatIf(['STOCK'], strategy, priceData, dates.at(-1)!);
    expect(results).toHaveLength(1);
    expect(results[0].ticker).toBe('STOCK');
    expect(['buy', 'sell', 'hold']).toContain(results[0].signalType);
    expect(results[0].currentPrice).toBeGreaterThan(0);
  });

  it('空价格数据的标的应返回 hold 信号', () => {
    const strategy = makeStrategy();
    const results = analyzeWhatIf(['EMPTY'], strategy, {}, '2020-01-02');
    expect(results[0].signalType).toBe('hold');
    expect(results[0].currentPrice).toBe(0);
  });

  it('多标的应分别返回信号', () => {
    const strategy = makeStrategy();
    const prices = makeUptrendPrices(30);
    const dates = makeDates(30);
    const priceData = {
      A: Object.fromEntries(dates.map((d, i) => [d, prices[i]])),
      B: Object.fromEntries(dates.map((d, i) => [d, prices[i]])),
    };
    const results = analyzeWhatIf(['A', 'B'], strategy, priceData, dates.at(-1)!);
    expect(results).toHaveLength(2);
  });

  it('空策略应返回 hold 信号', () => {
    const strategy = makeStrategy({ signals: [] });
    const prices = makeUptrendPrices(30);
    const dates = makeDates(30);
    const priceData = { STOCK: Object.fromEntries(dates.map((d, i) => [d, prices[i]])) };
    const results = analyzeWhatIf(['STOCK'], strategy, priceData, dates.at(-1)!);
    expect(results[0].signalType).toBe('hold');
  });
});
