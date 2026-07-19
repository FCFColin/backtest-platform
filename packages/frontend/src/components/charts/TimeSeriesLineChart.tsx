/**
 * @file 时间序列折线图通用组件
 * @description 推广自 signal/SignalResultsPanel.tsx 的 EquityLineChart，去除信号页特定 i18n 默认值，
 *              提供更通用的 API 供 PCA / Tactical / Regression 等页面复用，替代内联 LineChart 样板。
 *              与 sharedChartContent.tsx 的 TimeSeriesLineChartContent 并存：本组件支持每系列独立配置
 *              （strokeDasharray / showDots / color 等），后者仅接受 string[] 系列。
 */
import type { ReactElement } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Brush,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import {
  CHART_TOOLTIP_STYLE,
  CHART_MARGIN,
  CHART_GRID_PROPS,
  AXIS_TICK_STYLE,
  LEGEND_WRAPPER_STYLE,
  DATE_TICK_FORMATTER,
} from './chartConstants.js';

/** 单系列配置 */
interface TimeSeriesSeriesConfig {
  /** 数据字段名（同时作为 dataKey） */
  dataKey: string;
  /** Legend 显示名，默认等于 dataKey */
  legendName?: string;
  /** 折线宽度，未传则用 defaultStrokeWidth */
  strokeWidth?: number;
  /** 虚线样式（如 '6 3'） */
  strokeDasharray?: string;
  /** 自定义颜色，未传则按 CHART_COLORS 顺序 */
  color?: string;
  /** activeDot 半径，默认 4 */
  activeDotR?: number;
  /** 是否显示数据点 dot，默认 false */
  showDots?: boolean;
  /** 数据点半径，默认 3 */
  dotR?: number;
}

/** 通用图表数据点 */
type ChartDataPoint = Record<string, number | string>;

/** Tooltip 值格式化函数类型 */
type TooltipValueFormatter = (value: number) => [string, string];

interface TimeSeriesLineChartProps {
  /** 图表数据，键包含 xDataKey 与各系列 dataKey */
  data: ChartDataPoint[];
  /** 系列；可传字符串数组（仅 dataKey）或完整配置数组 */
  series: TimeSeriesSeriesConfig[] | string[];
  /** X 轴数据字段名，默认 'date' */
  xDataKey?: string;
  /** 图表高度，默认 350 */
  height?: number;
  /** Y 轴刻度格式化；未传则使用 `$k` 千分位格式 */
  yTickFormatter?: (v: number) => string;
  /** Tooltip 值格式化，返回 [文本, 名称]；未传则使用 `$value` 格式 */
  tooltipValueFormatter?: TooltipValueFormatter;
  /** Tooltip 标签格式化；未传则原样返回 */
  tooltipLabelFormatter?: (label: string) => string;
  /** Y 轴域 */
  yDomain?: [number | 'auto', number | 'auto'];
  /** 水平参考线 Y 值（如 0），undefined 表示不显示 */
  referenceY?: number;
  /** 是否显示 Brush（数据点超过 brushThreshold 时生效） */
  showBrush?: boolean;
  /** Brush 触发阈值，默认 100 */
  brushThreshold?: number;
  /** 是否显示 Legend，默认 true */
  showLegend?: boolean;
  /** 默认折线宽度，默认 2 */
  defaultStrokeWidth?: number;
  /** 颜色起始偏移（用于跳过基准色），默认 0 */
  colorOffset?: number;
  /** Y 轴标签文本 */
  yLabel?: string;
  /** X 轴刻度间隔（'preserveStartEnd' 或数字），未传则不设 */
  xTickInterval?: number | 'preserveStartEnd';
  /** X 轴刻度字体大小（覆盖默认 AXIS_TICK_STYLE） */
  xTickFontSize?: number;
}

interface NormalizedSeries {
  dataKey: string;
  legendName: string;
  strokeWidth: number;
  strokeDasharray?: string;
  color?: string;
  activeDotR: number;
  showDots: boolean;
  dotR: number;
}

function normalizeSeries(
  series: TimeSeriesSeriesConfig[] | string[],
  defaultStrokeWidth: number,
): NormalizedSeries[] {
  return series.map((s) => {
    const cfg = typeof s === 'string' ? { dataKey: s } : s;
    return {
      dataKey: cfg.dataKey,
      legendName: cfg.legendName ?? cfg.dataKey,
      strokeWidth: cfg.strokeWidth ?? defaultStrokeWidth,
      strokeDasharray: cfg.strokeDasharray,
      color: cfg.color,
      activeDotR: cfg.activeDotR ?? 4,
      showDots: cfg.showDots ?? false,
      dotR: cfg.dotR ?? 3,
    };
  });
}

/** 默认 Y 轴刻度格式化：千分位 $k 格式 */
const defaultYTickFormatter = (v: number): string =>
  v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0);

/** 默认 Tooltip 值格式化：$ 千分位 */
const defaultTooltipValueFormatter: TooltipValueFormatter = (v: number): [string, string] => [
  `$${v.toLocaleString()}`,
  '',
];

const identityLabelFormatter = (label: string): string => `${label}`;

/** 渲染 X 轴 */
function renderXAxis(
  xDataKey: string,
  xTickFontSize: number | undefined,
  xTickInterval: number | 'preserveStartEnd' | undefined,
): ReactElement {
  const tick = xTickFontSize
    ? { fill: 'var(--text-muted)', fontSize: xTickFontSize }
    : AXIS_TICK_STYLE;
  return (
    <XAxis
      dataKey={xDataKey}
      tick={tick}
      tickFormatter={DATE_TICK_FORMATTER}
      interval={xTickInterval}
    />
  );
}

/** 渲染 Y 轴（含可选 Y 轴标签） */
function renderYAxis(
  yTickFormatter: (v: number) => string,
  yDomain: [number | 'auto', number | 'auto'] | undefined,
  yLabel: string | undefined,
): ReactElement {
  return (
    <YAxis
      tick={AXIS_TICK_STYLE}
      tickFormatter={yTickFormatter}
      domain={yDomain}
      label={
        yLabel
          ? {
              value: yLabel,
              angle: -90,
              position: 'insideLeft',
              style: { fill: 'var(--text-muted)', fontSize: 12 },
            }
          : undefined
      }
    />
  );
}

/** 渲染所有 Line 系列 */
function renderLines(normalized: NormalizedSeries[], colorOffset: number): ReactElement[] {
  return normalized.map((s, idx) => (
    <Line
      key={s.dataKey}
      type="monotone"
      dataKey={s.dataKey}
      name={s.legendName}
      stroke={s.color ?? CHART_COLORS[(idx + colorOffset) % CHART_COLORS.length]}
      strokeWidth={s.strokeWidth}
      strokeDasharray={s.strokeDasharray}
      dot={s.showDots ? { r: s.dotR } : false}
      activeDot={{ r: s.activeDotR }}
    />
  ));
}

/**
 * 时间序列折线图
 *
 * 通用 Recharts LineChart 包装，支持多系列、参考线、Brush、自定义坐标轴/Tooltip 格式化。
 * 用于替代各页面内联的 LineChart 样板（Growth/Best/Residual/Cumulative 等）。
 */
export function TimeSeriesLineChart({
  data,
  series,
  xDataKey = 'date',
  height = 350,
  yTickFormatter = defaultYTickFormatter,
  tooltipValueFormatter = defaultTooltipValueFormatter,
  tooltipLabelFormatter = identityLabelFormatter,
  yDomain,
  referenceY,
  showBrush = false,
  brushThreshold = 100,
  showLegend = true,
  defaultStrokeWidth = 2,
  colorOffset = 0,
  yLabel,
  xTickInterval,
  xTickFontSize,
}: TimeSeriesLineChartProps) {
  const normalized = normalizeSeries(series, defaultStrokeWidth);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
        {renderXAxis(xDataKey, xTickFontSize, xTickInterval)}
        {renderYAxis(yTickFormatter, yDomain, yLabel)}
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          labelFormatter={tooltipLabelFormatter}
          formatter={tooltipValueFormatter}
        />
        {showLegend && <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />}
        {referenceY !== undefined && (
          <ReferenceLine y={referenceY} stroke="var(--text-muted)" strokeDasharray="4 4" />
        )}
        {renderLines(normalized, colorOffset)}
        {showBrush && data.length > brushThreshold && (
          <Brush
            dataKey={xDataKey}
            height={20}
            stroke="var(--brand)"
            travellerWidth={8}
            tickFormatter={DATE_TICK_FORMATTER}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
