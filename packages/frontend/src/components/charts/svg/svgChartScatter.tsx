import { useMemo, useCallback, useState } from 'react';
import {
  SvgAxis,
  ChartShell,
  LeftAxis,
  useChartScaffold,
  plotDims,
  computeTicks,
  seriesColor,
  linearScale,
  HIDDEN_TOOLTIP,
  type TooltipDataItem,
  type ChartMargin,
  type ChartPoint,
} from './svgChartParts.js';

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
  const { tooltip, setTooltip, handleMouseLeave } = useChartScaffold([]);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const { plotWidth, plotHeight, plotBottom, plotLeft } = plotDims(width, height, margin);
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
    () => linearScale(yMin, yMax, plotBottom, -plotHeight),
    [plotBottom, plotHeight, yMin, yMax],
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
    [scatterPoints, xName, yName, tooltipFormatter, tooltipLabelFormatter, setTooltip],
  );
  const handleMouseLeaveScatter = useCallback(() => {
    handleMouseLeave();
    setHoveredIdx(null);
  }, [handleMouseLeave]);
  return (
    <ChartShell
      width={width}
      height={height}
      tooltip={tooltip}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeaveScatter}
    >
      <LeftAxis
        range={plotHeight}
        ticks={yTicks.map((t) => ({ value: yScale(t), label: t.toFixed(2) }))}
        label={yLabel}
        offset={plotLeft}
        hideLine
      />
      <SvgAxis
        orientation="bottom"
        range={plotWidth}
        ticks={xTicks.map((t) => ({ value: xScale(t), label: t.toFixed(2) }))}
        label={xLabel ? { value: xLabel } : undefined}
        gridLines
        gridColor="hsl(var(--chart-grid))"
        tickLine={false}
        offset={plotBottom}
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
    </ChartShell>
  );
}
