import { describe, it, expect } from 'vitest';
import {
  calcCAGR,
  calcMWRR,
  calcAnnualizedStdev,
  calcSharpe,
  calcMaxDrawdown,
  calcCorrelation,
  calcDailyReturns,
} from '../../../packages/backend/src/engine/statistics.js';

describe('calcCAGR', () => {
  it('计算正常CAGR', () => {
    // 10000 → 20000，5年，CAGR ≈ 14.87%
    const cagr = calcCAGR(10000, 20000, 5);
    expect(cagr).toBeCloseTo(0.1487, 3);
  });

  it('零增长返回0', () => {
    expect(calcCAGR(10000, 10000, 5)).toBe(0);
  });

  it('负增长返回负值', () => {
    const cagr = calcCAGR(10000, 5000, 5);
    expect(cagr).toBeLessThan(0);
  });

  it('非法输入返回0', () => {
    expect(calcCAGR(0, 20000, 5)).toBe(0);
    expect(calcCAGR(10000, 0, 5)).toBe(0);
    expect(calcCAGR(10000, 20000, 0)).toBe(0);
    expect(calcCAGR(-10000, 20000, 5)).toBe(0);
  });
});

describe('calcMWRR', () => {
  it('简单投入场景', () => {
    // 投入10000，5年后收回20000
    const mwrr = calcMWRR([
      { value: -10000, time: 0 },
      { value: 20000, time: 5 },
    ]);
    expect(mwrr).toBeCloseTo(0.1487, 2);
  });

  it('空现金流返回0', () => {
    expect(calcMWRR([])).toBe(0);
  });
});

describe('calcAnnualizedStdev', () => {
  it('常数收益率波动率为0', () => {
    expect(calcAnnualizedStdev([0.01, 0.01, 0.01, 0.01])).toBe(0);
  });

  it('有波动的收益率返回正值', () => {
    const stdev = calcAnnualizedStdev([0.01, -0.02, 0.03, -0.01, 0.02]);
    expect(stdev).toBeGreaterThan(0);
  });

  it('少于2个数据返回0', () => {
    expect(calcAnnualizedStdev([0.01])).toBe(0);
    expect(calcAnnualizedStdev([])).toBe(0);
  });
});

describe('calcSharpe', () => {
  it('正常计算', () => {
    const sharpe = calcSharpe(0.1, 0.15);
    // (0.10 - 0.02) / 0.15 ≈ 0.533
    expect(sharpe).toBeCloseTo(0.533, 2);
  });

  it('波动率为0返回0', () => {
    expect(calcSharpe(0.1, 0)).toBe(0);
  });
});

describe('calcMaxDrawdown', () => {
  it('单调递增无回撤', () => {
    const { maxDrawdown, maxDrawdownDuration } = calcMaxDrawdown([100, 110, 120, 130]);
    expect(maxDrawdown).toBe(0);
    expect(maxDrawdownDuration).toBe(0);
  });

  it('简单回撤', () => {
    // 100 → 120 → 90 → 110
    // 最大回撤 = (120-90)/120 = 25%
    const { maxDrawdown } = calcMaxDrawdown([100, 120, 90, 110]);
    expect(maxDrawdown).toBeCloseTo(0.25, 3);
  });

  it('少于2个数据返回0', () => {
    expect(calcMaxDrawdown([100])).toEqual({ maxDrawdown: 0, maxDrawdownDuration: 0 });
  });
});

describe('calcCorrelation', () => {
  it('完全正相关', () => {
    const r = calcCorrelation([1, 2, 3, 4], [2, 4, 6, 8]);
    expect(r).toBeCloseTo(1, 5);
  });

  it('完全负相关', () => {
    const r = calcCorrelation([1, 2, 3, 4], [8, 6, 4, 2]);
    expect(r).toBeCloseTo(-1, 5);
  });

  it('少于2个数据返回0', () => {
    expect(calcCorrelation([1], [2])).toBe(0);
  });
});

describe('calcDailyReturns', () => {
  it('正常计算', () => {
    const returns = calcDailyReturns([100, 110, 105]);
    expect(returns).toHaveLength(2);
    expect(returns[0]).toBeCloseTo(0.1, 5); // (110-100)/100
    expect(returns[1]).toBeCloseTo(-0.04545, 4); // (105-110)/110
  });

  it('前值为0返回0', () => {
    expect(calcDailyReturns([0, 100])).toEqual([0]);
  });
});
