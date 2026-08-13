import { useTranslation } from 'react-i18next';
import { BarChart3 } from 'lucide-react';
import type { EChartsOption } from 'echarts';
import { CHART_MARGIN, getPortfolioColor } from '@/lib/chart-theme.js';
import type { TooltipValueFormatter } from '@/lib/chart-theme.js';
import { useChartAnimation } from '@/hooks/miscHooks.js';
import EChart from './EChart.js';
import {
  AXIS_TEXT,
  BORDER_SOFT,
  tooltipRow,
  tooltipOption,
  axisTooltipFormatter,
} from './chartUtils.js';

type ChartDataPoint = Record<string, number | string | null>;

const HEADER_DIV = '<div style="font-weight:600;margin-bottom:6px;color:hsl(var(--fg))">';
function scatterTooltip(
  xName: string,
  yName: string,
  labelFormatter?: (label: string) => string,
  valueFormatter?: (value: number, name: string) => [string, string] | string,
) {
  return tooltipOption((p: { name: string; value: [number, number]; color: string }) => {
    const [x, y] = p.value;
    const header = labelFormatter ? labelFormatter(p.name) : p.name;
    const row = (val: number, name: string) => {
      const r = valueFormatter ? valueFormatter(val, name) : [String(val), name];
      const [v, n] = Array.isArray(r) ? r : [r, name];
      return tooltipRow(p.color, n, String(v));
    };
    return (header ? `${HEADER_DIV}${header}</div>` : '') + row(x, xName) + row(y, yName);
  }, 'item');
}
function valueAxis(
  name: string | undefined,
  axisName: string,
  formatter: (v: number) => string,
  isY = false,
) {
  const base = {
    type: 'value' as const,
    name: name ?? axisName,
    nameLocation: 'middle' as const,
    nameGap: isY ? 52 : 34,
    nameTextStyle: AXIS_TEXT,
    axisLabel: { ...AXIS_TEXT, formatter },
    axisTick: { show: false },
  };
  return isY
    ? {
        ...base,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: BORDER_SOFT, opacity: 0.6 } },
      }
    : { ...base, axisLine: { lineStyle: { color: BORDER_SOFT } } };
}

interface SimpleSeriesSpec {
  dataKey: string;
  name?: string;
  color?: string;
  width?: number;
  dash?: string;
  stackId?: string;
  connectNulls?: boolean;
  symbol?: 'circle' | 'square' | 'diamond' | 'none';
  symbolSize?: number;
  areaOpacity?: number;
}
interface SimpleChartProps {
  type?: 'line' | 'area';
  data: ChartDataPoint[];
  height?: number;
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  xDataKey?: string;
  xType?: 'number' | 'category';
  xLabel?: string;
  xTickFormatter?: (v: number | string) => string;
  xTickInterval?: number | 'preserveStartEnd';
  yTickFormatter?: (v: number) => string;
  yDomain?: [number | 'auto', number | 'auto'];
  yScale?: 'log' | 'linear';
  yLabel?: string;
  tooltipFormatter?: TooltipValueFormatter;
  tooltipLabelFormatter?: (label: string) => string;
  showLegend?: boolean;
  legendFormatter?: (name: string) => string;
  gradientId?: string;
  gradientColor?: string;
  series: SimpleSeriesSpec[];
  referenceLines?: Array<{
    axis: 'x' | 'y';
    value: number | string;
    label?: string;
    color?: string;
    dash?: string;
  }>;
}
export function SimpleChart({
  type = 'line',
  data,
  height = 350,
  margin = CHART_MARGIN,
  xDataKey = 'date',
  xType,
  xLabel,
  xTickFormatter,
  xTickInterval,
  yTickFormatter = (v) => v.toFixed(0),
  yDomain = ['auto', 'auto'],
  yScale,
  yLabel,
  tooltipFormatter,
  tooltipLabelFormatter,
  showLegend,
  legendFormatter,
  gradientId,
  gradientColor = 'hsl(var(--danger))',
  series,
  referenceLines,
}: SimpleChartProps) {
  const animated = useChartAnimation(data.length >= 100).isAnimationActive;
  const isArea = type === 'area';
  const isCategory = xType !== 'number';
  const showLegendFinal = showLegend ?? !isArea;
  const grid = {
    left: margin.left ?? CHART_MARGIN.left,
    right: margin.right ?? CHART_MARGIN.right,
    top: margin.top ?? CHART_MARGIN.top,
    bottom: (margin.bottom ?? CHART_MARGIN.bottom) + (showLegendFinal ? 24 : 0),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 需要动态添加 markLine 属性
  const seriesArr: any[] = series.map((s, i) => {
    const color = s.color ?? getPortfolioColor(i);
    return {
      name: s.name ?? s.dataKey,
      type: 'line',
      data: isCategory
        ? data.map((d) => d[s.dataKey] ?? null)
        : data.map((d) => [Number(d[xDataKey]), d[s.dataKey] ?? null]),
      smooth: true,
      symbol: s.symbol ?? 'none',
      showSymbol: s.symbol != null,
      symbolSize: s.symbolSize ?? 8,
      lineStyle: { width: s.width ?? 2.5, type: s.dash ?? 'solid', color },
      itemStyle: { color },
      connectNulls: s.connectNulls ?? false,
      stack: s.stackId,
      emphasis: { focus: 'series' },
      areaStyle: isArea
        ? gradientId
          ? {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: gradientColor },
                  { offset: 1, color: gradientColor },
                ],
              },
              opacity: 0.25,
            }
          : { color, opacity: s.areaOpacity ?? 0.15 }
        : undefined,
    };
  });
  const marks = referenceLines?.map((rl) => {
    const line = {
      [rl.axis === 'x' ? 'xAxis' : 'yAxis']: rl.value,
      lineStyle: { color: rl.color ?? 'hsl(var(--text-muted))', type: rl.dash ?? 'dashed' },
    };
    return rl.label ? { ...line, label: { formatter: rl.label, position: 'insideEndTop' } } : line;
  });
  if (marks?.length && seriesArr[0]) seriesArr[0].markLine = { data: marks, silent: true };
  const option: EChartsOption = {
    grid,
    xAxis: {
      type: isCategory ? 'category' : 'value',
      data: isCategory ? data.map((d) => d[xDataKey] ?? '') : undefined,
      name: xLabel,
      nameLocation: 'middle',
      nameGap: isCategory ? 28 : 38,
      nameTextStyle: AXIS_TEXT,
      axisLabel: {
        ...AXIS_TEXT,
        interval:
          xTickInterval === 'preserveStartEnd' ? 'auto' : (xTickInterval as number | undefined),
        formatter: xTickFormatter,
      },
      axisLine: { lineStyle: { color: BORDER_SOFT } },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: yScale === 'log' ? 'log' : 'value',
      name: yLabel,
      nameLocation: 'middle',
      nameGap: 48,
      nameTextStyle: AXIS_TEXT,
      min: yDomain[0] !== 'auto' ? yDomain[0] : undefined,
      max: yDomain[1] !== 'auto' ? yDomain[1] : undefined,
      axisLabel: { ...AXIS_TEXT, formatter: yTickFormatter },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: BORDER_SOFT, opacity: 0.6 } },
    },
    tooltip: tooltipOption(axisTooltipFormatter(tooltipLabelFormatter, tooltipFormatter)),
    legend: showLegendFinal
      ? {
          bottom: 0,
          textStyle: { color: 'hsl(var(--fg-tertiary))', fontSize: 12 },
          formatter: legendFormatter,
        }
      : undefined,
    series: seriesArr as EChartsOption['series'],
    animation: animated,
  };
  return (
    <EChart
      option={option}
      height={height}
      ariaLabel={[xLabel, yLabel].filter(Boolean).join(' vs ') || 'Chart'}
    />
  );
}
export const SimpleAreaChart = (p: Omit<SimpleChartProps, 'type'>) => (
  <SimpleChart type="area" height={440} showLegend={false} {...p} />
);
export const SimpleLineChart = (p: Omit<SimpleChartProps, 'type'>) => (
  <SimpleChart type="line" {...p} />
);

interface BarChartContentProps {
  data: ChartDataPoint[];
  seriesNames: string[];
  xDataKey: string;
  height?: number;
  yTickFormatter?: (v: number) => string;
  tooltipValueFormatter?: TooltipValueFormatter;
  yLabel?: string;
  barRadius?: number;
  fillOpacity?: number;
  showLegend?: boolean;
  signColorSingleSeries?: boolean;
  xTickFontSize?: number;
  xTickInterval?: number;
}
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
  const animated = useChartAnimation(data.length >= 100).isAnimationActive;
  const singleSignColor = seriesNames.length === 1 && signColorSingleSeries;
  const option: EChartsOption = {
    grid: { left: 80, right: 40, top: 20, bottom: 20 + (showLegend ? 24 : 0) },
    xAxis: {
      type: 'category',
      data: data.map((d) => String(d[xDataKey])),
      axisLabel: {
        ...AXIS_TEXT,
        fontSize: xTickFontSize ?? 11,
        interval: xTickInterval ?? 'auto',
      },
      axisLine: { lineStyle: { color: BORDER_SOFT } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      name: yLabel,
      nameLocation: 'middle',
      nameGap: 48,
      nameTextStyle: AXIS_TEXT,
      axisLabel: { ...AXIS_TEXT, formatter: yTickFormatter },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: BORDER_SOFT, opacity: 0.6 } },
    },
    tooltip: tooltipOption(axisTooltipFormatter(undefined, tooltipValueFormatter)),
    legend: showLegend
      ? { bottom: 0, textStyle: { color: 'hsl(var(--fg-tertiary))', fontSize: 12 } }
      : undefined,
    series: seriesNames.map((name, i) => ({
      type: 'bar',
      name,
      data: data.map((d) => {
        const v = Number(d[name]) || 0;
        return {
          value: v,
          itemStyle: {
            color: singleSignColor
              ? v >= 0
                ? 'hsl(var(--success))'
                : 'hsl(var(--danger))'
              : getPortfolioColor(i),
            opacity: fillOpacity,
            borderRadius: [barRadius, barRadius, 0, 0],
          },
        };
      }),
      barMaxWidth: 60,
    })) as EChartsOption['series'],
    animation: animated,
  };
  return <EChart option={option} height={height} ariaLabel={seriesNames.join(', ')} />;
}

interface ScatterChartContentProps {
  data: ChartDataPoint[];
  xDataKey: string;
  xName: string;
  yDataKey: string;
  yName: string;
  xLabel?: string;
  yLabel?: string;
  nameDataKey?: string;
  height?: number;
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  tooltipFormatter?: (value: number | string, name: string) => [string, string] | string;
  tooltipLabelFormatter?: (label: string) => string;
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
}: ScatterChartContentProps) {
  const animated = useChartAnimation(data.length >= 100).isAnimationActive;
  const fmt2 = (v: number) => Number(v).toFixed(2);
  const option: EChartsOption = {
    grid: {
      left: margin.left ?? 80,
      right: margin.right ?? 40,
      top: margin.top ?? 20,
      bottom: margin.bottom ?? 20,
    },
    xAxis: valueAxis(xLabel, xName, fmt2),
    yAxis: valueAxis(yLabel, yName, fmt2, true),
    tooltip: scatterTooltip(xName, yName, tooltipLabelFormatter, tooltipFormatter),
    series: [
      {
        type: 'scatter',
        data: data.map((d, i) => ({
          value: [Number(d[xDataKey]), Number(d[yDataKey])],
          name: String(d[nameDataKey] ?? ''),
          itemStyle: { color: getPortfolioColor(i) },
        })),
        symbolSize: 8,
        label: {
          show: true,
          position: 'right',
          formatter: (p: { name: string }) => p.name,
          color: 'hsl(var(--text-muted))',
          fontSize: 11,
        },
      },
    ],
    animation: animated,
  };
  return <EChart option={option} height={height} ariaLabel={`${xName} vs ${yName}`} />;
}

export interface XYScatterSeriesSpec {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 兼容无索引签名的具体接口（ScatterPoint、RiskScatterPoint 等）
  data: any[];
  color?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 同上
  colorOf?: (item: any) => string;
  opacity?: number;
  symbol?: 'circle' | 'star' | 'pin' | 'rect' | 'diamond' | 'none';
  symbolSize?: number;
  zDataKey?: string;
  zRange?: [number, number];
  showLabels?: boolean;
  nameKey?: string;
}
interface XYScatterChartProps {
  xKey: string;
  yKey: string;
  xName: string;
  yName: string;
  height?: number;
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  zRange?: [number, number];
  xTickFormatter?: (v: number) => string;
  yTickFormatter?: (v: number) => string;
  tooltipFormatter?: TooltipValueFormatter;
  labelFormatter?: (label: string) => string;
  xLabel?: string;
  yLabel?: string;
  series: XYScatterSeriesSpec[];
  referenceLines?: Array<{
    axis: 'x' | 'y';
    value: number;
    label?: string;
    color?: string;
    dash?: string;
  }>;
  lines?: Array<{ points: [number, number][]; color?: string; dash?: string; width?: number }>;
  onClick?: (params: { dataIndex?: number; seriesIndex?: number }) => void;
}
export function XYScatterChart({
  xKey,
  yKey,
  xName,
  yName,
  height = 300,
  margin = { top: 20, right: 20, bottom: 20, left: 10 },
  zRange = [36, 36],
  xTickFormatter,
  yTickFormatter,
  tooltipFormatter,
  labelFormatter,
  xLabel,
  yLabel,
  series,
  referenceLines,
  lines,
  onClick,
}: XYScatterChartProps) {
  const animated = useChartAnimation(
    series.reduce((n, s) => n + s.data.length, 0) >= 500,
  ).isAnimationActive;
  const toStr = (v: number) => String(v);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 需要动态添加 markLine 和混合 scatter/line 系列
  const seriesArr: any[] = series.map((s, si) => {
    const minMax: { min: number; max: number } | null =
      s.zDataKey && s.data.length
        ? s.data.reduce<{ min: number; max: number }>(
            (acc, d) => {
              const v = Number(d[s.zDataKey!]) || 0;
              return { min: Math.min(acc.min, v), max: Math.max(acc.max, v) };
            },
            { min: Infinity, max: -Infinity },
          )
        : null;
    const sizeOf = (v: number) => {
      if (!minMax || minMax.min === minMax.max) return s.symbolSize ?? 8;
      const [rMin, rMax] = s.zRange ?? zRange;
      return rMin + ((v - minMax.min) / (minMax.max - minMax.min)) * (rMax - rMin);
    };
    return {
      type: 'scatter',
      data: s.data.map((d) => ({
        value: [Number(d[xKey]), Number(d[yKey])],
        name: String(d[s.nameKey ?? 'name'] ?? ''),
        itemStyle: s.colorOf
          ? { color: s.colorOf(d) }
          : { color: s.color ?? getPortfolioColor(si), opacity: s.opacity },
        symbolSize: s.zDataKey ? sizeOf(Number(d[s.zDataKey]) || 0) : (s.symbolSize ?? 8),
      })),
      symbol: s.symbol ?? 'circle',
      label: s.showLabels
        ? {
            show: true,
            position: 'right',
            formatter: (p: { name: string }) => p.name,
            color: 'hsl(var(--text-muted))',
            fontSize: 11,
          }
        : undefined,
    };
  });
  if (referenceLines?.length && seriesArr[0]) {
    seriesArr[0].markLine = {
      silent: true,
      data: referenceLines.map((rl) => ({
        [rl.axis === 'x' ? 'xAxis' : 'yAxis']: rl.value,
        lineStyle: { color: rl.color ?? 'hsl(var(--fg-tertiary))', type: rl.dash ?? 'dashed' },
        ...(rl.label ? { label: { formatter: rl.label, position: 'insideEndTop' } } : {}),
      })),
    };
  }
  if (lines) {
    lines.forEach((l) =>
      seriesArr.push({
        type: 'line',
        data: l.points.map(([x, y]) => ({ value: [x, y] })),
        symbol: 'none',
        lineStyle: { color: l.color, type: l.dash ?? 'dashed', width: l.width ?? 2 },
        silent: true,
        tooltip: { show: false },
      }),
    );
  }
  const option: EChartsOption = {
    grid: {
      left: margin.left ?? 10,
      right: margin.right ?? 20,
      top: margin.top ?? 20,
      bottom: margin.bottom ?? 20,
    },
    xAxis: valueAxis(xLabel, xName, (xTickFormatter ?? toStr) as (v: number) => string),
    yAxis: valueAxis(yLabel, yName, (yTickFormatter ?? toStr) as (v: number) => string, true),
    tooltip: scatterTooltip(xName, yName, labelFormatter, tooltipFormatter),
    series: seriesArr as EChartsOption['series'],
    animation: animated,
  };
  return (
    <EChart option={option} height={height} ariaLabel={`${xName} vs ${yName}`} onClick={onClick} />
  );
}

interface ChartEmptyStateProps {
  message?: string;
  height?: string;
}
export function ChartEmptyState({ message, height = '280px' }: ChartEmptyStateProps) {
  const { t } = useTranslation();
  return (
    <div
      className="flex items-center justify-center border border-dashed border-border-subtle rounded-lg"
      style={{ height }}
      data-testid="chart-empty-state"
    >
      <div className="text-center text-fg-tertiary">
        <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-caption">{message ?? t('No data')}</p>
      </div>
    </div>
  );
}
