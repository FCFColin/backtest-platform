import { describe, it, expect } from 'vitest';
import { CHART_COLORS } from '@backtest/shared';
import {
  getPortfolioColor,
  YEAR_ONLY_TICK_FORMATTER,
  DATE_TICK_FORMATTER,
  SMART_DATE_INTERVAL,
  currencyFormatter,
  CHART_MARGIN,
  getCorrelationColor,
} from '../../../packages/frontend/src/lib/chart-theme.js';
import {
  AXIS_TEXT,
  tooltipOption,
} from '../../../packages/frontend/src/components/charts/chartUtils.js';

describe('CHART_COLORS', () => {
  it('包含 8 种颜色', () => {
    expect(CHART_COLORS).toHaveLength(8);
  });

  it('每个颜色值使用 hsl(var(--chart-N)) 格式', () => {
    for (let i = 0; i < CHART_COLORS.length; i++) {
      expect(CHART_COLORS[i]).toBe(`hsl(var(--chart-${i + 1}))`);
    }
  });
});

describe('getPortfolioColor', () => {
  it.each([
    [0, CHART_COLORS[0]],
    [7, CHART_COLORS[7]],
    [8, CHART_COLORS[0]],
    [15, CHART_COLORS[7]],
  ])('索引 %i 应返回对应颜色（循环取模）', (index, expected) => {
    expect(getPortfolioColor(index)).toBe(expected);
  });
});

describe('YEAR_ONLY_TICK_FORMATTER', () => {
  it.each([
    ['2024-01-15', '2024'],
    ['2024-06', '2024'],
    ['', ''],
  ])('%s 应返回 %s', (input, expected) => {
    expect(YEAR_ONLY_TICK_FORMATTER(input)).toBe(expected);
  });
});

describe('DATE_TICK_FORMATTER', () => {
  it('从 YYYY-MM-DD 截取 YYYY-MM', () => {
    expect(DATE_TICK_FORMATTER('2024-01-15')).toBe('2024-01');
  });
});

describe('SMART_DATE_INTERVAL', () => {
  it.each([
    [1, 1],
    [10, 1],
    [12, 1],
    [13, 6],
    [50, 6],
    [60, 6],
    [61, 12],
    [100, 12],
    [120, 12],
    [121, 24],
    [200, 24],
    [240, 24],
    [241, 60],
    [600, 60],
    [1000, 60],
  ])('%i 个月应返回 %i（%i 月内每 N 月一个刻度）', (months, interval) => {
    expect(SMART_DATE_INTERVAL(months)).toBe(interval);
  });
});

describe('currencyFormatter', () => {
  it.each([
    [350000, 0, '$350,000'],
    [0, 0, '$0'],
    [350000.99, 0, '$350,001'],
    [350000, 2, '$350,000.00'],
    [350000.5, 2, '$350,000.50'],
  ] as const)('digits=%i 时应格式化 %i 为 %s', (value, digits, expected) => {
    expect(currencyFormatter(value, 'USD', digits)).toBe(expected);
  });

  it('支持自定义货币', () => {
    expect(currencyFormatter(1000, 'EUR')).toContain('1,000');
    expect(currencyFormatter(99.99, 'EUR', 2)).toContain('99.99');
  });
});

describe('tooltipOption', () => {
  it.each([
    ['backgroundColor 使用 chart-tooltip-bg CSS 变量', 'backgroundColor', 'chart-tooltip-bg'],
    ['backdropFilter 包含 blur', 'extraCssText', 'blur'],
  ] as const)('%s', (_label, key, substring) => {
    expect(tooltipOption(undefined)[key]).toContain(substring);
  });

  it('borderRadius 为 8px', () => {
    expect(tooltipOption(undefined).extraCssText).toContain('border-radius: 8px');
  });
});

describe('CHART_MARGIN', () => {
  it.each([
    ['left 为 80（容纳 $XX,XXX,XXX 格式）', 'left', 80],
    ['right 为 40', 'right', 40],
  ] as const)('%s', (_label, key, expected) => {
    expect(CHART_MARGIN[key]).toBe(expected);
  });
});

describe('AXIS_TEXT', () => {
  it.each([
    ['fontSize 为 11', 'fontSize', 11],
    ['fontFamily 为 Geist Mono Variable', 'fontFamily', 'Geist Mono Variable'],
  ] as const)('%s', (_label, key, expected) => {
    expect(AXIS_TEXT[key]).toBe(expected);
  });

  it('使用 fg-tertiary CSS 变量', () => {
    expect(AXIS_TEXT.color).toContain('fg-tertiary');
  });
});

describe('getCorrelationColor', () => {
  it.each([
    ['强正相关', 0.9, 'hsl(var(--corr-pos-1))'],
    ['强负相关', -0.9, 'hsl(var(--corr-neg-1))'],
    ['0（中性）', 0, 'hsl(var(--surface))'],
  ] as const)('%s 应返回 %s', (_label, value, expected) => {
    expect(getCorrelationColor(value)).toBe(expected);
  });
});
