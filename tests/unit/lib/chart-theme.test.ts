import { describe, it, expect } from 'vitest';
import {
  PORTFOLIO_COLORS,
  getPortfolioColor,
  YEAR_ONLY_TICK_FORMATTER,
  DATE_TICK_FORMATTER,
  SMART_DATE_INTERVAL,
  currencyFormatter,
  CHART_TOOLTIP_STYLE,
  CHART_MARGIN,
  CHART_GRID_PROPS,
  AXIS_TICK_STYLE,
  CHART_LINE_STYLE,
  getCorrelationColor,
  wrapTooltipFormatter,
} from '../../../packages/frontend/src/lib/chart-theme.js';

describe('PORTFOLIO_COLORS', () => {
  it('包含 8 种颜色', () => {
    expect(PORTFOLIO_COLORS).toHaveLength(8);
  });

  it('每个颜色值使用 hsl(var(--chart-N)) 格式', () => {
    for (let i = 0; i < PORTFOLIO_COLORS.length; i++) {
      expect(PORTFOLIO_COLORS[i]).toBe(`hsl(var(--chart-${i + 1}))`);
    }
  });
});

describe('getPortfolioColor', () => {
  it.each([
    [0, PORTFOLIO_COLORS[0]],
    [7, PORTFOLIO_COLORS[7]],
    [8, PORTFOLIO_COLORS[0]],
    [15, PORTFOLIO_COLORS[7]],
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

describe('CHART_TOOLTIP_STYLE', () => {
  it.each([
    ['backgroundColor 使用 chart-tooltip-bg CSS 变量', 'backgroundColor', 'chart-tooltip-bg'],
    ['backdropFilter 包含 blur', 'backdropFilter', 'blur'],
  ] as const)('%s', (_label, key, substring) => {
    expect(CHART_TOOLTIP_STYLE[key]).toContain(substring);
  });

  it('borderRadius 为 8px', () => {
    expect(CHART_TOOLTIP_STYLE.borderRadius).toBe('8px');
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

describe('CHART_GRID_PROPS', () => {
  it.each([
    ['vertical 为 true（开启垂直网格）', 'vertical', true],
    ['horizontal 为 true', 'horizontal', true],
  ] as const)('%s', (_label, key, expected) => {
    expect(CHART_GRID_PROPS[key]).toBe(expected);
  });

  it('使用 chart-grid CSS 变量', () => {
    expect(CHART_GRID_PROPS.stroke).toContain('chart-grid');
  });
});

describe('AXIS_TICK_STYLE', () => {
  it.each([
    ['fontSize 为 11', 'fontSize', 11],
    ['fontFamily 为 Geist Mono Variable', 'fontFamily', 'Geist Mono Variable'],
  ] as const)('%s', (_label, key, expected) => {
    expect(AXIS_TICK_STYLE[key]).toBe(expected);
  });

  it('使用 fg-tertiary CSS 变量', () => {
    expect(AXIS_TICK_STYLE.fill).toContain('fg-tertiary');
  });
});

describe('CHART_LINE_STYLE', () => {
  it.each([
    ['strokeWidth 为 2.5', 'strokeWidth', 2.5],
    ['dot 为 false（隐藏默认点）', 'dot', false],
    ['isAnimationActive 为 false（关闭内建动画）', 'isAnimationActive', false],
  ] as const)('%s', (_label, key, expected) => {
    expect(CHART_LINE_STYLE[key]).toBe(expected);
  });

  it('activeDot 包含 r 和 strokeWidth', () => {
    expect(CHART_LINE_STYLE.activeDot).toEqual({ r: 4, strokeWidth: 2 });
  });
});

describe('getCorrelationColor', () => {
  it.each([
    ['强正相关', 0.9, '#1a7a3a'],
    ['强负相关', -0.9, '#8b2020'],
    ['0（中性）', 0, 'var(--surface)'],
  ] as const)('%s 应返回 %s', (_label, value, expected) => {
    expect(getCorrelationColor(value)).toBe(expected);
  });
});

describe('wrapTooltipFormatter', () => {
  it('undefined formatter 返回 undefined', () => {
    expect(wrapTooltipFormatter(undefined)).toBeUndefined();
  });

  it('包装返回 [value, name] 元组', () => {
    const formatter = (_value: number, _name: string) => '$100';
    const wrapped = wrapTooltipFormatter(formatter)!;
    const result = wrapped(100, 'Portfolio A');
    expect(result[0]).toBe('$100');
    expect(result[1]).toBe('Portfolio A');
  });

  it('包装返回 [formattedValue, formattedName] 元组', () => {
    const formatter = (_value: number, _name: string) => ['$100', 'Custom'] as [string, string];
    const wrapped = wrapTooltipFormatter(formatter)!;
    const result = wrapped(100, 'Original');
    expect(result[0]).toBe('$100');
    expect(result[1]).toBe('Custom');
  });

  it('formatter 抛异常时返回兜底值', () => {
    const formatter = () => {
      throw new Error('test');
    };
    const wrapped = wrapTooltipFormatter(formatter)!;
    const result = wrapped(42, 'Test');
    expect(result[0]).toBe('42');
    expect(result[1]).toBe('Test');
  });
});
