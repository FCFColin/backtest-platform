/* eslint-disable max-lines-per-function, sonarjs/cognitive-complexity -- 图表组件库，渲染分支多，Plan-1 重写 */
import { useMemo, useState, useCallback, type CSSProperties } from 'react';
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
const DEFAULT_TICK_STYLE: CSSProperties = {
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
  tickStyle = DEFAULT_TICK_STYLE,
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
      {gridLines &&
        ticks.map((t, i) => {
          const [x1, y1, x2, y2] = gridLine(orientation, t.value, range, offset);
          return (
            <line
              key={`grid-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={gridColor}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          );
        })}
      {ticks.map((t, i) => {
        const [x1, y1, x2, y2] = tickMark(orientation, t.value, offset, len);
        const tp = tickTextPos(orientation, t.value, offset, len);
        return (
          <g key={`tick-${i}`}>
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

interface TooltipDataItem {
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
const HIDDEN_TOOLTIP: TooltipState = { active: false, x: 0, y: 0, label: '', data: [] };
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

interface ReferenceDotConfig {
  x: string | number;
  y: number;
  name: string;
  value: number;
}
interface ChartMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
type ChartPoint = Record<string, number | string>;
const seriesColor = (idx: number) => CHART_COLORS[idx % CHART_COLORS.length];
const linearScale = (min: number, max: number, start: number, span: number) => (v: number) =>
  start + ((v - min) / (max - min)) * span;
const toggleInSet = (prev: Set<string>, name: string) => {
  const next = new Set(prev);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  return next;
};
const formatTooltipValue = (r: [string, string] | string) => (Array.isArray(r) ? r[0] : r);
const gradId = (name: string) => `svg-area-grad-${name.replace(/\s+/g, '-')}`;
const XTICK_STYLE: CSSProperties = {
  fill: 'hsl(var(--fg-tertiary))',
  fontSize: 11,
  fontFamily: 'Geist Mono Variable',
};
interface XTickPixel {
  value: number;
  label: string;
  show?: boolean;
}
function computeTicks(min: number, max: number, count = 5): number[] {
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
function XAxisTicks({
  ticks,
  plotBottom,
  maxLabelLen,
  style = XTICK_STYLE,
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

interface SvgAreaChartProps {
  data: ChartPoint[];
  seriesNames: string[];
  xDataKey: string;
  width: number;
  height: number;
  margin: ChartMargin;
  yTickFormatter?: (v: number) => string;
  yDomain?: [number | 'auto', number | 'auto'];
  fillOpacity?: number;
  strokeWidth?: number;
  showLegend?: boolean;
  colorOffset?: number;
  referenceDots?: ReferenceDotConfig[];
  useGradient?: boolean;
  hideAxisLines?: boolean;
  tooltipValueFormatter?: (value: number, name: string) => [string, string] | string;
  tooltipLabelFormatter?: (label: string) => string;
}
export function SvgAreaChart({
  data,
  seriesNames,
  xDataKey,
  width,
  height,
  margin,
  yTickFormatter,
  yDomain,
  fillOpacity = 0.12,
  strokeWidth = 1.5,
  showLegend = true,
  colorOffset = 0,
  referenceDots,
  useGradient = false,
  hideAxisLines = false,
  tooltipValueFormatter,
  tooltipLabelFormatter,
}: SvgAreaChartProps) {
  const [tooltip, setTooltip] = useState<TooltipState>(HIDDEN_TOOLTIP);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const plotBottom = margin.top + plotHeight;
  const visibleSeries = seriesNames.filter((n) => !hiddenSeries.has(n));
  const xStep = data.length > 1 ? plotWidth / (data.length - 1) : plotWidth;
  const colorOf = useCallback((idx: number) => seriesColor(idx + colorOffset), [colorOffset]);
  const { yMin, yMax, yTicks } = useMemo(() => {
    let min = yDomain && yDomain[0] !== 'auto' ? yDomain[0] : 0;
    let max = yDomain && yDomain[1] !== 'auto' ? yDomain[1] : 1;
    if (!yDomain || yDomain[0] === 'auto' || yDomain[1] === 'auto')
      for (const d of data)
        for (const name of seriesNames) {
          const v = Number(d[name]) || 0;
          if (v < min) min = v;
          if (v > max) max = v;
        }
    const ticks = computeTicks(min, max);
    return { yMin: ticks[0], yMax: ticks[ticks.length - 1], yTicks: ticks };
  }, [data, seriesNames, yDomain]);
  const yScale = useMemo(
    () => linearScale(yMin, yMax, margin.top + plotHeight, -plotHeight),
    [yMin, yMax, margin.top, plotHeight],
  );
  const { yTickPixels, xTickPixels } = useMemo(
    () => ({
      yTickPixels: yTicks.map((t) => ({
        value: yScale(t),
        label: yTickFormatter ? yTickFormatter(t) : t.toFixed(2),
      })),
      xTickPixels: data.map((d, i) => ({
        value: margin.left + i * xStep,
        label: String(d[xDataKey] ?? ''),
      })),
    }),
    [yTicks, yScale, yTickFormatter, data, xDataKey, margin.left, xStep],
  );
  const areaPaths = useMemo(
    () =>
      visibleSeries.map((name) => {
        const seriesIdx = seriesNames.indexOf(name);
        const points = data.map((d, i) => ({
          x: margin.left + i * xStep,
          y: yScale(Number(d[name]) || 0),
        }));
        const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
        const areaPath = `${linePath} L${points[points.length - 1].x},${plotBottom} L${points[0].x},${plotBottom} Z`;
        return {
          name,
          color: colorOf(seriesIdx),
          gradientId: useGradient ? gradId(name) : undefined,
          areaPath,
          linePath,
          points,
        };
      }),
    [
      visibleSeries,
      seriesNames,
      data,
      margin.left,
      xStep,
      yScale,
      plotBottom,
      useGradient,
      colorOf,
    ],
  );
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const mx = e.clientX - e.currentTarget.getBoundingClientRect().left;
      const dataIdx = Math.round((mx - margin.left) / xStep);
      if (dataIdx < 0 || dataIdx >= data.length) {
        setTooltip(HIDDEN_TOOLTIP);
        return;
      }
      const point = data[dataIdx];
      const rawLabel = String(point[xDataKey] ?? '');
      const items = visibleSeries.map((name) => {
        const val = Number(point[name]) || 0;
        const r = tooltipValueFormatter?.(val, name);
        return {
          name,
          value: r ? formatTooltipValue(r) : val.toFixed(2),
          color: colorOf(seriesNames.indexOf(name)),
        };
      });
      setTooltip({
        active: true,
        x: e.clientX,
        y: e.clientY,
        label: tooltipLabelFormatter ? tooltipLabelFormatter(rawLabel) : rawLabel,
        data: items,
      });
    },
    [
      data,
      xDataKey,
      xStep,
      margin.left,
      visibleSeries,
      seriesNames,
      tooltipValueFormatter,
      tooltipLabelFormatter,
      colorOf,
    ],
  );
  const handleMouseLeave = useCallback(() => setTooltip(HIDDEN_TOOLTIP), []);
  const handleLegendToggle = useCallback(
    (name: string) => setHiddenSeries((prev) => toggleInSet(prev, name)),
    [],
  );
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg
        width={width}
        height={height}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ display: 'block' }}
      >
        <defs>
          {useGradient &&
            visibleSeries.map((name) => {
              const id = gradId(name);
              const color = colorOf(seriesNames.indexOf(name));
              return (
                <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={fillOpacity} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              );
            })}
        </defs>
        <SvgAxis
          orientation="left"
          range={plotHeight}
          ticks={yTickPixels}
          gridLines
          gridColor="hsl(var(--chart-grid))"
          tickLine={false}
          offset={margin.left}
          hideLine={hideAxisLines}
        />
        <XAxisTicks ticks={xTickPixels} plotBottom={plotBottom} maxLabelLen={7} />
        {areaPaths.map((area) => (
          <g key={area.name}>
            <path
              d={area.areaPath}
              fill={area.gradientId ? `url(#${area.gradientId})` : area.color}
              fillOpacity={useGradient ? 1 : fillOpacity}
              stroke="none"
            />
            <path d={area.linePath} fill="none" stroke={area.color} strokeWidth={strokeWidth} />
            {area.points.map((p, i) => (
              <circle
                key={`dot-${area.name}-${i}`}
                cx={p.x}
                cy={p.y}
                r={2}
                fill={area.color}
                stroke="var(--bg-elevated)"
                strokeWidth={1}
              />
            ))}
          </g>
        ))}
        {referenceDots?.map((dot, idx) => {
          const dataIdx = data.findIndex(
            (d) => d[xDataKey] === dot.x || String(d[xDataKey]) === String(dot.x),
          );
          const cx = dataIdx >= 0 ? margin.left + dataIdx * xStep : margin.left + plotWidth / 2;
          const cy = yScale(dot.y);
          const color = seriesColor(idx);
          return (
            <g key={`ref-${idx}`}>
              <circle
                cx={cx}
                cy={cy}
                r={5}
                fill={color}
                stroke="var(--bg-elevated)"
                strokeWidth={2}
              />
              <text
                x={cx}
                y={cy - 10}
                textAnchor="middle"
                fill={color}
                fontSize={11}
                fontWeight={600}
              >
                {dot.value.toFixed(2)}%
              </text>
            </g>
          );
        })}
      </svg>
      <SvgTooltip
        active={tooltip.active}
        position={{ x: tooltip.x, y: tooltip.y }}
        data={tooltip.data}
        label={tooltip.label}
      />
      {showLegend && (
        <SvgLegend
          series={seriesNames.map((name, idx) => ({
            name,
            color: colorOf(idx),
            visible: !hiddenSeries.has(name),
          }))}
          onToggle={handleLegendToggle}
        />
      )}
    </div>
  );
}

interface SvgBarChartProps {
  data: ChartPoint[];
  seriesNames: string[];
  xDataKey: string;
  width: number;
  height: number;
  margin: ChartMargin;
  yTickFormatter: (v: number) => string;
  yLabel?: string;
  barRadius?: number;
  fillOpacity?: number;
  showLegend?: boolean;
  signColorSingleSeries?: boolean;
  xTickFontSize?: number;
  xTickInterval?: number;
  tooltipValueFormatter?: (value: number, name: string) => [string, string] | string;
  onMouseMove?: (activePayload: unknown) => void;
  onMouseLeave?: () => void;
}
const barFill = (val: number, idx: number, signColor: boolean) =>
  signColor ? (val >= 0 ? 'var(--success)' : 'var(--error)') : seriesColor(idx);
export function SvgBarChart({
  data,
  seriesNames,
  xDataKey,
  width,
  height,
  margin,
  yTickFormatter,
  yLabel,
  barRadius = 0,
  fillOpacity = 1,
  showLegend = true,
  signColorSingleSeries = false,
  xTickFontSize,
  xTickInterval,
  tooltipValueFormatter,
}: SvgBarChartProps) {
  const [tooltip, setTooltip] = useState<TooltipState>(HIDDEN_TOOLTIP);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const plotLeft = margin.left;
  const plotTop = margin.top;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const visibleSeries = seriesNames.filter((n) => !hiddenSeries.has(n));
  const { yMin, yMax, yTicks } = useMemo(() => {
    let min = 0;
    let max = 0;
    for (const d of data)
      for (const name of seriesNames) {
        const v = Number(d[name]) || 0;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    if (min === 0 && max === 0) max = 1;
    const ticks = computeTicks(min, max);
    return { yMin: ticks[0], yMax: ticks[ticks.length - 1], yTicks: ticks };
  }, [data, seriesNames]);
  const yScale = useMemo(
    () => linearScale(yMin, yMax, plotTop + plotHeight, -plotHeight),
    [plotTop, plotHeight, yMin, yMax],
  );
  const yTickPixels = useMemo(
    () => yTicks.map((t) => ({ value: yScale(t), label: yTickFormatter(t) })),
    [yTicks, yScale, yTickFormatter],
  );
  const groupWidth = plotWidth / data.length;
  const barWidth = useMemo(
    () => Math.max(4, (groupWidth * 0.7) / (visibleSeries.length || 1)),
    [groupWidth, visibleSeries.length],
  );
  const xTickPixels = useMemo(() => {
    const interval = xTickInterval ?? 1;
    return data.map((d, i) => ({
      value: plotLeft + i * groupWidth + groupWidth / 2,
      label: String(d[xDataKey] ?? ''),
      show: i % interval === 0,
    }));
  }, [data, xDataKey, plotLeft, groupWidth, xTickInterval]);
  const signColor = seriesNames.length === 1 && signColorSingleSeries;
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const mx = e.clientX - e.currentTarget.getBoundingClientRect().left;
      const dataIdx = Math.floor((mx - plotLeft) / groupWidth);
      if (dataIdx < 0 || dataIdx >= data.length) {
        setTooltip(HIDDEN_TOOLTIP);
        return;
      }
      const point = data[dataIdx];
      const items = visibleSeries.map((name) => {
        const val = Number(point[name]) || 0;
        const r = tooltipValueFormatter?.(val, name);
        return {
          name,
          value: r ? formatTooltipValue(r) : String(val),
          color: barFill(val, seriesNames.indexOf(name), signColor),
        };
      });
      setTooltip({
        active: true,
        x: e.clientX,
        y: e.clientY,
        label: String(point[xDataKey] ?? ''),
        data: items,
      });
    },
    [
      data,
      xDataKey,
      plotLeft,
      groupWidth,
      visibleSeries,
      seriesNames,
      signColor,
      tooltipValueFormatter,
    ],
  );
  const handleMouseLeave = useCallback(() => setTooltip(HIDDEN_TOOLTIP), []);
  const handleLegendToggle = useCallback(
    (name: string) => setHiddenSeries((prev) => toggleInSet(prev, name)),
    [],
  );
  const xTickStyle: CSSProperties = xTickFontSize
    ? {
        fill: 'hsl(var(--fg-tertiary))',
        fontSize: xTickFontSize,
        fontFamily: 'Geist Mono Variable',
      }
    : XTICK_STYLE;
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg
        width={width}
        height={height}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ display: 'block' }}
      >
        <SvgAxis
          orientation="left"
          range={plotHeight}
          ticks={yTickPixels}
          label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft' } : undefined}
          gridLines
          gridColor="hsl(var(--chart-grid))"
          tickLine={false}
          offset={plotLeft}
          hideLine
        />
        <XAxisTicks ticks={xTickPixels} plotBottom={plotTop + plotHeight} style={xTickStyle} />
        {data.map((point, dataIdx) => {
          const startX =
            plotLeft +
            dataIdx * groupWidth +
            groupWidth / 2 -
            (visibleSeries.length * barWidth) / 2;
          return visibleSeries.map((name, seriesIdx) => {
            const val = Number(point[name]) || 0;
            const color = barFill(val, seriesNames.indexOf(name), signColor);
            const barX = startX + seriesIdx * barWidth;
            const barH = Math.abs((val - yMin) / (yMax - yMin)) * plotHeight;
            const barY = val >= 0 ? yScale(val) : yScale(0);
            return (
              <rect
                key={`bar-${dataIdx}-${name}`}
                x={barX}
                y={barY}
                width={barWidth}
                height={Math.max(0, barH)}
                fill={color}
                fillOpacity={fillOpacity}
                rx={barRadius}
                ry={barRadius}
              />
            );
          });
        })}
      </svg>
      <SvgTooltip
        active={tooltip.active}
        position={{ x: tooltip.x, y: tooltip.y }}
        data={tooltip.data}
        label={tooltip.label}
      />
      {showLegend && (
        <SvgLegend
          series={seriesNames.map((name, idx) => ({
            name,
            color: seriesColor(idx),
            visible: !hiddenSeries.has(name),
          }))}
          onToggle={handleLegendToggle}
        />
      )}
    </div>
  );
}

interface SvgScatterChartProps {
  data: ChartPoint[];
  xDataKey: string;
  xName: string;
  yDataKey: string;
  yName: string;
  xLabel?: string;
  yLabel?: string;
  nameDataKey?: string;
  width: number;
  height: number;
  margin: ChartMargin;
  tooltipFormatter?: (value: number | string, name: string) => [string, string];
  tooltipLabelFormatter?: (label: string) => string;
}
export function SvgScatterChart({
  data,
  xDataKey,
  xName,
  yDataKey,
  yName,
  xLabel,
  yLabel,
  nameDataKey = 'name',
  width,
  height,
  margin,
  tooltipFormatter,
  tooltipLabelFormatter,
}: SvgScatterChartProps) {
  const [tooltip, setTooltip] = useState<TooltipState>(HIDDEN_TOOLTIP);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const plotLeft = margin.left;
  const plotTop = margin.top;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const { xMin, xMax, yMin, yMax, xTicks, yTicks } = useMemo(() => {
    let xMin = Infinity,
      xMax = -Infinity,
      yMin = Infinity,
      yMax = -Infinity;
    for (const d of data) {
      const xv = Number(d[xDataKey]) || 0;
      const yv = Number(d[yDataKey]) || 0;
      if (xv < xMin) xMin = xv;
      if (xv > xMax) xMax = xv;
      if (yv < yMin) yMin = yv;
      if (yv > yMax) yMax = yv;
    }
    if (xMin === xMax) {
      xMin -= 1;
      xMax += 1;
    }
    if (yMin === yMax) {
      yMin -= 1;
      yMax += 1;
    }
    const xTicks = computeTicks(xMin, xMax);
    const yTicks = computeTicks(yMin, yMax);
    return {
      xMin: xTicks[0],
      xMax: xTicks[xTicks.length - 1],
      yMin: yTicks[0],
      yMax: yTicks[yTicks.length - 1],
      xTicks,
      yTicks,
    };
  }, [data, xDataKey, yDataKey]);
  const xScale = useMemo(
    () => linearScale(xMin, xMax, plotLeft, plotWidth),
    [plotLeft, plotWidth, xMin, xMax],
  );
  const yScale = useMemo(
    () => linearScale(yMin, yMax, plotTop + plotHeight, -plotHeight),
    [plotTop, plotHeight, yMin, yMax],
  );
  const scatterPoints = useMemo(
    () =>
      data.map((d, idx) => ({
        idx,
        cx: xScale(Number(d[xDataKey]) || 0),
        cy: yScale(Number(d[yDataKey]) || 0),
        name: String(d[nameDataKey] ?? ''),
        color: seriesColor(idx),
        xVal: Number(d[xDataKey]) || 0,
        yVal: Number(d[yDataKey]) || 0,
      })),
    [data, xDataKey, yDataKey, nameDataKey, xScale, yScale],
  );
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let closestIdx = -1;
      let closestDist = Infinity;
      for (const pt of scatterPoints) {
        const dist = Math.sqrt((pt.cx - mx) ** 2 + (pt.cy - my) ** 2);
        if (dist < closestDist && dist < 40) {
          closestDist = dist;
          closestIdx = pt.idx;
        }
      }
      if (closestIdx < 0) {
        setTooltip(HIDDEN_TOOLTIP);
        setHoveredIdx(null);
        return;
      }
      const pt = scatterPoints[closestIdx];
      setHoveredIdx(closestIdx);
      const formatItem = (v: number | string, name: string, fallback: string): TooltipDataItem => {
        if (!tooltipFormatter) return { name, value: fallback, color: pt.color };
        const r = tooltipFormatter(v, name);
        return Array.isArray(r)
          ? { name: r[1], value: r[0], color: pt.color }
          : { name, value: String(v), color: pt.color };
      };
      setTooltip({
        active: true,
        x: e.clientX,
        y: e.clientY,
        label: tooltipLabelFormatter ? tooltipLabelFormatter(pt.name) : pt.name,
        data: [
          formatItem(pt.xVal, xName, pt.xVal.toFixed(2)),
          formatItem(pt.yVal, yName, pt.yVal.toFixed(2)),
        ],
      });
    },
    [scatterPoints, xName, yName, tooltipFormatter, tooltipLabelFormatter],
  );
  const handleMouseLeave = useCallback(() => {
    setTooltip(HIDDEN_TOOLTIP);
    setHoveredIdx(null);
  }, []);
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg
        width={width}
        height={height}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ display: 'block' }}
      >
        <SvgAxis
          orientation="left"
          range={plotHeight}
          ticks={yTicks.map((t) => ({ value: yScale(t), label: t.toFixed(2) }))}
          label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft' } : undefined}
          gridLines
          gridColor="hsl(var(--chart-grid))"
          tickLine={false}
          offset={plotLeft}
          hideLine
        />
        <SvgAxis
          orientation="bottom"
          range={plotWidth}
          ticks={xTicks.map((t) => ({ value: xScale(t), label: t.toFixed(2) }))}
          label={xLabel ? { value: xLabel, position: 'insideBottom' } : undefined}
          gridLines
          gridColor="hsl(var(--chart-grid))"
          tickLine={false}
          offset={plotTop + plotHeight}
          hideLine
        />
        {scatterPoints.map((pt) => (
          <g key={`scatter-${pt.idx}`}>
            <circle
              cx={pt.cx}
              cy={pt.cy}
              r={hoveredIdx === pt.idx ? 7 : 5}
              fill={pt.color}
              fillOpacity={hoveredIdx === pt.idx ? 1 : 0.8}
              stroke="var(--bg-elevated)"
              strokeWidth={2}
            />
            <text
              x={pt.cx + 8}
              y={pt.cy + 4}
              textAnchor="start"
              style={{ fill: 'var(--text-muted)', fontSize: 11 }}
            >
              {pt.name}
            </text>
          </g>
        ))}
      </svg>
      <SvgTooltip
        active={tooltip.active}
        position={{ x: tooltip.x, y: tooltip.y }}
        data={tooltip.data}
        label={tooltip.label}
      />
    </div>
  );
}
