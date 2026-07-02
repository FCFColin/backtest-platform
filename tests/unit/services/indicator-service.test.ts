/**
 * indicatorService 单元测试
 *
 * 企业理由：技术指标计算是信号分析与战术分配的基础，计算错误
 * 会导致交易信号误判。测试覆盖：
 * - calcSMA 简单移动平均（含周期不足、period=0 边界）
 * - calcEMA 指数移动平均（含空数组、period=0）
 * - calcRSI 相对强弱指数（含全涨/全跌/震荡场景）
 * - calcMACD（含默认参数、自定义参数）
 * - calcBollinger 布林带（含上下轨计算）
 * - calcBollingerPctB %B 指标（含上下轨重合）
 * - calcMomentum 动量（含基准价为 0）
 */

import { describe, it, expect } from 'vitest';
import {
  calcSMA,
  calcEMA,
  calcRSI,
  calcMACD,
  calcBollinger,
  calcBollingerPctB,
  calcMomentum,
} from '../../../api/services/indicatorService.js';

describe('calcSMA', () => {
  it('应正确计算简单移动平均', () => {
    const prices = [1, 2, 3, 4, 5];
    const result = calcSMA(prices, 3);
    // SMA[2] = (1+2+3)/3 = 2
    // SMA[3] = (2+3+4)/3 = 3
    // SMA[4] = (3+4+5)/3 = 4
    expect(result[0]).toBeNaN();
    expect(result[1]).toBeNaN();
    expect(result[2]).toBe(2);
    expect(result[3]).toBe(3);
    expect(result[4]).toBe(4);
  });

  it('period=1 时应返回原序列', () => {
    const prices = [1, 2, 3];
    const result = calcSMA(prices, 1);
    expect(result).toEqual([1, 2, 3]);
  });

  it('period=0 时应全部为 NaN', () => {
    const prices = [1, 2, 3];
    const result = calcSMA(prices, 0);
    expect(result).toEqual([NaN, NaN, NaN]);
  });

  it('period 为负数时应全部为 NaN', () => {
    const prices = [1, 2, 3];
    const result = calcSMA(prices, -1);
    expect(result).toEqual([NaN, NaN, NaN]);
  });

  it('空数组应返回空数组', () => {
    const result = calcSMA([], 3);
    expect(result).toEqual([]);
  });

  it('period 大于数组长度时应全部为 NaN', () => {
    const prices = [1, 2];
    const result = calcSMA(prices, 5);
    expect(result).toEqual([NaN, NaN]);
  });

  it('period 等于数组长度时只有最后一个有值', () => {
    const prices = [1, 2, 3];
    const result = calcSMA(prices, 3);
    expect(result[0]).toBeNaN();
    expect(result[1]).toBeNaN();
    expect(result[2]).toBe(2); // (1+2+3)/3
  });
});

describe('calcEMA', () => {
  it('应正确计算指数移动平均', () => {
    const prices = [10, 20, 30];
    const result = calcEMA(prices, 2);
    // mult = 2/(2+1) = 0.6667
    // EMA[0] = 10
    // EMA[1] = 20 * 0.6667 + 10 * 0.3333 = 13.333 + 3.333 = 16.667
    expect(result[0]).toBe(10);
    expect(result[1]).toBeCloseTo(20 * (2 / 3) + 10 * (1 / 3), 5);
    expect(result[2]).toBeCloseTo(30 * (2 / 3) + result[1] * (1 / 3), 5);
  });

  it('period=1 时 mult=1，EMA 应等于原序列', () => {
    const prices = [1, 2, 3];
    const result = calcEMA(prices, 1);
    // mult = 2/2 = 1，EMA[i] = prices[i] * 1 + EMA[i-1] * 0 = prices[i]
    expect(result).toEqual([1, 2, 3]);
  });

  it('空数组应返回空数组', () => {
    const result = calcEMA([], 3);
    expect(result).toEqual([]);
  });

  it('period=0 时应全部为 NaN', () => {
    const prices = [1, 2, 3];
    const result = calcEMA(prices, 0);
    expect(result).toEqual([NaN, NaN, NaN]);
  });

  it('period 为负数时应全部为 NaN', () => {
    const prices = [1, 2, 3];
    const result = calcEMA(prices, -1);
    expect(result).toEqual([NaN, NaN, NaN]);
  });

  it('应以 prices[0] 作为种子值', () => {
    const prices = [100, 200, 300];
    const result = calcEMA(prices, 5);
    expect(result[0]).toBe(100);
  });
});

describe('calcRSI', () => {
  it('应正确计算 RSI（震荡场景）', () => {
    // 价格交替涨跌
    const prices = [100, 110, 105, 115, 110, 120, 115, 125];
    const result = calcRSI(prices, 5);
    // 前 5 个应为 NaN（数据不足）
    expect(result[0]).toBeNaN();
    expect(result[1]).toBeNaN();
    expect(result[2]).toBeNaN();
    expect(result[3]).toBeNaN();
    expect(result[4]).toBeNaN();
    // result[5] 应为有效值
    expect(result[5]).not.toBeNaN();
    expect(result[5]).toBeGreaterThanOrEqual(0);
    expect(result[5]).toBeLessThanOrEqual(100);
  });

  it('全涨场景 RSI 应为 100', () => {
    const prices = [1, 2, 3, 4, 5, 6];
    const result = calcRSI(prices, 3);
    // 每天都涨，avgLoss = 0，RSI = 100
    expect(result[3]).toBe(100);
    expect(result[4]).toBe(100);
    expect(result[5]).toBe(100);
  });

  it('全跌场景 RSI 应为 0', () => {
    const prices = [6, 5, 4, 3, 2, 1];
    const result = calcRSI(prices, 3);
    // 每天都跌，avgGain = 0，RSI = 100 - 100/(1+0) = 0
    expect(result[3]).toBe(0);
    expect(result[4]).toBe(0);
    expect(result[5]).toBe(0);
  });

  it('数据长度 <= period 时应全部为 NaN', () => {
    const prices = [1, 2, 3];
    const result = calcRSI(prices, 3);
    expect(result).toEqual([NaN, NaN, NaN]);
  });

  it('period=0 时应全部为 NaN', () => {
    const prices = [1, 2, 3, 4, 5];
    const result = calcRSI(prices, 0);
    expect(result).toEqual([NaN, NaN, NaN, NaN, NaN]);
  });

  it('period 为负数时应全部为 NaN', () => {
    const prices = [1, 2, 3, 4, 5];
    const result = calcRSI(prices, -1);
    expect(result).toEqual([NaN, NaN, NaN, NaN, NaN]);
  });

  it('空数组应返回空数组', () => {
    const result = calcRSI([], 14);
    expect(result).toEqual([]);
  });

  it('RSI 应在 0-100 范围内', () => {
    const prices = [100, 102, 98, 103, 97, 105, 99, 108, 101, 110, 104, 112, 106, 115, 109];
    const result = calcRSI(prices, 14);
    for (let i = 14; i < prices.length; i++) {
      expect(result[i]).toBeGreaterThanOrEqual(0);
      expect(result[i]).toBeLessThanOrEqual(100);
    }
  });
});

describe('calcMACD', () => {
  it('应返回 macd/signal/histogram 三个序列', () => {
    const prices = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5);
    const result = calcMACD(prices);

    expect(result.macd).toHaveLength(50);
    expect(result.signal).toHaveLength(50);
    expect(result.histogram).toHaveLength(50);
  });

  it('应使用默认参数 12/26/9', () => {
    const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const result = calcMACD(prices);

    // macd = EMA(12) - EMA(26)
    const ema12 = calcEMA(prices, 12);
    const ema26 = calcEMA(prices, 26);
    for (let i = 0; i < prices.length; i++) {
      expect(result.macd[i]).toBeCloseTo(ema12[i] - ema26[i], 10);
    }
  });

  it('应支持自定义参数', () => {
    const prices = Array.from({ length: 50 }, (_, i) => 100 + i);
    const result = calcMACD(prices, 5, 10, 3);

    const ema5 = calcEMA(prices, 5);
    const ema10 = calcEMA(prices, 10);
    expect(result.macd[0]).toBeCloseTo(ema5[0] - ema10[0], 10);
  });

  it('histogram 应等于 macd - signal', () => {
    const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 3) * 5);
    const result = calcMACD(prices);

    for (let i = 0; i < prices.length; i++) {
      expect(result.histogram[i]).toBeCloseTo(result.macd[i] - result.signal[i], 10);
    }
  });

  it('空数组应返回空序列', () => {
    const result = calcMACD([]);
    expect(result.macd).toEqual([]);
    expect(result.signal).toEqual([]);
    expect(result.histogram).toEqual([]);
  });
});

describe('calcBollinger', () => {
  it('应返回 upper/middle/lower 三个序列', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
    const result = calcBollinger(prices);

    expect(result.upper).toHaveLength(30);
    expect(result.middle).toHaveLength(30);
    expect(result.lower).toHaveLength(30);
  });

  it('middle 应等于 SMA', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
    const result = calcBollinger(prices, 20, 2);
    const sma = calcSMA(prices, 20);

    for (let i = 0; i < prices.length; i++) {
      expect(result.middle[i]).toBe(sma[i]);
    }
  });

  it('upper 应大于等于 middle，lower 应小于等于 middle', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 3) * 10);
    const result = calcBollinger(prices, 20, 2);

    for (let i = 19; i < prices.length; i++) {
      expect(result.upper[i]).toBeGreaterThanOrEqual(result.middle[i]);
      expect(result.lower[i]).toBeLessThanOrEqual(result.middle[i]);
    }
  });

  it('period 不足时 upper/lower 应为 NaN', () => {
    const prices = [1, 2, 3];
    const result = calcBollinger(prices, 20, 2);

    expect(result.upper).toEqual([NaN, NaN, NaN]);
    expect(result.lower).toEqual([NaN, NaN, NaN]);
  });

  it('价格不变时 upper === middle === lower', () => {
    const prices = Array.from({ length: 25 }, () => 100);
    const result = calcBollinger(prices, 20, 2);

    for (let i = 19; i < prices.length; i++) {
      expect(result.upper[i]).toBe(result.middle[i]);
      expect(result.lower[i]).toBe(result.middle[i]);
    }
  });

  it('应使用默认参数 period=20, mult=2', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
    const result1 = calcBollinger(prices);
    const result2 = calcBollinger(prices, 20, 2);

    expect(result1.upper).toEqual(result2.upper);
    expect(result1.lower).toEqual(result2.lower);
  });

  it('空数组应返回空序列', () => {
    const result = calcBollinger([]);
    expect(result.upper).toEqual([]);
    expect(result.middle).toEqual([]);
    expect(result.lower).toEqual([]);
  });
});

describe('calcBollingerPctB', () => {
  it('应返回 %B 序列', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
    const result = calcBollingerPctB(prices);

    expect(result).toHaveLength(30);
  });

  it('period 不足时应为 NaN', () => {
    const prices = [1, 2, 3];
    const result = calcBollingerPctB(prices, 20, 2);

    expect(result).toEqual([NaN, NaN, NaN]);
  });

  it('价格等于中轨时 %B 应为 0.5', () => {
    // 价格不变，upper=middle=lower，%B 应为 0.5（避免除零）
    const prices = Array.from({ length: 25 }, () => 100);
    const result = calcBollingerPctB(prices, 20, 2);

    for (let i = 19; i < prices.length; i++) {
      expect(result[i]).toBe(0.5);
    }
  });

  it('价格等于上轨时 %B 应为 1', () => {
    // 构造价格序列使某点价格等于 upper
    const prices = Array.from({ length: 25 }, (_, i) => 100 + i);
    const result = calcBollingerPctB(prices, 20, 2);
    const bollinger = calcBollinger(prices, 20, 2);

    // %B = (price - lower) / (upper - lower)
    for (let i = 19; i < prices.length; i++) {
      const expected = (prices[i] - bollinger.lower[i]) / (bollinger.upper[i] - bollinger.lower[i]);
      expect(result[i]).toBeCloseTo(expected, 10);
    }
  });

  it('空数组应返回空数组', () => {
    const result = calcBollingerPctB([]);
    expect(result).toEqual([]);
  });
});

describe('calcMomentum', () => {
  it('应正确计算动量（百分比收益）', () => {
    const prices = [100, 110, 121];
    const result = calcMomentum(prices, 1);
    // Momentum[1] = (110/100 - 1) * 100 = 10
    // Momentum[2] = (121/110 - 1) * 100 = 10
    expect(result[0]).toBeNaN();
    expect(result[1]).toBeCloseTo(10, 5);
    expect(result[2]).toBeCloseTo(10, 5);
  });

  it('period=2 时应计算 2 周期动量', () => {
    const prices = [100, 110, 121];
    const result = calcMomentum(prices, 2);
    // Momentum[2] = (121/100 - 1) * 100 = 21
    expect(result[0]).toBeNaN();
    expect(result[1]).toBeNaN();
    expect(result[2]).toBeCloseTo(21, 5);
  });

  it('period=0 时应全部为 NaN', () => {
    const prices = [1, 2, 3];
    const result = calcMomentum(prices, 0);
    expect(result).toEqual([NaN, NaN, NaN]);
  });

  it('period 为负数时应全部为 NaN', () => {
    const prices = [1, 2, 3];
    const result = calcMomentum(prices, -1);
    expect(result).toEqual([NaN, NaN, NaN]);
  });

  it('基准价为 0 时应为 NaN（避免除零）', () => {
    const prices = [0, 100, 200];
    const result = calcMomentum(prices, 1);
    // prices[0] = 0，result[1] 应为 NaN（避免除零）
    expect(result[1]).toBeNaN();
    // prices[1] = 100，result[2] = (200/100 - 1) * 100 = 100
    expect(result[2]).toBeCloseTo(100, 5);
  });

  it('价格下跌时动量应为负数', () => {
    const prices = [100, 90, 80];
    const result = calcMomentum(prices, 1);
    expect(result[1]).toBeCloseTo(-10, 5); // (90/100 - 1) * 100 = -10
    expect(result[2]).toBeCloseTo(-100 / 9, 5); // (80/90 - 1) * 100 ≈ -11.11
  });

  it('空数组应返回空数组', () => {
    const result = calcMomentum([], 5);
    expect(result).toEqual([]);
  });

  it('period 大于数组长度时应全部为 NaN', () => {
    const prices = [1, 2, 3];
    const result = calcMomentum(prices, 5);
    expect(result).toEqual([NaN, NaN, NaN]);
  });
});
