import type { CSSProperties, ReactNode } from 'react';

/**
 * 图表 Tooltip 容器样式（基于设计 token 体系：--elevated / --border-subtle / --fg）。
 */
export const CHART_TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: 'var(--elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius)',
  color: 'var(--fg)',
  fontSize: '12px',
  boxShadow: '0 4px 12px hsl(220 14% 8% / 0.4)',
  padding: '10px 14px',
};

/** 图表通用边距 */
export const CHART_MARGIN = { top: 5, right: 30, bottom: 5, left: 60 } as const;

/** CartesianGrid 网格线属性 - 极细浅灰色 */
export const CHART_GRID_PROPS = {
  strokeDasharray: '',
  strokeWidth: 1,
  stroke: 'var(--border-subtle)',
} as const;

/** 坐标轴刻度文本样式 */
export const AXIS_TICK_STYLE = { fill: 'var(--fg-tertiary)', fontSize: 11 } as const;

/** Legend 容器样式 */
export const LEGEND_WRAPPER_STYLE = { fontSize: '12px', color: 'var(--fg-tertiary)' } as const;

/** 日期刻度格式化器：截取 YYYY-MM */
export const DATE_TICK_FORMATTER = (value: string): string => value.slice(0, 7);

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 同上
): ((value: any, name: any, _item?: any, _index?: number, _payload?: any) => [ReactNode, ReactNode]) | undefined {
  if (!userFormatter) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 同上
  return (value: any, name: any, _item?: any, _index?: number, _payload?: any) => {
    try {
      const result = userFormatter(value as number, name as string);
      if (Array.isArray(result)) {
        const [formattedVal, formattedName] = result;
        return [formattedVal, formattedName || name];
      }
      return [result, name];
    } catch {
      return [String(value ?? ''), name];
    }
  };
}
