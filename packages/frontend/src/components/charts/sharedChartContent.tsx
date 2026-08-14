import type { EChartsOption } from 'echarts';
import { CHART_MARGIN, getPortfolioColor } from '@/lib/chart-theme.js';
import type { TooltipValueFormatter } from '@/lib/chart-theme.js';
import { useChartAnimation } from '@/hooks/miscHooks.js';
import EChart from './EChart.js';
import {
  categoryAxis,
  chartGrid,
  chartLegend,
  markLineData,
  scatterLabel,
  tooltipRow,
  tooltipOption,
  axisTooltipFormatter,
  valueXAxis,
  valueYAxis,
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
  opacity?: number;
  emphasisDotR?: number;
  areaOpacity?: number;
  smooth?: boolean;
}
export interface SimpleChartProps {
  type?: 'line' | 'area';
  data: ChartDataPoint[];
  height?: number;
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  xDataKey?: string;
  xType?: 'number' | 'category';
  xLabel?: string;
  xTickFormatter?: (v: number | string) => string;
  xTickInterval?: number | 'preserveStartEnd';
  xTickFontSize?: number;
  yTickFormatter?: (v: number) => string;
  yDomain?: [number | 'auto', number | 'auto'];
  yScale?: 'log' | 'linear';
  yLabel?: string;
  tooltipFormatter?: TooltipValueFormatter;
  tooltipLabelFormatter?: (label: string) => string;
  showLegend?: boolean;
  legendPosition?: 'top' | 'bottom';
  legendFormatter?: (name: string) => string;
  areaColor?: string;
  colorOffset?: number;
  dataZoom?: boolean;
  ariaLabel?: string;
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
  xTickFontSize,
  yTickFormatter = (v) => v.toFixed(0),
  yDomain = ['auto', 'auto'],
  yScale,
  yLabel,
  tooltipFormatter,
  tooltipLabelFormatter,
  showLegend,
  legendPosition = 'bottom',
  legendFormatter,
  areaColor,
  colorOffset = 0,
  dataZoom,
  ariaLabel,
  series,
  referenceLines,
}: SimpleChartProps) {
  const animated = useChartAnimation(data.length >= 100).isAnimationActive;
  const isArea = type === 'area';
  const isCategory = xType !== 'number';
  const showLegendFinal = showLegend ?? !isArea;
  const showDataZoom = dataZoom === true && data.length >= 100;
  const grid = chartGrid(margin, {
    legendBottom: legendPosition === 'top' ? 0 : showLegendFinal ? 24 : 0,
    dataZoomBottom: showDataZoom ? 28 : 0,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 需要动态添加 markLine 属性
  const seriesArr: any[] = series.map((s, i) => {
    const color = s.color ?? getPortfolioColor(i + colorOffset);
    return {
      name: s.name ?? s.dataKey,
      type: 'line',
      data: isCategory
        ? data.map((d) => d[s.dataKey] ?? null)
        : data.map((d) => [Number(d[xDataKey]), d[s.dataKey] ?? null]),
      // 密集序列平滑无视觉失真；稀疏序列用直线如实反映月度跳变
      smooth: s.smooth ?? data.length >= 100,
      symbol: s.symbol ?? 'none',
      showSymbol: s.symbol != null,
      symbolSize: s.symbolSize ?? 8,
      lineStyle: { width: s.width ?? 2.5, type: s.dash ?? 'solid', color, opacity: s.opacity },
      itemStyle: { color },
      connectNulls: s.connectNulls ?? false,
      stack: s.stackId,
      emphasis: {
        focus: 'series',
        ...(s.emphasisDotR !== undefined ? { symbolSize: s.emphasisDotR } : {}),
      },
      areaStyle: isArea
        ? areaColor
          ? { color: areaColor, opacity: 0.25 }
          : { color, opacity: s.areaOpacity ?? 0.15 }
        : undefined,
    };
  });
  if (referenceLines?.length && seriesArr[0])
    seriesArr[0].markLine = markLineData(referenceLines, 'hsl(var(--text-muted))');
  const option: EChartsOption = {
    grid,
    xAxis: isCategory
      ? categoryAxis(
          data.map((d) => d[xDataKey] ?? ''),
          {
            name: xLabel,
            nameGap: 28,
            formatter: xTickFormatter,
            interval: xTickInterval === 'preserveStartEnd' ? 'auto' : xTickInterval,
            fontSize: xTickFontSize ?? 11,
          },
        )
      : valueXAxis({
          formatter: xTickFormatter,
          name: xLabel,
          nameGap: 38,
          fontSize: xTickFontSize ?? 11,
        }),
    yAxis: valueYAxis({
      formatter: yTickFormatter,
      name: yLabel,
      nameGap: 48,
      type: yScale === 'log' ? 'log' : undefined,
      min: yDomain[0] !== 'auto' ? yDomain[0] : undefined,
      max: yDomain[1] !== 'auto' ? yDomain[1] : undefined,
    }),
    tooltip: tooltipOption(axisTooltipFormatter(tooltipLabelFormatter, tooltipFormatter)),
    legend: showLegendFinal
      ? legendPosition === 'top'
        ? chartLegend({ top: 0, formatter: legendFormatter })
        : chartLegend({ bottom: showDataZoom ? 26 : 0, formatter: legendFormatter })
      : undefined,
    series: seriesArr as EChartsOption['series'],
    dataZoom: showDataZoom
      ? [{ type: 'slider', height: 18, bottom: 0, borderColor: 'transparent' }]
      : undefined,
    animation: animated,
  };
  return (
    <EChart
      option={option}
      height={height}
      ariaLabel={ariaLabel ?? ([xLabel, yLabel].filter(Boolean).join(' vs ') || 'Chart')}
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
    xAxis: categoryAxis(
      data.map((d) => String(d[xDataKey])),
      {
        fontSize: xTickFontSize ?? 11,
        interval: xTickInterval ?? 'auto',
      },
    ),
    yAxis: valueYAxis({ formatter: yTickFormatter, name: yLabel, nameGap: 48 }),
    tooltip: tooltipOption(axisTooltipFormatter(undefined, tooltipValueFormatter)),
    legend: showLegend ? chartLegend() : undefined,
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
  margin = { top: 20, right: 40, bottom: 60, left: 112 },
  tooltipFormatter,
  tooltipLabelFormatter,
}: ScatterChartContentProps) {
  const animated = useChartAnimation(data.length >= 100).isAnimationActive;
  const fmt2 = (v: number) => Number(v).toFixed(2);
  const option: EChartsOption = {
    grid: chartGrid(margin),
    xAxis: valueXAxis({ formatter: fmt2, name: xLabel ?? xName }),
    yAxis: valueYAxis({ formatter: fmt2, name: yLabel ?? yName }),
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
        label: scatterLabel(),
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
  margin = { top: 20, right: 30, bottom: 60, left: 112 },
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
      label: s.showLabels ? scatterLabel() : undefined,
    };
  });
  if (referenceLines?.length && seriesArr[0])
    seriesArr[0].markLine = markLineData(referenceLines, 'hsl(var(--fg-tertiary))');
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
    grid: chartGrid(margin),
    xAxis: valueXAxis({
      formatter: (xTickFormatter ?? toStr) as (v: number) => string,
      name: xLabel ?? xName,
    }),
    yAxis: valueYAxis({
      formatter: (yTickFormatter ?? toStr) as (v: number) => string,
      name: yLabel ?? yName,
    }),
    tooltip: scatterTooltip(xName, yName, labelFormatter, tooltipFormatter),
    series: seriesArr as EChartsOption['series'],
    animation: animated,
  };
  return (
    <EChart option={option} height={height} ariaLabel={`${xName} vs ${yName}`} onClick={onClick} />
  );
}
