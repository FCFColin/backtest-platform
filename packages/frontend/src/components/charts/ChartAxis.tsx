import { XAxis, YAxis, Tooltip, Legend } from 'recharts';
import type { XAxisProps, YAxisProps } from 'recharts';
import { CHART_TOOLTIP_STYLE, AXIS_TICK_STYLE, LEGEND_WRAPPER_STYLE, DATE_TICK_FORMATTER, wrapTooltipFormatter } from '@/lib/chart-theme.js';
import type { TooltipValueFormatter } from '@/lib/chart-theme.js';
interface ChartXAxisProps extends Omit<XAxisProps, 'label' | 'tick' | 'tickFormatter' | 'ref'> {
  dataKey?: string;
  tickFormatter?: (value: number | string) => string;
  label?: string | XAxisProps['label'];
  tickFontSize?: number;
}
export function ChartXAxis({ dataKey = 'date', type, name, tickFormatter = DATE_TICK_FORMATTER as (value: number | string) => string, label, tickFontSize, interval, xAxisId = 0, ...rest }: ChartXAxisProps) {
  const tick = tickFontSize ? { fill: 'var(--text-muted)', fontSize: tickFontSize } : AXIS_TICK_STYLE;
  let labelProps: XAxisProps['label'] = undefined;
  if (label) {
    if (typeof label === 'string') {
      labelProps = {
        value: label,
        position: 'insideBottom',
        offset: -10,
        style: { fill: 'var(--text-muted)', fontSize: 12 }
      };
    } else {
      labelProps = label;
    }
  }
  return <XAxis xAxisId={xAxisId} dataKey={dataKey} type={type} name={name} tick={tick} tickFormatter={tickFormatter} interval={interval} label={labelProps} {...rest} />;
}
interface ChartYAxisProps extends Omit<YAxisProps, 'label' | 'tick' | 'width' | 'ref'> {
  tickFormatter?: (v: number) => string;
  label?: string | YAxisProps['label'];
  width?: number;
}
export function ChartYAxis({ tickFormatter, domain, scale, label, type, dataKey, name, width = 80, yAxisId = 0, ...rest }: ChartYAxisProps) {
  let labelProps: YAxisProps['label'] = undefined;
  if (label) {
    if (typeof label === 'string') {
      labelProps = {
        value: label,
        angle: -90,
        position: 'insideLeft',
        style: { fill: 'var(--text-muted)', fontSize: 12 }
      };
    } else {
      labelProps = label;
    }
  }
  return <YAxis yAxisId={yAxisId} type={type} dataKey={dataKey} name={name} tick={AXIS_TICK_STYLE} tickFormatter={tickFormatter} domain={domain} scale={scale} width={width} label={labelProps} {...rest} />;
}
interface ChartTooltipProps {
  formatter?: TooltipValueFormatter;
  labelFormatter?: (label: string) => string;
  cursor?: boolean | { stroke?: string; strokeWidth?: number; strokeDasharray?: string };
  allowEscapeViewBox?: { x?: boolean; y?: boolean };
  offset?: number;
  isLargeDataset?: boolean;
}
export function ChartTooltip({ formatter, labelFormatter, cursor, allowEscapeViewBox = { x: true, y: true }, offset = 20, isLargeDataset = false }: ChartTooltipProps) {
  const cursorProp = cursor === undefined ? { stroke: 'var(--border-soft)', strokeWidth: 1, strokeDasharray: '4 4' } : cursor;
  return <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={wrapTooltipFormatter(formatter)} labelFormatter={labelFormatter} cursor={cursorProp} isAnimationActive={!isLargeDataset} animationDuration={isLargeDataset ? 0 : 150} wrapperStyle={{ zIndex: 1000, outline: 'none', pointerEvents: 'none' }} allowEscapeViewBox={allowEscapeViewBox} offset={offset} />;
}
export function ChartLegend() {
  return <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />;
}
ChartXAxis.displayName = 'XAxis';
ChartXAxis.defaultProps = { xAxisId: 0, type: 'category', dataKey: 'date' };
ChartYAxis.displayName = 'YAxis';
ChartYAxis.defaultProps = { yAxisId: 0, type: 'number' };
ChartTooltip.displayName = 'Tooltip';
ChartLegend.displayName = 'Legend';
