import { TRADING_DAYS_PER_YEAR } from '@backtest/shared/constants';
import { CHART_MARGIN, pickByAbsThreshold } from '@/lib/chart-theme.js';
export const AXIS_TEXT = {
  color: 'hsl(var(--fg-tertiary))',
  fontSize: 11,
  fontFamily: 'Geist Mono Variable',
} as const;
export const BORDER_SOFT = 'hsl(var(--border-subtle))';
function axisLabel(formatter?: (v: number) => string, fontSize?: number) {
  return {
    ...AXIS_TEXT,
    ...(formatter ? { formatter } : {}),
    ...(fontSize !== undefined ? { fontSize } : {}),
  };
}
export function chartGrid(
  margin: { top?: number; right?: number; bottom?: number; left?: number } = CHART_MARGIN,
  opts: { legendBottom?: number; dataZoomBottom?: number } = {},
) {
  return {
    left: margin.left ?? CHART_MARGIN.left,
    right: margin.right ?? CHART_MARGIN.right,
    top: margin.top ?? CHART_MARGIN.top,
    bottom:
      (margin.bottom ?? CHART_MARGIN.bottom) +
      (opts.legendBottom ?? 0) +
      (opts.dataZoomBottom ?? 0),
  };
}
export function chartLegend(
  opts: { top?: number; bottom?: number; formatter?: (name: string) => string } = {},
) {
  return {
    ...(opts.top !== undefined ? { top: opts.top } : { bottom: opts.bottom ?? 0 }),
    textStyle: { color: 'hsl(var(--fg-tertiary))', fontSize: 12 },
    ...(opts.formatter ? { formatter: opts.formatter } : {}),
  };
}
function axisName(name: string | undefined, nameGap: number, nameRotate = 0) {
  return name
    ? { name, nameLocation: 'middle' as const, nameGap, nameRotate, nameTextStyle: AXIS_TEXT }
    : {};
}
export function valueXAxis(
  opts: {
    formatter?: (v: number) => string;
    name?: string;
    nameGap?: number;
    fontSize?: number;
  } = {},
) {
  return {
    type: 'value' as const,
    ...axisName(opts.name, opts.nameGap ?? 34),
    axisLabel: axisLabel(opts.formatter, opts.fontSize),
    axisLine: { lineStyle: { color: BORDER_SOFT } },
    axisTick: { show: false },
    splitLine: { show: false },
  };
}
export function valueYAxis(
  opts: {
    formatter?: (v: number) => string;
    min?: number;
    max?: number;
    type?: 'log';
    name?: string;
    nameGap?: number;
    fontSize?: number;
  } = {},
) {
  return {
    type: (opts.type ?? 'value') as 'value' | 'log',
    ...(opts.min !== undefined ? { min: opts.min } : {}),
    ...(opts.max !== undefined ? { max: opts.max } : {}),
    ...axisName(opts.name, opts.nameGap ?? 52, 90),
    axisLabel: axisLabel(opts.formatter, opts.fontSize),
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: BORDER_SOFT, opacity: 0.6 } },
  };
}
export function categoryAxis(
  data: (string | number)[],
  opts: {
    formatter?: (v: string) => string;
    interval?: number | 'auto' | ((index: number, value: string) => boolean);
    name?: string;
    nameGap?: number;
    fontSize?: number;
    preserveStartEnd?: boolean;
  } = {},
) {
  return {
    type: 'category' as const,
    data,
    ...axisName(opts.name, opts.nameGap ?? 30),
    axisLabel: {
      ...AXIS_TEXT,
      ...(opts.fontSize !== undefined ? { fontSize: opts.fontSize } : {}),
      ...(opts.interval !== undefined ? { interval: opts.interval } : {}),
      ...(opts.formatter ? { formatter: opts.formatter } : {}),
      ...(opts.preserveStartEnd ? { showMinLabel: true, showMaxLabel: true } : {}),
    },
    axisLine: { lineStyle: { color: BORDER_SOFT } },
    axisTick: { show: false },
    splitLine: { show: false },
  };
}
export type ReferenceLine = {
  axis: 'x' | 'y';
  value: number | string;
  label?: string;
  labelColor?: string;
  labelFontSize?: number;
  color?: string;
  dash?: string;
  width?: number;
};
export function markLineData(referenceLines: ReferenceLine[], defaultColor: string) {
  return {
    silent: true,
    data: referenceLines.map((rl) => ({
      [rl.axis === 'x' ? 'xAxis' : 'yAxis']: rl.value,
      lineStyle: {
        color: rl.color ?? defaultColor,
        type: rl.dash ?? 'dashed',
        ...(rl.width ? { width: rl.width } : {}),
      },
      ...(rl.label
        ? {
            label: {
              formatter: rl.label,
              position: 'insideEndTop' as const,
              color: rl.labelColor ?? defaultColor,
              fontSize: rl.labelFontSize ?? 11,
            },
          }
        : {}),
    })),
  };
}
export function scatterLabel() {
  return {
    show: true,
    position: 'right' as const,
    formatter: (p: { name: string }) => p.name,
    color: 'hsl(var(--fg-tertiary))',
    fontSize: 11,
  };
}
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
export const tooltipRow = (marker: string, name: string, value: string) =>
  `<div style="display:flex;align-items:center;gap:8px;padding:2px 0">${marker}<span style="color:hsl(var(--fg-tertiary))">${escapeHtml(name)}</span><span style="margin-left:auto;font-weight:600;font-family:monospace;color:hsl(var(--fg))">${escapeHtml(value)}</span></div>`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ECharts tooltip formatter 类型过于复杂，手动构造 option
export function tooltipOption(formatter: unknown, trigger: 'axis' | 'item' = 'axis'): any {
  return {
    trigger,
    backgroundColor: 'hsl(var(--chart-tooltip-bg))',
    borderColor: 'hsl(var(--border-strong))',
    borderWidth: 1,
    padding: [12, 12],
    textStyle: { color: 'hsl(var(--fg))', fontSize: 12 },
    extraCssText:
      'backdrop-filter: blur(8px); border-radius: 8px; box-shadow: var(--tooltip-shadow);',
    confine: true,
    formatter,
  };
}
export function axisTooltipFormatter(
  labelFormatter?: (label: string) => string,
  valueFormatter?: (value: number, name: string) => [string, string] | string,
) {
  return (
    params: Array<{
      axisValue: string | number;
      seriesName: string;
      marker: string;
      value: number | [unknown, number];
    }>,
  ) => {
    const first = params[0];
    const header = labelFormatter
      ? labelFormatter(String(first?.axisValue ?? ''))
      : String(first?.axisValue ?? '');
    const rows = params
      .map((p) => {
        const raw = Array.isArray(p.value) ? p.value[1] : p.value;
        const num = raw == null ? NaN : Number(raw);
        if (Number.isNaN(num)) return tooltipRow(p.marker, p.seriesName, '—');
        const f = valueFormatter ? valueFormatter(num, p.seriesName) : String(num);
        const [v, n] = Array.isArray(f) ? f : [f, p.seriesName];
        return tooltipRow(p.marker, n, String(v));
      })
      .join('');
    return (
      (header
        ? `<div style="font-weight:600;margin-bottom:6px;color:hsl(var(--fg))">${escapeHtml(header)}</div>`
        : '') + rows
    );
  };
}

export type RollingMetricKey = 'cagr' | 'volatility' | 'excess' | 'skewness' | 'kurtosis' | 'kelly';
export type RiskMetricKey = 'stdev' | 'maxDrawdown' | 'avgDrawdown' | 'ulcerIndex';
function calcMoments(w: number[]) {
  const mean = w.reduce((s, r) => s + r, 0) / w.length;
  return { mean, variance: w.reduce((s, r) => s + (r - mean) ** 2, 0) / (w.length - 1) };
}
function calcCagr(w: number[], wd: number) {
  let p = 1;
  for (const r of w) p *= 1 + r;
  return Math.pow(p, TRADING_DAYS_PER_YEAR / wd) - 1;
}
function calcVolatility(w: number[]) {
  return Math.sqrt(calcMoments(w).variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}
function calcSkewness(w: number[]) {
  const n = w.length,
    { mean, variance } = calcMoments(w);
  if (variance === 0) return 0;
  const stdev = Math.sqrt(variance);
  return (n / ((n - 1) * (n - 2))) * w.reduce((s, r) => s + ((r - mean) / stdev) ** 3, 0);
}
function calcKurtosis(w: number[]) {
  const n = w.length;
  if (n < 4) return 0;
  const { mean, variance } = calcMoments(w);
  if (variance === 0) return 0;
  const stdev = Math.sqrt(variance);
  return (
    ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) *
      w.reduce((s, r) => s + ((r - mean) / stdev) ** 4, 0) -
    (3 * (n - 1) ** 2) / ((n - 2) * (n - 3))
  );
}
function calcKelly(w: number[]) {
  const { mean, variance } = calcMoments(w);
  return variance > 0 ? mean / variance : 0;
}
const METRIC_CALCULATORS: Record<string, (w: number[], wd: number) => number> = {
  cagr: calcCagr,
  volatility: calcVolatility,
  skewness: calcSkewness,
  kurtosis: calcKurtosis,
  kelly: calcKelly,
};
export function computeRollingMetric(
  dailyReturns: number[],
  dates: string[],
  windowDays: number,
  metric: RollingMetricKey,
): Array<{ date: string; value: number }> {
  const result: Array<{ date: string; value: number }> = [];
  if (dailyReturns.length < windowDays) return result;
  const calc = METRIC_CALCULATORS[metric];
  for (let i = windowDays; i <= dailyReturns.length; i++) {
    if (i >= dates.length) continue;
    result.push({ date: dates[i], value: calc(dailyReturns.slice(i - windowDays, i), windowDays) });
  }
  return result;
}
export function computeRollingExcessReturn(
  dailyReturns: number[],
  benchmarkDailyReturns: number[],
  dates: string[],
  windowDays: number,
): Array<{ date: string; value: number }> {
  const result: Array<{ date: string; value: number }> = [];
  const n = Math.min(dailyReturns.length, benchmarkDailyReturns.length);
  if (n < windowDays) return result;
  for (let i = windowDays; i <= n; i++) {
    if (i >= dates.length) continue;
    result.push({
      date: dates[i],
      value:
        calcCagr(dailyReturns.slice(i - windowDays, i), windowDays) -
        calcCagr(benchmarkDailyReturns.slice(i - windowDays, i), windowDays),
    });
  }
  return result;
}

export type RollingCorrelationPoint = { date: string; value: number };
export type BetaRow = { name: string; beta: number };
export function computeDailyReturns(curve: { date: string; value: number }[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    if (curve[i - 1].value > 0)
      returns.push((curve[i].value - curve[i - 1].value) / curve[i - 1].value);
  }
  return returns;
}
export function computeBeta(baseReturns: number[], targetReturns: number[]): number {
  const n = Math.min(baseReturns.length, targetReturns.length);
  if (n < 2) return 0;
  const xMean = baseReturns.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const yMean = targetReturns.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let ssXY = 0,
    ssXX = 0;
  for (let i = 0; i < n; i++) {
    ssXY += (baseReturns[i] - xMean) * (targetReturns[i] - yMean);
    ssXX += (baseReturns[i] - xMean) ** 2;
  }
  return ssXX > 0 ? ssXY / ssXX : 0;
}
export function computeRollingCorrelation(
  baseReturns: number[],
  targetReturns: number[],
  dates: string[],
  windowSize: number,
  maxPoints = 200,
): RollingCorrelationPoint[] {
  const n = Math.min(baseReturns.length, targetReturns.length);
  if (n < windowSize) return [];
  const result: RollingCorrelationPoint[] = [];
  const step = Math.max(1, Math.floor((n - windowSize) / maxPoints));
  for (let start = 0; start + windowSize <= n; start += step) {
    const xSlice = baseReturns.slice(start, start + windowSize);
    const ySlice = targetReturns.slice(start, start + windowSize);
    const xMean = xSlice.reduce((s, v) => s + v, 0) / windowSize;
    const yMean = ySlice.reduce((s, v) => s + v, 0) / windowSize;
    let ssXY = 0,
      ssXX = 0,
      ssYY = 0;
    for (let i = 0; i < windowSize; i++) {
      const dx = xSlice[i] - xMean,
        dy = ySlice[i] - yMean;
      ssXY += dx * dy;
      ssXX += dx * dx;
      ssYY += dy * dy;
    }
    result.push({
      date: dates[start + windowSize - 1] || '',
      value: +(ssXX > 1e-12 && ssYY > 1e-12 ? ssXY / Math.sqrt(ssXX * ssYY) : 0).toFixed(4),
    });
  }
  return result;
}
export function totalMonths(data: Array<Record<string, string | number>>): number {
  if (data.length <= 1) return 1;
  const [f, l] = [new Date(String(data[0].date)), new Date(String(data[data.length - 1].date))];
  return Math.max(1, (l.getFullYear() - f.getFullYear()) * 12 + l.getMonth() - f.getMonth());
}
export const getCorrelationTextColor = (val: number) =>
  pickByAbsThreshold(val, 0.6, 'hsl(var(--corr-text-strong))', 'hsl(var(--fg))');
export const getColorClass = (value: number) =>
  value > 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-fg';
