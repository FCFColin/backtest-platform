import { describe, it, expect } from 'vitest';
import {
  PORTFOLIO_COLORS,
  getPortfolioColor,
  YEAR_ONLY_TICK_FORMATTER,
  DATE_TICK_FORMATTER,
  SMART_DATE_INTERVAL,
  currencyFormatter,
  PERCENT_TICK_FORMATTER,
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

describe('PERCENT_TICK_FORMATTER', () => {
  it('默认 2 位小数', () => {
    expect(PERCENT_TICK_FORMATTER(15.23456)).toBe('15.23%');
  });

  it('自定义小数位数', () => {
    expect(PERCENT_TICK_FORMATTER(15.23456, 4)).toBe('15.2346%');
  });

  it('0 位小数', () => {
    expect(PERCENT_TICK_FORMATTER(15.6, 0)).toBe('16%');
  });
});

describe('CHART_TOOLTIP_STYLE', () => {
  it('使用 chart-tooltip-bg CSS 变量', () => {
    expect(CHART_TOOLTIP_STYLE.backgroundColor).toContain('chart-tooltip-bg');
  });

  it('包含 backdropFilter blur', () => {
    expect(CHART_TOOLTIP_STYLE.backdropFilter).toContain('blur');
  });

  it('borderRadius 为 8px', () => {
    expect(CHART_TOOLTIP_STYLE.borderRadius).toBe('8px');
  });
});

describe('CHART_MARGIN', () => {
  it('left 为 80（容纳 $XX,XXX,XXX 格式）', () => {
    expect(CHART_MARGIN.left).toBe(80);
  });

  it('right 为 40', () => {
    expect(CHART_MARGIN.right).toBe(40);
  });
});

describe('CHART_GRID_PROPS', () => {
  it('vertical 为 true（开启垂直网格）', () => {
    expect(CHART_GRID_PROPS.vertical).toBe(true);
  });

  it('horizontal 为 true', () => {
    expect(CHART_GRID_PROPS.horizontal).toBe(true);
  });

  it('使用 chart-grid CSS 变量', () => {
    expect(CHART_GRID_PROPS.stroke).toContain('chart-grid');
  });
});

describe('AXIS_TICK_STYLE', () => {
  it('使用 fg-tertiary CSS 变量', () => {
    expect(AXIS_TICK_STYLE.fill).toContain('fg-tertiary');
  });

  it('fontSize 为 11', () => {
    expect(AXIS_TICK_STYLE.fontSize).toBe(11);
  });

  it('fontFamily 为 Geist Mono Variable', () => {
    expect(AXIS_TICK_STYLE.fontFamily).toBe('Geist Mono Variable');
  });
});

describe('CHART_LINE_STYLE', () => {
  it('strokeWidth 为 2.5', () => {
    expect(CHART_LINE_STYLE.strokeWidth).toBe(2.5);
  });

  it('dot 为 false（隐藏默认点）', () => {
    expect(CHART_LINE_STYLE.dot).toBe(false);
  });

  it('isAnimationActive 为 false（关闭内建动画）', () => {
    expect(CHART_LINE_STYLE.isAnimationActive).toBe(false);
  });

  it('activeDot 包含 r 和 strokeWidth', () => {
    expect(CHART_LINE_STYLE.activeDot).toEqual({ r: 4, strokeWidth: 2 });
  });
});

describe('getCorrelationColor', () => {
  it('强正相关返回绿色', () => {
    const color = getCorrelationColor(0.9);
    expect(color).toBe('#1a7a3a');
  });

  it('强负相关返回红色', () => {
    const color = getCorrelationColor(-0.9);
    expect(color).toBe('#8b2020');
  });

  it('0 返回中性色', () => {
    const color = getCorrelationColor(0);
    expect(color).toBe('var(--surface)');
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
