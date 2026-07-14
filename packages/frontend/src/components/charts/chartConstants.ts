import type { CSSProperties } from 'react';

export const CHART_TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-body)',
  fontSize: '12px',
  boxShadow: 'var(--shadow-md)',
};

/** 图表通用边距 */
export const CHART_MARGIN = { top: 5, right: 20, bottom: 5, left: 10 } as const;

/** CartesianGrid 虚线网格属性 */
export const CHART_GRID_PROPS = { strokeDasharray: '3 3' } as const;

/** 坐标轴刻度文本样式 */
export const AXIS_TICK_STYLE = { fill: 'var(--text-muted)', fontSize: 11 } as const;

/** Legend 容器样式 */
export const LEGEND_WRAPPER_STYLE = { fontSize: '12px', color: 'var(--text-muted)' } as const;

/** 日期刻度格式化器：截取 YYYY-MM */
export const DATE_TICK_FORMATTER = (value: string): string => value.slice(0, 7);
