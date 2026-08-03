import { useRef, useState, useEffect, memo, type ReactElement, type ReactNode } from 'react';
import {
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
  AreaChart,
  LineChart,
} from 'recharts';
import type { XAxisProps, YAxisProps } from 'recharts';
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
import type { PortfolioResult } from '@backtest/shared';
import ChartCard from '../ChartCard.js';

type SeriesNames = string[];
type ChartDataPoint = Record<string, number | string>;

function ResponsiveContainer({
  width: propWidth,
  height,
  children,
}: {
  width?: string | number;
  height: number;
  children: (dims: { width: number; height: number }) => ReactElement;
}) {
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
  return (
    <ResponsiveContainer height={height}>
      {({ width }) => (
        <SvgBarChart
          data={data}
          seriesNames={seriesNames}
          xDataKey={xDataKey}
          width={width}
          height={height}
          margin={CHART_MARGIN}
          yTickFormatter={yTickFormatter}
          yLabel={yLabel}
          barRadius={barRadius}
          fillOpacity={fillOpacity}
          showLegend={showLegend}
          signColorSingleSeries={signColorSingleSeries}
          xTickFontSize={xTickFontSize}
          xTickInterval={xTickInterval}
          tooltipValueFormatter={tooltipValueFormatter}
        />
      )}
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
  const mergedMargin = { ...CHART_MARGIN, ...margin };
  return (
    <ResponsiveContainer height={height}>
      {({ width }) => (
        <SvgScatterChart
          data={data}
          xDataKey={xDataKey}
          xName={xName}
          yDataKey={yDataKey}
          yName={yName}
          xLabel={xLabel}
          yLabel={yLabel}
          nameDataKey={nameDataKey}
          width={width}
          height={height}
          margin={mergedMargin}
          tooltipFormatter={tooltipFormatter}
          tooltipLabelFormatter={tooltipLabelFormatter}
        />
      )}
    </ResponsiveContainer>
  );
}

interface ChartXAxisProps extends Omit<XAxisProps, 'label' | 'tick' | 'tickFormatter' | 'ref'> {
  dataKey?: string;
  tickFormatter?: (value: number | string) => string;
  label?: string | XAxisProps['label'];
  tickFontSize?: number;
}
export function ChartXAxis({
  dataKey = 'date',
  type,
  name,
  tickFormatter = DATE_TICK_FORMATTER as (value: number | string) => string,
  label,
  tickFontSize,
  interval,
  xAxisId = 0,
  ...rest
}: ChartXAxisProps) {
  const tick = tickFontSize
    ? { fill: 'var(--text-muted)', fontSize: tickFontSize }
    : AXIS_TICK_STYLE;
  let labelProps: XAxisProps['label'] = undefined;
  if (label) {
    if (typeof label === 'string') {
      labelProps = {
        value: label,
        position: 'insideBottom',
        offset: -10,
        style: { fill: 'var(--text-muted)', fontSize: 12 },
      };
    } else {
      labelProps = label;
    }
  }
  return (
    <XAxis
      xAxisId={xAxisId}
      dataKey={dataKey}
      type={type}
      name={name}
      tick={tick}
      tickFormatter={tickFormatter}
      interval={interval}
      label={labelProps}
      {...rest}
    />
  );
}

interface ChartYAxisProps extends Omit<YAxisProps, 'label' | 'tick' | 'width' | 'ref'> {
  tickFormatter?: (v: number) => string;
  label?: string | YAxisProps['label'];
  width?: number;
}
export function ChartYAxis({
  tickFormatter,
  domain,
  scale,
  label,
  type,
  dataKey,
  name,
  width = 80,
  yAxisId = 0,
  ...rest
}: ChartYAxisProps) {
  let labelProps: YAxisProps['label'] = undefined;
  if (label) {
    if (typeof label === 'string') {
      labelProps = {
        value: label,
        angle: -90,
        position: 'insideLeft',
        style: { fill: 'var(--text-muted)', fontSize: 12 },
      };
    } else {
      labelProps = label;
    }
  }
  return (
    <YAxis
      yAxisId={yAxisId}
      type={type}
      dataKey={dataKey}
      name={name}
      tick={AXIS_TICK_STYLE}
      tickFormatter={tickFormatter}
      domain={domain}
      scale={scale}
      width={width}
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
ChartXAxis.displayName = 'XAxis';
ChartXAxis.defaultProps = { type: 'category' };
ChartYAxis.displayName = 'YAxis';
ChartYAxis.defaultProps = { type: 'number' };
ChartTooltip.displayName = 'Tooltip';
ChartLegend.displayName = 'Legend';

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
        <p className="text-caption">{message ?? t('chart.emptyData')}</p>
      </div>
    </div>
  );
}

interface ReturnsTabDailyChartProps {
  portfolios: PortfolioResult[];
  bins: Array<{ range: string; [portfolioName: string]: string | number }>;
}
export default memo(function ReturnsTabDailyChart({ portfolios, bins }: ReturnsTabDailyChartProps) {
  const { t } = useTranslation();
  if (bins.length === 0) return null;
  return (
    <ChartCard title={t('backtest.dailyReturnsHist')} data={bins}>
      <BarChartContent
        data={bins}
        seriesNames={portfolios.map((p) => p.name)}
        xDataKey="range"
        height={350}
        yLabel={t('backtest.frequency')}
        fillOpacity={0.7}
        xTickFontSize={9}
        xTickInterval={4}
      />
    </ChartCard>
  );
});

interface SimpleAreaChartProps {
  data: ChartDataPoint[];
  height?: number;
  margin?: typeof CHART_MARGIN;
  xDataKey?: string;
  xTickFormatter?: (v: number | string) => string;
  xTickInterval?: number | 'preserveStartEnd';
  yTickFormatter?: (v: number) => string;
  yDomain?: [number | 'auto', number | 'auto'];
  yLabel?: string;
  tooltipFormatter?: (value: number, name: string) => [string, string];
  tooltipLabelFormatter?: (label: string) => string;
  showLegend?: boolean;
  gradientId?: string;
  gradientColor?: string;
  children?: ReactNode;
}
export function SimpleAreaChart({
  data,
  height = 440,
  margin = CHART_MARGIN,
  xDataKey = 'date',
  xTickFormatter,
  xTickInterval,
  yTickFormatter = (v) => v.toFixed(0),
  yDomain = ['auto', 'auto'],
  yLabel,
  tooltipFormatter,
  tooltipLabelFormatter,
  showLegend = false,
  gradientId,
  gradientColor = 'hsl(var(--danger))',
  children,
}: SimpleAreaChartProps) {
  const isLargeDataset = data.length >= 100;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={margin}>
        {gradientId && (
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={gradientColor} stopOpacity={0.4} />
              <stop offset="100%" stopColor={gradientColor} stopOpacity={0.05} />
            </linearGradient>
          </defs>
        )}
        <CartesianGrid {...CHART_GRID_PROPS} />
        <XAxis
          dataKey={xDataKey}
          tickFormatter={xTickFormatter}
          interval={xTickInterval}
          tick={AXIS_TICK_STYLE}
        />
        <YAxis
          tickFormatter={yTickFormatter}
          tick={AXIS_TICK_STYLE}
          domain={yDomain}
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
          formatter={tooltipFormatter}
          labelFormatter={tooltipLabelFormatter}
          isAnimationActive={!isLargeDataset}
          animationDuration={isLargeDataset ? 0 : 150}
        />
        {showLegend && <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />}
        {children}
      </AreaChart>
    </ResponsiveContainer>
  );
}
interface SimpleLineChartProps {
  data: ChartDataPoint[];
  height?: number;
  margin?: typeof CHART_MARGIN;
  xDataKey?: string;
  xTickFormatter?: (v: number | string) => string;
  yTickFormatter?: (v: number) => string;
  yDomain?: [number | 'auto', number | 'auto'];
  yLabel?: string;
  tooltipFormatter?: (value: number, name: string) => [string, string] | string;
  tooltipLabelFormatter?: (label: string) => string;
  showLegend?: boolean;
  children?: ReactNode;
}
export function SimpleLineChart({
  data,
  height = 350,
  margin = CHART_MARGIN,
  xDataKey = 'date',
  xTickFormatter = DATE_TICK_FORMATTER as (v: number | string) => string,
  yTickFormatter = (v) => v.toFixed(0),
  yDomain = ['auto', 'auto'],
  yLabel,
  tooltipFormatter,
  tooltipLabelFormatter,
  showLegend = true,
  children,
}: SimpleLineChartProps) {
  const isLargeDataset = data.length >= 100;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={margin}>
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
        <XAxis dataKey={xDataKey} tickFormatter={xTickFormatter} tick={AXIS_TICK_STYLE} />
        <YAxis
          tickFormatter={yTickFormatter}
          tick={AXIS_TICK_STYLE}
          domain={yDomain}
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
          formatter={wrapTooltipFormatter(tooltipFormatter)}
          labelFormatter={tooltipLabelFormatter}
          cursor={{ stroke: 'var(--border-soft)', strokeWidth: 1, strokeDasharray: '4 4' }}
          isAnimationActive={!isLargeDataset}
          animationDuration={isLargeDataset ? 0 : 150}
          wrapperStyle={{ zIndex: 100, outline: 'none' }}
        />
        {showLegend && <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />}
        {children}
      </LineChart>
    </ResponsiveContainer>
  );
}
