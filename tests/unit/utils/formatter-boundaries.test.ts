/**
 * 格式化函数边界条件测试（D5-010）— Infinity/NaN/MAX_VALUE/极端值
 *
 * 企业理由：现有测试仅在 8 个文件中覆盖 NaN/Infinity/MAX_VALUE。
 * 本测试补充前端 formatters 的极端值边界验证。
 */
import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatCurrencyShort,
  formatPercent,
  formatPercentSigned,
  formatNumber,
} from '../../../packages/frontend/src/lib/formatters.js';

describe('formatters — Infinity/极端值边界（D5-010）', () => {
  it('formatCurrency(Infinity) 不应抛异常', () => {
    expect(() => formatCurrency(Infinity)).not.toThrow();
  });

  it('formatCurrency(-Infinity) 不应抛异常', () => {
    expect(() => formatCurrency(-Infinity)).not.toThrow();
  });

  it('formatCurrency(Number.MAX_VALUE) 不应抛异常', () => {
    expect(() => formatCurrency(Number.MAX_VALUE)).not.toThrow();
  });

  it('formatCurrency(Number.MIN_VALUE) 不应抛异常', () => {
    expect(() => formatCurrency(Number.MIN_VALUE)).not.toThrow();
  });

  it('formatCurrency(-0) 应格式化为含 0 的字符串', () => {
    const result = formatCurrency(-0);
    expect(result).toMatch(/0/);
  });

  it('formatCurrency(NaN) 应返回占位符', () => {
    const result = formatCurrency(NaN);
    expect(result).toBe('—');
  });

  it('formatCurrency(null) 应返回占位符', () => {
    const result = formatCurrency(null);
    expect(result).toBe('—');
  });

  it('formatCurrency(undefined) 应返回占位符', () => {
    const result = formatCurrency(undefined);
    expect(result).toBe('—');
  });

  it('formatPercent(Infinity) 不应抛异常', () => {
    expect(() => formatPercent(Infinity)).not.toThrow();
  });

  it('formatPercent(-Infinity) 不应抛异常', () => {
    expect(() => formatPercent(-Infinity)).not.toThrow();
  });

  it('formatPercent(NaN) 应返回占位符', () => {
    expect(formatPercent(NaN)).toBe('—');
  });

  it('formatPercentSigned(Infinity) 不应抛异常', () => {
    expect(() => formatPercentSigned(Infinity)).not.toThrow();
  });

  it('formatPercentSigned(-Infinity) 不应抛异常', () => {
    expect(() => formatPercentSigned(-Infinity)).not.toThrow();
  });

  it('formatPercentSigned(NaN) 应返回占位符', () => {
    expect(formatPercentSigned(NaN)).toBe('—');
  });

  it('formatNumber(Infinity) 不应抛异常', () => {
    expect(() => formatNumber(Infinity)).not.toThrow();
  });

  it('formatNumber(Number.MAX_SAFE_INTEGER) 不应抛异常', () => {
    expect(() => formatNumber(Number.MAX_SAFE_INTEGER)).not.toThrow();
  });

  it('formatNumber(NaN) 应返回占位符', () => {
    expect(formatNumber(NaN)).toBe('—');
  });

  it('formatCurrencyShort(Infinity) 不应抛异常', () => {
    expect(() => formatCurrencyShort(Infinity)).not.toThrow();
  });

  it('formatCurrencyShort(Number.MAX_VALUE) 不应抛异常', () => {
    expect(() => formatCurrencyShort(Number.MAX_VALUE)).not.toThrow();
  });

  it('formatCurrencyShort(NaN) 应返回占位符', () => {
    expect(formatCurrencyShort(NaN)).toBe('—');
  });
});