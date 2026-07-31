/* eslint-disable max-lines-per-function, sonarjs/cognitive-complexity -- 图表组件库，渲染分支多，Plan-1 重写 */
import { useMemo, useCallback, type CSSProperties } from 'react';
import {
  XAxisTicks,
  TICK_STYLE,
  ChartShell,
  LeftAxis,
  useChartScaffold,
  computeYDomain,
  plotDims,
  seriesColor,
  linearScale,
  buildMouseMoveHandler,
  gradId,
  type ChartMargin,
  type ChartPoint,
} from './svgChartParts.js';
export { SvgScatterChart } from './svgChartScatter.js';

interface ReferenceDotConfig {
  x: string | number;
  y: number;
  name: string;
  value: number;
}
const barFill = (val: number, idx: number, signColor: boolean) =>
  signColor ? (val >= 0 ? 'var(--success)' : 'var(--error)') : seriesColor(idx);
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
type SeriesChartKind = 'area' | 'bar';
type SvgSeriesChartProps = SvgAreaChartProps & SvgBarChartProps & { kind: SeriesChartKind };

// eslint-disable-next-line complexity -- 面积/柱状共用交互与坐标逻辑，仅图形标记分支不同
function SvgSeriesChart({
  kind,
  data,
  seriesNames,
  xDataKey,
  width,
  height,
  margin,
  yTickFormatter,
  yDomain,
  yLabel,
  fillOpacity = kind === 'area' ? 0.12 : 1,
  strokeWidth = 1.5,
  showLegend = true,
  colorOffset = 0,
  barRadius = 0,
  signColorSingleSeries = false,
  xTickFontSize,
  xTickInterval,
  referenceDots,
  useGradient = false,
  hideAxisLines = false,
  tooltipValueFormatter,
  tooltipLabelFormatter,
}: SvgSeriesChartProps) {
  const isArea = kind === 'area';
  const { tooltip, setTooltip, hiddenSeries, visibleSeries, handleMouseLeave, handleLegendToggle } =
    useChartScaffold(seriesNames);
  const { plotWidth, plotHeight, plotBottom, plotLeft } = plotDims(width, height, margin);
  const colorOf = useCallback((idx: number) => seriesColor(idx + colorOffset), [colorOffset]);
  const yTicks = useMemo(
    () => computeYDomain(data, seriesNames, yDomain, 0, isArea ? 1 : 0),
    [data, seriesNames, yDomain, isArea],
  );
  const yMin = yTicks[0];
  const yMax = yTicks[yTicks.length - 1];
  const yScale = useMemo(
    () => linearScale(yMin, yMax, plotBottom, -plotHeight),
    [yMin, yMax, plotBottom, plotHeight],
  );
  const xStep = data.length > 1 ? plotWidth / (data.length - 1) : plotWidth;
  const groupWidth = plotWidth / data.length;
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
        value: isArea ? plotLeft + i * xStep : plotLeft + i * groupWidth + groupWidth / 2,
        label: String(d[xDataKey] ?? ''),
        show: isArea ? undefined : i % (xTickInterval ?? 1) === 0,
      })),
    }),
    [
      yTicks,
      yScale,
      yTickFormatter,
      data,
      xDataKey,
      plotLeft,
      xStep,
      groupWidth,
      isArea,
      xTickInterval,
    ],
  );
  const signColor = seriesNames.length === 1 && signColorSingleSeries;
  const areaPaths = useMemo(
    () =>
      isArea
        ? visibleSeries.map((name) => {
            const seriesIdx = seriesNames.indexOf(name);
            const points = data.map((d, i) => ({
              x: plotLeft + i * xStep,
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
          })
        : [],
    [
      isArea,
      visibleSeries,
      seriesNames,
      data,
      plotLeft,
      xStep,
      yScale,
      plotBottom,
      useGradient,
      colorOf,
    ],
  );
  const handleMouseMove = useCallback(
    buildMouseMoveHandler(setTooltip, {
      data,
      xDataKey,
      visibleSeries,
      seriesNames,
      colorOf: (idx, val) => (isArea ? colorOf(idx) : barFill(val, idx, signColor)),
      indexAt: (mx) =>
        isArea ? Math.round((mx - plotLeft) / xStep) : Math.floor((mx - plotLeft) / groupWidth),
      fallbackValue: isArea ? (v: number) => v.toFixed(2) : String,
      tooltipValueFormatter,
      tooltipLabelFormatter,
    }),
    [
      data,
      xDataKey,
      visibleSeries,
      seriesNames,
      colorOf,
      plotLeft,
      xStep,
      groupWidth,
      isArea,
      signColor,
      tooltipValueFormatter,
      tooltipLabelFormatter,
    ],
  );
  const xTickStyle: CSSProperties = xTickFontSize
    ? {
        fill: 'hsl(var(--fg-tertiary))',
        fontSize: xTickFontSize,
        fontFamily: 'Geist Mono Variable',
      }
    : TICK_STYLE;
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
      {isArea && useGradient && (
        <defs>
          {visibleSeries.map((name) => {
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
      )}
      <LeftAxis
        range={plotHeight}
        ticks={yTickPixels}
        label={yLabel}
        offset={plotLeft}
        hideLine={isArea ? hideAxisLines : true}
      />
      <XAxisTicks
        ticks={xTickPixels}
        plotBottom={plotBottom}
        maxLabelLen={isArea ? 7 : undefined}
        style={isArea ? undefined : xTickStyle}
      />
      {isArea ? (
        <>
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
            const cx = dataIdx >= 0 ? plotLeft + dataIdx * xStep : plotLeft + plotWidth / 2;
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
        </>
      ) : (
        data.map((point, dataIdx) => {
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
        })
      )}
    </ChartShell>
  );
}
export function SvgAreaChart(props: SvgAreaChartProps) {
  return <SvgSeriesChart kind="area" {...props} />;
}
export function SvgBarChart(props: SvgBarChartProps) {
  return <SvgSeriesChart kind="bar" {...props} />;
}
