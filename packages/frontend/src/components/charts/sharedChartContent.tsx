import {
  useRef,
  useState,
  useEffect,
  type ReactElement,
  type ReactNode,
  type ElementType,
} from 'react';
import {
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
  AreaChart,
  LineChart,
  ScatterChart,
  ZAxis,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  CHART_MARGIN,
  CHART_TOOLTIP_STYLE,
  CHART_GRID_PROPS,
  AXIS_TICK_STYLE,
  LEGEND_WRAPPER_STYLE,
  DATE_TICK_FORMATTER,
  wrapTooltipFormatter,
} from '@/lib/chart-theme.js';
import type { TooltipValueFormatter } from '@/lib/chart-theme.js';
import { SvgBarChart, SvgScatterChart } from './svg/svgCharts.js';

type SeriesNames = string[];
type ChartDataPoint = Record<string, number | string>;

function MeasuredContainer({
  width: propWidth,
  height,
  children,
}: {
  width?: string | number;
  height: number;
  children: (dims: { width: number; height: number }) => ReactElement;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ width: propWidth ?? '100%', height, overflow: 'hidden' }}>
      {w > 0 && children({ width: w, height })}
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
export function BarChartContent({
  height = 350,
  yTickFormatter = (v) => v.toFixed(0),
  ...rest
}: BarChartContentProps) {
  return (
    <MeasuredContainer height={height}>
      {({ width }) => (
        <SvgBarChart
          {...rest}
          yTickFormatter={yTickFormatter}
          height={height}
          width={width}
          margin={CHART_MARGIN}
        />
      )}
    </MeasuredContainer>
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
}
export function ScatterChartContent({
  height = 450,
  margin = CHART_MARGIN,
  ...rest
}: ScatterChartContentProps) {
  return (
    <MeasuredContainer height={height}>
      {({ width }) => (
        <SvgScatterChart
          {...rest}
          height={height}
          width={width}
          margin={{ ...CHART_MARGIN, ...margin }}
        />
      )}
    </MeasuredContainer>
  );
}

const LABEL_STYLE = { fill: 'var(--text-muted)', fontSize: 12 } as const;
function axisLabel(label: unknown, angle?: number) {
  if (typeof label !== 'string') return label as string | object | undefined;
  return angle
    ? { value: label, angle, position: 'insideLeft' as const, style: LABEL_STYLE }
    : { value: label, position: 'insideBottom' as const, offset: -10, style: LABEL_STYLE };
}

interface ChartAxisProps {
  dir: 'x' | 'y';
  dataKey?: string;
  type?: 'number' | 'category';
  name?: string;
  // method 签名（双变）以兼容调用方收窄的 formatter，如 (v: number) => string
  tickFormatter?(value: number | string): string;
  label?: string;
  tickFontSize?: number;
  interval?: number | 'preserveStartEnd';
  domain?: [number | 'auto' | 'dataMin' | 'dataMax', number | 'auto' | 'dataMin' | 'dataMax'];
  scale?: 'log' | 'linear';
  width?: number;
  axisId?: number;
}
export const ChartXAxis = (p: Omit<ChartAxisProps, 'dir'>) => (
  <ChartAxis dir="x" dataKey="date" {...p} />
);
export const ChartYAxis = (p: Omit<ChartAxisProps, 'dir'>) => <ChartAxis dir="y" {...p} />;
function ChartAxis({
  dir,
  dataKey,
  type,
  name,
  tickFormatter = DATE_TICK_FORMATTER as (value: number | string) => string,
  label,
  tickFontSize,
  interval,
  domain,
  scale,
  width = 80,
  axisId = 0,
  ...rest
}: ChartAxisProps) {
  const tick = tickFontSize
    ? { fill: 'var(--text-muted)', fontSize: tickFontSize }
    : AXIS_TICK_STYLE;
  const labelProps = axisLabel(label, dir === 'y' ? -90 : undefined);
  const Comp = (dir === 'x' ? XAxis : YAxis) as ElementType;
  const idProp = dir === 'x' ? { xAxisId: axisId } : { yAxisId: axisId };
  return (
    <Comp
      {...idProp}
      dataKey={dataKey}
      type={type}
      name={name}
      tick={tick}
      tickFormatter={tickFormatter}
      interval={interval}
      domain={domain}
      scale={scale}
      width={dir === 'y' ? width : undefined}
      label={labelProps}
      {...rest}
    />
  );
}

interface ChartTooltipProps {
  formatter?: TooltipValueFormatter;
  labelFormatter?: (label: string) => string;
  cursor?: boolean | { stroke?: string; strokeWidth?: number; strokeDasharray?: string };
  allowEscapeViewBox?: { x?: boolean; y?: boolean };
  offset?: number;
  isLargeDataset?: boolean;
}
export function ChartTooltip({
  formatter,
  labelFormatter,
  cursor,
  allowEscapeViewBox = { x: true, y: true },
  offset = 20,
  isLargeDataset = false,
}: ChartTooltipProps) {
  const cursorProp =
    cursor === undefined
      ? { stroke: 'var(--border-soft)', strokeWidth: 1, strokeDasharray: '4 4' }
      : cursor;
  return (
    <Tooltip
      contentStyle={CHART_TOOLTIP_STYLE}
      formatter={wrapTooltipFormatter(formatter)}
      labelFormatter={labelFormatter}
      cursor={cursorProp}
      isAnimationActive={!isLargeDataset}
      animationDuration={isLargeDataset ? 0 : 150}
      wrapperStyle={{ zIndex: 1000, outline: 'none', pointerEvents: 'none' }}
      allowEscapeViewBox={allowEscapeViewBox}
      offset={offset}
    />
  );
}

export function ChartLegend() {
  return <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />;
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
  tooltipFormatter?: (value: number, name: string) => [string, string] | string;
  tooltipLabelFormatter?: (label: string) => string;
  showLegend?: boolean;
  legendFormatter?: (name: string) => string;
  gradientId?: string;
  gradientColor?: string;
  children?: ReactNode;
}
const CHART_BY_TYPE = { line: LineChart, area: AreaChart } as const;
export function SimpleChart({
  type = 'line',
  data,
  height = 350,
  margin = CHART_MARGIN,
  xDataKey = 'date',
  xType,
  xLabel,
  xTickFormatter = DATE_TICK_FORMATTER as (v: number | string) => string,
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
  children,
}: SimpleChartProps) {
  const isArea = type === 'area';
  const isLargeDataset = data.length >= 100;
  const Chart = CHART_BY_TYPE[type];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={data} margin={margin}>
        {isArea && gradientId && (
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={gradientColor} stopOpacity={0.4} />
              <stop offset="100%" stopColor={gradientColor} stopOpacity={0.05} />
            </linearGradient>
          </defs>
        )}
        <CartesianGrid {...CHART_GRID_PROPS} stroke={isArea ? undefined : 'var(--bg-subtle)'} />
        <XAxis
          dataKey={xDataKey}
          type={xType}
          tickFormatter={xTickFormatter}
          interval={xTickInterval}
          tick={AXIS_TICK_STYLE}
          label={
            xLabel
              ? {
                  value: xLabel,
                  position: 'insideBottom',
                  offset: -4,
                  fontSize: 11,
                  fill: 'var(--fg-tertiary)',
                }
              : undefined
          }
        />
        <ChartYAxis tickFormatter={yTickFormatter} domain={yDomain} scale={yScale} label={yLabel} />
        <ChartTooltip
          formatter={tooltipFormatter as TooltipValueFormatter}
          labelFormatter={tooltipLabelFormatter}
          isLargeDataset={isLargeDataset}
        />
        {(showLegend ?? !isArea) && (
          <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} formatter={legendFormatter} />
        )}
        {children}
      </Chart>
    </ResponsiveContainer>
  );
}
export const SimpleAreaChart = (p: Omit<SimpleChartProps, 'type'>) => (
  <SimpleChart type="area" height={440} showLegend={false} {...p} />
);
export const SimpleLineChart = (p: Omit<SimpleChartProps, 'type'>) => (
  <SimpleChart type="line" {...p} />
);
interface XYScatterChartProps {
  xKey: string;
  yKey: string;
  xName: string;
  yName: string;
  height?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  zRange?: [number, number];
  zDataKey?: string;
  xTickFormatter?: (v: number) => string;
  yTickFormatter?: (v: number) => string;
  tooltipFormatter?: TooltipValueFormatter;
  labelFormatter?: (label: string) => string;
  cursor?: boolean | { stroke?: string; strokeWidth?: number; strokeDasharray?: string };
  xLabel?: string;
  yLabel?: string;
  children: ReactNode;
}
export function XYScatterChart({
  xKey,
  yKey,
  xName,
  yName,
  height = 300,
  margin = { top: 20, right: 20, bottom: 20, left: 10 },
  zRange = [36, 36],
  zDataKey,
  xTickFormatter,
  yTickFormatter,
  tooltipFormatter,
  labelFormatter,
  cursor,
  xLabel,
  yLabel,
  children,
}: XYScatterChartProps) {
  const numberFormatter = (v: number | string) => String(v);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={margin}>
        <CartesianGrid {...CHART_GRID_PROPS} />
        <ChartXAxis
          type="number"
          dataKey={xKey}
          name={xName}
          tickFormatter={(xTickFormatter ?? numberFormatter) as (value: number | string) => string}
          label={xLabel ?? xName}
        />
        <ChartYAxis
          type="number"
          dataKey={yKey}
          name={yName}
          tickFormatter={yTickFormatter ?? numberFormatter}
          label={yLabel ?? yName}
        />
        <ZAxis type="number" dataKey={zDataKey} range={zRange} />
        <ChartTooltip
          formatter={tooltipFormatter}
          labelFormatter={labelFormatter}
          cursor={cursor}
        />
        {children}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
