import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import type { FanDataPoint } from './monteCarloUtils.js';
import { monthFormatter, dollarKFormatter } from './monteCarloUtils.js';
import { computeTicks } from '@/components/charts/svg/svgChartParts.js';
const MARGIN = { top: 10, right: 30, left: 60, bottom: 40 };
interface SvgFanChartProps {
  data: FanDataPoint[];
  band5_95Name: string;
  band25_75Name: string;
  medianName: string;
}
export default function SvgFanChart({
  data,
  band5_95Name,
  band25_75Name,
  medianName,
}: SvgFanChartProps) {
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
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const { xScale, yScale, yTicks, xTicks, visibleData } = useMemo(() => {
    if (data.length === 0)
      return { xScale: () => 0, yScale: () => 0, yTicks: [], xTicks: [], visibleData: [] };
    const months = data.map((d) => d.month);
    const minMonth = months[0];
    const maxMonth = months[months.length - 1];
    const allValues = data.flatMap((d) => [d.band5_95[0], d.band5_95[1], d.p50]);
    const yMin = Math.min(...allValues);
    const yMax = Math.max(...allValues);
    const yPad = (yMax - yMin) * 0.05 || 1;
    const xScaleFn = (month: number) =>
      MARGIN.left + ((month - minMonth) / (maxMonth - minMonth || 1)) * innerW;
    const yScaleFn = (val: number) =>
      MARGIN.top + innerH - ((val - (yMin - yPad)) / (yMax - yMin + 2 * yPad)) * innerH;
    const yTicks = computeTicks(yMin - yPad, yMax + yPad);
    const xTicks = months.filter(
      (m) => m % 12 === 0 || m === months[0] || m === months[months.length - 1],
    );
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
    [visibleData, xScale, yScale],
  );
  const buildLinePath = useCallback(
    (getVal: (d: FanDataPoint) => number) => {
      if (visibleData.length < 2) return '';
      return visibleData
        .map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(d.month)},${yScale(getVal(d))}`)
        .join(' ');
    },
    [visibleData, xScale, yScale],
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
    [visibleData, xScale, innerW],
  );
  if (data.length === 0) return null;
  return (
    <div ref={containerRef} className="w-full h-[450px] relative">
      <svg
        width={width}
        height={height}
        role="img"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        <title>{`${band5_95Name} · ${band25_75Name} · ${medianName}`}</title>
        {yTicks.map((t) => (
          <line
            key={'g' + t}
            x1={MARGIN.left}
            y1={yScale(t)}
            x2={width - MARGIN.right}
            y2={yScale(t)}
            stroke="hsl(var(--border-subtle))"
            strokeWidth={1}
          />
        ))}
        <path
          d={buildBandPath(
            (d) => d.band5_95[1],
            (d) => d.band5_95[0],
          )}
          fill={getPortfolioColor(0)}
          fillOpacity={0.08}
        />
        <path
          d={buildBandPath(
            (d) => d.band25_75[1],
            (d) => d.band25_75[0],
          )}
          fill={getPortfolioColor(0)}
          fillOpacity={0.18}
        />
        <path
          d={buildLinePath((d) => d.p50)}
          fill="none"
          stroke={getPortfolioColor(0)}
          strokeWidth={2.5}
        />
        <line
          x1={MARGIN.left}
          y1={height - MARGIN.bottom}
          x2={width - MARGIN.right}
          y2={height - MARGIN.bottom}
          stroke="hsl(var(--border))"
        />
        {xTicks.map((m) => (
          <text
            key={'x' + m}
            x={xScale(m)}
            y={height - MARGIN.bottom + 16}
            textAnchor="middle"
            fill="hsl(var(--fg-tertiary))"
            fontSize={11}
          >
            {monthFormatter(m)}
          </text>
        ))}
        <line
          x1={MARGIN.left}
          y1={MARGIN.top}
          x2={MARGIN.left}
          y2={height - MARGIN.bottom}
          stroke="hsl(var(--border))"
        />
        {yTicks.map((t) => (
          <text
            key={'y' + t}
            x={MARGIN.left - 8}
            y={yScale(t) + 4}
            textAnchor="end"
            fill="hsl(var(--fg-tertiary))"
            fontSize={11}
          >
            {dollarKFormatter(t)}
          </text>
        ))}
        {tooltip && (
          <line
            x1={tooltip.x}
            y1={MARGIN.top}
            x2={tooltip.x}
            y2={height - MARGIN.bottom}
            stroke="hsl(var(--fg-tertiary))"
            strokeWidth={1}
            strokeDasharray="4 2"
          />
        )}
      </svg>
      {tooltip && (
        <div
          className="absolute z-10 pointer-events-none rounded-md border border-border bg-app p-2 px-3 text-xs shadow-lg"
          style={{
            top: MARGIN.top + 8,
            left: Math.min(tooltip.x + 12, width - 180),
          }}
        >
          <div className="font-semibold mb-1 text-fg-secondary">
            {monthFormatter(tooltip.data.month)}
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-sm"
              style={{ background: getPortfolioColor(0), opacity: 0.18 }}
            />
            <span>
              {band25_75Name}: ${(tooltip.data.band25_75[0] / 1000).toFixed(0)}k – $
              {(tooltip.data.band25_75[1] / 1000).toFixed(0)}k
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="w-3 h-[2.5px] rounded-sm"
              style={{ background: getPortfolioColor(0) }}
            />
            <span>
              {medianName}: ${(tooltip.data.p50 / 1000).toFixed(0)}k
            </span>
          </div>
        </div>
      )}
      <div className="absolute top-2 right-[30px] flex gap-4 text-xs text-fg-tertiary">
        <div className="flex items-center gap-1">
          <span
            className="w-3 h-3 rounded-sm"
            style={{ background: getPortfolioColor(0), opacity: 0.18 }}
          />
          <span>{band25_75Name}</span>
        </div>
        <div className="flex items-center gap-1">
          <span
            className="w-3 h-3 rounded-sm"
            style={{ background: getPortfolioColor(0), opacity: 0.08 }}
          />
          <span>{band5_95Name}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-[2.5px] rounded-sm" style={{ background: getPortfolioColor(0) }} />
          <span>{medianName}</span>
        </div>
      </div>
    </div>
  );
}
