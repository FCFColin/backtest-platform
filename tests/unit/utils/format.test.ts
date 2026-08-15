import { describe, it, expect, vi } from 'vitest';

vi.mock(
  '@/i18n/index.js',
  async () => (await import('../../helpers/i18nMock.js')).i18nIndexModuleMock,
);

import {
  fmtPct,
  fmtRatio,
  fmtNum,
  fmtAmount,
  formatCurrency,
  formatPercentSigned,
  formatDuration,
  toCSV,
} from '../../../packages/frontend/src/utils/format.js';

describe.each([
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

it.each([
  [0.123456, 2, '12.35%'],
  [0.123456, 1, '12.3%'],
  [-0.055, 2, '-5.50%'],
])('fmtPct(%p, %p) 指定小数位应为 %p', (value, digits, expected) => {
  expect(fmtPct(value, digits)).toBe(expected);
});

describe('fmtNum', () => {
  it.each([null, undefined, NaN])('无效输入 %p 应返回占位符', (v) => {
    expect(fmtNum(v as number | null | undefined)).toBe('—');
  });
  it.each([
    [0, undefined, '0.00'],
    [1.236, 2, '1.24'],
    [1.5, 0, '2'],
    [3.14159, 4, '3.1416'],
  ])('fmtNum(%p, %p) 应返回 %p', (v, digits, expected) => {
    expect(fmtNum(v, digits as number | undefined)).toBe(expected as string);
  });
});

describe('fmtAmount', () => {
  it.each([
    [1234, '$1,234'],
    [0, '$0'],
  ])('fmtAmount(%p) 应返回 %p', (v, expected) => {
    expect(fmtAmount(v)).toBe(expected);
  });
});

describe('formatters — Infinity/极端值边界（D5-010）', () => {
  it.each([
    ['formatCurrency', formatCurrency],
    ['fmtPct', fmtPct],
    ['formatPercentSigned', formatPercentSigned],
    ['fmtNum', fmtNum],
  ])('%s(Infinity/-Infinity/MAX_VALUE/MIN_VALUE/MAX_SAFE_INTEGER) 不应抛异常', (_n, fn) => {
    expect(() => fn(Infinity)).not.toThrow();
    expect(() => fn(-Infinity)).not.toThrow();
    expect(() => fn(Number.MAX_VALUE)).not.toThrow();
    expect(() => fn(Number.MIN_VALUE)).not.toThrow();
    expect(() => fn(Number.MAX_SAFE_INTEGER)).not.toThrow();
  });

  it.each([
    ['formatCurrency', formatCurrency],
    ['fmtPct', fmtPct],
    ['formatPercentSigned', formatPercentSigned],
    ['fmtNum', fmtNum],
  ])('%s(NaN/null/undefined) 应返回占位符', (_n, fn) => {
    expect(fn(NaN)).toBe('—');
    expect(fn(null as unknown as number)).toBe('—');
    expect(fn(undefined as unknown as number)).toBe('—');
  });

  it('formatCurrency(-0) 应格式化为含 0 的字符串', () => {
    expect(formatCurrency(-0)).toMatch(/0/);
  });
});

describe('formatCurrency', () => {
  it('大金额（≥100万）0 位小数', () => {
    const result = formatCurrency(1_500_000);
    expect(result).toContain('1,500,000');
    expect(result).not.toContain('1,500,000.00');
  });
});

describe('formatDuration', () => {
  it.each([
    [15, '15 days'],
    [60, '2mo'],
    [730, '2.0y'],
    [365, '1.0y'],
  ])('formatDuration(%p) 应为 %p', (days, expected) => {
    expect(formatDuration(days)).toBe(expected);
  });
});

describe('toCSV', () => {
  it('空数据返回空串', () => {
    expect(toCSV([])).toBe('');
  });

  it('输出带 BOM 且正确转义引号/逗号/换行', () => {
    const csv = toCSV([{ name: 'a,b', note: 'x"y' }]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"a,b"');
    expect(csv).toContain('"x""y"');
  });

  it('以 = + - @ 开头的单元格前置制表符防公式注入', () => {
    const csv = toCSV([{ value: '=SUM(A1:A2)', minus: '-5', plus: '+44', at: '@cmd', safe: 'ok' }]);
    expect(csv).toContain('\t=SUM(A1:A2)');
    expect(csv).toContain('\t-5');
    expect(csv).toContain('\t+44');
    expect(csv).toContain('\t@cmd');
    expect(csv).not.toContain('\tok');
  });
});
