import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { CHART_COLORS } from '@backtest/shared';
import type { FanDataPoint } from './monteCarloUtils.js';
import { monthFormatter, dollarKFormatter } from './monteCarloUtils.js';
interface SvgFanChartProps {
  data: FanDataPoint[];
  band5_95Name: string;
  band25_75Name: string;
  medianName: string;
}
function computeNiceTicks(min: number, max: number, count: number = 5): number[] {
  if (max - min < 1) max = min + 1;
  const range = max - min;
  const step = range / (count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(step)));
  const residual = step / mag;
  const niceStep = residual <= 1.5 ? mag : residual <= 3.5 ? 2 * mag : residual <= 7.5 ? 5 * mag : 10 * mag;
  const niceMin = Math.floor(min / niceStep) * niceStep;
  const niceMax = Math.ceil(max / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let t = niceMin; t <= niceMax + niceStep * 0.5; t += niceStep) ticks.push(t);
  return ticks;
}
export default function SvgFanChart({ data, band5_95Name, band25_75Name, medianName }: SvgFanChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 450 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({ width: entry.contentRect.width, height: 450 });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const { width, height } = size;
  const MARGIN = { top: 10, right: 30, left: 60, bottom: 40 };
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const { xScale, yScale, yTicks, xTicks, visibleData } = useMemo(() => {
    if (data.length === 0) return { xScale: () => 0, yScale: () => 0, yTicks: [], xTicks: [], visibleData: [] };
    const months = data.map((d) => d.month);
    const minMonth = months[0];
    const maxMonth = months[months.length - 1];
    const allValues = data.flatMap((d) => [d.band5_95[0], d.band5_95[1], d.p50]);
    const yMin = Math.min(...allValues);
    const yMax = Math.max(...allValues);
    const yPad = (yMax - yMin) * 0.05 || 1;
    const xScaleFn = (month: number) => MARGIN.left + ((month - minMonth) / (maxMonth - minMonth || 1)) * innerW;
    const yScaleFn = (val: number) => MARGIN.top + innerH - ((val - (yMin - yPad)) / (yMax - yMin + 2 * yPad)) * innerH;
    const yTicks = computeNiceTicks(yMin - yPad, yMax + yPad);
    const xTicks = months.filter((m) => m % 12 === 0 || m === months[0] || m === months[months.length - 1]);
    const visibleData = data;
    return { xScale: xScaleFn, yScale: yScaleFn, yTicks, xTicks, visibleData };
  }, [data, innerW, innerH]);
  const buildBandPath = useCallback(
    (getUpper: (d: FanDataPoint) => number, getLower: (d: FanDataPoint) => number) => {
      if (visibleData.length < 2) return '';
      const upper = visibleData.map((d) => `${xScale(d.month)},${yScale(getUpper(d))}`);
      const lower = visibleData.map((d) => `${xScale(d.month)},${yScale(getLower(d))}`).reverse();
      return `M${upper.join(' L')} L${lower.join(' L')} Z`;
    },
    [visibleData, xScale, yScale]
  );
  const buildLinePath = useCallback(
    (getVal: (d: FanDataPoint) => number) => {
      if (visibleData.length < 2) return '';
      return visibleData.map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(d.month)},${yScale(getVal(d))}`).join(' ');
    },
    [visibleData, xScale, yScale]
  );
  const [tooltip, setTooltip] = useState<{ x: number; data: FanDataPoint } | null>(null);
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svgRect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - svgRect.left;
      let nearest = visibleData[0];
      let minDist = Infinity;
      for (const d of visibleData) {
        const dist = Math.abs(xScale(d.month) - mouseX);
        if (dist < minDist) {
          minDist = dist;
          nearest = d;
        }
      }
      if (minDist < innerW / 20) {
        setTooltip({ x: xScale(nearest.month), data: nearest });
      } else {
        setTooltip(null);
      }
    },
    [visibleData, xScale, innerW]
  );
  if (data.length === 0) return null;
  return (
    <div ref={containerRef} style={{ width: '100%', height: 450, position: 'relative' }}>
      <svg width={width} height={height} onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)}>
        {/* Grid lines */}
        {yTicks.map((t) => (
          <line key={'g' + t} x1={MARGIN.left} y1={yScale(t)} x2={width - MARGIN.right} y2={yScale(t)} stroke="hsl(var(--border-subtle))" strokeWidth={1} />
        ))}
        {/* Bands */}
        <path
          d={buildBandPath(
            (d) => d.band5_95[1],
            (d) => d.band5_95[0]
          )}
          fill={CHART_COLORS[0]}
          fillOpacity={0.08}
        />
        <path
          d={buildBandPath(
            (d) => d.band25_75[1],
            (d) => d.band25_75[0]
          )}
          fill={CHART_COLORS[0]}
          fillOpacity={0.18}
        />
        {/* Median line */}
        <path d={buildLinePath((d) => d.p50)} fill="none" stroke={CHART_COLORS[0]} strokeWidth={2.5} />
        {/* X axis */}
        <line x1={MARGIN.left} y1={height - MARGIN.bottom} x2={width - MARGIN.right} y2={height - MARGIN.bottom} stroke="hsl(var(--border))" />
        {xTicks.map((m) => (
          <text key={'x' + m} x={xScale(m)} y={height - MARGIN.bottom + 16} textAnchor="middle" fill="hsl(var(--fg-tertiary))" fontSize={11}>
            {monthFormatter(m)}
          </text>
        ))}
        {/* Y axis */}
        <line x1={MARGIN.left} y1={MARGIN.top} x2={MARGIN.left} y2={height - MARGIN.bottom} stroke="hsl(var(--border))" />
        {yTicks.map((t) => (
          <text key={'y' + t} x={MARGIN.left - 8} y={yScale(t) + 4} textAnchor="end" fill="hsl(var(--fg-tertiary))" fontSize={11}>
            {dollarKFormatter(t)}
          </text>
        ))}
        {/* Tooltip vertical line */}
        {tooltip && <line x1={tooltip.x} y1={MARGIN.top} x2={tooltip.x} y2={height - MARGIN.bottom} stroke="hsl(var(--fg-tertiary))" strokeWidth={1} strokeDasharray="4 2" />}
      </svg>
      {/* Tooltip overlay */}
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            top: MARGIN.top + 8,
            left: Math.min(tooltip.x + 12, width - 180),
            background: 'hsl(var(--app))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 12,
            pointerEvents: 'none',
            zIndex: 10,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4, color: 'hsl(var(--fg-secondary))' }}>{monthFormatter(tooltip.data.month)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, background: CHART_COLORS[0], opacity: 0.18 }} />
            <span>
              {band25_75Name}: ${(tooltip.data.band25_75[0] / 1000).toFixed(0)}k – ${(tooltip.data.band25_75[1] / 1000).toFixed(0)}k
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{ width: 12, height: 2.5, borderRadius: 1, background: CHART_COLORS[0] }} />
            <span>
              {medianName}: ${(tooltip.data.p50 / 1000).toFixed(0)}k
            </span>
          </div>
        </div>
      )}
      {/* Legend */}
      <div style={{ position: 'absolute', top: 8, right: 30, display: 'flex', gap: 16, fontSize: 12, color: 'hsl(var(--fg-tertiary))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, background: CHART_COLORS[0], opacity: 0.18 }} />
          <span>{band25_75Name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 2.5, borderRadius: 1, background: CHART_COLORS[0] }} />
          <span>{band5_95Name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 2.5, borderRadius: 1, background: CHART_COLORS[0] }} />
          <span>{medianName}</span>
        </div>
      </div>
    </div>
  );
}
