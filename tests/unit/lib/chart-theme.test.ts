import { describe, it, expect } from 'vitest';
import {
  PORTFOLIO_COLORS,
  getPortfolioColor,
  YEAR_ONLY_TICK_FORMATTER,
  DATE_TICK_FORMATTER,
  SMART_DATE_INTERVAL,
  smartDateInterval,
  CURRENCY_TICK_FORMATTER,
  CURRENCY_EXACT_FORMATTER,
  PERCENT_TICK_FORMATTER,
  CHART_TOOLTIP_STYLE,
  CHART_MARGIN,
  CHART_GRID_PROPS,
  AXIS_TICK_STYLE,
  CHART_LINE_STYLE,
  LEGEND_WRAPPER_STYLE,
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
  it('索引 0 返回第一个颜色', () => {
    expect(getPortfolioColor(0)).toBe(PORTFOLIO_COLORS[0]);
  });

  it('索引 7 返回最后一个颜色', () => {
    expect(getPortfolioColor(7)).toBe(PORTFOLIO_COLORS[7]);
  });

  it('索引 8 循环回第一个颜色', () => {
    expect(getPortfolioColor(8)).toBe(PORTFOLIO_COLORS[0]);
  });

  it('索引 15 循环回第七个颜色', () => {
    expect(getPortfolioColor(15)).toBe(PORTFOLIO_COLORS[7]);
  });
});

describe('YEAR_ONLY_TICK_FORMATTER', () => {
  it('从 YYYY-MM-DD 截取年份', () => {
    expect(YEAR_ONLY_TICK_FORMATTER('2024-01-15')).toBe('2024');
  });

  it('从 YYYY-MM 截取年份', () => {
    expect(YEAR_ONLY_TICK_FORMATTER('2024-06')).toBe('2024');
  });

  it('空字符串返回空字符串', () => {
    expect(YEAR_ONLY_TICK_FORMATTER('')).toBe('');
  });
});

describe('DATE_TICK_FORMATTER', () => {
  it('从 YYYY-MM-DD 截取 YYYY-MM', () => {
    expect(DATE_TICK_FORMATTER('2024-01-15')).toBe('2024-01');
  });
});

describe('SMART_DATE_INTERVAL', () => {
  it('12 个月以内返回 1（每月）', () => {
    expect(SMART_DATE_INTERVAL(1)).toBe(1);
    expect(SMART_DATE_INTERVAL(12)).toBe(1);
  });

  it('13-60 个月返回 6（每半年）', () => {
    expect(SMART_DATE_INTERVAL(13)).toBe(6);
    expect(SMART_DATE_INTERVAL(60)).toBe(6);
  });

  it('61-120 个月返回 12（每年）', () => {
    expect(SMART_DATE_INTERVAL(61)).toBe(12);
    expect(SMART_DATE_INTERVAL(120)).toBe(12);
  });

  it('121-240 个月返回 24（每两年）', () => {
    expect(SMART_DATE_INTERVAL(121)).toBe(24);
    expect(SMART_DATE_INTERVAL(240)).toBe(24);
  });

  it('240 个月以上返回 60（每五年）', () => {
    expect(SMART_DATE_INTERVAL(241)).toBe(60);
    expect(SMART_DATE_INTERVAL(600)).toBe(60);
  });
});

describe('smartDateInterval (legacy)', () => {
  it('20 点以内返回 0（全部显示）', () => {
    expect(smartDateInterval(10)).toBe(0);
    expect(smartDateInterval(20)).toBe(0);
  });

  it('21-100 点返回 4（每 5 个）', () => {
    expect(smartDateInterval(50)).toBe(4);
  });

  it('101-500 点返回 19（每 20 个）', () => {
    expect(smartDateInterval(200)).toBe(19);
  });

  it('500 点以上返回 49（每 50 个）', () => {
    expect(smartDateInterval(1000)).toBe(49);
  });
});

describe('CURRENCY_TICK_FORMATTER', () => {
  it('格式化正整数为货币（无小数）', () => {
    const result = CURRENCY_TICK_FORMATTER(350000);
    expect(result).toBe('$350,000');
  });

  it('格式化 0 为 $0', () => {
    expect(CURRENCY_TICK_FORMATTER(0)).toBe('$0');
  });

  it('截断小数位', () => {
    expect(CURRENCY_TICK_FORMATTER(350000.99)).toBe('$350,001');
  });

  it('支持自定义货币', () => {
    const result = CURRENCY_TICK_FORMATTER(1000, 'EUR');
    expect(result).toContain('1,000');
  });
});

describe('CURRENCY_EXACT_FORMATTER', () => {
  it('格式化为 2 位小数货币', () => {
    expect(CURRENCY_EXACT_FORMATTER(350000)).toBe('$350,000.00');
  });

  it('保留小数位', () => {
    expect(CURRENCY_EXACT_FORMATTER(350000.5)).toBe('$350,000.50');
  });

  it('支持自定义货币', () => {
    const result = CURRENCY_EXACT_FORMATTER(99.99, 'EUR');
    expect(result).toContain('99.99');
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
    const formatter = (value: number, _name: string) => '$100';
    const wrapped = wrapTooltipFormatter(formatter)!;
    const result = wrapped(100, 'Portfolio A');
    expect(result[0]).toBe('$100');
    expect(result[1]).toBe('Portfolio A');
  });

  it('包装返回 [formattedValue, formattedName] 元组', () => {
    const formatter = (value: number, _name: string) => ['$100', 'Custom'] as [string, string];
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
