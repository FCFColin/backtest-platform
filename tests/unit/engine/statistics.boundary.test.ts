import { describe, it, expect } from 'vitest';
import {
  calcCAGR,
  calcMWRR,
  calcAnnualizedStdev,
  calcSharpe,
  calcSortino,
  calcMaxDrawdown,
  calcCorrelation,
  calcDailyReturns,
} from '../../../api/engine/statistics.js';

// ===== calcCAGR 边界测试 =====
describe('calcCAGR - 边界', () => {
  it('极小正收益', () => {
    expect(calcCAGR(10000, 10001, 1)).toBeCloseTo(0.0001, 4);
  });

  it('极小负收益', () => {
    expect(calcCAGR(10000, 9999, 1)).toBeCloseTo(-0.0001, 4);
  });

  it('亏损99%', () => {
    expect(calcCAGR(10000, 100, 1)).toBeCloseTo(-0.99, 2);
  });

  it('翻100倍', () => {
    expect(calcCAGR(100, 10000, 1)).toBeCloseTo(99, 0);
  });

  it('1年vs10年：相同终值，年化不同', () => {
    const cagr1 = calcCAGR(10000, 20000, 1);
    const cagr10 = calcCAGR(10000, 20000, 10);
    expect(cagr1).toBeGreaterThan(cagr10); // 1年翻倍年化更高
  });

  it('极短时间（0.01年）', () => {
    const cagr = calcCAGR(10000, 10100, 0.01);
    expect(cagr).toBeGreaterThan(0);
    expect(isFinite(cagr)).toBe(true);
  });

  it('NaN输入', () => {
    expect(calcCAGR(NaN, 20000, 5)).toBe(0);
    expect(calcCAGR(10000, NaN, 5)).toBe(0);
  });

  it('Infinity输入', () => {
    expect(calcCAGR(Infinity, 20000, 5)).toBe(0);
    expect(calcCAGR(10000, Infinity, 5)).toBe(0);
  });
});

// ===== calcMWRR 边界测试 =====
describe('calcMWRR - 边界', () => {
  it('亏损场景', () => {
    const mwrr = calcMWRR([
      { value: -10000, time: 0 },
      { value: 5000, time: 5 },
    ]);
    expect(mwrr).toBeLessThan(0);
  });

  it('多个现金流', () => {
    const mwrr = calcMWRR([
      { value: -5000, time: 0 },
      { value: -5000, time: 1 },
      { value: 25000, time: 5 },
    ]);
    expect(mwrr).toBeGreaterThan(0);
  });

  it('time=0的现金流', () => {
    const mwrr = calcMWRR([
      { value: -10000, time: 0 },
      { value: 10000, time: 0 },
    ]);
    // 两个time=0的等额现金流，NPV恒为0，MWRR不确定但应在合理范围
    expect(Math.abs(mwrr)).toBeLessThan(1);
  });
});

// ===== calcAnnualizedStdev 边界测试 =====
describe('calcAnnualizedStdev - 边界', () => {
  it('单一极端值', () => {
    const stdev = calcAnnualizedStdev([0.01, 0.01, 0.01, -0.5]); // 一个暴跌日
    expect(stdev).toBeGreaterThan(0.5); // 波动率应该很大
  });

  it('NaN 输入返回 NaN（区别于常数收益率返回0）', () => {
    // 与 statistics.test.ts 中 "常数收益率波动率为0" 不同：此处测试 NaN 传播
    const stdev = calcAnnualizedStdev([0.01, NaN, 0.02]);
    expect(Number.isNaN(stdev)).toBe(true);
  });

  it('大量数据点', () => {
    const returns = Array.from({ length: 10000 }, () => (Math.random() - 0.5) * 0.02);
    const stdev = calcAnnualizedStdev(returns);
    expect(stdev).toBeGreaterThan(0);
    expect(isFinite(stdev)).toBe(true);
  });
});

// ===== calcSharpe 边界测试 =====
describe('calcSharpe - 边界', () => {
  it('负收益正波动', () => {
    const sharpe = calcSharpe(-0.1, 0.2);
    expect(sharpe).toBeLessThan(0);
  });

  it('自定义无风险利率', () => {
    const sharpe = calcSharpe(0.1, 0.15, 0.05);
    expect(sharpe).toBeCloseTo(0.333, 2);
  });

  it('NaN 输入返回 NaN（区别于零波动率返回0）', () => {
    // 与 statistics.test.ts 中 "波动率为0返回0" 不同：此处测试 NaN 传播
    const sharpe = calcSharpe(NaN, 0.15);
    expect(Number.isNaN(sharpe)).toBe(true);
  });

  it('Infinity 波动率返回有限值', () => {
    // 与零波动率不同：Infinity 波动率使 Sharpe 趋近于 0
    const sharpe = calcSharpe(0.1, Infinity);
    expect(sharpe).toBeCloseTo(0, 10);
  });
});

// ===== calcSortino 边界测试 =====
describe('calcSortino - 边界', () => {
  it('全部正收益', () => {
    const sortino = calcSortino(0.1, [0.01, 0.02, 0.015, 0.008]);
    expect(sortino).toBeGreaterThan(0);
  });

  it('全部负收益', () => {
    const sortino = calcSortino(-0.1, [-0.01, -0.02, -0.015]);
    expect(sortino).toBeLessThan(0);
  });

  it('空数组', () => {
    expect(calcSortino(0.1, [])).toBe(0);
  });
});

// ===== calcSortino Infinity分支测试 =====
describe('calcSortino - Infinity分支', () => {
  it('全部收益>无风险利率且cagr>无风险利率，返回Infinity', () => {
    // 日无风险利率 ≈ 0.0000768
    // 所有日收益都大于无风险利率
    const dailyReturns = [0.01, 0.02, 0.015, 0.008, 0.012];
    const sortino = calcSortino(0.2, dailyReturns);
    expect(sortino).toBe(Infinity);
  });

  it('全部收益>无风险利率但cagr<无风险利率，返回0', () => {
    const dailyReturns = [0.001, 0.002, 0.0015, 0.0018];
    const sortino = calcSortino(0.01, dailyReturns); // cagr=1% < riskFreeRate=2%
    expect(sortino).toBe(0);
  });

  it('downsideDeviation=0时返回0', () => {
    // 所有收益恰好等于无风险利率（极端情况）
    const dailyReturns = new Array(10).fill(0);
    const sortino = calcSortino(0.02, dailyReturns);
    expect(sortino).toBe(0);
  });
});

// ===== calcMaxDrawdown 边界测试 =====
describe('calcMaxDrawdown - 边界', () => {
  it('先跌后涨再跌，取最大回撤', () => {
    // 100 → 80 → 120 → 60
    // DD1: (100-80)/100 = 20%
    // DD2: (120-60)/120 = 50%
    const { maxDrawdown } = calcMaxDrawdown([100, 80, 120, 60]);
    expect(maxDrawdown).toBeCloseTo(0.5, 3);
  });

  it('持续下跌', () => {
    const { maxDrawdown } = calcMaxDrawdown([100, 90, 80, 70, 60]);
    expect(maxDrawdown).toBeCloseTo(0.4, 3); // (100-60)/100
  });

  it('V型反转', () => {
    const { maxDrawdown } = calcMaxDrawdown([100, 50, 100]);
    expect(maxDrawdown).toBeCloseTo(0.5, 3);
  });

  it('包含0值（爆仓场景）', () => {
    const { maxDrawdown } = calcMaxDrawdown([100, 50, 0, 0]);
    expect(maxDrawdown).toBe(1); // 100%回撤
  });

  it('回撤持续时间', () => {
    // 100 → 120 → 110 → 105 → 130
    // peak在120(idx=1)，回撤持续到idx=3
    const { maxDrawdownDuration } = calcMaxDrawdown([100, 120, 110, 105, 130]);
    expect(maxDrawdownDuration).toBe(2); // idx3 - idx1 = 2
  });

  it('NaN 输入：NaN 值不更新 peak，回撤计算受影响（区别于少于2个数据返回0）', () => {
    // 与 statistics.test.ts 中 "少于2个数据返回0" 不同：此处测试 NaN 在序列中的行为
    // NaN 与任何数比较都为 false，所以 NaN 不会成为 peak，也不会触发回撤更新
    const { maxDrawdown } = calcMaxDrawdown([100, NaN, 90]);
    // 90 < 100 (peak), dd = (100-90)/100 = 0.1
    expect(maxDrawdown).toBeCloseTo(0.1, 3);
  });

  it('两个数据点', () => {
    const { maxDrawdown } = calcMaxDrawdown([100, 90]);
    expect(maxDrawdown).toBeCloseTo(0.1, 3);
  });
});

// ===== calcCorrelation 边界测试 =====
describe('calcCorrelation - 边界', () => {
  it('无变化序列返回0', () => {
    expect(calcCorrelation([5, 5, 5], [1, 2, 3])).toBe(0);
    expect(calcCorrelation([1, 2, 3], [5, 5, 5])).toBe(0);
  });

  it('长度不等取较短', () => {
    const r = calcCorrelation([1, 2, 3, 4, 5], [2, 4, 6]);
    expect(r).toBeCloseTo(1, 5);
  });

  it('随机序列相关性在[-1,1]', () => {
    const a = Array.from({ length: 100 }, () => Math.random());
    const b = Array.from({ length: 100 }, () => Math.random());
    const r = calcCorrelation(a, b);
    expect(r).toBeGreaterThanOrEqual(-1);
    expect(r).toBeLessThanOrEqual(1);
  });
});

// ===== calcDailyReturns 边界测试 =====
describe('calcDailyReturns - 边界', () => {
  it('空数组', () => {
    expect(calcDailyReturns([])).toEqual([]);
  });

  it('单元素', () => {
    expect(calcDailyReturns([100])).toEqual([]);
  });

  it('连续0值', () => {
    expect(calcDailyReturns([0, 0, 0])).toEqual([0, 0]);
  });

  it('负价格：前值为负数时返回0（区别于前值为0返回0）', () => {
    // 与 statistics.test.ts 中 "前值为0返回0" 不同：此处测试负价格边界
    // calcDailyReturns 仅检查 prev > 0，负价格不满足条件，返回0
    expect(calcDailyReturns([-100, 110])).toEqual([0]);
    expect(calcDailyReturns([100, -110])).toHaveLength(1);
    // (−110 − 100) / 100 = −2.1
    expect(calcDailyReturns([100, -110])[0]).toBeCloseTo(-2.1, 4);
  });

  it('从0到正值', () => {
    expect(calcDailyReturns([0, 100])).toEqual([0]); // 前值为0返回0
  });

  it('极小价格变化', () => {
    const returns = calcDailyReturns([100, 100.01]);
    expect(returns[0]).toBeCloseTo(0.0001, 4);
  });

  it('涨停/跌停（10%）', () => {
    const returns = calcDailyReturns([100, 110]);
    expect(returns[0]).toBeCloseTo(0.1, 5);
    const returns2 = calcDailyReturns([100, 90]);
    expect(returns2[0]).toBeCloseTo(-0.1, 5);
  });
});

// ===== 边界条件：非法输入与极端场景 =====
describe('边界条件 - 非法输入与极端场景', () => {
  it('calcCAGR 负年数返回0', () => {
    expect(calcCAGR(10000, 20000, -1)).toBe(0);
    expect(calcCAGR(10000, 20000, -5)).toBe(0);
  });

  it('calcCAGR 年数为0返回0', () => {
    expect(calcCAGR(10000, 20000, 0)).toBe(0);
  });

  it('calcMWRR 全零现金流返回有限值', () => {
    // 所有现金流为0时，NPV恒为0，二分法应返回区间中点
    const mwrr = calcMWRR([
      { value: 0, time: 0 },
      { value: 0, time: 1 },
      { value: 0, time: 2 },
    ]);
    // NPV恒为0，二分法返回 (low+high)/2 = (-0.5+1.0)/2 = 0.25
    expect(mwrr).toBeCloseTo(0.25, 5);
  });

  it('calcCorrelation 长度为0数组返回0', () => {
    expect(calcCorrelation([], [])).toBe(0);
  });

  it('calcCorrelation 长度为1数组返回0', () => {
    expect(calcCorrelation([0.01], [0.02])).toBe(0);
  });

  it('calcDailyReturns 负价格序列', () => {
    // 全为负价格：前值不满足 > 0，全部返回0
    const returns = calcDailyReturns([-100, -110, -105]);
    expect(returns).toEqual([0, 0]);
  });

  it('calcDailyReturns 混合正负价格', () => {
    // 正→负：前值>0，计算收益率
    // 负→正：前值<0，返回0
    const returns = calcDailyReturns([100, -50, 200]);
    expect(returns[0]).toBeCloseTo(-1.5, 4); // (-50-100)/100 = -1.5
    expect(returns[1]).toBe(0); // 前值-50 < 0，返回0
  });
});
