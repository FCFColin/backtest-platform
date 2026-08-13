import type { TooltipValueFormatter } from '@/lib/chart-theme.js';
import { DATE_TICK_FORMATTER } from '@/lib/chart-theme.js';
import { fmtAmount } from '@/utils/format';
import { SimpleChart, type SimpleChartProps } from './sharedChartContent.js';

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
  xTickFormatter?: (v: number | string) => string;
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
  fmtAmount(v),
  '',
];

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
  xTickFormatter = DATE_TICK_FORMATTER,
}: TimeSeriesLineChartProps) {
  const normalized = normalizeSeries(series, defaultStrokeWidth);
  const chartSeries: SimpleChartProps['series'] = normalized.map((s) => ({
    dataKey: s.dataKey,
    name: s.legendName,
    color: s.color,
    width: s.strokeWidth,
    dash: s.strokeDasharray,
    connectNulls: s.connectNulls,
    symbol: s.showDots ? 'circle' : 'none',
    symbolSize: s.dotR,
    opacity: s.strokeOpacity,
    emphasisDotR: s.showDots ? s.activeDotR + 1 : undefined,
  }));
  return (
    <SimpleChart
      data={data}
      xDataKey={xDataKey}
      height={height}
      xTickFormatter={xTickFormatter}
      xTickInterval={xTickInterval}
      xTickFontSize={xTickFontSize}
      yTickFormatter={yTickFormatter}
      yDomain={yDomain}
      yLabel={yLabel}
      tooltipFormatter={tooltipValueFormatter}
      tooltipLabelFormatter={tooltipLabelFormatter}
      showLegend={showLegend}
      colorOffset={colorOffset}
      dataZoom={showBrush}
      ariaLabel={normalized.map((s) => s.legendName).join(', ')}
      referenceLines={referenceY !== undefined ? [{ axis: 'y', value: referenceY }] : undefined}
      series={chartSeries}
    />
  );
}
