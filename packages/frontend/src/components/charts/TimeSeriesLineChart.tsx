import type { EChartsOption } from 'echarts';
import { CHART_MARGIN, DATE_TICK_FORMATTER, getPortfolioColor } from '@/lib/chart-theme.js';
import type { TooltipValueFormatter } from '@/lib/chart-theme.js';
import { AXIS_TEXT, BORDER_SOFT, axisTooltipFormatter, tooltipOption } from './chartUtils.js';
import { useChartAnimation } from '@/hooks/miscHooks';
import EChart from './EChart.js';
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
  const isCategory = typeof data[0]?.[xDataKey] === 'string';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 需要动态添加 markLine 属性
  const seriesArr: any[] = normalized.map((s, idx) => {
    const color = s.color ?? getPortfolioColor(idx + colorOffset);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 与 seriesArr 同源，需动态加属性
    const base: any = {
      name: s.legendName,
      type: 'line' as const,
      smooth: true,
      data: isCategory
        ? data.map((d) => d[s.dataKey] ?? null)
        : data.map((d) => [Number(d[xDataKey]), d[s.dataKey] ?? null]),
      connectNulls: s.connectNulls,
      symbol: s.showDots ? 'circle' : 'none',
      showSymbol: s.showDots,
      symbolSize: s.dotR,
      lineStyle: {
        width: s.strokeWidth,
        type: (s.strokeDasharray ? 'dashed' : 'solid') as 'solid' | 'dashed',
        color,
        opacity: s.strokeOpacity,
      },
      itemStyle: { color },
      emphasis: {
        focus: 'series' as const,
        symbolSize: s.showDots ? s.activeDotR + 1 : undefined,
      },
    };
    if (referenceY !== undefined && idx === 0) {
      base.markLine = {
        silent: true,
        data: [
          {
            yAxis: referenceY,
            lineStyle: { color: 'hsl(var(--text-muted))', type: 'dashed' },
          },
        ],
      };
    }
    return base;
  });
  const grid = {
    ...CHART_MARGIN,
    bottom: (CHART_MARGIN.bottom ?? 20) + (showBrush && isLargeDataset ? 28 : 0),
  };
  const option: EChartsOption = {
    grid,
    xAxis: {
      type: isCategory ? 'category' : 'value',
      data: isCategory ? data.map((d) => d[xDataKey] ?? '') : undefined,
      axisLabel: {
        ...AXIS_TEXT,
        fontSize: xTickFontSize ?? 11,
        interval:
          xTickInterval === 'preserveStartEnd' ? 'auto' : (xTickInterval as number | undefined),
        formatter: DATE_TICK_FORMATTER,
      },
      axisLine: { lineStyle: { color: BORDER_SOFT } },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: yLabel,
      nameLocation: 'middle',
      nameGap: 52,
      nameTextStyle: AXIS_TEXT,
      min: yDomain && yDomain[0] !== 'auto' ? yDomain[0] : undefined,
      max: yDomain && yDomain[1] !== 'auto' ? yDomain[1] : undefined,
      axisLabel: { ...AXIS_TEXT, formatter: yTickFormatter },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: BORDER_SOFT, opacity: 0.6 } },
    },
    tooltip: tooltipOption(axisTooltipFormatter(tooltipLabelFormatter, tooltipValueFormatter)),
    legend: showLegend
      ? { bottom: 0, textStyle: { color: 'hsl(var(--fg-tertiary))', fontSize: 12 } }
      : undefined,
    dataZoom:
      showBrush && isLargeDataset
        ? [{ type: 'slider', height: 18, bottom: 0, borderColor: 'transparent' }]
        : undefined,
    series: seriesArr as EChartsOption['series'],
    animation: animated,
  };
  return (
    <div role="img" aria-label={normalized.map((s) => s.legendName).join(', ')}>
      <EChart option={option} height={height} />
    </div>
  );
}
