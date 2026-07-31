/* eslint-disable react-refresh/only-export-components, complexity, sonarjs/cognitive-complexity, max-params -- SVG 图表共享工具库（工具函数与组件同文件，拆分独立文件则重复 import） */
import { useCallback, useState, type CSSProperties, type ReactNode } from 'react';
import { CHART_COLORS } from '@backtest/shared';

type Orientation = 'bottom' | 'left';
interface TickLineConfig {
  length: number;
  color?: string;
}
interface AxisLabelConfig {
  value: string;
  angle?: number;
  position?: 'insideLeft' | 'insideBottom';
  style?: CSSProperties;
}
interface SvgAxisProps {
  orientation: Orientation;
  range: number;
  ticks: Array<{ value: number; label: string }>;
  label?: AxisLabelConfig | string;
  gridLines?: boolean;
  gridColor?: string;
  tickLine?: TickLineConfig | boolean;
  tickStyle?: CSSProperties;
  offset: number;
  hideLine?: boolean;
}
export const TICK_STYLE: CSSProperties = {
  fill: 'hsl(var(--fg-tertiary))',
  fontSize: 11,
  fontFamily: 'Geist Mono Variable',
};
const isAxisLabelConfig = (v: AxisLabelConfig | string | undefined): v is AxisLabelConfig =>
  typeof v === 'object' && v !== null && 'value' in v;
type Line4 = [number, number, number, number];
const axisLine = (o: Orientation, range: number, offset: number): Line4 =>
  o === 'bottom' ? [0, offset, range, offset] : [offset, 0, offset, range];
const gridLine = (o: Orientation, v: number, range: number, offset: number): Line4 =>
  o === 'bottom' ? [v, 0, v, offset] : [0, v, range, v];
const tickMark = (o: Orientation, v: number, offset: number, len: number): Line4 =>
  o === 'bottom' ? [v, offset, v, offset + len] : [offset - len, v, offset, v];
const tickTextPos = (o: Orientation, v: number, offset: number, len: number) =>
  o === 'bottom'
    ? { x: v, y: offset + len + 12, textAnchor: 'middle' as const }
    : { x: offset - len - 6, y: v + 4, textAnchor: 'end' as const };
const LABEL_STYLE: CSSProperties = { fill: 'var(--text-muted)', fontSize: 12 };
export function SvgAxis({
  orientation,
  range,
  ticks,
  label,
  gridLines = false,
  gridColor = 'var(--chart-grid)',
  tickLine = { length: 5 },
  tickStyle = TICK_STYLE,
  offset,
  hideLine = false,
}: SvgAxisProps) {
  const isBottom = orientation === 'bottom';
  const len = typeof tickLine === 'boolean' ? (tickLine ? 5 : 0) : tickLine.length;
  const [axX1, axY1, axX2, axY2] = axisLine(orientation, range, offset);
  const labelProps = isBottom
    ? { x: range / 2, y: offset + 36 }
    : { x: -range / 2, y: 16, transform: 'rotate(-90)' };
  return (
    <g className="svg-axis">
      {!hideLine && (
        <line x1={axX1} y1={axY1} x2={axX2} y2={axY2} stroke="var(--border-soft)" strokeWidth={1} />
      )}
      {ticks.map((t, i) => {
        const [gx1, gy1, gx2, gy2] = gridLine(orientation, t.value, range, offset);
        const [x1, y1, x2, y2] = tickMark(orientation, t.value, offset, len);
        const tp = tickTextPos(orientation, t.value, offset, len);
        return (
          <g key={`tick-${i}`}>
            {gridLines && (
              <line
                x1={gx1}
                y1={gy1}
                x2={gx2}
                y2={gy2}
                stroke={gridColor}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            )}
            {len > 0 && (
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--border-soft)" strokeWidth={1} />
            )}
            <text
              x={tp.x}
              y={tp.y}
              textAnchor={tp.textAnchor}
              style={tickStyle as Record<string, string | number>}
            >
              {t.label}
            </text>
          </g>
        );
      })}
      {label && (
        <text {...labelProps} textAnchor="middle" style={LABEL_STYLE}>
          {isAxisLabelConfig(label) ? label.value : label}
        </text>
      )}
    </g>
  );
}

export interface TooltipDataItem {
  name: string;
  value: string | number;
  color: string;
}
export interface TooltipState {
  active: boolean;
  x: number;
  y: number;
  label: string;
  data: TooltipDataItem[];
}
export const HIDDEN_TOOLTIP: TooltipState = { active: false, x: 0, y: 0, label: '', data: [] };
interface SvgTooltipProps {
  active: boolean;
  position: { x: number; y: number };
  data: TooltipDataItem[];
  label?: string;
  offset?: number;
}
const TOOLTIP_STYLE: CSSProperties = {
  position: 'fixed',
  backgroundColor: 'hsl(var(--chart-tooltip-bg) / 0.95)',
  border: '1px solid hsl(var(--border-strong))',
  borderRadius: '8px',
  padding: '12px',
  color: 'hsl(var(--fg))',
  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.3)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  zIndex: 1000,
  pointerEvents: 'none',
  fontSize: '12px',
  lineHeight: '1.5',
  whiteSpace: 'nowrap',
};
export function SvgTooltip({ active, position, data, label, offset = 20 }: SvgTooltipProps) {
  if (!active || data.length === 0) return null;
  return (
    <div
      style={{ ...TOOLTIP_STYLE, left: `${position.x + offset}px`, top: `${position.y - 10}px` }}
    >
      {label != null && (
        <div style={{ marginBottom: 6, fontWeight: 600, color: 'hsl(var(--fg-strong))' }}>
          {label}
        </div>
      )}
      {data.map((item, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              flexShrink: 0,
              backgroundColor: item.color,
            }}
          />
          <span style={{ color: 'hsl(var(--fg-tertiary))' }}>{item.name}</span>
          <span style={{ fontWeight: 600, marginLeft: 'auto', fontFamily: 'Geist Mono Variable' }}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

interface SvgLegendSeries {
  name: string;
  color: string;
  visible?: boolean;
}
interface SvgLegendProps {
  series: SvgLegendSeries[];
  onToggle?: (name: string) => void;
}
export function SvgLegend({ series, onToggle }: SvgLegendProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '12px',
        padding: '8px 0',
        fontSize: '12px',
        color: 'var(--fg-tertiary)',
      }}
    >
      {series.map((s) => (
        <div
          key={s.name}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            cursor: onToggle ? 'pointer' : 'default',
            opacity: s.visible === false ? 0.4 : 1,
            transition: 'opacity 0.15s',
          }}
          onClick={() => onToggle?.(s.name)}
        >
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              flexShrink: 0,
              backgroundColor: s.color,
            }}
          />
          <span>{s.name}</span>
        </div>
      ))}
    </div>
  );
}

export interface XTickPixel {
  value: number;
  label: string;
  show?: boolean;
}
export function XAxisTicks({
  ticks,
  plotBottom,
  maxLabelLen,
  style = TICK_STYLE,
}: {
  ticks: XTickPixel[];
  plotBottom: number;
  maxLabelLen?: number;
  style?: CSSProperties;
}) {
  return (
    <>
      {ticks.map((t, i) => {
        if (t.show === false) return null;
        const label =
          maxLabelLen && t.label.length > maxLabelLen + 3 ? t.label.slice(0, maxLabelLen) : t.label;
        return (
          <g key={`xtick-${i}`}>
            <line
              x1={t.value}
              y1={plotBottom}
              x2={t.value}
              y2={plotBottom + 5}
              stroke="var(--border-soft)"
              strokeWidth={1}
            />
            <text
              x={t.value}
              y={plotBottom + 16}
              textAnchor="middle"
              style={style as Record<string, string | number>}
            >
              {label}
            </text>
          </g>
        );
      })}
    </>
  );
}

export interface ChartMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export type ChartPoint = Record<string, number | string>;
export const plotDims = (width: number, height: number, margin: ChartMargin) => {
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  return {
    plotWidth,
    plotHeight,
    plotLeft: margin.left,
    plotBottom: margin.top + plotHeight,
  };
};
export const toggleInSet = (prev: Set<string>, name: string) => {
  const next = new Set(prev);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  return next;
};
export function computeTicks(min: number, max: number, count = 5): number[] {
  if (min === max) {
    const v = min === 0 ? 1 : Math.abs(min);
    min -= v;
    max += v;
  }
  const roughStep = (max - min) / (count - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;
  const niceStep =
    (residual <= 1.5 ? 1 : residual <= 3.5 ? 2 : residual <= 7.5 ? 5 : 10) * magnitude;
  const niceMin = Math.floor(min / niceStep) * niceStep;
  const niceMax = Math.ceil(max / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + niceStep * 0.001; v += niceStep)
    ticks.push(Math.round(v * 1e10) / 1e10);
  return ticks;
}
export const computeYDomain = (
  data: ChartPoint[],
  seriesNames: string[],
  yDomain?: [number | 'auto', number | 'auto'],
  minStart = 0,
  maxStart = 0,
) => {
  let min = yDomain && yDomain[0] !== 'auto' ? yDomain[0] : minStart;
  let max = yDomain && yDomain[1] !== 'auto' ? yDomain[1] : maxStart;
  if (!yDomain || yDomain[0] === 'auto' || yDomain[1] === 'auto')
    for (const d of data)
      for (const name of seriesNames) {
        const v = Number(d[name]) || 0;
        if (v < min) min = v;
        if (v > max) max = v;
      }
  if (maxStart === 0 && min === 0 && max === 0) max = 1;
  return computeTicks(min, max);
};
export const seriesColor = (idx: number) => CHART_COLORS[idx % CHART_COLORS.length];
export const gradId = (name: string) => `svg-area-grad-${name.replace(/\s+/g, '-')}`;
export const linearScale = (min: number, max: number, start: number, span: number) => (v: number) =>
  start + ((v - min) / (max - min)) * span;
export const formatTooltipValue = (r: [string, string] | string) => (Array.isArray(r) ? r[0] : r);
export const buildTooltipItems = (
  point: ChartPoint,
  visibleSeries: string[],
  seriesNames: string[],
  colorOf: (idx: number, val: number) => string,
  fallbackValue: (v: number) => string,
  formatter?: (v: number, name: string) => [string, string] | string,
): TooltipDataItem[] =>
  visibleSeries.map((name) => {
    const val = Number(point[name]) || 0;
    const r = formatter?.(val, name);
    return {
      name,
      value: r ? formatTooltipValue(r) : fallbackValue(val),
      color: colorOf(seriesNames.indexOf(name), val),
    };
  });
interface MouseMoveContext {
  data: ChartPoint[];
  xDataKey: string;
  visibleSeries: string[];
  seriesNames: string[];
  colorOf: (idx: number, val: number) => string;
  indexAt: (mx: number) => number;
  fallbackValue: (v: number) => string;
  tooltipValueFormatter?: (v: number, name: string) => [string, string] | string;
  tooltipLabelFormatter?: (l: string) => string;
}
export const buildMouseMoveHandler =
  (setTooltip: (t: TooltipState) => void, ctx: MouseMoveContext) =>
  (e: React.MouseEvent<SVGSVGElement>) => {
    const mx = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const dataIdx = ctx.indexAt(mx);
    if (dataIdx < 0 || dataIdx >= ctx.data.length) {
      setTooltip(HIDDEN_TOOLTIP);
      return;
    }
    const point = ctx.data[dataIdx];
    const rawLabel = String(point[ctx.xDataKey] ?? '');
    setTooltip({
      active: true,
      x: e.clientX,
      y: e.clientY,
      label: ctx.tooltipLabelFormatter ? ctx.tooltipLabelFormatter(rawLabel) : rawLabel,
      data: buildTooltipItems(
        point,
        ctx.visibleSeries,
        ctx.seriesNames,
        ctx.colorOf,
        ctx.fallbackValue,
        ctx.tooltipValueFormatter,
      ),
    });
  };
interface ChartLegendConfig {
  names: string[];
  colorOf: (idx: number) => string;
  hidden: Set<string>;
  onToggle: (name: string) => void;
}
interface ChartShellProps {
  width: number;
  height: number;
  tooltip: TooltipState;
  onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
  onMouseLeave: () => void;
  legend?: ChartLegendConfig;
  children: ReactNode;
}
export function ChartShell({
  width,
  height,
  tooltip,
  onMouseMove,
  onMouseLeave,
  legend,
  children,
}: ChartShellProps) {
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg
        width={width}
        height={height}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        style={{ display: 'block' }}
      >
        {children}
      </svg>
      <SvgTooltip
        active={tooltip.active}
        position={{ x: tooltip.x, y: tooltip.y }}
        data={tooltip.data}
        label={tooltip.label}
      />
      {legend && (
        <SvgLegend
          series={legend.names.map((name, idx) => ({
            name,
            color: legend.colorOf(idx),
            visible: !legend.hidden.has(name),
          }))}
          onToggle={legend.onToggle}
        />
      )}
    </div>
  );
}
export function useChartScaffold(seriesNames: string[]) {
  const [tooltip, setTooltip] = useState<TooltipState>(HIDDEN_TOOLTIP);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const visibleSeries = seriesNames.filter((n) => !hiddenSeries.has(n));
  const handleMouseLeave = useCallback(() => setTooltip(HIDDEN_TOOLTIP), []);
  const handleLegendToggle = useCallback(
    (name: string) => setHiddenSeries((prev) => toggleInSet(prev, name)),
    [],
  );
  return { tooltip, setTooltip, hiddenSeries, visibleSeries, handleMouseLeave, handleLegendToggle };
}
export function LeftAxis({
  range,
  ticks,
  offset,
  label,
  hideLine = false,
}: {
  range: number;
  ticks: Array<{ value: number; label: string }>;
  offset: number;
  label?: string;
  hideLine?: boolean;
}) {
  return (
    <SvgAxis
      orientation="left"
      range={range}
      ticks={ticks}
      gridLines
      gridColor="hsl(var(--chart-grid))"
      tickLine={false}
      offset={offset}
      label={label ? { value: label, angle: -90, position: 'insideLeft' } : undefined}
      hideLine={hideLine}
    />
  );
}
