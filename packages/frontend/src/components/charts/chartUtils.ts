import { TRADING_DAYS_PER_YEAR } from '@backtest/shared/constants';
import { pickByAbsThreshold } from '@/lib/chart-theme.js';

export const AXIS_TEXT = {
  color: 'hsl(var(--fg-tertiary))',
  fontSize: 11,
  fontFamily: 'Geist Mono Variable',
} as const;
export const BORDER_SOFT = 'hsl(var(--border-soft))';
type ValueFormatter = (v: number) => string;
function axisLabel(formatter?: ValueFormatter) {
  return { ...AXIS_TEXT, ...(formatter ? { formatter } : {}) };
}
export function valueXAxis(formatter?: ValueFormatter) {
  return {
    type: 'value' as const,
    axisLabel: axisLabel(formatter),
    axisLine: { lineStyle: { color: BORDER_SOFT } },
    axisTick: { show: false },
    splitLine: { show: false },
  };
}
export function valueYAxis(opts: { formatter?: ValueFormatter; min?: number; max?: number } = {}) {
  return {
    type: 'value' as const,
    ...(opts.min !== undefined ? { min: opts.min } : {}),
    ...(opts.max !== undefined ? { max: opts.max } : {}),
    axisLabel: axisLabel(opts.formatter),
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
  } = {},
) {
  return {
    type: 'category' as const,
    data,
    ...(opts.name
      ? { name: opts.name, nameLocation: 'middle' as const, nameGap: 30, nameTextStyle: AXIS_TEXT }
      : {}),
    axisLabel: {
      ...AXIS_TEXT,
      ...(opts.interval !== undefined ? { interval: opts.interval } : {}),
      ...(opts.formatter ? { formatter: opts.formatter } : {}),
    },
    axisLine: { lineStyle: { color: BORDER_SOFT } },
    axisTick: { show: false },
    splitLine: { show: false },
  };
}
function escapeHtml(value: string): string {
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

function calcCagr(window: number[], windowDays: number): number {
  let cumProd = 1;
  for (const r of window) cumProd *= 1 + r;
  const years = windowDays / TRADING_DAYS_PER_YEAR;
  return Math.pow(cumProd, 1 / years) - 1;
}

function calcVolatility(window: number[]): number {
  const mean = window.reduce((s, r) => s + r, 0) / window.length;
  const variance = window.reduce((s, r) => s + (r - mean) ** 2, 0) / (window.length - 1);
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

function calcSkewness(window: number[]): number {
  const n = window.length;
  const mean = window.reduce((s, r) => s + r, 0) / n;
  const variance = window.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
  if (variance === 0) return 0;
  const stdev = Math.sqrt(variance);
  const sumCubed = window.reduce((s, r) => s + ((r - mean) / stdev) ** 3, 0);
  return (n / ((n - 1) * (n - 2))) * sumCubed;
}

function calcKurtosis(window: number[]): number {
  const n = window.length;
  if (n < 4) return 0;
  const mean = window.reduce((s, r) => s + r, 0) / n;
  const variance = window.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
  if (variance === 0) return 0;
  const stdev = Math.sqrt(variance);
  const sumFourth = window.reduce((s, r) => s + ((r - mean) / stdev) ** 4, 0);
  return (
    ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sumFourth -
    (3 * (n - 1) ** 2) / ((n - 2) * (n - 3))
  );
}

function calcKelly(window: number[]): number {
  const mean = window.reduce((s, r) => s + r, 0) / window.length;
  const variance = window.reduce((s, r) => s + (r - mean) ** 2, 0) / (window.length - 1);
  return variance > 0 ? mean / variance : 0;
}

const METRIC_CALCULATORS: Record<string, (w: number[], wd: number) => number> = {
  cagr: (w, wd) => calcCagr(w, wd),
  volatility: (w) => calcVolatility(w),
  skewness: (w) => calcSkewness(w),
  kurtosis: (w) => calcKurtosis(w),
  kelly: (w) => calcKelly(w),
};

export function computeRollingMetric(
  dailyReturns: number[],
  dates: string[],
  windowDays: number,
  metric: RollingMetricKey,
): Array<{ date: string; value: number }> {
  const result: Array<{ date: string; value: number }> = [];
  if (dailyReturns.length < windowDays) return result;
  const calculator = METRIC_CALCULATORS[metric];
  for (let i = windowDays; i <= dailyReturns.length; i++) {
    if (i >= dates.length) continue;
    const window = dailyReturns.slice(i - windowDays, i);
    result.push({ date: dates[i], value: calculator(window, windowDays) });
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
    const wAsset = dailyReturns.slice(i - windowDays, i);
    const wBench = benchmarkDailyReturns.slice(i - windowDays, i);
    const dateIdx = i;
    if (dateIdx >= dates.length) continue;
    let cumAsset = 1,
      cumBench = 1;
    for (let j = 0; j < wAsset.length; j++) {
      cumAsset *= 1 + wAsset[j];
      cumBench *= 1 + wBench[j];
    }
    const years = windowDays / TRADING_DAYS_PER_YEAR;
    const cagrAsset = Math.pow(cumAsset, 1 / years) - 1;
    const cagrBench = Math.pow(cumBench, 1 / years) - 1;
    result.push({ date: dates[dateIdx], value: cagrAsset - cagrBench });
  }
  return result;
}

type GrowthCurvePoint = { date: string; value: number };
export type RollingCorrelationPoint = { date: string; value: number };
export type BetaRow = { name: string; beta: number };

export function computeDailyReturns(curve: GrowthCurvePoint[]): number[] {
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
    const corr = ssXX > 1e-12 && ssYY > 1e-12 ? ssXY / Math.sqrt(ssXX * ssYY) : 0;
    result.push({ date: dates[start + windowSize - 1] || '', value: +corr.toFixed(4) });
  }
  return result;
}

export function totalMonths(data: Array<Record<string, string | number>>): number {
  if (data.length <= 1) return 1;
  const first = new Date(String(data[0].date));
  const last = new Date(String(data[data.length - 1].date));
  return Math.max(
    1,
    (last.getFullYear() - first.getFullYear()) * 12 + last.getMonth() - first.getMonth(),
  );
}
export function getCorrelationTextColor(val: number): string {
  return pickByAbsThreshold(val, 0.6, 'hsl(var(--corr-text-strong))', 'hsl(var(--fg))');
}
export function getColorClass(value: number): string {
  return value > 0 ? 'text-pos' : value < 0 ? 'text-neg' : 'text-fg';
}
