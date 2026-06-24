import { describe, it, expect } from 'vitest';
import {
  calcSortino,
} from '../../api/engine/statistics.js';

describe('calcSortino - Infinity分支', () => {
  it('全部收益>无风险利率且cagr>无风险利率，返回Infinity', () => {
    // 日无风险利率 ≈ 0.0000768
    // 所有日收益都大于无风险利率
    const dailyReturns = [0.01, 0.02, 0.015, 0.008, 0.012];
    const sortino = calcSortino(0.20, dailyReturns);
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
