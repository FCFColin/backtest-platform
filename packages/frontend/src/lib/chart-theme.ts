import type { CSSProperties, ReactNode } from 'react';

// ============ Tooltip 样式 ============

/**
 * 图表 Tooltip 容器样式（P0-5 增强：backdrop-blur + chart-tooltip-bg）。
 * 基于 CSS 变量 --chart-tooltip-bg / --border-strong / --fg。
 */
export const CHART_TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: 'hsl(var(--chart-tooltip-bg) / 0.95)',
  border: '1px solid hsl(var(--border-strong))',
  borderRadius: '8px',
  padding: '12px',
  color: 'hsl(var(--fg))',
  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.3)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
} as const;

// ============ 图表布局常量 ============

/** 图表通用边距（P0-5：left 增至 80 以容纳 $XX,XXX,XXX 格式） */
export const CHART_MARGIN = { top: 20, right: 40, bottom: 20, left: 80 } as const;

/** CartesianGrid 双向网格（P0-5：开启垂直网格 + chart-grid 色） */
export const CHART_GRID_PROPS = {
  stroke: 'hsl(var(--chart-grid))',
  strokeWidth: 1,
  strokeDasharray: '3 3',
  vertical: true,
  horizontal: true,
} as const;

/** 坐标轴刻度样式（P0-5：增加 fontFamily） */
export const AXIS_TICK_STYLE = {
  fill: 'hsl(var(--fg-tertiary))',
  fontSize: 11,
  fontFamily: 'Geist Mono Variable',
} as const;

/** 主线条样式（P0-5 新增：供 GrowthChartV2 等使用） */
export const CHART_LINE_STYLE = {
  strokeWidth: 2.5,
  dot: false,
  activeDot: { r: 4, strokeWidth: 2 },
  isAnimationActive: false,
} as const;

/** Legend 容器样式 */
export const LEGEND_WRAPPER_STYLE = { fontSize: '12px', color: 'var(--fg-tertiary)' } as const;

// ============ 多组合配色 ============

/** 图表配色数组（P0-5 新增：多组合时循环使用，8 色） */
export const PORTFOLIO_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
  'hsl(var(--chart-7))',
  'hsl(var(--chart-8))',
] as const;

/**
 * 根据组合索引取色（超过 8 个循环）。
 * @param index - 组合索引（0-based）
 * @returns CSS 颜色字符串
 */
export function getPortfolioColor(index: number): string {
  return PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length];
}

// ============ 刻度格式化器 ============

/** 日期刻度格式化器：截取 YYYY-MM */
export const DATE_TICK_FORMATTER = (value: string): string => value.slice(0, 7);

/** 仅年份的刻度格式化器：截取 YYYY */
export const YEAR_ONLY_TICK_FORMATTER = (value: string): string => value.slice(0, 4);

/**
 * 智能日期间隔（P0-5 新增）：根据月数自动选择刻度间隔。
 * ≤12 月：每月。≤60 月：每半年。≤120 月：每年。≤240 月：每两年。>240：每五年。
 * @param totalMonths - 总月数
 * @returns Recharts interval 值
 */
export function SMART_DATE_INTERVAL(totalMonths: number): number {
  if (totalMonths <= 12) return 1;
  if (totalMonths <= 60) return 6;
  if (totalMonths <= 120) return 12;
  if (totalMonths <= 240) return 24;
  return 60;
}

/**
 * 旧版智能日期间隔（保留向后兼容）：根据数据点数量自动选择刻度间隔。
 * < 20 点：全部显示。20-100：每 5 个。100-500：每 20 个。> 500：每 50 个。
 * @param dataLength - 数据点数量
 * @returns Recharts interval 值
 */
export function smartDateInterval(dataLength: number): number {
  if (dataLength <= 20) return 0;
  if (dataLength <= 100) return 4;
  if (dataLength <= 500) return 19;
  return 49;
}

/**
 * Y 轴金额格式化（P0-5：完整格式 $XXX,XXX）。
 * @param value - 数值
 * @param currency - 货币代码，默认 USD
 * @returns 完整货币字符串如 $350,000
 */
export function CURRENCY_TICK_FORMATTER(value: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Y 轴金额格式化：精确到 2 位小数（用于 Tooltip）。
 * @param value - 数值
 * @param currency - 货币代码，默认 USD
 * @returns 精确货币字符串如 $350,000.00
 */
export function CURRENCY_EXACT_FORMATTER(value: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Y 轴百分比格式化（P0-5：支持自定义小数位数）。
 * @param value - 百分比值（如 15.2 表示 15.2%）
 * @param digits - 小数位数，默认 2
 * @returns 百分比字符串如 15.20%
 */
export function PERCENT_TICK_FORMATTER(value: number, digits: number = 2): string {
  return `${value.toFixed(digits)}%`;
}

// ============ 相关系数配色 ============

/**
 * 相关系数热力图配色常量
 * 绿色系=正相关，红色系=负相关，中间色=中性
 */
const CORR_COLORS = {
  strongPositive: '#1a7a3a',
  moderatePositive: '#2e8b57',
  weakPositive: '#6abf7e',
  faintPositive: '#b8e0c4',
  neutral: 'var(--surface)',
  faintNegative: '#f0c8c8',
  weakNegative: '#d47070',
  moderateNegative: '#b04040',
  strongNegative: '#8b2020',
} as const;

const POS_CORR_THRESHOLDS = [0.8, 0.6, 0.4, 0.2] as const;
const POS_CORR_COLORS = [
  CORR_COLORS.strongPositive,
  CORR_COLORS.moderatePositive,
  CORR_COLORS.weakPositive,
  CORR_COLORS.faintPositive,
  CORR_COLORS.neutral,
] as const;
const NEG_CORR_THRESHOLDS = [-0.8, -0.6, -0.4, -0.2] as const;
const NEG_CORR_COLORS = [
  CORR_COLORS.strongNegative,
  CORR_COLORS.moderateNegative,
  CORR_COLORS.weakNegative,
  CORR_COLORS.faintNegative,
  CORR_COLORS.neutral,
] as const;

/**
 * 根据相关系数返回对应颜色（绿色=正相关，红色=负相关）
 * @param val - 相关系数 [-1, 1]
 * @returns CSS 颜色字符串
 */
export function getCorrelationColor(val: number): string {
  if (val >= 0) {
    const idx = POS_CORR_THRESHOLDS.findIndex((t) => val >= t);
    return POS_CORR_COLORS[idx === -1 ? POS_CORR_COLORS.length - 1 : idx];
  }
  const idx = NEG_CORR_THRESHOLDS.findIndex((t) => val <= t);
  return NEG_CORR_COLORS[idx === -1 ? NEG_CORR_COLORS.length - 1 : idx];
}

// ============ Tooltip formatter 共享封装 ============

/** Tooltip 值格式化函数类型（接受 value/name，返回 [文本, 名称] 或纯文本） */
export type TooltipValueFormatter = (value: number, name: string) => [string, string] | string;

/**
 * 包装用户提供的 formatter，返回 Recharts 兼容的 [ReactNode, ReactNode] 元组。
 * 统一处理数组解构、名称回退、异常兜底；Recharts 运行时传入 number/string/array，
 * 内部 cast 为 number/string 调用用户 formatter。供 ChartAxis / sharedChartContent /
 * TimeSeriesLineChart 三处复用，消除重复实现。
 *
 * @param userFormatter - 用户提供的值格式化函数，undefined 时返回 undefined
 * @returns Recharts Tooltip formatter 兼容函数
 */
export function wrapTooltipFormatter(
  userFormatter: TooltipValueFormatter | undefined,
):
  | ((
      value: unknown,
      name: unknown,
      _item?: unknown,
      _index?: number,
      _payload?: unknown,
    ) => [ReactNode, ReactNode])
  | undefined {
  if (!userFormatter) return undefined;
  return (
    value: unknown,
    name: unknown,
    _item?: unknown,
    _index?: number,
    _payload?: unknown,
  ): [ReactNode, ReactNode] => {
    try {
      const result = userFormatter(value as number, name as string);
      if (Array.isArray(result)) {
        const [formattedVal, formattedName] = result;
        return [formattedVal as ReactNode, (formattedName || name) as ReactNode];
      }
      return [result as ReactNode, name as ReactNode];
    } catch {
      return [String(value ?? ''), name as ReactNode];
    }
  };
}
