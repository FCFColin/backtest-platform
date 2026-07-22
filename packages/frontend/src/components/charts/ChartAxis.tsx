/**
 * @file 图表坐标轴 / Tooltip / Legend 通用封装
 * @description 基于 chartConstants.ts 项目标准样式，提供 Recharts XAxis / YAxis / Tooltip /
 *              Legend 的统一封装。各图表文件（GrowthChart / TelltaleChart / CorrelationHeatmapChart
 *              / RegressionChart / AnalysisGrowthChart 等）内联的 CartesianGrid + XAxis + YAxis +
 *              Tooltip + Legend 样板，可改用本组件消除重复。
 */
import type { ReactNode } from 'react';
import { XAxis, YAxis, Tooltip, Legend } from 'recharts';
import {
  CHART_TOOLTIP_STYLE,
  AXIS_TICK_STYLE,
  LEGEND_WRAPPER_STYLE,
  DATE_TICK_FORMATTER,
} from './chartConstants.js';

/**
 * Tooltip 值格式化函数签名。
 * Recharts 在运行时可能传入 number / string / array，使用 any 避免与 recharts Formatter
 * 泛型（ValueType）做严格逆变检查；返回值用 ReactNode 与 recharts Formatter 返回类型对齐，
 * 允许 number / string / 元素等作为格式化结果。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Recharts 运行时类型不兼容，见上方注释
export type ChartTooltipFormatter = (value: any, name?: any) => [ReactNode, ReactNode];

interface ChartXAxisProps {
  /** X 轴数据字段名，默认 'date' */
  dataKey?: string;
  /** 轴类型；未传则使用 Recharts 默认（category），ScatterChart 需传 'number' */
  type?: 'number' | 'category';
  /** 轴名称（ScatterChart 用于 tooltip 关联） */
  name?: string;
  /** 刻度格式化；未传则使用 DATE_TICK_FORMATTER（截取 YYYY-MM） */
  tickFormatter?: (value: number | string) => string;
  /** 轴标签文本；在 number 类型下定位 insideBottom，否则不渲染 */
  label?: string;
  /** X 轴刻度字体大小（覆盖默认 AXIS_TICK_STYLE） */
  tickFontSize?: number;
  /** 刻度间隔，未传则不设 */
  interval?: number | 'preserveStartEnd';
}

/** 通用 X 轴：默认日期轴（DATE_TICK_FORMATTER），可配置为数值轴 */
export function ChartXAxis({
  dataKey = 'date',
  type,
  name,
  tickFormatter = DATE_TICK_FORMATTER as (value: number | string) => string,
  label,
  tickFontSize,
  interval,
}: ChartXAxisProps) {
  const tick = tickFontSize
    ? { fill: 'var(--text-muted)', fontSize: tickFontSize }
    : AXIS_TICK_STYLE;
  const labelProps = label
    ? {
        value: label,
        position: 'insideBottom' as const,
        offset: -10,
        style: { fill: 'var(--text-muted)', fontSize: 12 },
      }
    : undefined;
  return (
    <XAxis
      dataKey={dataKey}
      type={type}
      name={name}
      tick={tick}
      tickFormatter={tickFormatter}
      interval={interval}
      label={labelProps}
    />
  );
}

interface ChartYAxisProps {
  /** 刻度格式化 */
  tickFormatter?: (v: number) => string;
  /** Y 轴域 */
  domain?: [number | 'auto', number | 'auto'];
  /** 轴刻度类型（log/linear） */
  scale?: 'linear' | 'log';
  /** Y 轴标签文本（旋转 -90 度，定位 insideLeft） */
  label?: string;
  /** Y 轴类型；ScatterChart 需传 'number' */
  type?: 'number' | 'category';
  /** 数据字段名（ScatterChart 使用） */
  dataKey?: string;
  /** 轴名称（ScatterChart 用于 tooltip 关联） */
  name?: string;
}

/** 通用 Y 轴：含可选 label / 域 / 刻度类型 */
export function ChartYAxis({
  tickFormatter,
  domain,
  scale,
  label,
  type,
  dataKey,
  name,
}: ChartYAxisProps) {
  return (
    <YAxis
      type={type}
      dataKey={dataKey}
      name={name}
      tick={AXIS_TICK_STYLE}
      tickFormatter={tickFormatter}
      domain={domain}
      scale={scale}
      label={
        label
          ? {
              value: label,
              angle: -90,
              position: 'insideLeft',
              style: { fill: 'var(--text-muted)', fontSize: 12 },
            }
          : undefined
      }
    />
  );
}

interface ChartTooltipProps {
  /** 值格式化，返回 [文本, 名称] */
  formatter?: ChartTooltipFormatter;
  /** 标签（X 轴值）格式化 */
  labelFormatter?: (label: string) => string;
}

/** 通用 Tooltip：基于 CHART_TOOLTIP_STYLE 默认样式 */
export function ChartTooltip({ formatter, labelFormatter }: ChartTooltipProps) {
  return (
    <Tooltip
      contentStyle={CHART_TOOLTIP_STYLE}
      formatter={formatter}
      labelFormatter={labelFormatter}
    />
  );
}

/** 通用 Legend：基于 LEGEND_WRAPPER_STYLE 默认样式 */
export function ChartLegend() {
  return <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />;
}
