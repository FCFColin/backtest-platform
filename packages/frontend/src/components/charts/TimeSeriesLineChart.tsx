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
  wrapTooltipFormatter,
} from '@/lib/chart-theme.js';
import type { TooltipValueFormatter } from '@/lib/chart-theme.js';
interface TimeSeriesSeriesConfig {
  dataKey: string;
  legendName?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  color?: string;
  activeDotR?: number;
  showDots?: boolean;
  dotR?: number;
}
type ChartDataPoint = Record<string, number | string>;
interface TimeSeriesLineChartProps {
  data: ChartDataPoint[];
  series: TimeSeriesSeriesConfig[] | string[];
  xDataKey?: string;
  height?: number;
  yTickFormatter?: (v: number) => string;
  tooltipValueFormatter?: TooltipValueFormatter;
  tooltipLabelFormatter?: (label: string) => string;
  yDomain?: [number | 'auto', number | 'auto'];
  referenceY?: number;
  showBrush?: boolean;
  brushThreshold?: number;
  showLegend?: boolean;
  defaultStrokeWidth?: number;
  colorOffset?: number;
  yLabel?: string;
  xTickInterval?: number | 'preserveStartEnd';
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
const defaultYTickFormatter = (v: number): string =>
  v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0);
const defaultTooltipValueFormatter: TooltipValueFormatter = (v: number): [string, string] => [
  `$${v.toLocaleString()}`,
  '',
];
const identityLabelFormatter = (label: string): string => `${label}`;
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
  );
}
function renderLines(
  normalized: NormalizedSeries[],
  colorOffset: number,
  isAnimationActive: boolean,
): ReactElement[] {
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
      activeDot={{ r: s.activeDotR + 1, stroke: 'var(--bg-elevated)', strokeWidth: 2 }}
      isAnimationActive={isAnimationActive}
    />
  ));
}
// eslint-disable-next-line complexity
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
  const isLargeDataset = data.length >= 100;
  const seriesAnimationActive = !isLargeDataset;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
        {renderXAxis(xDataKey, xTickFontSize, xTickInterval)}
        {renderYAxis(yTickFormatter, yDomain, yLabel)}
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          labelFormatter={tooltipLabelFormatter}
          formatter={wrapTooltipFormatter(tooltipValueFormatter)}
          cursor={{ stroke: 'var(--border-soft)', strokeWidth: 1, strokeDasharray: '4 4' }}
          isAnimationActive={!isLargeDataset}
          animationDuration={isLargeDataset ? 0 : 150}
          wrapperStyle={{ zIndex: 100, outline: 'none' }}
        />
        {showLegend && <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />}
        {referenceY !== undefined && (
          <ReferenceLine y={referenceY} stroke="var(--text-muted)" strokeDasharray="4 4" />
        )}
        {renderLines(normalized, colorOffset, seriesAnimationActive)}
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
