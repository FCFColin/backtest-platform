/**
 * 共享图表渲染内容 — TimeSeriesLine / Bar 两族图表的统一渲染层
 *
 * 企业理由：backtest 页和 analysis 页各自实现了相同的 Recharts 渲染逻辑，
 * 样式/tooltip/坐标轴配置重复。提取共享内容组件后，两页复用同一渲染层，
 * 样式变更只需改一处。RO-061 扩展 TimeSeriesLineChartContent 与 BarChartContent
 * 覆盖 Rolling/Seasonality/AnnualReturns/ReturnsTabDaily 等同构图表。
 */
import type { ReactElement } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
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

/** 通用系列名列表 */
type SeriesNames = string[];

/** 通用图表数据点 */
type ChartDataPoint = Record<string, number | string>;

/** Tooltip 值格式化函数类型 */
type TooltipValueFormatter = (value: number) => [string, string];

// ===== 内部辅助函数：抽取 CartesianGrid/XAxis/Legend/Tooltip/Brush/Lines 重复样板 =====

/** 通用 CartesianGrid（虚线网格 + subtle 背景），5 处复用 */
function chartGrid(): ReactElement {
  return <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />;
}

/** 通用日期 X 轴，4 处复用 */
function dateXAxis(dataKey: string = 'date'): ReactElement {
  return <XAxis dataKey={dataKey} tick={AXIS_TICK_STYLE} tickFormatter={DATE_TICK_FORMATTER} />;
}

/** 通用 Legend，5 处复用 */
function chartLegend(): ReactElement {
  return <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />;
}

/** 通用 Tooltip（可选 labelFormatter），5 处复用 */
function chartTooltip(
  formatter: TooltipValueFormatter | undefined,
  labelFormatter: ((label: string) => string) | undefined = undefined,
): ReactElement {
  return (
    <Tooltip
      contentStyle={CHART_TOOLTIP_STYLE}
      labelFormatter={labelFormatter}
      formatter={formatter}
    />
  );
}

/** 条件渲染 Brush（数据点超过阈值时显示），4 处复用 */
function maybeBrush(
  showBrush: boolean,
  dataLength: number,
  dataKey: string = 'date',
  threshold: number = 100,
): ReactElement | null {
  if (!showBrush || dataLength <= threshold) return null;
  return (
    <Brush
      dataKey={dataKey}
      height={20}
      stroke="var(--brand)"
      travellerWidth={8}
      tickFormatter={DATE_TICK_FORMATTER}
    />
  );
}

/** renderLines 选项 */
interface RenderLinesOptions {
  /** 颜色起始偏移（跳过基准色），默认 0 */
  colorOffset?: number;
  /** 折线宽度，默认 2 */
  strokeWidth?: number;
  /** activeDot 半径，默认 4 */
  activeDotR?: number;
}

/** 多系列 Line 数组渲染，TimeSeriesLineChartContent 复用 */
function renderLines(
  seriesNames: SeriesNames,
  { colorOffset = 0, strokeWidth = 2, activeDotR = 4 }: RenderLinesOptions = {},
): ReactElement[] {
  return seriesNames.map((name, idx) => (
    <Line
      key={name}
      type="monotone"
      dataKey={name}
      stroke={CHART_COLORS[(idx + colorOffset) % CHART_COLORS.length]}
      strokeWidth={strokeWidth}
      dot={false}
      activeDot={{ r: activeDotR }}
    />
  ));
}

interface TimeSeriesLineChartContentProps {
  data: ChartDataPoint[];
  seriesNames: SeriesNames;
  /** X 轴数据字段名，默认 'date' */
  xDataKey?: string;
  height?: number;
  /** Y 轴刻度格式化；未传则不设 formatter */
  yTickFormatter?: (v: number) => string;
  /** Tooltip 值格式化，返回 [文本, 名称] */
  tooltipValueFormatter?: TooltipValueFormatter;
  /** Tooltip 标签（X 轴值）格式化 */
  tooltipLabelFormatter?: (label: string) => string;
  /** Y 轴域 */
  yDomain?: [number | 'auto', number | 'auto'];
  /** 水平参考线 Y 值（如 0） */
  referenceY?: number;
  /** 是否显示 Brush（数据点超过 brushThreshold 时生效） */
  showBrush?: boolean;
  /** Brush 触发阈值，默认 100 */
  brushThreshold?: number;
  /** 是否显示 Legend，默认 true */
  showLegend?: boolean;
  /** 折线宽度，默认 1.5 */
  strokeWidth?: number;
  /** 颜色起始偏移（用于跳过基准色），默认 0 */
  colorOffset?: number;
}

/** 泛化时间序列折线图渲染（Rolling/Correlation 等） */
export function TimeSeriesLineChartContent({
  data,
  seriesNames,
  xDataKey = 'date',
  height = 300,
  yTickFormatter,
  tooltipValueFormatter = (v) => [v.toFixed(2), ''],
  tooltipLabelFormatter = (label) => `${label}`,
  yDomain,
  referenceY,
  showBrush = false,
  brushThreshold = 100,
  showLegend = true,
  strokeWidth = 1.5,
  colorOffset = 0,
}: TimeSeriesLineChartContentProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={CHART_MARGIN}>
        {chartGrid()}
        {dateXAxis(xDataKey)}
        <YAxis tick={AXIS_TICK_STYLE} tickFormatter={yTickFormatter} domain={yDomain} />
        {chartTooltip(tooltipValueFormatter, tooltipLabelFormatter)}
        {showLegend && chartLegend()}
        {referenceY !== undefined && (
          <ReferenceLine y={referenceY} stroke="var(--text-muted)" strokeDasharray="4 4" />
        )}
        {renderLines(seriesNames, { colorOffset, strokeWidth, activeDotR: 3 })}
        {maybeBrush(showBrush, data.length, xDataKey, brushThreshold)}
      </LineChart>
    </ResponsiveContainer>
  );
}

interface BarChartContentProps {
  data: ChartDataPoint[];
  seriesNames: SeriesNames;
  /** X 轴数据字段名 */
  xDataKey: string;
  height?: number;
  /** Y 轴刻度格式化 */
  yTickFormatter?: (v: number) => string;
  /** Tooltip 值格式化，返回 [文本, 名称]；未传则不设 formatter */
  tooltipValueFormatter?: TooltipValueFormatter;
  /** Y 轴标签文本 */
  yLabel?: string;
  /** 柱顶圆角，默认 0 */
  barRadius?: number;
  /** 填充透明度，默认 1 */
  fillOpacity?: number;
  /** 是否显示 Legend，默认 true */
  showLegend?: boolean;
  /** 单系列时按正负值染色（绿/红），默认 false */
  signColorSingleSeries?: boolean;
  /** X 轴刻度字体大小（覆盖默认 AXIS_TICK_STYLE），默认 undefined 用 AXIS_TICK_STYLE */
  xTickFontSize?: number;
  /** X 轴刻度间隔（同 Recharts interval），默认 undefined */
  xTickInterval?: number;
}

/** 泛化柱状图渲染（Seasonality/AnnualReturns/DailyHist 等） */
export function BarChartContent({
  data,
  seriesNames,
  xDataKey,
  height = 350,
  yTickFormatter = (v) => v.toFixed(0),
  tooltipValueFormatter,
  yLabel,
  barRadius = 0,
  fillOpacity = 1,
  showLegend = true,
  signColorSingleSeries = false,
  xTickFontSize,
  xTickInterval,
}: BarChartContentProps) {
  const xTick = xTickFontSize
    ? { fill: 'var(--text-muted)', fontSize: xTickFontSize }
    : AXIS_TICK_STYLE;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={CHART_MARGIN}>
        {chartGrid()}
        <XAxis dataKey={xDataKey} tick={xTick} interval={xTickInterval} />
        <YAxis
          tick={AXIS_TICK_STYLE}
          tickFormatter={yTickFormatter}
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
        {chartTooltip(tooltipValueFormatter)}
        {showLegend && chartLegend()}
        {seriesNames.length === 1 && signColorSingleSeries ? (
          <Bar dataKey={seriesNames[0]} radius={[barRadius, barRadius, 0, 0]}>
            {data.map((entry, idx) => {
              const val = entry[seriesNames[0]] as number;
              return <Cell key={idx} fill={val >= 0 ? 'var(--success)' : 'var(--error)'} />;
            })}
          </Bar>
        ) : (
          seriesNames.map((name, idx) => (
            <Bar
              key={name}
              dataKey={name}
              fill={CHART_COLORS[idx % CHART_COLORS.length]}
              radius={[barRadius, barRadius, 0, 0]}
              fillOpacity={fillOpacity}
            />
          ))
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}
