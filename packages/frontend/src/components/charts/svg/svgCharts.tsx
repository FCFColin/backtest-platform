import { useMemo, useCallback, type CSSProperties } from 'react';
import {
  SvgAxis,
  ChartShell,
  LeftAxis,
  useChartScaffold,
  computeYDomain,
  plotDims,
  seriesColor,
  linearScale,
  buildMouseMoveHandler,
  type ChartMargin,
  type ChartPoint,
} from './svgChartParts.js';
import { AXIS_TICK_STYLE } from '@/lib/chart-theme';
export { SvgScatterChart } from './svgChartScatter.js';

const barFill = (val: number, idx: number, signColor: boolean) =>
  signColor ? (val >= 0 ? 'var(--success)' : 'var(--danger)') : seriesColor(idx);
interface SvgBarChartProps {
  data: ChartPoint[];
  seriesNames: string[];
  xDataKey: string;
  width: number;
  height: number;
  margin: ChartMargin;
  yTickFormatter?: (v: number) => string;
  yLabel?: string;
  barRadius?: number;
  fillOpacity?: number;
  showLegend?: boolean;
  signColorSingleSeries?: boolean;
  xTickFontSize?: number;
  xTickInterval?: number;
  tooltipValueFormatter?: (value: number, name: string) => [string, string] | string;
}
export function SvgBarChart({
  data,
  seriesNames,
  xDataKey,
  width,
  height,
  margin,
  yTickFormatter,
  yLabel,
  fillOpacity = 1,
  showLegend = true,
  barRadius = 0,
  signColorSingleSeries = false,
  xTickFontSize,
  xTickInterval,
  tooltipValueFormatter,
}: SvgBarChartProps) {
  const { tooltip, setTooltip, hiddenSeries, visibleSeries, handleMouseLeave, handleLegendToggle } =
    useChartScaffold(seriesNames);
  const { plotWidth, plotHeight, plotBottom, plotLeft } = plotDims(width, height, margin);
  const colorOf = useCallback((idx: number) => seriesColor(idx), []);
  const yTicks = useMemo(() => computeYDomain(data, seriesNames), [data, seriesNames]);
  const yMin = yTicks[0];
  const yMax = yTicks[yTicks.length - 1];
  const yScale = useMemo(
    () => linearScale(yMin, yMax, plotBottom, -plotHeight),
    [yMin, yMax, plotBottom, plotHeight],
  );
  const groupWidth = data.length ? plotWidth / data.length : 0;
  const barWidth = useMemo(
    () => Math.max(4, (groupWidth * 0.7) / (visibleSeries.length || 1)),
    [groupWidth, visibleSeries.length],
  );
  const { yTickPixels, xTickPixels } = useMemo(
    () => ({
      yTickPixels: yTicks.map((t) => ({
        value: yScale(t),
        label: yTickFormatter ? yTickFormatter(t) : t.toFixed(2),
      })),
      xTickPixels: data.map((d, i) => ({
        value: plotLeft + i * groupWidth + groupWidth / 2,
        label: String(d[xDataKey] ?? ''),
        show: i % (xTickInterval ?? 1) === 0,
      })),
    }),
    [yTicks, yScale, yTickFormatter, data, xDataKey, plotLeft, groupWidth, xTickInterval],
  );
  const signColor = seriesNames.length === 1 && signColorSingleSeries;
  const handleMouseMove = useMemo(
    () =>
      buildMouseMoveHandler(setTooltip, {
        data,
        xDataKey,
        visibleSeries,
        seriesNames,
        colorOf: (idx, val) => barFill(val, idx, signColor),
        indexAt: (mx) => Math.floor((mx - plotLeft) / groupWidth),
        fallbackValue: String,
        tooltipValueFormatter,
      }),
    [
      data,
      xDataKey,
      visibleSeries,
      seriesNames,
      plotLeft,
      groupWidth,
      signColor,
      tooltipValueFormatter,
      setTooltip,
    ],
  );
  const xTickStyle: CSSProperties = xTickFontSize
    ? {
        fill: 'hsl(var(--fg-tertiary))',
        fontSize: xTickFontSize,
        fontFamily: 'Geist Mono Variable',
      }
    : AXIS_TICK_STYLE;
  return (
    <ChartShell
      width={width}
      height={height}
      tooltip={tooltip}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      legend={
        showLegend
          ? { names: seriesNames, colorOf, hidden: hiddenSeries, onToggle: handleLegendToggle }
          : undefined
      }
    >
      <LeftAxis range={plotHeight} ticks={yTickPixels} label={yLabel} offset={plotLeft} hideLine />
      <SvgAxis
        orientation="bottom"
        range={0}
        ticks={xTickPixels}
        offset={plotBottom}
        tickStyle={xTickStyle}
        hideLine
      />
      {data.map((point, dataIdx) => {
        const startX =
          plotLeft + dataIdx * groupWidth + groupWidth / 2 - (visibleSeries.length * barWidth) / 2;
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
    </ChartShell>
  );
}
