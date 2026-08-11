import type { ReactElement } from 'react';
import {
  LineChart,
  Line,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Brush,
} from 'recharts';
import {
  CHART_MARGIN,
  CHART_GRID_PROPS,
  LEGEND_WRAPPER_STYLE,
  DATE_TICK_FORMATTER,
  getPortfolioColor,
} from '@/lib/chart-theme.js';
import type { TooltipValueFormatter } from '@/lib/chart-theme.js';
import { ChartXAxis, ChartYAxis, ChartTooltip } from './sharedChartContent.js';
import { useChartAnimation } from '@/hooks/miscHooks';
interface TimeSeriesSeriesConfig {
  dataKey: string;
  legendName?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  color?: string;
  activeDotR?: number;
  showDots?: boolean;
  dotR?: number;
  connectNulls?: boolean;
  strokeOpacity?: number;
}
type ChartDataPoint = Record<string, number | string | null>;
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
  connectNulls: boolean;
  strokeOpacity?: number;
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
      connectNulls: cfg.connectNulls ?? false,
      strokeOpacity: cfg.strokeOpacity,
    };
  });
}
const defaultYTickFormatter = (v: number): string =>
  v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0);
const defaultTooltipValueFormatter: TooltipValueFormatter = (v: number): [string, string] => [
  `$${v.toLocaleString()}`,
  '',
];
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
      stroke={s.color ?? getPortfolioColor(idx + colorOffset)}
      strokeWidth={s.strokeWidth}
      strokeDasharray={s.strokeDasharray}
      dot={s.showDots ? { r: s.dotR } : false}
      activeDot={{ r: s.activeDotR + 1, stroke: 'var(--bg-surface)', strokeWidth: 2 }}
      connectNulls={s.connectNulls}
      strokeOpacity={s.strokeOpacity}
      isAnimationActive={isAnimationActive}
    />
  ));
}

export function TimeSeriesLineChart({
  data,
  series,
  xDataKey = 'date',
  height = 350,
  yTickFormatter = defaultYTickFormatter,
  tooltipValueFormatter = defaultTooltipValueFormatter,
  tooltipLabelFormatter,
  yDomain,
  referenceY,
  showBrush = false,
  showLegend = true,
  defaultStrokeWidth = 2,
  colorOffset = 0,
  yLabel,
  xTickInterval,
  xTickFontSize,
}: TimeSeriesLineChartProps) {
  const normalized = normalizeSeries(series, defaultStrokeWidth);
  const isLargeDataset = data.length >= 100;
  const animated = useChartAnimation(isLargeDataset).isAnimationActive;
  return (
    <div role="img" aria-label={normalized.map((s) => s.legendName).join(', ')}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <ChartXAxis dataKey={xDataKey} tickFontSize={xTickFontSize} interval={xTickInterval} />
          <ChartYAxis tickFormatter={yTickFormatter} domain={yDomain} label={yLabel} />
          <ChartTooltip
            formatter={tooltipValueFormatter}
            labelFormatter={tooltipLabelFormatter}
            isLargeDataset={isLargeDataset}
          />
          {showLegend && <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />}
          {referenceY !== undefined && (
            <ReferenceLine y={referenceY} stroke="var(--text-muted)" strokeDasharray="4 4" />
          )}
          {renderLines(normalized, colorOffset, animated)}
          {showBrush && data.length >= 100 && (
            <Brush
              dataKey={xDataKey}
              height={20}
              stroke="hsl(var(--brand))"
              fill="var(--bg-surface)"
              travellerWidth={8}
              tickFormatter={DATE_TICK_FORMATTER}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
