/* eslint-disable react-refresh/only-export-components, complexity, sonarjs/cognitive-complexity, max-params -- SVG 图表共享工具库 */
import { useCallback, useState, type CSSProperties, type ReactNode } from 'react';
import { CHART_COLORS } from '@backtest/shared';
import { AXIS_TICK_STYLE } from '@/lib/chart-theme';

type Orientation = 'bottom' | 'left';
interface SvgAxisProps {
  orientation: Orientation;
  range: number;
  ticks: Array<{ value: number; label: string; show?: boolean }>;
  label?: { value: string } | string;
  gridLines?: boolean;
  gridColor?: string;
  tickLine?: { length: number } | boolean;
  tickStyle?: CSSProperties;
  offset: number;
  hideLine?: boolean;
}
type Line4 = [number, number, number, number];
const axisLine = (o: Orientation, range: number, offset: number): Line4 =>
  o === 'bottom' ? [0, offset, range, offset] : [offset, 0, offset, range];
const tickGeom = (o: Orientation, v: number, range: number, offset: number, len: number) => {
  const b = o === 'bottom';
  return {
    grid: (b ? [v, 0, v, offset] : [0, v, range, v]) as Line4,
    tick: (b ? [v, offset, v, offset + len] : [offset - len, v, offset, v]) as Line4,
    text: b
      ? { x: v, y: offset + len + 12, textAnchor: 'middle' as const }
      : { x: offset - len - 6, y: v + 4, textAnchor: 'end' as const },
  };
};
const isLabelCfg = (v: { value: string } | string | undefined): v is { value: string } =>
  typeof v === 'object' && v !== null && 'value' in v;
export function SvgAxis({
  orientation,
  range,
  ticks,
  label,
  gridLines = false,
  gridColor = 'var(--chart-grid)',
  tickLine = { length: 5 },
  tickStyle = AXIS_TICK_STYLE,
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
        <line
          {...{ x1: axX1, y1: axY1, x2: axX2, y2: axY2 }}
          stroke="var(--border-soft)"
          strokeWidth={1}
        />
      )}
      {ticks.map((t, i) => {
        if (t.show === false) return null;
        const g = tickGeom(orientation, t.value, range, offset, len);
        const lbl = t.label;
        return (
          <g key={`tick-${i}`}>
            {gridLines && (
              <line
                {...{ x1: g.grid[0], y1: g.grid[1], x2: g.grid[2], y2: g.grid[3] }}
                stroke={gridColor}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            )}
            {len > 0 && (
              <line
                {...{ x1: g.tick[0], y1: g.tick[1], x2: g.tick[2], y2: g.tick[3] }}
                stroke="var(--border-soft)"
                strokeWidth={1}
              />
            )}
            <text
              x={g.text.x}
              y={g.text.y}
              textAnchor={g.text.textAnchor}
              style={tickStyle as Record<string, string | number>}
            >
              {lbl}
            </text>
          </g>
        );
      })}
      {label && (
        <text
          {...labelProps}
          textAnchor="middle"
          style={{ fill: 'var(--text-muted)', fontSize: 12 }}
        >
          {isLabelCfg(label) ? label.value : label}
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
interface TooltipState {
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
const TOOLTIP_CLS =
  'fixed pointer-events-none z-[1000] rounded-lg p-3 text-xs leading-relaxed whitespace-nowrap backdrop-blur-md bg-chart-tooltip-bg/95 border border-border-strong text-fg shadow-[0_10px_25px_-5px_rgba(0,0,0,0.5),0_4px_6px_-2px_rgba(0,0,0,0.3)]';
function SvgTooltip({ active, position, data, label, offset = 20 }: SvgTooltipProps) {
  if (!active || data.length === 0) return null;
  return (
    <div
      className={TOOLTIP_CLS}
      style={{ left: `${position.x + offset}px`, top: `${position.y - 10}px` }}
    >
      {label != null && (
        <div className="mb-1.5 font-semibold text-[hsl(var(--fg-strong))]">{label}</div>
      )}
      {data.map((item, idx) => (
        <div key={idx} className="flex items-center gap-2 py-0.5">
          <span
            className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-fg-tertiary">{item.name}</span>
          <span className="ml-auto font-semibold font-mono">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

interface SvgLegendProps {
  series: Array<{ name: string; color: string; visible?: boolean }>;
  onToggle?: (name: string) => void;
}
function SvgLegend({ series, onToggle }: SvgLegendProps) {
  return (
    <div className="flex flex-wrap justify-center gap-3 py-2 text-xs text-fg-tertiary">
      {series.map((s) => (
        <div
          role="button"
          tabIndex={0}
          key={s.name}
          className={`flex items-center gap-1.5 transition-opacity ${onToggle ? 'cursor-pointer' : 'cursor-default'} ${s.visible === false ? 'opacity-40' : 'opacity-100'}`}
          onClick={() => onToggle?.(s.name)}
          onKeyDown={(e) => {
            if (onToggle && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onToggle(s.name);
            }
          }}
        >
          <span
            className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
            style={{ backgroundColor: s.color }}
          />
          <span>{s.name}</span>
        </div>
      ))}
    </div>
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
  return { plotWidth, plotHeight, plotLeft: margin.left, plotBottom: margin.top + plotHeight };
};
const toggleInSet = (prev: Set<string>, name: string) => {
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
export const linearScale = (min: number, max: number, start: number, span: number) => (v: number) =>
  start + ((v - min) / (max - min)) * span;
const formatTooltipValue = (r: [string, string] | string) => (Array.isArray(r) ? r[0] : r);
const buildTooltipItems = (
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
export const buildMouseMoveHandler =
  (
    setTooltip: (t: TooltipState) => void,
    ctx: {
      data: ChartPoint[];
      xDataKey: string;
      visibleSeries: string[];
      seriesNames: string[];
      colorOf: (idx: number, val: number) => string;
      indexAt: (mx: number) => number;
      fallbackValue: (v: number) => string;
      tooltipValueFormatter?: (v: number, name: string) => [string, string] | string;
      tooltipLabelFormatter?: (l: string) => string;
    },
  ) =>
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
export function ChartShell({
  width,
  height,
  tooltip,
  onMouseMove,
  onMouseLeave,
  legend,
  children,
}: {
  width: number;
  height: number;
  tooltip: TooltipState;
  onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
  onMouseLeave: () => void;
  legend?: {
    names: string[];
    colorOf: (idx: number) => string;
    hidden: Set<string>;
    onToggle: (name: string) => void;
  };
  children: ReactNode;
}) {
  return (
    <div className="relative w-full">
      <svg
        width={width}
        height={height}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        className="block"
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
export const LeftAxis = (
  p: Omit<SvgAxisProps, 'orientation' | 'gridLines' | 'gridColor' | 'tickLine'>,
) => (
  <SvgAxis
    {...p}
    orientation="left"
    gridLines
    gridColor="hsl(var(--chart-grid))"
    tickLine={false}
  />
);
