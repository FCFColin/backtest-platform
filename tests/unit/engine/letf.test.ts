import { describe, it, expect } from 'vitest';
import { analyzeLetfSlippage } from '../../../api/engine/letf.js';

// ===== 边界条件 =====
describe('analyzeLetfSlippage - 边界条件', () => {
  it('空输入数组应抛出错误', () => {
    expect(() => analyzeLetfSlippage([], [], 2)).toThrow('有效价格数据不足');
  });

  it('单个数据点应抛出错误（至少需要2个交易日）', () => {
    const single = [{ date: '2020-01-02', price: 100 }];
    expect(() => analyzeLetfSlippage(single, single, 2)).toThrow('有效价格数据不足');
  });

  it('LETF 与基准日期不交集应抛出错误', () => {
    const letf = [
      { date: '2020-01-02', price: 100 },
      { date: '2020-01-03', price: 101 },
    ];
    const bench = [
      { date: '2020-01-04', price: 100 },
      { date: '2020-01-05', price: 101 },
    ];
    expect(() => analyzeLetfSlippage(letf, bench, 2)).toThrow('有效价格数据不足');
  });

  it('NaN 价格应产生 NaN 累积值', () => {
    const letf = [
      { date: '2020-01-02', price: NaN },
      { date: '2020-01-03', price: 101 },
    ];
    const bench = [
      { date: '2020-01-02', price: 100 },
      { date: '2020-01-03', price: 101 },
    ];
    // NaN 参与运算后累积值应为 NaN
    const result = analyzeLetfSlippage(letf, bench, 2);
    expect(result.stats.slippage).toBeNaN();
  });

  it('Infinity 价格应产生 Infinity 累积值', () => {
    const letf = [
      { date: '2020-01-02', price: Infinity },
      { date: '2020-01-03', price: 200 },
    ];
    const bench = [
      { date: '2020-01-02', price: 100 },
      { date: '2020-01-03', price: 101 },
    ];
    const result = analyzeLetfSlippage(letf, bench, 2);
    // Infinity 前值导致 letfRet = 0（prev.letfPrice !== 0 判断通过，但运算结果为 0/Infinity）
    // 实际：(200 - Infinity) / Infinity = -Infinity / Infinity = NaN
    expect(Number.isFinite(result.stats.slippage)).toBe(false);
  });

  it('前值为 0 的价格应返回 0 收益率（不抛出）', () => {
    const letf = [
      { date: '2020-01-02', price: 0 },
      { date: '2020-01-03', price: 100 },
    ];
    const bench = [
      { date: '2020-01-02', price: 0 },
      { date: '2020-01-03', price: 100 },
    ];
    const result = analyzeLetfSlippage(letf, bench, 2);
    // 前值为0时收益率为0，累积值保持1
    expect(result.stats.benchmarkReturn).toBe(0);
    expect(result.stats.letfReturn).toBe(0);
  });
});

// ===== 正常计算 =====
describe('analyzeLetfSlippage - 正常计算', () => {
  it('完美跟踪：LETF 收益 = 基准收益 × 杠杆时，滑点为 0', () => {
    // 基准每天涨1%，LETF(2x)每天涨2% —— 完美跟踪
    const bench = [
      { date: '2020-01-02', price: 100 },
      { date: '2020-01-03', price: 101 },
      { date: '2020-01-04', price: 102.01 },
    ];
    const letf = [
      { date: '2020-01-02', price: 100 },
      { date: '2020-01-03', price: 102 },
      { date: '2020-01-04', price: 104.04 },
    ];
    const result = analyzeLetfSlippage(letf, bench, 2);
    // 完美跟踪时 slippage = expectedReturn - letfReturn ≈ 0
    expect(result.stats.slippage).toBeCloseTo(0, 6);
    expect(result.stats.expectedReturn).toBeCloseTo(result.stats.letfReturn, 6);
  });

  it('有滑点时：LETF 收益 < 预期收益，滑点为正', () => {
    // 基准涨1%，LETF(2x)应涨2%但实际只涨1.5% —— 有滑点
    const bench = [
      { date: '2020-01-02', price: 100 },
      { date: '2020-01-03', price: 101 },
    ];
    const letf = [
      { date: '2020-01-02', price: 100 },
      { date: '2020-01-03', price: 101.5 },
    ];
    const result = analyzeLetfSlippage(letf, bench, 2);
    // expectedReturn = 2 * 0.01 = 0.02
    // letfReturn = 0.015
    // slippage = 0.02 - 0.015 = 0.005
    expect(result.stats.expectedReturn).toBeCloseTo(0.02, 6);
    expect(result.stats.letfReturn).toBeCloseTo(0.015, 6);
    expect(result.stats.slippage).toBeCloseTo(0.005, 6);
    expect(result.slippageCurve).toHaveLength(1);
    expect(result.slippageCurve[0].slippage).toBeCloseTo(0.005, 6);
  });

  it('基准收益与 LETF 收益正确计算', () => {
    const bench = [
      { date: '2020-01-02', price: 100 },
      { date: '2020-01-03', price: 110 }, // 涨10%
    ];
    const letf = [
      { date: '2020-01-02', price: 100 },
      { date: '2020-01-03', price: 120 }, // 涨20%（2x完美跟踪）
    ];
    const result = analyzeLetfSlippage(letf, bench, 2);
    expect(result.stats.benchmarkReturn).toBeCloseTo(0.1, 6);
    expect(result.stats.letfReturn).toBeCloseTo(0.2, 6);
    expect(result.stats.expectedReturn).toBeCloseTo(0.2, 6);
  });

  it('滑点曲线长度 = 对齐后交易日数 - 1', () => {
    const dates = ['2020-01-02', '2020-01-03', '2020-01-04', '2020-01-05', '2020-01-06'];
    const bench = dates.map((d, i) => ({ date: d, price: 100 + i }));
    const letf = dates.map((d, i) => ({ date: d, price: 100 + i * 2 }));
    const result = analyzeLetfSlippage(letf, bench, 2);
    expect(result.slippageCurve).toHaveLength(4);
    expect(result.effectiveLeverage).toHaveLength(4);
  });

  it('实际杠杆：完美跟踪时接近名义杠杆', () => {
    // 构造20+天数据使滚动窗口生效
    // 使用变化的收益率避免常数序列导致方差为0
    const bench: Array<{ date: string; price: number }> = [];
    const letf: Array<{ date: string; price: number }> = [];
    let bPrice = 100;
    let lPrice = 100;
    const current = new Date('2020-01-02');
    // 交替使用不同收益率，保持 letfRet = 2 * benchRet
    const benchReturns = [
      0.01, -0.005, 0.008, -0.003, 0.012, -0.007, 0.006, -0.004, 0.009, -0.002, 0.011, -0.006,
      0.007, -0.001, 0.013, -0.008, 0.005, -0.009, 0.01, -0.005, 0.008, -0.003, 0.012, -0.007,
      0.006,
    ];
    for (let i = 0; i < benchReturns.length; i++) {
      const d = current.toISOString().slice(0, 10);
      bench.push({ date: d, price: bPrice });
      letf.push({ date: d, price: lPrice });
      bPrice *= 1 + benchReturns[i];
      lPrice *= 1 + benchReturns[i] * 2; // 完美2x跟踪
      current.setDate(current.getDate() + 1);
    }
    const result = analyzeLetfSlippage(letf, bench, 2);
    // 滚动窗口20天后开始输出有效值
    const validLeverages = result.effectiveLeverage.filter((v) => !Number.isNaN(v));
    expect(validLeverages.length).toBeGreaterThan(0);
    // 完美跟踪时实际杠杆应接近2
    const lastValid = validLeverages[validLeverages.length - 1];
    expect(lastValid).toBeCloseTo(2, 1);
  });

  it('年化拖累为有限值（数据足够时）', () => {
    const bench: Array<{ date: string; price: number }> = [];
    const letf: Array<{ date: string; price: number }> = [];
    let bPrice = 100;
    let lPrice = 100;
    const current = new Date('2020-01-02');
    for (let i = 0; i < 30; i++) {
      const d = current.toISOString().slice(0, 10);
      bench.push({ date: d, price: bPrice });
      letf.push({ date: d, price: lPrice });
      bPrice *= 1.01;
      lPrice *= 1.019; // 略低于2x，产生滑点
      current.setDate(current.getDate() + 1);
    }
    const result = analyzeLetfSlippage(letf, bench, 2);
    expect(Number.isFinite(result.annualDecay)).toBe(true);
    expect(result.annualDecay).toBeGreaterThan(0); // 有滑点时年化拖累为正
  });
});
