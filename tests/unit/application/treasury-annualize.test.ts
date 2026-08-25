import { describe, it, expect } from 'vitest';
import { annualizeTbillRates } from '../../../packages/backend/src/infrastructure/dataServices.js';

const mk = (n: number, rate: number, start = '2024-01-01') =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.parse(start) + i * 864e5).toISOString().slice(0, 10);
    return { date: d, rate };
  });

describe('annualizeTbillRates（U-2 P2）', () => {
  it('≥60 交易日：常数利率年化=原值（几何复利不动常数）', () => {
    const rates = mk(90, 0.05);
    const got = annualizeTbillRates(rates, '2024-01-01', '2024-12-31');
    expect(got).not.toBeNull();
    expect(Math.abs(got! - 0.05)).toBeLessThan(1e-9);
  });
  it('<60 交易日返回 null（引擎走 legacy 常量，golden 零漂移）', () => {
    expect(annualizeTbillRates(mk(59, 0.05), '2024-01-01', '2024-12-31')).toBeNull();
  });
  it('窗口外观测被过滤后再判长度', () => {
    const rates = [...mk(100, 0.05), ...mk(200, 0.02, '2030-01-01')];
    const got = annualizeTbillRates(rates, '2024-01-01', '2024-06-30');
    expect(Math.abs(got! - 0.05)).toBeLessThan(1e-9);
  });
});
