import { useRef, useState, useEffect, type ReactElement } from 'react';
 
import { CHART_MARGIN } from '@/lib/chart-theme.js';
import type { TooltipValueFormatter } from '@/lib/chart-theme.js';
import { SvgBarChart, SvgAreaChart, SvgScatterChart } from './svg/svgCharts.js';
type SeriesNames = string[];
type ChartDataPoint = Record<string, number | string>;
interface ReferenceDotConfig {
  x: string | number;
  y: number;
  name: string;
  value: number;
}
function ResponsiveContainer({ width: propWidth, height, children }: { width?: string | number; height: number; children: (dims: { width: number; height: number }) => ReactElement }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={containerRef} style={{ width: propWidth ?? '100%', height, overflow: 'hidden' }}>
      {containerWidth > 0 && children({ width: containerWidth, height })}
    </div>
  );
}
interface BarChartContentProps {
  data: ChartDataPoint[];
  seriesNames: SeriesNames;
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
export function BarChartContent({ data, seriesNames, xDataKey, height = 350, yTickFormatter = (v) => v.toFixed(0), tooltipValueFormatter, yLabel, barRadius = 0, fillOpacity = 1, showLegend = true, signColorSingleSeries = false, xTickFontSize, xTickInterval }: BarChartContentProps) {
  return <ResponsiveContainer height={height}>{({ width }) => <SvgBarChart data={data} seriesNames={seriesNames} xDataKey={xDataKey} width={width} height={height} margin={CHART_MARGIN} yTickFormatter={yTickFormatter} yLabel={yLabel} barRadius={barRadius} fillOpacity={fillOpacity} showLegend={showLegend} signColorSingleSeries={signColorSingleSeries} xTickFontSize={xTickFontSize} xTickInterval={xTickInterval} tooltipValueFormatter={tooltipValueFormatter} />}</ResponsiveContainer>;
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
export function AreaChartContent({ data, seriesNames, xDataKey = 'date', height = 300, yTickFormatter, yDomain, tooltipValueFormatter = (v) => [v.toFixed(2), ''], tooltipLabelFormatter, fillOpacity = 0.12, strokeWidth = 1.5, showLegend = true, colorOffset = 0, referenceDots, useGradient = false, customMargin, hideAxisLines = false }: AreaChartContentProps) {
  const margin = customMargin ? { ...CHART_MARGIN, ...customMargin } : CHART_MARGIN;
  return <ResponsiveContainer height={height}>{({ width }) => <SvgAreaChart data={data} seriesNames={seriesNames} xDataKey={xDataKey} width={width} height={height} margin={margin} yTickFormatter={yTickFormatter} yDomain={yDomain} fillOpacity={fillOpacity} strokeWidth={strokeWidth} showLegend={showLegend} colorOffset={colorOffset} referenceDots={referenceDots} useGradient={useGradient} hideAxisLines={hideAxisLines} tooltipValueFormatter={tooltipValueFormatter} tooltipLabelFormatter={tooltipLabelFormatter} />}</ResponsiveContainer>;
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
export function ScatterChartContent({ data, xDataKey, xName, yDataKey, yName, xLabel, yLabel, nameDataKey = 'name', height = 450, margin = CHART_MARGIN, tooltipFormatter, tooltipLabelFormatter }: ScatterChartContentProps) {
  const mergedMargin = { ...CHART_MARGIN, ...margin };
  return <ResponsiveContainer height={height}>{({ width }) => <SvgScatterChart data={data} xDataKey={xDataKey} xName={xName} yDataKey={yDataKey} yName={yName} xLabel={xLabel} yLabel={yLabel} nameDataKey={nameDataKey} width={width} height={height} margin={mergedMargin} tooltipFormatter={tooltipFormatter} tooltipLabelFormatter={tooltipLabelFormatter} />}</ResponsiveContainer>;
}
