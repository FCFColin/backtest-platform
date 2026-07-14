/**
 * 共享图表渲染内容 — Growth / Drawdown / Telltale / TimeSeriesLine / Bar 五族图表的统一渲染层
 *
 * 企业理由：backtest 页和 analysis 页各自实现了相同的 Recharts 渲染逻辑，
 * 样式/tooltip/坐标轴配置重复。提取共享内容组件后，两页复用同一渲染层，
 * 样式变更只需改一处。RO-061 扩展 TimeSeriesLineChartContent 与 BarChartContent
 * 覆盖 Rolling/Seasonality/AnnualReturns/ReturnsTabDaily 等同构图表。
 */
import {
  LineChart,
  Line,
  AreaChart,
  Area,
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

interface GrowthChartContentProps {
  data: ChartDataPoint[];
  seriesNames: SeriesNames;
  height?: number;
  logScale?: boolean;
  showBrush?: boolean;
  yLabelFormatter?: (v: number) => string;
  tooltipValueFormatter?: (v: number) => [string, string];
}

/** 增长曲线图共享渲染 */
export function GrowthChartContent({
  data,
  seriesNames,
  height = 400,
  logScale = false,
  showBrush = false,
  yLabelFormatter = (v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)),
  tooltipValueFormatter = (v) => [`$${v.toLocaleString()}`, ''],
}: GrowthChartContentProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
        <XAxis dataKey="date" tick={AXIS_TICK_STYLE} tickFormatter={DATE_TICK_FORMATTER} />
        <YAxis
          scale={logScale ? 'log' : 'linear'}
          domain={['auto', 'auto']}
          tick={AXIS_TICK_STYLE}
          tickFormatter={yLabelFormatter}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          labelFormatter={(label: string) => `${label}`}
          formatter={tooltipValueFormatter}
        />
        <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
        {seriesNames.map((name, idx) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            stroke={CHART_COLORS[idx % CHART_COLORS.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
        {showBrush && data.length > 100 && (
          <Brush
            dataKey="date"
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

interface DrawdownChartContentProps {
  data: ChartDataPoint[];
  seriesNames: SeriesNames;
  height?: number;
  showBrush?: boolean;
}

/** 回撤面积图共享渲染 */
export function DrawdownChartContent({
  data,
  seriesNames,
  height = 300,
  showBrush = false,
}: DrawdownChartContentProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
        <XAxis dataKey="date" tick={AXIS_TICK_STYLE} tickFormatter={DATE_TICK_FORMATTER} />
        <YAxis
          domain={['auto', 0]}
          tick={AXIS_TICK_STYLE}
          tickFormatter={(v: number) => `${v.toFixed(0)}%`}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          labelFormatter={(label: string) => `${label}`}
          formatter={(value: number) => [`${value.toFixed(2)}%`, '']}
        />
        <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
        {seriesNames.map((name, idx) => (
          <Area
            key={name}
            type="monotone"
            dataKey={name}
            stroke={CHART_COLORS[idx % CHART_COLORS.length]}
            fill={CHART_COLORS[idx % CHART_COLORS.length]}
            fillOpacity={0.12}
            strokeWidth={1.5}
          />
        ))}
        {showBrush && data.length > 100 && (
          <Brush
            dataKey="date"
            height={20}
            stroke="var(--brand)"
            travellerWidth={8}
            tickFormatter={DATE_TICK_FORMATTER}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface TelltaleChartContentProps {
  data: ChartDataPoint[];
  seriesNames: SeriesNames;
  height?: number;
  showBrush?: boolean;
  yLabel?: string;
}

/** Telltale 走势对比图共享渲染 */
export function TelltaleChartContent({
  data,
  seriesNames,
  height = 400,
  showBrush = false,
  yLabel,
}: TelltaleChartContentProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
        <XAxis dataKey="date" tick={AXIS_TICK_STYLE} tickFormatter={DATE_TICK_FORMATTER} />
        <YAxis
          tick={AXIS_TICK_STYLE}
          tickFormatter={(v: number) => v.toFixed(3)}
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
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          labelFormatter={(label: string) => `${label}`}
          formatter={(value: number) => [value.toFixed(3), '']}
        />
        <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
        <ReferenceLine y={1} stroke="var(--text-muted)" strokeDasharray="4 4" />
        {seriesNames.map((name, idx) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            stroke={CHART_COLORS[(idx + 1) % CHART_COLORS.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
        {showBrush && data.length > 100 && (
          <Brush
            dataKey="date"
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

interface TimeSeriesLineChartContentProps {
  data: ChartDataPoint[];
  seriesNames: SeriesNames;
  /** X 轴数据字段名，默认 'date' */
  xDataKey?: string;
  height?: number;
  /** Y 轴刻度格式化；未传则不设 formatter */
  yTickFormatter?: (v: number) => string;
  /** Tooltip 值格式化，返回 [文本, 名称] */
  tooltipValueFormatter?: (v: number) => [string, string];
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
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
        <XAxis dataKey={xDataKey} tick={AXIS_TICK_STYLE} tickFormatter={DATE_TICK_FORMATTER} />
        <YAxis tick={AXIS_TICK_STYLE} tickFormatter={yTickFormatter} domain={yDomain} />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          labelFormatter={tooltipLabelFormatter}
          formatter={tooltipValueFormatter}
        />
        {showLegend && <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />}
        {referenceY !== undefined && (
          <ReferenceLine y={referenceY} stroke="var(--text-muted)" strokeDasharray="4 4" />
        )}
        {seriesNames.map((name, idx) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            stroke={CHART_COLORS[(idx + colorOffset) % CHART_COLORS.length]}
            strokeWidth={strokeWidth}
            dot={false}
            activeDot={{ r: 3 }}
          />
        ))}
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

interface BarChartContentProps {
  data: ChartDataPoint[];
  seriesNames: SeriesNames;
  /** X 轴数据字段名 */
  xDataKey: string;
  height?: number;
  /** Y 轴刻度格式化 */
  yTickFormatter?: (v: number) => string;
  /** Tooltip 值格式化，返回 [文本, 名称]；未传则不设 formatter */
  tooltipValueFormatter?: (v: number) => [string, string];
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
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
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
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={tooltipValueFormatter} />
        {showLegend && <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />}
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
