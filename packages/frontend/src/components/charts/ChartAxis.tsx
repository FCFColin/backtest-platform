/**
 * @file 图表坐标轴 / Tooltip / Legend 通用封装
 * @description 基于 chartConstants.ts 项目标准样式，提供 Recharts XAxis / YAxis / Tooltip /
 *              Legend 的统一封装。各图表文件（GrowthChart / TelltaleChart / CorrelationHeatmapChart
 *              / RegressionChart / AnalysisGrowthChart 等）内联的 CartesianGrid + XAxis + YAxis +
 *              Tooltip + Legend 样板，可改用本组件消除重复。
 */
import { XAxis, YAxis, Tooltip, Legend } from 'recharts';
import type { XAxisProps, YAxisProps } from 'recharts';
import {
  CHART_TOOLTIP_STYLE,
  AXIS_TICK_STYLE,
  LEGEND_WRAPPER_STYLE,
  DATE_TICK_FORMATTER,
  wrapTooltipFormatter,
} from './chartConstants.js';
import type { TooltipValueFormatter } from './chartConstants.js';

interface ChartXAxisProps extends Omit<XAxisProps, 'label' | 'tick' | 'tickFormatter' | 'ref'> {
  /** X 轴数据字段名，默认 'date' */
  dataKey?: string;
  /** 刻度格式化；未传则使用 DATE_TICK_FORMATTER（截取 YYYY-MM） */
  tickFormatter?: (value: number | string) => string;
  /** 轴标签；支持字符串（自动定位 insideBottom）或完整 Recharts label 对象 */
  label?: string | XAxisProps['label'];
  /** X 轴刻度字体大小（覆盖默认 AXIS_TICK_STYLE） */
  tickFontSize?: number;
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
  ...rest
}: ChartXAxisProps) {
  const tick = tickFontSize
    ? { fill: 'var(--text-muted)', fontSize: tickFontSize }
    : AXIS_TICK_STYLE;
  let labelProps: XAxisProps['label'] = undefined;
  if (label) {
    if (typeof label === 'string') {
      labelProps = {
        value: label,
        position: 'insideBottom',
        offset: -10,
        style: { fill: 'var(--text-muted)', fontSize: 12 },
      };
    } else {
      labelProps = label;
    }
  }
  return (
    <XAxis
      dataKey={dataKey}
      type={type}
      name={name}
      tick={tick}
      tickFormatter={tickFormatter}
      interval={interval}
      label={labelProps}
      {...rest}
    />
  );
}

interface ChartYAxisProps extends Omit<YAxisProps, 'label' | 'tick' | 'width' | 'ref'> {
  /** 刻度格式化 */
  tickFormatter?: (v: number) => string;
  /** 轴标签；支持字符串（自动旋转 -90 度定位 insideLeft）或完整 Recharts label 对象 */
  label?: string | YAxisProps['label'];
  /** Y 轴宽度，默认 80 */
  width?: number;
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
  width = 80,
  ...rest
}: ChartYAxisProps) {
  let labelProps: YAxisProps['label'] = undefined;
  if (label) {
    if (typeof label === 'string') {
      labelProps = {
        value: label,
        angle: -90,
        position: 'insideLeft',
        style: { fill: 'var(--text-muted)', fontSize: 12 },
      };
    } else {
      labelProps = label;
    }
  }
  return (
    <YAxis
      type={type}
      dataKey={dataKey}
      name={name}
      tick={AXIS_TICK_STYLE}
      tickFormatter={tickFormatter}
      domain={domain}
      scale={scale}
      width={width}
      label={labelProps}
      {...rest}
    />
  );
}

interface ChartTooltipProps {
  /** 值格式化，返回 [文本, 名称] */
  formatter?: TooltipValueFormatter;
  /** 标签（X 轴值）格式化 */
  labelFormatter?: (label: string) => string;
  /** 光标样式；设为 false 禁用光标，默认显示虚线跟踪线 */
  cursor?: boolean | { stroke?: string; strokeWidth?: number; strokeDasharray?: string };
  /** 允许Tooltip逃出SVG viewBox边界，防止被父容器裁剪 */
  allowEscapeViewBox?: { x?: boolean; y?: boolean };
  /** Tooltip偏移量 */
  offset?: number;
}

/** 通用 Tooltip：基于 CHART_TOOLTIP_STYLE 默认样式 */
export function ChartTooltip({
  formatter,
  labelFormatter,
  cursor,
  allowEscapeViewBox = { x: true, y: true },
  offset = 20,
}: ChartTooltipProps) {
  const cursorProp =
    cursor === undefined
      ? { stroke: 'var(--border-soft)', strokeWidth: 1, strokeDasharray: '4 4' }
      : cursor;
  return (
    <Tooltip
      contentStyle={CHART_TOOLTIP_STYLE}
      formatter={wrapTooltipFormatter(formatter)}
      labelFormatter={labelFormatter}
      cursor={cursorProp}
      isAnimationActive={true}
      animationDuration={150}
      wrapperStyle={{ zIndex: 1000, outline: 'none', pointerEvents: 'none' }}
      allowEscapeViewBox={allowEscapeViewBox}
      offset={offset}
    />
  );
}

/** 通用 Legend：基于 LEGEND_WRAPPER_STYLE 默认样式 */
export function ChartLegend() {
  return <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />;
}
