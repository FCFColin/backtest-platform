/** @file MonteCarlo utility functions and constants */
import type { CSSProperties } from 'react';
import { CHART_COLORS } from '@backtest/shared';
import type { MonteCarloResult, PerPathMetrics } from '@backtest/shared';
import type { DistMetric, RangeDataPoint } from './types.js';

export function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(Math.floor(sorted.length * p), sorted.length - 1)];
}

export function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

export function fmtDollar(v: number): string {
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function fmtPct(v: number, decimals = 1): string {
  return `${(v * 100).toFixed(decimals)}%`;
}

export function fmtNum(v: number, decimals = 2): string {
  return v.toFixed(decimals);
}

export const METRIC_LABELS: Record<DistMetric, string> = {
  finalValue: '终值',
  cagr: 'CAGR',
  maxDrawdown: '最大回撤',
  volatility: '波动率',
  sharpe: '夏普比率',
  sortino: 'Sortino比率',
};

export const METRIC_FORMAT: Record<DistMetric, (v: number) => string> = {
  finalValue: fmtDollar,
  cagr: fmtPct,
  maxDrawdown: fmtPct,
  volatility: fmtPct,
  sharpe: fmtNum,
  sortino: fmtNum,
};

export const EMPTY_DATA_STYLE: CSSProperties = {
  color: 'var(--text-muted)',
  textAlign: 'center',
  padding: 24,
};

export const TOOLTIP_STYLE: CSSProperties = {
  fontSize: 12,
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-body)',
  boxShadow: 'var(--shadow-md)',
};

export const statCardStyle: CSSProperties = {
  textAlign: 'center',
  padding: 14,
  backgroundColor: 'var(--bg-subtle)',
  borderRadius: 'var(--radius-control)',
};

/** Build summary statistics table data */
export function buildSummaryData(r: MonteCarloResult, startingValue: number) {
  const metrics = r.perPathMetrics;
  if (!metrics || metrics.length === 0) return null;
  const keys: DistMetric[] = [
    'finalValue',
    'cagr',
    'maxDrawdown',
    'volatility',
    'sharpe',
    'sortino',
  ];
  return keys.map((key) => {
    const vals =
      key === 'finalValue'
        ? metrics.map((m) => m.finalValue * startingValue)
        : metrics.map((m) => m[key]);
    const p = (frac: number) => percentile(vals, frac);
    const m = mean(vals);
    const s = std(vals);
    return {
      metric: METRIC_LABELS[key],
      key,
      values: {
        Min: METRIC_FORMAT[key](Math.min(...vals)),
        P10: METRIC_FORMAT[key](p(0.1)),
        P25: METRIC_FORMAT[key](p(0.25)),
        P50: METRIC_FORMAT[key](p(0.5)),
        Mean: METRIC_FORMAT[key](m),
        P75: METRIC_FORMAT[key](p(0.75)),
        P90: METRIC_FORMAT[key](p(0.9)),
        Max: METRIC_FORMAT[key](Math.max(...vals)),
        Std: key === 'finalValue' ? fmtDollar(s) : fmtNum(s),
      } as Record<string, string>,
    };
  });
}

/** Build percentile range chart data */
export function buildRangeData(r: MonteCarloResult, startingValue: number): RangeDataPoint[] {
  const { p5, p25, p50, p75, p95 } = r.percentiles;
  if (!p5 || p5.length === 0) return [];
  const data: RangeDataPoint[] = [];
  const push = (day: number, month: number) => {
    data.push({
      month,
      label: month % 12 === 0 ? `${month / 12}y` : '',
      p5: p5[day] * startingValue,
      p25: p25[day] * startingValue,
      p50: p50[day] * startingValue,
      p75: p75[day] * startingValue,
      p95: p95[day] * startingValue,
    });
  };
  push(0, 0);
  let day = 0,
    month = 0;
  while (day < p5.length - 1) {
    day += 21;
    month++;
    if (day >= p5.length) day = p5.length - 1;
    push(day, month);
    if (day >= p5.length - 1) break;
  }
  return data;
}

/** Build success probability chart data */
export function buildSuccessData(r: MonteCarloResult) {
  const sp = r.successProbabilities;
  if (!sp || !sp.survival || sp.survival.length === 0) return [];
  return sp.survival.map((_, i) => ({
    year: i + 1,
    survival: Number((sp.survival[i] * 100).toFixed(1)),
    capitalPreservation: Number((sp.capitalPreservation[i] * 100).toFixed(1)),
    profit: Number((sp.profit[i] * 100).toFixed(1)),
  }));
}

/** Build distribution histogram data */
export function buildDistHistogram(
  metrics: PerPathMetrics[],
  metric: DistMetric,
  startingValue: number,
) {
  const vals =
    metric === 'finalValue'
      ? metrics.map((m) => m.finalValue * startingValue)
      : metrics.map((m) => m[metric]);
  if (vals.length === 0) return { data: [], medianLabel: '', meanLabel: '' };
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const binCount = 40;
  const binWidth = (max - min) / binCount || 1;
  const formatBin = (v: number) => {
    if (metric === 'finalValue') return `$${(v / 1000).toFixed(0)}k`;
    if (metric === 'cagr' || metric === 'maxDrawdown' || metric === 'volatility')
      return `${(v * 100).toFixed(1)}%`;
    return v.toFixed(2);
  };
  const bins: { range: string; count: number; minVal: number }[] = [];
  for (let i = 0; i < binCount; i++)
    bins.push({ range: formatBin(min + i * binWidth), count: 0, minVal: min + i * binWidth });
  for (const v of vals) {
    let idx = Math.floor((v - min) / binWidth);
    if (idx >= binCount) idx = binCount - 1;
    bins[idx].count++;
  }
  const medianVal = percentile(vals, 0.5);
  const meanVal = mean(vals);
  return {
    data: bins,
    medianLabel: formatBin(Math.floor((medianVal - min) / binWidth) * binWidth + min),
    meanLabel: formatBin(Math.floor((meanVal - min) / binWidth) * binWidth + min),
    medianVal,
    meanVal,
  };
}

/** Build representative scenario paths chart data */
export function buildScenarioData(r: MonteCarloResult, startingValue: number) {
  const rp = r.representativePaths;
  if (!rp || !rp.best || rp.best.length === 0) return { data: [] };
  return {
    data: rp.best.map((_, i) => ({
      month: i,
      best: rp.best[i] * startingValue,
      p75: rp.p75[i] * startingValue,
      median: rp.median[i] * startingValue,
      p25: rp.p25[i] * startingValue,
      worst: rp.worst[i] * startingValue,
    })),
  };
}

// Chart config constants
export const monthFormatter = (v: number) => {
  const y = v / 12;
  return Number.isInteger(y) ? `${y}y` : '';
};

export const dollarKFormatter = (v: number) => `$${(v / 1000).toFixed(0)}k`;

export const dollarFormatter = (v: number) =>
  `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export const yearLabelFormatter = (l: number) => `${(l / 12).toFixed(1)} 年`;

export const RANGE_AREAS = [
  { dataKey: 'p95', stackId: 'outer', fill: CHART_COLORS[0], fillOpacity: 0.06, name: 'P95' },
  { dataKey: 'p5', stackId: 'outer-base', fill: '#fff', fillOpacity: 1, name: '' },
  { dataKey: 'p75', stackId: 'inner', fill: CHART_COLORS[0], fillOpacity: 0.12, name: 'P75' },
  { dataKey: 'p25', stackId: 'inner-base', fill: '#fff', fillOpacity: 1, name: '' },
];

export const RANGE_LINES = [
  { dataKey: 'p50', stroke: CHART_COLORS[0], strokeWidth: 2, name: '中位数' },
  { dataKey: 'p5', stroke: CHART_COLORS[3], strokeWidth: 0.8, dash: '4 2', name: 'P5' },
  { dataKey: 'p95', stroke: CHART_COLORS[4], strokeWidth: 0.8, dash: '4 2', name: 'P95' },
  { dataKey: 'p25', stroke: CHART_COLORS[1], strokeWidth: 0.8, dash: '3 3', name: 'P25' },
  { dataKey: 'p75', stroke: CHART_COLORS[2], strokeWidth: 0.8, dash: '3 3', name: 'P75' },
];
