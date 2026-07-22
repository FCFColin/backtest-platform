import type { CSSProperties } from 'react';

export const CHART_TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: 'rgba(15, 23, 42, 0.96)',
  border: 'none',
  borderRadius: 6,
  color: '#f1f5f9',
  fontSize: '12px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
  padding: '10px 14px',
};

/** 图表通用边距 */
export const CHART_MARGIN = { top: 5, right: 20, bottom: 5, left: 10 } as const;

/** CartesianGrid 网格线属性 - 极细浅灰色 */
export const CHART_GRID_PROPS = {
  strokeDasharray: '',
  strokeWidth: 1,
  stroke: 'var(--border-soft)',
} as const;

/** 坐标轴刻度文本样式 */
export const AXIS_TICK_STYLE = { fill: 'var(--text-muted)', fontSize: 11 } as const;

/** Legend 容器样式 */
export const LEGEND_WRAPPER_STYLE = { fontSize: '12px', color: 'var(--text-muted)' } as const;

/** 日期刻度格式化器：截取 YYYY-MM */
export const DATE_TICK_FORMATTER = (value: string): string => value.slice(0, 7);
