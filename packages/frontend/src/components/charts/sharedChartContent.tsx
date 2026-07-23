/**
 * 共享图表渲染内容 — Bar / Area / Scatter 三族图表的统一渲染层
 *
 * 企业理由：backtest 页和 analysis 页各自实现了相同的 Recharts 渲染逻辑，
 * 样式/tooltip/坐标轴配置重复。提取共享内容组件后，两页复用同一渲染层，
 * 样式变更只需改一处。RO-061 扩展 BarChartContent / AreaChartContent /
 * ScatterChartContent 覆盖 Seasonality/AnnualReturns/ReturnsTabDaily 等同构图表。
 * 时间序列折线图统一使用 TimeSeriesLineChart.tsx（支持每系列独立配置）。
 */
import type { ReactElement } from 'react';
import {
  BarChart,
  Bar,
  Cell,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  ZAxis,
  LabelList,
  Label,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush,
  ReferenceDot,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import {
  CHART_TOOLTIP_STYLE,
  CHART_MARGIN,
  CHART_GRID_PROPS,
  AXIS_TICK_STYLE,
  LEGEND_WRAPPER_STYLE,
  DATE_TICK_FORMATTER,
  wrapTooltipFormatter,
} from './chartConstants.js';
import type { TooltipValueFormatter } from './chartConstants.js';

/** 通用系列名列表 */
type SeriesNames = string[];

/** 通用图表数据点 */
type ChartDataPoint = Record<string, number | string>;

// ===== 内部辅助函数：抽取 CartesianGrid/XAxis/Legend/Tooltip/Brush 重复样板 =====

/** 通用 CartesianGrid（虚线网格 + subtle 背景），3 处复用 */
function chartGrid(): ReactElement {
  return <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />;
}

/** 通用日期 X 轴，1 处复用 */
function dateXAxis(dataKey: string = 'date'): ReactElement {
  return <XAxis dataKey={dataKey} tick={AXIS_TICK_STYLE} tickFormatter={DATE_TICK_FORMATTER} />;
}

/** 通用 Legend，2 处复用 */
function chartLegend(): ReactElement {
  return <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />;
}

/** 通用 Tooltip（可选 labelFormatter），3 处复用 */
function chartTooltip(
  formatter: TooltipValueFormatter | undefined,
  labelFormatter: ((label: string) => string) | undefined = undefined,
): ReactElement {
  return (
    <Tooltip
      contentStyle={CHART_TOOLTIP_STYLE}
      labelFormatter={labelFormatter}
      formatter={wrapTooltipFormatter(formatter)}
      cursor={{ stroke: 'var(--border-soft)', strokeWidth: 1, strokeDasharray: '4 4' }}
      isAnimationActive={true}
      animationDuration={150}
      wrapperStyle={{ zIndex: 1000, outline: 'none', pointerEvents: 'none' }}
      allowEscapeViewBox={{ x: true, y: true }}
      offset={20}
    />
  );
}

/** 条件渲染 Brush（数据点超过阈值时显示），1 处复用 */
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

/** 渲染面积图渐变定义 */
function renderGradientDefs(
  seriesNames: SeriesNames,
  colorOffset: number,
  fillOpacity: number,
): ReactElement[] {
  return seriesNames.map((name, idx) => {
    const color = CHART_COLORS[(idx + colorOffset) % CHART_COLORS.length];
    const gradientId = `gradient-${name.replace(/\s+/g, '-')}`;
    return (
      <linearGradient key={gradientId} id={gradientId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor={color} stopOpacity={fillOpacity} />
        <stop offset="95%" stopColor={color} stopOpacity={0.02} />
      </linearGradient>
    );
  });
}

/** 渲染面积系列 */
function renderAreas(
  seriesNames: SeriesNames,
  colorOffset: number,
  useGradient: boolean,
  fillOpacity: number,
  strokeWidth: number,
): ReactElement[] {
  return seriesNames.map((name, idx) => {
    const color = CHART_COLORS[(idx + colorOffset) % CHART_COLORS.length];
    const gradientId = `gradient-${name.replace(/\s+/g, '-')}`;
    return (
      <Area
        key={name}
        type="monotone"
        dataKey={name}
        name={name}
        stroke={color}
        fill={useGradient ? `url(#${gradientId})` : color}
        fillOpacity={useGradient ? 1 : fillOpacity}
        strokeWidth={strokeWidth}
        activeDot={{ r: 5, stroke: 'var(--bg-elevated)', strokeWidth: 2 }}
      />
    );
  });
}

/** 渲染参考点（最大回撤标注） */
function renderReferenceDots(
  referenceDots: ReferenceDotConfig[] | undefined,
  colorOffset: number,
): ReactElement[] | null {
  if (!referenceDots) return null;
  return referenceDots.map((dot, idx) => {
    const color = CHART_COLORS[(idx + colorOffset) % CHART_COLORS.length];
    return (
      <ReferenceDot
        key={`${dot.name}-${dot.x}`}
        x={dot.x}
        y={dot.y}
        r={5}
        fill={color}
        stroke="var(--bg-elevated)"
        strokeWidth={2}
      >
        <Label
          value={`${dot.value.toFixed(2)}%`}
          position="top"
          offset={8}
          style={{ fill: color, fontSize: 11, fontWeight: 600 }}
        />
      </ReferenceDot>
    );
  });
}

const AXIS_LABEL_STYLE = { fill: 'var(--text-muted)', fontSize: 12 };

/** 渲染散点系列 */
function renderScatters(
  data: Array<Record<string, string | number>>,
  nameDataKey: string,
): ReactElement[] {
  return data.map((point, idx) => (
    <Scatter
      key={String(point[nameDataKey])}
      data={[point]}
      fill={CHART_COLORS[idx % CHART_COLORS.length]}
      {...({ activeDot: { r: 5, stroke: 'var(--bg-elevated)', strokeWidth: 2 } } as object)}
    >
      <LabelList
        dataKey={nameDataKey}
        position="right"
        style={{ fill: 'var(--text-muted)', fontSize: 11 }}
      />
    </Scatter>
  ));
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
          width={80}
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

/** 参考点配置（最大回撤标注等） */
interface ReferenceDotConfig {
  x: string | number;
  y: number;
  name: string;
  value: number;
}

interface AreaChartContentProps {
  data: ChartDataPoint[];
  seriesNames: SeriesNames;
  xDataKey?: string;
  height?: number;
  yTickFormatter?: (v: number) => string;
  yDomain?: [number | 'auto', number | 'auto'];
  tooltipValueFormatter?: TooltipValueFormatter;
  tooltipLabelFormatter?: (label: string) => string;
  fillOpacity?: number;
  strokeWidth?: number;
  showBrush?: boolean;
  brushThreshold?: number;
  showLegend?: boolean;
  colorOffset?: number;
  referenceDots?: ReferenceDotConfig[];
  useGradient?: boolean;
  customMargin?: { top?: number; right?: number; bottom?: number; left?: number };
  yAxisWidth?: number;
  hideAxisLines?: boolean;
}

export function AreaChartContent({
  data,
  seriesNames,
  xDataKey = 'date',
  height = 300,
  yTickFormatter,
  yDomain,
  tooltipValueFormatter = (v) => [v.toFixed(2), ''],
  tooltipLabelFormatter,
  fillOpacity = 0.12,
  strokeWidth = 1.5,
  showBrush = false,
  brushThreshold = 100,
  showLegend = true,
  colorOffset = 0,
  referenceDots,
  useGradient = false,
  customMargin,
  yAxisWidth = 80,
  hideAxisLines = false,
}: AreaChartContentProps) {
  const margin = customMargin ? { ...CHART_MARGIN, ...customMargin } : CHART_MARGIN;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={margin}>
        <defs>{renderGradientDefs(seriesNames, colorOffset, fillOpacity)}</defs>
        {chartGrid()}
        {dateXAxis(xDataKey)}
        <YAxis
          tick={AXIS_TICK_STYLE}
          tickFormatter={yTickFormatter}
          domain={yDomain}
          width={yAxisWidth}
          tickLine={!hideAxisLines}
          axisLine={!hideAxisLines}
        />
        {chartTooltip(tooltipValueFormatter, tooltipLabelFormatter)}
        {showLegend && chartLegend()}
        {renderAreas(seriesNames, colorOffset, useGradient, fillOpacity, strokeWidth)}
        {renderReferenceDots(referenceDots, colorOffset)}
        {maybeBrush(showBrush, data.length, xDataKey, brushThreshold)}
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface ScatterChartContentProps {
  data: Array<Record<string, string | number>>;
  xDataKey: string;
  xName: string;
  yDataKey: string;
  yName: string;
  xLabel?: string;
  yLabel?: string;
  nameDataKey?: string;
  height?: number;
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  tooltipFormatter?: (value: number | string, name: string) => [string, string];
  tooltipLabelFormatter?: (label: string) => string;
  zRange?: [number, number];
}

export function ScatterChartContent({
  data,
  xDataKey,
  xName,
  yDataKey,
  yName,
  xLabel,
  yLabel,
  nameDataKey = 'name',
  height = 450,
  margin = CHART_MARGIN,
  tooltipFormatter,
  tooltipLabelFormatter,
  zRange = [80, 80],
}: ScatterChartContentProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={margin}>
        {chartGrid()}
        <XAxis
          type="number"
          dataKey={xDataKey}
          name={xName}
          tick={AXIS_TICK_STYLE}
          label={
            xLabel
              ? { value: xLabel, position: 'insideBottom', offset: -10, style: AXIS_LABEL_STYLE }
              : undefined
          }
        />
        <YAxis
          type="number"
          dataKey={yDataKey}
          name={yName}
          tick={AXIS_TICK_STYLE}
          width={80}
          label={
            yLabel
              ? { value: yLabel, angle: -90, position: 'insideLeft', style: AXIS_LABEL_STYLE }
              : undefined
          }
        />
        <ZAxis range={zRange} />
        {chartTooltip(tooltipFormatter as TooltipValueFormatter, tooltipLabelFormatter)}
        {renderScatters(data, nameDataKey)}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
