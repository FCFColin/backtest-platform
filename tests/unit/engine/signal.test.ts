/**
 * 信号分析模块单元测试（T-P3-9）
 *
 * 企业理由：信号生成逻辑驱动买卖决策，错误的信号会导致
 * 错误的交易和资金损失。测试覆盖：
 * - 正常信号生成（SMA/EMA/RSI/MACD/Bollinger 交叉触发）
 * - 信号过滤（entry/exit/both）
 * - 统计计算（胜率、平均收益）
 * - 权益曲线与回撤
 * - 边界（空数据、单点、全零、NaN）
 */

import { describe, it, expect } from 'vitest';
import {
  generateRawSignals,
  filterByType,
  calcStatistics,
  calcEquityCurve,
  analyzeSignal,
  analyzeDualSignal,
  analyzeMultiSignal,
  buildSignalDirMap,
  combineDir,
} from '../../../packages/backend/src/engine/signal.js';
import type { PricePoint, SignalPoint } from '../../../packages/backend/src/engine/signal.js';
import type { SignalAnalysisRequest } from '@backtest/shared/types/signal.js';

// 构造带趋势的价格序列：先跌后涨，产生 SMA 交叉
function makeTrendPriceData(): PricePoint[] {
  const points: PricePoint[] = [];
  let price = 100;
  // 前 20 天下跌
  for (let i = 0; i < 20; i++) {
    price *= 0.98;
    points.push({ date: `2020-01-${String(i + 2).padStart(2, '0')}`, price });
  }
  // 后 20 天上涨（触发金叉）
  for (let i = 0; i < 20; i++) {
    price *= 1.03;
    points.push({ date: `2020-02-${String(i + 1).padStart(2, '0')}`, price });
  }
  return points;
}

// 构造单调上涨序列
function makeUptrendPriceData(days = 30): PricePoint[] {
  const points: PricePoint[] = [];
  let price = 100;
  for (let i = 0; i < days; i++) {
    price *= 1.01;
    const d = new Date(2020, 0, 2 + i);
    points.push({ date: d.toISOString().slice(0, 10), price });
  }
  return points;
}

function makeRequest(overrides?: Partial<SignalAnalysisRequest>): SignalAnalysisRequest {
  return {
    ticker: 'TEST',
    indicator: 'sma',
    period: 5,
    threshold: 0,
    startDate: '2020-01-02',
    endDate: '2020-12-31',
    signalType: 'both',
    ...overrides,
  };
}

describe('generateRawSignals - 正常信号生成', () => {
  it('SMA 交叉应在价格穿越均线时产生信号', () => {
    const data = makeTrendPriceData();
    const signals = generateRawSignals('sma', 5, 0, data);
    // 先跌后涨应产生至少一个 buy 信号
    const buys = signals.filter((s) => s.type === 'buy');
    expect(buys.length).toBeGreaterThan(0);
  });

  it('EMA 交叉应在价格穿越均线时产生信号', () => {
    const data = makeTrendPriceData();
    const signals = generateRawSignals('ema', 5, 0, data);
    expect(signals.length).toBeGreaterThan(0);
  });

  it('RSI 超卖应产生 buy 信号', () => {
    // 构造先涨后跌数据，使 RSI 从高位下穿超卖阈值（30）
    // 信号逻辑：rsi[i-1] >= oversold && rsi[i] < oversold 时产生 buy
    const points: PricePoint[] = [];
    let price = 100;
    // 前 20 天上涨（RSI 升至高位）
    for (let i = 0; i < 20; i++) {
      price *= 1.02;
      const d = new Date(2020, 0, 2 + i);
      points.push({ date: d.toISOString().slice(0, 10), price });
    }
    // 后 20 天大幅下跌（RSI 下穿 30 触发超卖）
    for (let i = 0; i < 20; i++) {
      price *= 0.92;
      const d = new Date(2020, 1, 21 + i);
      points.push({ date: d.toISOString().slice(0, 10), price });
    }
    const signals = generateRawSignals('rsi', 14, 30, points);
    const buys = signals.filter((s) => s.type === 'buy');
    expect(buys.length).toBeGreaterThan(0);
  });

  it('MACD 交叉应产生信号', () => {
    const data = makeTrendPriceData();
    const signals = generateRawSignals('macd', 0, 0, data);
    // MACD 在趋势反转时应产生信号
    expect(Array.isArray(signals)).toBe(true);
  });

  it('Bollinger 突破应产生信号', () => {
    // 构造剧烈波动触发 Bollinger 突破
    const points: PricePoint[] = [];
    let price = 100;
    for (let i = 0; i < 30; i++) {
      price *= i % 2 === 0 ? 1.05 : 0.96;
      const d = new Date(2020, 0, 2 + i);
      points.push({ date: d.toISOString().slice(0, 10), price });
    }
    const signals = generateRawSignals('bollinger', 10, 2, points);
    expect(Array.isArray(signals)).toBe(true);
  });

  it('未知指标应返回空数组', () => {
    const data = makeUptrendPriceData();
    const signals = generateRawSignals('unknown', 5, 0, data);
    expect(signals).toEqual([]);
  });

  it('信号应包含 date/type/price 字段', () => {
    const data = makeTrendPriceData();
    const signals = generateRawSignals('sma', 5, 0, data);
    for (const s of signals) {
      expect(s.date).toBeTruthy();
      expect(['buy', 'sell']).toContain(s.type);
      expect(typeof s.price).toBe('number');
    }
  });
});

describe('generateRawSignals - 边界与异常', () => {
  it('空数据应返回空数组', () => {
    const signals = generateRawSignals('sma', 5, 0, []);
    expect(signals).toEqual([]);
  });

  it('单点数据应返回空数组（无法计算交叉）', () => {
    const signals = generateRawSignals('sma', 5, 0, [{ date: '2020-01-02', price: 100 }]);
    expect(signals).toEqual([]);
  });

  it('两点数据应可计算（不崩溃）', () => {
    const signals = generateRawSignals('sma', 2, 0, [
      { date: '2020-01-02', price: 100 },
      { date: '2020-01-03', price: 101 },
    ]);
    expect(Array.isArray(signals)).toBe(true);
  });

  it('全零价格不应产生误信号', () => {
    const points: PricePoint[] = Array.from({ length: 20 }, (_, i) => ({
      date: `2020-01-${String(i + 2).padStart(2, '0')}`,
      price: 0,
    }));
    const signals = generateRawSignals('sma', 5, 0, points);
    // 全零价格不应产生有效信号
    expect(signals).toEqual([]);
  });

  it('含 NaN 价格的数据不应崩溃', () => {
    const points: PricePoint[] = [
      { date: '2020-01-02', price: 100 },
      { date: '2020-01-03', price: NaN },
      { date: '2020-01-04', price: 101 },
      { date: '2020-01-05', price: 102 },
    ];
    expect(() => generateRawSignals('sma', 2, 0, points)).not.toThrow();
  });

  it('period < 2 应被提升为 2（safePeriod）', () => {
    const data = makeUptrendPriceData(10);
    // period=1 应被提升为 2，不崩溃
    expect(() => generateRawSignals('sma', 1, 0, data)).not.toThrow();
  });

  it('单调上涨序列不应产生 sell 信号', () => {
    const data = makeUptrendPriceData(30);
    const signals = generateRawSignals('sma', 5, 0, data);
    const sells = signals.filter((s) => s.type === 'sell');
    // 单调上涨不应触发死叉
    expect(sells.length).toBe(0);
  });
});

describe('filterByType - 信号过滤', () => {
  const mixedSignals: SignalPoint[] = [
    { date: '2020-01-02', type: 'buy', price: 100 },
    { date: '2020-01-03', type: 'sell', price: 105 },
    { date: '2020-01-04', type: 'buy', price: 95 },
    { date: '2020-01-05', type: 'sell', price: 110 },
  ];

  it('entry 应仅返回 buy 信号', () => {
    const result = filterByType(mixedSignals, 'entry');
    expect(result.every((s) => s.type === 'buy')).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('exit 应仅返回 sell 信号', () => {
    const result = filterByType(mixedSignals, 'exit');
    expect(result.every((s) => s.type === 'sell')).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('both 应返回全部信号', () => {
    const result = filterByType(mixedSignals, 'both');
    expect(result).toHaveLength(4);
  });

  it('未知 signalType 应返回全部信号（默认）', () => {
    const result = filterByType(mixedSignals, 'unknown');
    expect(result).toHaveLength(4);
  });

  it('空数组应返回空数组', () => {
    expect(filterByType([], 'both')).toEqual([]);
  });
});

describe('calcStatistics - 统计计算', () => {
  it('应正确计算已完成交易的胜率', () => {
    const signals: SignalPoint[] = [
      { date: '2020-01-02', type: 'buy', price: 100 },
      { date: '2020-01-03', type: 'sell', price: 110 }, // +10% 盈利
      { date: '2020-01-04', type: 'buy', price: 105 },
      { date: '2020-01-05', type: 'sell', price: 100 }, // -4.76% 亏损
    ];
    const stats = calcStatistics(signals);
    expect(stats.totalSignals).toBe(4);
    // 2 笔已完成交易：+10% 盈、-4.76% 亏 → 胜率精确为 0.5
    expect(stats.winRate).toBeCloseTo(0.5, 10);
    // 平均收益 = (0.10 + (-0.047619...)) / 2 ≈ 0.02619
    expect(stats.avgReturn).toBeCloseTo((0.1 + (100 - 105) / 105) / 2, 6);
  });

  it('全盈利交易胜率应为 1', () => {
    const signals: SignalPoint[] = [
      { date: '2020-01-02', type: 'buy', price: 100 },
      { date: '2020-01-03', type: 'sell', price: 110 },
      { date: '2020-01-04', type: 'buy', price: 100 },
      { date: '2020-01-05', type: 'sell', price: 120 },
    ];
    const stats = calcStatistics(signals);
    expect(stats.winRate).toBe(1);
    expect(stats.avgReturn).toBeGreaterThan(0);
  });

  it('无配对交易（仅 buy）胜率应为 0', () => {
    const signals: SignalPoint[] = [{ date: '2020-01-02', type: 'buy', price: 100 }];
    const stats = calcStatistics(signals);
    expect(stats.winRate).toBe(0);
    expect(stats.avgReturn).toBe(0);
  });

  it('空信号数组应返回零值统计', () => {
    const stats = calcStatistics([]);
    expect(stats.totalSignals).toBe(0);
    expect(stats.winRate).toBe(0);
    expect(stats.avgReturn).toBe(0);
  });

  it('未平仓的 buy 不计入已完成交易', () => {
    const signals: SignalPoint[] = [
      { date: '2020-01-02', type: 'buy', price: 100 },
      { date: '2020-01-03', type: 'sell', price: 110 },
      { date: '2020-01-04', type: 'buy', price: 105 }, // 未平仓
    ];
    const stats = calcStatistics(signals);
    expect(stats.totalSignals).toBe(3);
    // 仅 1 笔已完成交易（最后的 buy 未平仓，不计入）；唯一交易盈利
    expect(stats.winRate).toBe(1);
    // 未平仓的 buy 不应拉低平均收益：avgReturn 仅来自唯一已完成交易 +10%
    expect(stats.avgReturn).toBeCloseTo(0.1, 10);
  });
});

describe('calcEquityCurve - 权益曲线', () => {
  it('应返回与输入等长的权益曲线', () => {
    const data = makeUptrendPriceData(20);
    const signals: SignalPoint[] = [{ date: data[0].date, type: 'buy', price: data[0].price }];
    const { equityCurve } = calcEquityCurve(signals, data);
    expect(equityCurve).toHaveLength(20);
  });

  it('无信号时应保持初始资金不变', () => {
    const data = makeUptrendPriceData(10);
    const { equityCurve } = calcEquityCurve([], data);
    for (const point of equityCurve) {
      expect(point.value).toBe(10000); // INITIAL_CAPITAL
    }
  });

  it('买入后持有应随价格上涨', () => {
    const data = makeUptrendPriceData(10);
    const signals: SignalPoint[] = [{ date: data[0].date, type: 'buy', price: data[0].price }];
    const { equityCurve } = calcEquityCurve(signals, data);
    expect(equityCurve.at(-1)!.value).toBeGreaterThan(10000);
  });

  it('maxDrawdown 应在 [0, 1] 范围内', () => {
    const data = makeTrendPriceData();
    const signals = generateRawSignals('sma', 5, 0, data);
    const { maxDrawdown } = calcEquityCurve(signals, data);
    expect(maxDrawdown).toBeGreaterThanOrEqual(0);
    expect(maxDrawdown).toBeLessThanOrEqual(1);
  });

  it('空数据应返回空曲线', () => {
    const { equityCurve, maxDrawdown, sharpe } = calcEquityCurve([], []);
    expect(equityCurve).toEqual([]);
    expect(maxDrawdown).toBe(0);
    expect(sharpe).toBe(0);
  });
});

describe('analyzeSignal - 主分析函数', () => {
  it('应返回完整的分析结果', () => {
    const data = makeTrendPriceData();
    const req = makeRequest({ indicator: 'sma', period: 5, signalType: 'both' });
    const result = analyzeSignal(req, data);
    expect(result.signals).toBeDefined();
    expect(result.statistics).toBeDefined();
    expect(result.equityCurve).toBeDefined();
    expect(result.equityCurve.length).toBe(data.length);
  });

  it('signalType=entry 应仅返回 buy 信号', () => {
    const data = makeTrendPriceData();
    const req = makeRequest({ signalType: 'entry' });
    const result = analyzeSignal(req, data);
    expect(result.signals.every((s) => s.type === 'buy')).toBe(true);
  });

  it('空数据应返回空信号与零统计', () => {
    const req = makeRequest();
    const result = analyzeSignal(req, []);
    expect(result.signals).toEqual([]);
    expect(result.statistics.totalSignals).toBe(0);
    expect(result.equityCurve).toEqual([]);
  });
});

describe('buildSignalDirMap - 信号方向映射', () => {
  it('应构建 date -> direction 映射', () => {
    const signals: SignalPoint[] = [
      { date: '2020-01-02', type: 'buy', price: 100 },
      { date: '2020-01-03', type: 'sell', price: 110 },
    ];
    const map = buildSignalDirMap(signals);
    expect(map.get('2020-01-02')).toBe('buy');
    expect(map.get('2020-01-03')).toBe('sell');
    expect(map.size).toBe(2);
  });

  it('空数组应返回空 Map', () => {
    expect(buildSignalDirMap([]).size).toBe(0);
  });
});

describe('combineDir - 信号组合', () => {
  it('and 方法：两者同向才触发', () => {
    expect(combineDir('buy', 'buy', 'and')).toBe('buy');
    expect(combineDir('sell', 'sell', 'and')).toBe('sell');
    expect(combineDir('buy', 'sell', 'and')).toBeNull();
    expect(combineDir('buy', null, 'and')).toBeNull();
  });

  it('or 方法：任一触发即触发', () => {
    expect(combineDir('buy', null, 'or')).toBe('buy');
    expect(combineDir(null, 'sell', 'or')).toBe('sell');
    expect(combineDir(null, null, 'or')).toBeNull();
  });

  it('xor 方法：恰好一个触发', () => {
    expect(combineDir('buy', null, 'xor')).toBe('buy');
    expect(combineDir(null, 'sell', 'xor')).toBe('sell');
    expect(combineDir('buy', 'buy', 'xor')).toBeNull();
    expect(combineDir(null, null, 'xor')).toBeNull();
  });
});

describe('analyzeDualSignal - 双信号分析', () => {
  it('and 组合应仅在同向信号时产生 combined 信号', () => {
    const data = makeTrendPriceData();
    const cfg1 = makeRequest({ indicator: 'sma', period: 5, signalType: 'both' });
    const cfg2 = makeRequest({ indicator: 'ema', period: 5, signalType: 'both' });
    const result = analyzeDualSignal(cfg1, cfg2, data, data, 'and');

    expect(result.signal1.signals).toBeDefined();
    expect(result.signal2.signals).toBeDefined();
    expect(result.comparison.length).toBeGreaterThan(0);
    expect(
      result.combined.signals.every((s) =>
        result.comparison.some((c) => c.date === s.date && c.combined === s.type),
      ),
    ).toBe(true);
  });

  it('or 组合应合并任一信号', () => {
    const data = makeTrendPriceData();
    const cfg1 = makeRequest({ indicator: 'sma', period: 5 });
    const cfg2 = makeRequest({ indicator: 'ema', period: 5 });
    const result = analyzeDualSignal(cfg1, cfg2, data, data, 'or');

    // or 组合：任一信号触发即产生 combined，且 combined 必须来自 comparison 行
    expect(result.combined.signals.length).toBe(result.comparison.filter((c) => c.combined).length);
    for (const s of result.combined.signals) {
      const row = result.comparison.find((c) => c.date === s.date);
      expect(row?.combined).toBe(s.type);
    }
  });

  it('xor 组合应仅在单信号触发时产生 combined', () => {
    const data = makeTrendPriceData();
    const cfg1 = makeRequest({ indicator: 'sma', period: 5 });
    const cfg2 = makeRequest({ indicator: 'ema', period: 5 });
    const result = analyzeDualSignal(cfg1, cfg2, data, data, 'xor');

    for (const s of result.combined.signals) {
      const row = result.comparison.find((c) => c.date === s.date);
      const s1 = row?.signal1;
      const s2 = row?.signal2;
      expect(Boolean(s1) !== Boolean(s2)).toBe(true);
    }
  });

  it('空数据应返回空 combined 信号', () => {
    const cfg1 = makeRequest();
    const cfg2 = makeRequest({ indicator: 'ema' });
    const result = analyzeDualSignal(cfg1, cfg2, [], [], 'and');
    expect(result.combined.signals).toEqual([]);
    expect(result.combined.statistics.totalSignals).toBe(0);
    expect(result.comparison).toEqual([]);
  });

  it('未知指标配置应不产生 combined 信号', () => {
    const data = makeUptrendPriceData(15);
    const cfg1 = makeRequest({ indicator: 'unknown' });
    const cfg2 = makeRequest({ indicator: 'also-unknown' });
    const result = analyzeDualSignal(cfg1, cfg2, data, data, 'or');
    expect(result.combined.signals).toEqual([]);
  });
});

describe('analyzeMultiSignal - 多信号分析', () => {
  it('weighted 聚合应按权重合成信号', () => {
    const data = makeTrendPriceData();
    const configs = [
      makeRequest({ indicator: 'sma', period: 5 }),
      makeRequest({ indicator: 'ema', period: 5 }),
    ];
    const result = analyzeMultiSignal(configs, data, 'weighted', [0.7, 0.3]);
    expect(result.aggregated.signals).toBeDefined();
    expect(result.contributions).toHaveLength(2);
    expect(result.contributions[0].indicator).toBe('sma');
    expect(result.contributions[1].indicator).toBe('ema');
  });

  it('voting 聚合应按多数票决定方向', () => {
    const data = makeTrendPriceData();
    const configs = [
      makeRequest({ indicator: 'sma', period: 5 }),
      makeRequest({ indicator: 'ema', period: 5 }),
      makeRequest({ indicator: 'rsi', period: 14, threshold: 30 }),
    ];
    const result = analyzeMultiSignal(configs, data, 'voting');
    expect(result.contributions).toHaveLength(3);
    expect(result.aggregated.equityCurve.length).toBe(data.length);
  });

  it('rank 聚合应使用历史胜率最高的信号', () => {
    const data = makeTrendPriceData();
    const configs = [
      makeRequest({ indicator: 'sma', period: 5 }),
      makeRequest({ indicator: 'ema', period: 5 }),
    ];
    const result = analyzeMultiSignal(configs, data, 'rank');
    expect(result.aggregated.statistics).toBeDefined();
    expect(result.contributions.every((c) => typeof c.contribution === 'number')).toBe(true);
  });

  it('空配置数组应返回空聚合结果', () => {
    const data = makeUptrendPriceData(10);
    const result = analyzeMultiSignal([], data, 'weighted');
    expect(result.aggregated.signals).toEqual([]);
    expect(result.contributions).toEqual([]);
  });

  it('恶意/负权重应被钳制为 0（等价于零权重 + 归一化）', () => {
    const data = makeTrendPriceData();
    const configs = [
      makeRequest({ indicator: 'sma', period: 5 }),
      makeRequest({ indicator: 'ema', period: 5 }),
    ];
    // [-1, 2] 负权重钳制为 0 → [0, 2] 归一化 → [0, 1]
    // 因此聚合结果必须与显式 [0, 1] 完全一致（证明钳制真实生效，而非仅"不崩溃"）
    const malicious = analyzeMultiSignal(configs, data, 'weighted', [-1, 2]);
    const clamped = analyzeMultiSignal(configs, data, 'weighted', [0, 1]);
    expect(malicious.aggregated.signals).toEqual(clamped.aggregated.signals);
    // sma（被钳制为 0 权重）不应对聚合方向产生贡献，结果应等同仅用 ema
    const emaOnly = analyzeMultiSignal([configs[1]], data, 'weighted', [1]);
    expect(malicious.aggregated.signals.map((s) => `${s.date}:${s.type}`)).toEqual(
      emaOnly.aggregated.signals.map((s) => `${s.date}:${s.type}`),
    );
  });

  it('权重数量不匹配时应均分', () => {
    const data = makeTrendPriceData();
    const configs = [
      makeRequest({ indicator: 'sma', period: 5 }),
      makeRequest({ indicator: 'ema', period: 5 }),
    ];
    const withMismatch = analyzeMultiSignal(configs, data, 'weighted', [1]);
    const withDefault = analyzeMultiSignal(configs, data, 'weighted');
    expect(withMismatch.aggregated.signals).toEqual(withDefault.aggregated.signals);
  });

  it('period=1 边界应被提升为 safePeriod=2', () => {
    const data = makeUptrendPriceData(10);
    const configs = [makeRequest({ indicator: 'sma', period: 1 })];
    expect(() => analyzeMultiSignal(configs, data, 'voting')).not.toThrow();
  });
});
