import { useMemo, useState, useCallback, type CSSProperties } from 'react';
import { CHART_COLORS } from '@backtest/shared';
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
  orientation: 'bottom' | 'left';
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
function isAxisLabelConfig(v: AxisLabelConfig | string | undefined): v is AxisLabelConfig {
  return typeof v === 'object' && v !== null && 'value' in v;
}
export function SvgAxis({ orientation, range, ticks, label, gridLines = false, gridColor = 'var(--chart-grid)', tickLine = { length: 5 }, tickStyle = { fill: 'hsl(var(--fg-tertiary))', fontSize: 11, fontFamily: 'Geist Mono Variable' }, offset, hideLine = false }: SvgAxisProps) {
  const isBottom = orientation === 'bottom';
  const tickLineLen = typeof tickLine === 'boolean' ? (tickLine ? 5 : 0) : tickLine.length;
  return (
    <g className="svg-axis">
      {!hideLine && <line x1={isBottom ? 0 : offset} y1={isBottom ? offset : 0} x2={isBottom ? range : offset} y2={isBottom ? offset : range} stroke="var(--border-soft)" strokeWidth={1} />}
      {gridLines &&
        ticks.map((tick, i) => {
          if (isBottom) {
            return <line key={`grid-${i}`} x1={tick.value} y1={0} x2={tick.value} y2={offset} stroke={gridColor} strokeWidth={1} strokeDasharray="3 3" />;
          }
          return <line key={`grid-${i}`} x1={0} y1={tick.value} x2={range} y2={tick.value} stroke={gridColor} strokeWidth={1} strokeDasharray="3 3" />;
        })}
      {ticks.map((tick, i) => {
        if (isBottom) {
          return (
            <g key={`tick-${i}`}>
              {tickLineLen > 0 && <line x1={tick.value} y1={offset} x2={tick.value} y2={offset + tickLineLen} stroke="var(--border-soft)" strokeWidth={1} />}
              <text x={tick.value} y={offset + tickLineLen + 12} textAnchor="middle" style={tickStyle as Record<string, string | number>}>
                {tick.label}
              </text>
            </g>
          );
        }
        return (
          <g key={`tick-${i}`}>
            {tickLineLen > 0 && <line x1={offset - tickLineLen} y1={tick.value} x2={offset} y2={tick.value} stroke="var(--border-soft)" strokeWidth={1} />}
            <text x={offset - tickLineLen - 6} y={tick.value + 4} textAnchor="end" style={tickStyle as Record<string, string | number>}>
              {tick.label}
            </text>
          </g>
        );
      })}
      {label &&
        (() => {
          const labelText = isAxisLabelConfig(label) ? label.value : label;
          if (isBottom) {
            return (
              <text x={range / 2} y={offset + 36} textAnchor="middle" style={{ fill: 'var(--text-muted)', fontSize: 12 }}>
                {labelText}
              </text>
            );
          }
          return (
            <text x={-range / 2} y={16} textAnchor="middle" transform={`rotate(-90)`} style={{ fill: 'var(--text-muted)', fontSize: 12 }}>
              {labelText}
            </text>
          );
        })()}
    </g>
  );
}
interface TooltipDataItem {
  name: string;
  value: string | number;
  color: string;
}
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
  whiteSpace: 'nowrap'
};
export function SvgTooltip({ active, position, data, label, offset = 20 }: SvgTooltipProps) {
  if (!active || data.length === 0) return null;
  const style: CSSProperties = {
    ...TOOLTIP_STYLE,
    left: `${position.x + offset}px`,
    top: `${position.y - 10}px`
  };
  return (
    <div style={style}>
      {label !== undefined && label !== null && <div style={{ marginBottom: 6, fontWeight: 600, color: 'hsl(var(--fg-strong))' }}>{label}</div>}
      {data.map((item, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: item.color, flexShrink: 0 }} />
          <span style={{ color: 'hsl(var(--fg-tertiary))' }}>{item.name}</span>
          <span style={{ fontWeight: 600, marginLeft: 'auto', fontFamily: 'Geist Mono Variable' }}>{item.value}</span>
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
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px', padding: '8px 0', fontSize: '12px', color: 'var(--fg-tertiary)' }}>
      {series.map((s) => (
        <div
          key={s.name}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            cursor: onToggle ? 'pointer' : 'default',
            opacity: s.visible === false ? 0.4 : 1,
            transition: 'opacity 0.15s'
          }}
          onClick={() => onToggle?.(s.name)}
        >
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', backgroundColor: s.color, flexShrink: 0 }} />
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
interface SvgAreaChartProps {
  data: Array<Record<string, number | string>>;
  seriesNames: string[];
  xDataKey: string;
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
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
interface TooltipState {
  active: boolean;
  x: number;
  y: number;
  label: string;
  data: Array<{ name: string; value: string; color: string }>;
}
const HIDDEN_TOOLTIP: TooltipState = { active: false, x: 0, y: 0, label: '', data: [] };
const gradId = (name: string) => `svg-area-grad-${name.replace(/\s+/g, '-')}`;
function computeYTicks(min: number, max: number, count = 5): number[] {
  if (min === max) {
    const v = min === 0 ? 1 : Math.abs(min);
    min -= v;
    max += v;
  }
  const roughStep = (max - min) / (count - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;
  const niceStep = (residual <= 1.5 ? 1 : residual <= 3.5 ? 2 : residual <= 7.5 ? 5 : 10) * magnitude;
  const niceMin = Math.floor(min / niceStep) * niceStep;
  const niceMax = Math.ceil(max / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + niceStep * 0.001; v += niceStep) ticks.push(Math.round(v * 1e10) / 1e10);
  return ticks;
}
export function SvgAreaChart({ data, seriesNames, xDataKey, width, height, margin, yTickFormatter, yDomain, fillOpacity = 0.12, strokeWidth = 1.5, showLegend = true, colorOffset = 0, referenceDots, useGradient = false, hideAxisLines = false, tooltipValueFormatter, tooltipLabelFormatter }: SvgAreaChartProps) {
  const [tooltip, setTooltip] = useState<TooltipState>(HIDDEN_TOOLTIP);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const { top: plotTop, left: plotLeft } = margin;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const plotBottom = plotTop + plotHeight;
  const visibleSeries = seriesNames.filter((n) => !hiddenSeries.has(n));
  const xStep = data.length > 1 ? plotWidth / (data.length - 1) : plotWidth;
  const colorOf = useCallback((idx: number) => CHART_COLORS[(idx + colorOffset) % CHART_COLORS.length], [colorOffset]);
  const { yMin, yMax, yTicks } = useMemo(() => {
    let min = yDomain && yDomain[0] !== 'auto' ? yDomain[0] : 0;
    let max = yDomain && yDomain[1] !== 'auto' ? yDomain[1] : 1;
    if (!yDomain || yDomain[0] === 'auto' || yDomain[1] === 'auto') {
      for (const d of data)
        for (const name of seriesNames) {
          const v = Number(d[name]) || 0;
          if (v < min) min = v;
          if (v > max) max = v;
        }
    }
    const ticks = computeYTicks(min, max);
    return { yMin: ticks[0], yMax: ticks[ticks.length - 1], yTicks: ticks };
  }, [data, seriesNames, yDomain]);
  const yScale = useMemo(() => (v: number) => plotTop + plotHeight - ((v - yMin) / (yMax - yMin)) * plotHeight, [plotTop, plotHeight, yMin, yMax]);
  const { yTickPixels, xTickPixels } = useMemo(
    () => ({
      yTickPixels: yTicks.map((t) => ({ value: yScale(t), label: yTickFormatter ? yTickFormatter(t) : t.toFixed(2) })),
      xTickPixels: data.map((d, i) => ({ value: plotLeft + i * xStep, label: String(d[xDataKey] ?? '') }))
    }),
    [yTicks, yScale, yTickFormatter, data, xDataKey, plotLeft, xStep]
  );
  const areaPaths = useMemo(
    () =>
      visibleSeries.map((name) => {
        const seriesIdx = seriesNames.indexOf(name);
        const points = data.map((d, i) => ({ x: plotLeft + i * xStep, y: yScale(Number(d[name]) || 0) }));
        const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
        const areaPath = `${linePath} L${points[points.length - 1].x},${plotBottom} L${points[0].x},${plotBottom} Z`;
        return { name, color: colorOf(seriesIdx), gradientId: useGradient ? gradId(name) : undefined, areaPath, linePath, points };
      }),
    [visibleSeries, seriesNames, data, plotLeft, xStep, yScale, plotBottom, useGradient, colorOf]
  );
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const mx = e.clientX - e.currentTarget.getBoundingClientRect().left;
      const dataIdx = Math.round((mx - plotLeft) / xStep);
      if (dataIdx < 0 || dataIdx >= data.length) {
        setTooltip(HIDDEN_TOOLTIP);
        return;
      }
      const point = data[dataIdx];
      const rawLabel = String(point[xDataKey] ?? '');
      const items = visibleSeries.map((name) => {
        const val = Number(point[name]) || 0;
        const r = tooltipValueFormatter?.(val, name);
        return { name, value: r ? (Array.isArray(r) ? r[0] : r) : val.toFixed(2), color: colorOf(seriesNames.indexOf(name)) };
      });
      setTooltip({ active: true, x: e.clientX, y: e.clientY, label: tooltipLabelFormatter ? tooltipLabelFormatter(rawLabel) : rawLabel, data: items });
    },
    [data, xDataKey, xStep, plotLeft, visibleSeries, seriesNames, tooltipValueFormatter, tooltipLabelFormatter, colorOf]
  );
  const handleMouseLeave = useCallback(() => setTooltip(HIDDEN_TOOLTIP), []);
  const handleLegendToggle = useCallback(
    (name: string) =>
      setHiddenSeries((prev) => {
        const next = new Set(prev);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        return next;
      }),
    []
  );
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg width={width} height={height} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} style={{ display: 'block' }}>
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
        <SvgAxis orientation="left" range={plotHeight} ticks={yTickPixels} gridLines gridColor="hsl(var(--chart-grid))" tickLine={false} offset={plotLeft} hideLine={hideAxisLines} />
        {xTickPixels.map((t, i) => {
          const label = t.label.length > 10 ? t.label.slice(0, 7) : t.label;
          return (
            <g key={`xtick-${i}`}>
              <line x1={t.value} y1={plotBottom} x2={t.value} y2={plotBottom + 5} stroke="var(--border-soft)" strokeWidth={1} />
              <text x={t.value} y={plotBottom + 16} textAnchor="middle" style={{ fill: 'hsl(var(--fg-tertiary))', fontSize: 11, fontFamily: 'Geist Mono Variable' }}>
                {label}
              </text>
            </g>
          );
        })}
        {areaPaths.map((area) => (
          <g key={area.name}>
            <path d={area.areaPath} fill={area.gradientId ? `url(#${area.gradientId})` : area.color} fillOpacity={useGradient ? 1 : fillOpacity} stroke="none" />
            <path d={area.linePath} fill="none" stroke={area.color} strokeWidth={strokeWidth} />
            {area.points.map((p, i) => (
              <circle key={`dot-${area.name}-${i}`} cx={p.x} cy={p.y} r={2} fill={area.color} stroke="var(--bg-elevated)" strokeWidth={1} />
            ))}
          </g>
        ))}
        {referenceDots?.map((dot, idx) => {
          const color = colorOf(idx);
          const dataIdx = data.findIndex((d) => d[xDataKey] === dot.x || String(d[xDataKey]) === String(dot.x));
          const cx = dataIdx >= 0 ? plotLeft + dataIdx * xStep : plotLeft + plotWidth / 2;
          const cy = yScale(dot.y);
          return (
            <g key={`ref-${idx}`}>
              <circle cx={cx} cy={cy} r={5} fill={color} stroke="var(--bg-elevated)" strokeWidth={2} />
              <text x={cx} y={cy - 10} textAnchor="middle" fill={color} fontSize={11} fontWeight={600}>
                {dot.value.toFixed(2)}%
              </text>
            </g>
          );
        })}
      </svg>
      <SvgTooltip active={tooltip.active} position={{ x: tooltip.x, y: tooltip.y }} data={tooltip.data} label={tooltip.label} />
      {showLegend && <SvgLegend series={seriesNames.map((name, idx) => ({ name, color: colorOf(idx), visible: !hiddenSeries.has(name) }))} onToggle={handleLegendToggle} />}
    </div>
  );
}
interface SvgBarChartProps {
  data: Array<Record<string, number | string>>;
  seriesNames: string[];
  xDataKey: string;
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
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
interface TooltipState {
  active: boolean;
  x: number;
  y: number;
  label: string;
  data: Array<{ name: string; value: string; color: string }>;
}
function computeYTicksBar(min: number, max: number, count: number = 5): number[] {
  if (min === max) {
    const v = min === 0 ? 1 : Math.abs(min);
    min = min - v;
    max = max + v;
  }
  const range = max - min;
  const roughStep = range / (count - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;
  let niceStep: number;
  if (residual <= 1.5) niceStep = 1 * magnitude;
  else if (residual <= 3.5) niceStep = 2 * magnitude;
  else if (residual <= 7.5) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;
  const niceMin = Math.floor(min / niceStep) * niceStep;
  const niceMax = Math.ceil(max / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + niceStep * 0.001; v += niceStep) {
    ticks.push(Math.round(v * 1e10) / 1e10);
  }
  return ticks;
}
export function SvgBarChart({ data, seriesNames, xDataKey, width, height, margin, yTickFormatter, yLabel, barRadius = 0, fillOpacity = 1, showLegend = true, signColorSingleSeries = false, xTickFontSize, xTickInterval, tooltipValueFormatter }: SvgBarChartProps) {
  const [tooltip, setTooltip] = useState<TooltipState>({ active: false, x: 0, y: 0, label: '', data: [] });
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const plotLeft = margin.left;
  const plotTop = margin.top;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const visibleSeries = seriesNames.filter((n) => !hiddenSeries.has(n));
  const { yMin, yMax, yTicks } = useMemo(() => {
    let min = 0;
    let max = 0;
    for (const d of data) {
      for (const name of seriesNames) {
        const v = Number(d[name]) || 0;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (min === 0 && max === 0) {
      max = 1;
    }
    const yTicks = computeYTicksBar(min, max);
    return { yMin: yTicks[0], yMax: yTicks[yTicks.length - 1], yTicks };
  }, [data, seriesNames]);
  const yScale = useMemo(() => {
    return (v: number) => plotTop + plotHeight - ((v - yMin) / (yMax - yMin)) * plotHeight;
  }, [plotTop, plotHeight, yMin, yMax]);
  const yTickPixels = useMemo(() => yTicks.map((t) => ({ value: yScale(t), label: yTickFormatter(t) })), [yTicks, yScale, yTickFormatter]);
  const barWidth = useMemo(() => {
    const totalBars = visibleSeries.length || 1;
    const groupWidth = plotWidth / data.length;
    return Math.max(4, (groupWidth * 0.7) / totalBars);
  }, [plotWidth, data.length, visibleSeries.length]);
  const groupWidth = plotWidth / data.length;
  const xTickPixels = useMemo(() => {
    const interval = xTickInterval ?? 1;
    return data.map((d, i) => ({
      value: plotLeft + i * groupWidth + groupWidth / 2,
      label: String(d[xDataKey] ?? ''),
      show: i % interval === 0
    }));
  }, [data, xDataKey, plotLeft, groupWidth, xTickInterval]);
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const dataIdx = Math.floor((mx - plotLeft) / groupWidth);
      if (dataIdx < 0 || dataIdx >= data.length) {
        setTooltip({ active: false, x: 0, y: 0, label: '', data: [] });
        return;
      }
      const point = data[dataIdx];
      const label = String(point[xDataKey] ?? '');
      const items = visibleSeries.map((name) => {
        const val = Number(point[name]) || 0;
        const formatted = tooltipValueFormatter
          ? (() => {
              const r = tooltipValueFormatter(val, name);
              return Array.isArray(r) ? r[0] : r;
            })()
          : String(val);
        return {
          name,
          value: formatted,
          color: seriesNames.length === 1 && signColorSingleSeries ? (val >= 0 ? 'var(--success)' : 'var(--error)') : CHART_COLORS[seriesNames.indexOf(name) % CHART_COLORS.length]
        };
      });
      setTooltip({
        active: true,
        x: e.clientX,
        y: e.clientY,
        label,
        data: items
      });
    },
    [data, xDataKey, plotLeft, groupWidth, visibleSeries, seriesNames, signColorSingleSeries, tooltipValueFormatter]
  );
  const handleMouseLeave = useCallback(() => {
    setTooltip({ active: false, x: 0, y: 0, label: '', data: [] });
  }, []);
  const handleLegendToggle = useCallback((name: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);
  const xTickStyle = xTickFontSize ? { fill: 'hsl(var(--fg-tertiary))', fontSize: xTickFontSize, fontFamily: 'Geist Mono Variable' } : { fill: 'hsl(var(--fg-tertiary))', fontSize: 11, fontFamily: 'Geist Mono Variable' };
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg width={width} height={height} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} style={{ display: 'block' }}>
        <SvgAxis orientation="left" range={plotHeight} ticks={yTickPixels} label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft' } : undefined} gridLines gridColor="hsl(var(--chart-grid))" tickLine={false} offset={plotLeft} hideLine />
        {xTickPixels.map((t, i) => {
          if (!t.show) return null;
          return (
            <g key={`xtick-${i}`}>
              <line x1={t.value} y1={plotTop + plotHeight} x2={t.value} y2={plotTop + plotHeight + 5} stroke="var(--border-soft)" strokeWidth={1} />
              <text x={t.value} y={plotTop + plotHeight + 16} textAnchor="middle" style={xTickStyle as Record<string, string | number>}>
                {t.label}
              </text>
            </g>
          );
        })}
        {data.map((point, dataIdx) => {
          const startX = plotLeft + dataIdx * groupWidth + groupWidth / 2 - (visibleSeries.length * barWidth) / 2;
          return visibleSeries.map((name, seriesIdx) => {
            const val = Number(point[name]) || 0;
            const seriesColorIdx = seriesNames.indexOf(name);
            const color = seriesNames.length === 1 && signColorSingleSeries ? (val >= 0 ? 'var(--success)' : 'var(--error)') : CHART_COLORS[seriesColorIdx % CHART_COLORS.length];
            const barX = startX + seriesIdx * barWidth;
            const barH = Math.abs((val - yMin) / (yMax - yMin)) * plotHeight;
            const barY = val >= 0 ? yScale(val) : yScale(0);
            return <rect key={`bar-${dataIdx}-${name}`} x={barX} y={barY} width={barWidth} height={Math.max(0, barH)} fill={color} fillOpacity={fillOpacity} rx={barRadius} ry={barRadius} />;
          });
        })}
      </svg>
      <SvgTooltip active={tooltip.active} position={{ x: tooltip.x, y: tooltip.y }} data={tooltip.data} label={tooltip.label} />
      {showLegend && (
        <SvgLegend
          series={seriesNames.map((name, idx) => ({
            name,
            color: CHART_COLORS[idx % CHART_COLORS.length],
            visible: !hiddenSeries.has(name)
          }))}
          onToggle={handleLegendToggle}
        />
      )}
    </div>
  );
}
interface SvgScatterChartProps {
  data: Array<Record<string, string | number>>;
  xDataKey: string;
  xName: string;
  yDataKey: string;
  yName: string;
  xLabel?: string;
  yLabel?: string;
  nameDataKey?: string;
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  tooltipFormatter?: (value: number | string, name: string) => [string, string];
  tooltipLabelFormatter?: (label: string) => string;
}
interface TooltipState {
  active: boolean;
  x: number;
  y: number;
  label: string;
  data: Array<{ name: string; value: string; color: string }>;
}
function computeTicks(min: number, max: number, count: number = 5): number[] {
  if (min === max) {
    const v = min === 0 ? 1 : Math.abs(min);
    min = min - v;
    max = max + v;
  }
  const range = max - min;
  const roughStep = range / (count - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;
  let niceStep: number;
  if (residual <= 1.5) niceStep = 1 * magnitude;
  else if (residual <= 3.5) niceStep = 2 * magnitude;
  else if (residual <= 7.5) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;
  const niceMin = Math.floor(min / niceStep) * niceStep;
  const niceMax = Math.ceil(max / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + niceStep * 0.001; v += niceStep) {
    ticks.push(Math.round(v * 1e10) / 1e10);
  }
  return ticks;
}
export function SvgScatterChart({ data, xDataKey, xName, yDataKey, yName, xLabel, yLabel, nameDataKey = 'name', width, height, margin, tooltipFormatter, tooltipLabelFormatter }: SvgScatterChartProps) {
  const [tooltip, setTooltip] = useState<TooltipState>({ active: false, x: 0, y: 0, label: '', data: [] });
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const plotLeft = margin.left;
  const plotTop = margin.top;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const { xMin, xMax, yMin, yMax, xTicks, yTicks } = useMemo(() => {
    let xMin = Infinity,
      xMax = -Infinity;
    let yMin = Infinity,
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
    return { xMin: xTicks[0], xMax: xTicks[xTicks.length - 1], yMin: yTicks[0], yMax: yTicks[yTicks.length - 1], xTicks, yTicks };
  }, [data, xDataKey, yDataKey]);
  const xScale = useMemo(() => (v: number) => plotLeft + ((v - xMin) / (xMax - xMin)) * plotWidth, [plotLeft, plotWidth, xMin, xMax]);
  const yScale = useMemo(() => (v: number) => plotTop + plotHeight - ((v - yMin) / (yMax - yMin)) * plotHeight, [plotTop, plotHeight, yMin, yMax]);
  const xTickPixels = useMemo(() => xTicks.map((t) => ({ value: xScale(t), label: t.toFixed(2) })), [xTicks, xScale]);
  const yTickPixels = useMemo(() => yTicks.map((t) => ({ value: yScale(t), label: t.toFixed(2) })), [yTicks, yScale]);
  const scatterPoints = useMemo(
    () =>
      data.map((d, idx) => ({
        idx,
        cx: xScale(Number(d[xDataKey]) || 0),
        cy: yScale(Number(d[yDataKey]) || 0),
        name: String(d[nameDataKey] ?? ''),
        color: CHART_COLORS[idx % CHART_COLORS.length],
        xVal: Number(d[xDataKey]) || 0,
        yVal: Number(d[yDataKey]) || 0
      })),
    [data, xDataKey, yDataKey, nameDataKey, xScale, yScale]
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
        setTooltip({ active: false, x: 0, y: 0, label: '', data: [] });
        setHoveredIdx(null);
        return;
      }
      const pt = scatterPoints[closestIdx];
      setHoveredIdx(closestIdx);
      const label = tooltipLabelFormatter ? tooltipLabelFormatter(pt.name) : pt.name;
      const items = [];
      if (tooltipFormatter) {
        const xFormatted = tooltipFormatter(pt.xVal, xName);
        items.push({
          name: Array.isArray(xFormatted) ? xFormatted[1] : xName,
          value: Array.isArray(xFormatted) ? xFormatted[0] : String(pt.xVal),
          color: pt.color
        });
        const yFormatted = tooltipFormatter(pt.yVal, yName);
        items.push({
          name: Array.isArray(yFormatted) ? yFormatted[1] : yName,
          value: Array.isArray(yFormatted) ? yFormatted[0] : String(pt.yVal),
          color: pt.color
        });
      } else {
        items.push({ name: xName, value: pt.xVal.toFixed(2), color: pt.color });
        items.push({ name: yName, value: pt.yVal.toFixed(2), color: pt.color });
      }
      setTooltip({ active: true, x: e.clientX, y: e.clientY, label, data: items });
    },
    [scatterPoints, xName, yName, tooltipFormatter, tooltipLabelFormatter]
  );
  const handleMouseLeave = useCallback(() => {
    setTooltip({ active: false, x: 0, y: 0, label: '', data: [] });
    setHoveredIdx(null);
  }, []);
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg width={width} height={height} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} style={{ display: 'block' }}>
        <SvgAxis orientation="left" range={plotHeight} ticks={yTickPixels} label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft' } : undefined} gridLines gridColor="hsl(var(--chart-grid))" tickLine={false} offset={plotLeft} hideLine />
        <SvgAxis orientation="bottom" range={plotWidth} ticks={xTickPixels} label={xLabel ? { value: xLabel, position: 'insideBottom' } : undefined} gridLines gridColor="hsl(var(--chart-grid))" tickLine={false} offset={plotTop + plotHeight} hideLine />
        {scatterPoints.map((pt) => (
          <g key={`scatter-${pt.idx}`}>
            <circle cx={pt.cx} cy={pt.cy} r={hoveredIdx === pt.idx ? 7 : 5} fill={pt.color} fillOpacity={hoveredIdx === pt.idx ? 1 : 0.8} stroke="var(--bg-elevated)" strokeWidth={2} />
            <text x={pt.cx + 8} y={pt.cy + 4} textAnchor="start" style={{ fill: 'var(--text-muted)', fontSize: 11 }}>
              {pt.name}
            </text>
          </g>
        ))}
      </svg>
      <SvgTooltip active={tooltip.active} position={{ x: tooltip.x, y: tooltip.y }} data={tooltip.data} label={tooltip.label} />
    </div>
  );
}
