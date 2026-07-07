/** @file Shared helpers & types for analysis charts */
import { TRADING_DAYS_PER_YEAR } from '@backtest/shared/constants';

export const POS_CORR_THRESHOLDS = [0.8, 0.6, 0.4, 0.2] as const;
export const POS_CORR_COLORS = [
  '#1a7a3a',
  '#2e8b57',
  '#6abf7e',
  '#b8e0c4',
  'var(--bg-subtle)',
] as const;
export const NEG_CORR_THRESHOLDS = [-0.8, -0.6, -0.4, -0.2] as const;
export const NEG_CORR_COLORS = [
  '#8b2020',
  '#b04040',
  '#d47070',
  '#f0c8c8',
  'var(--bg-subtle)',
] as const;

export function getCorrelationColor(val: number): string {
  if (val >= 0) {
    const idx = POS_CORR_THRESHOLDS.findIndex((t) => val >= t);
    return POS_CORR_COLORS[idx === -1 ? POS_CORR_COLORS.length - 1 : idx];
  }
  const idx = NEG_CORR_THRESHOLDS.findIndex((t) => val <= t);
  return NEG_CORR_COLORS[idx === -1 ? NEG_CORR_COLORS.length - 1 : idx];
}

export function getHeatColor(val: number | null): string {
  if (val === null) return 'var(--bg-subtle)';
  if (val > 5) return '#1a7a3a';
  if (val > 2) return '#2e8b57';
  if (val > 0) return '#8bc9a3';
  if (val > -1) return '#f5d5d5';
  if (val > -2) return '#e8a0a0';
  if (val > -5) return '#d47070';
  return '#c94a4a';
}

export const tooltipStyle = {
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-body)',
  fontSize: '12px',
  boxShadow: 'var(--shadow-md)',
};

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

export const METRIC_CALCULATORS: Record<string, (w: number[], wd: number) => number> = {
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
