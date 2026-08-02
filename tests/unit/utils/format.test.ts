import { describe, it, expect, afterEach } from 'vitest';
import i18n from '../../../packages/frontend/src/i18n/index.js';
import {
  fmtDate,
  fmtYears,
  fmtPct,
  fmtRatio,
  fmtNum,
  fmtDollar,
  formatCurrency,
  formatCurrencyShort,
  formatPercent,
  formatPercentSigned,
  formatNumber,
} from '../../../packages/frontend/src/utils/format.js';

describe('fmtDate', () => {
  const originalLng = i18n.language;
  afterEach(() => {
    i18n.changeLanguage(originalLng);
  });

  it.each([undefined, '', null, 'not-a-date', '2024-13-45'])('无效输入 %p 应返回占位符', (v) => {
    expect(fmtDate(v as string | undefined)).toBe('—');
  });

  it.each([
    ['zh-CN', '2024年1月15日'],
    ['en', 'Jan 15, 2024'],
  ])('%s 应格式化为对应格式', (lng, expected) => {
    i18n.changeLanguage(lng);
    expect(fmtDate('2024-01-15')).toBe(expected);
  });

  it('应支持 Date 对象输入', () => {
    i18n.changeLanguage('zh-CN');
    expect(fmtDate(new Date(2024, 0, 15))).toBe('2024年1月15日');
  });
});

describe.each([
  [
    'fmtYears',
    fmtYears,
    [
      [0, '0天'],
      [5.5, '5年6个月'],
      [-1.234, '0天'],
    ],
  ],
  [
    'fmtPct',
    fmtPct,
    [
      [0, '0.00%'],
      [0.0523, '5.23%'],
      [-0.1, '-10.00%'],
      [1, '100.00%'],
    ],
  ],
  [
    'fmtRatio',
    fmtRatio,
    [
      [0, '0.00'],
      [1.5, '1.50'],
      [3.456, '3.46'],
    ],
  ],
])('%s', (_name, fn, cases) => {
  it.each([null, undefined, NaN])('无效输入 %p 应返回占位符', (v) => {
    expect(fn(v)).toBe('—');
  });
  it.each(cases)('输入 %p 应返回 %p', (input, expected) => {
    expect(fn(input as number)).toBe(expected as string);
  });
});

describe('fmtNum', () => {
  it.each([null, undefined, NaN])('无效输入 %p 应返回占位符', (v) => {
    expect(fmtNum(v as number | null | undefined)).toBe('—');
  });
  it.each([
    [0, undefined, '0.00'],
    [1.236, 2, '1.24'],
    [1.5, 0, '2'],
  ])('fmtNum(%p, %p) 应返回 %p', (v, digits, expected) => {
    expect(fmtNum(v, digits as number | undefined)).toBe(expected as string);
  });
});

describe('fmtDollar', () => {
  it.each([
    [1234, '$1,234'],
    [0, '$0'],
  ])('fmtDollar(%p) 应返回 %p', (v, expected) => {
    expect(fmtDollar(v)).toBe(expected);
  });
});

describe('formatters — Infinity/极端值边界（D5-010）', () => {
  it.each([
    ['formatCurrency', formatCurrency],
    ['formatPercent', formatPercent],
    ['formatPercentSigned', formatPercentSigned],
    ['formatNumber', formatNumber],
    ['formatCurrencyShort', formatCurrencyShort],
  ])('%s(Infinity/-Infinity/MAX_VALUE/MIN_VALUE/MAX_SAFE_INTEGER) 不应抛异常', (_n, fn) => {
    expect(() => fn(Infinity)).not.toThrow();
    expect(() => fn(-Infinity)).not.toThrow();
    expect(() => fn(Number.MAX_VALUE)).not.toThrow();
    expect(() => fn(Number.MIN_VALUE)).not.toThrow();
    expect(() => fn(Number.MAX_SAFE_INTEGER)).not.toThrow();
  });

  it.each([
    ['formatCurrency', formatCurrency],
    ['formatPercent', formatPercent],
    ['formatPercentSigned', formatPercentSigned],
    ['formatNumber', formatNumber],
    ['formatCurrencyShort', formatCurrencyShort],
  ])('%s(NaN/null/undefined) 应返回占位符', (_n, fn) => {
    expect(fn(NaN)).toBe('—');
    expect(fn(null as unknown as number)).toBe('—');
    expect(fn(undefined as unknown as number)).toBe('—');
  });

  it('formatCurrency(-0) 应格式化为含 0 的字符串', () => {
    expect(formatCurrency(-0)).toMatch(/0/);
  });
});
