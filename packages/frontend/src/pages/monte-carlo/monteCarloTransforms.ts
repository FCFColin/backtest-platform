/**
 * @file 蒙特卡洛结果数据变换函数
 * @description 承载 MonteCarloResults 各 Tab 所需的 buildXxxData 纯函数与共享常量/格式化器
 */
import type { TFunction } from 'i18next';
import { fmtDollar, fmtNum, fmtPct } from '@/utils/format';
import { percentile, mean, std } from '@/utils/stats';
import { CHART_COLORS } from '@backtest/shared';
import type { MonteCarloResult, PerPathMetrics } from '@backtest/shared';
import type { DistMetric } from './monteCarloTypes.js';

/** 指标中文标签映射（依赖 i18n） */
export const metricLabels = (t: TFunction): Record<DistMetric, string> => ({
  finalValue: t('monteCarlo.results.metrics.finalValue'),
  cagr: t('monteCarlo.results.metrics.cagr'),
  maxDrawdown: t('monteCarlo.results.metrics.maxDrawdown'),
  volatility: t('monteCarlo.results.metrics.volatility'),
  sharpe: t('monteCarlo.results.metrics.sharpe'),
  sortino: t('monteCarlo.results.metrics.sortino'),
});

/** 指标值格式化器映射 */
export const METRIC_FORMAT: Record<DistMetric, (v: number) => string> = {
  finalValue: fmtDollar,
  cagr: fmtPct,
  maxDrawdown: fmtPct,
  volatility: fmtPct,
  sharpe: fmtNum,
  sortino: fmtNum,
};

export const SUMMARY_STATS = [
  'Min',
  'P10',
  'P25',
  'P50',
  'Mean',
  'P75',
  'P90',
  'Max',
  'Std',
] as const;

export interface RangeDataPoint {
  month: number;
  label: string;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

/** 月份刻度格式化：整数年显示为 Ny */
export const monthFormatter = (v: number) => {
  const y = v / 12;
  return Number.isInteger(y) ? `${y}y` : '';
};

export const dollarKFormatter = (v: number) => `$${(v / 1000).toFixed(0)}k`;

export const dollarFormatter = (v: number) =>
  `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export const yearLabelFormatter = (t: TFunction, l: number) =>
  `${(l / 12).toFixed(1)} ${t('monteCarlo.results.year')}`;

/** 汇总 Tab 表格行数据：每个指标一行，列出 Min/P10/.../Max/Std */
export function buildSummaryData(r: MonteCarloResult, startingValue: number, t: TFunction) {
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
  const labels = metricLabels(t);
  return keys.map((key) => {
    const vals =
      key === 'finalValue'
        ? metrics.map((m) => m.finalValue * startingValue)
        : metrics.map((m) => m[key]);
    const p = (frac: number) => percentile(vals, frac);
    const m = mean(vals);
    const s = std(vals);
    return {
      metric: labels[key],
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

/** 区间 Tab 数据：按月采样百分位曲线 */
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

/** 成功概率 Tab 数据：逐年生存/保本/盈利概率 */
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

/** 分布直方图：分箱统计 + 中位/均值标记 */
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

/** 情景 Tab 数据：best/p75/median/p25/worst 代表路径 */
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

/** 区间图 Area 配置（外层 P95/P5 + 内层 P75/P25 透明叠加） */
export const RANGE_AREAS = [
  { dataKey: 'p95', stackId: 'outer', fill: CHART_COLORS[0], fillOpacity: 0.06, name: 'P95' },
  { dataKey: 'p5', stackId: 'outer-base', fill: '#fff', fillOpacity: 1, name: '' },
  { dataKey: 'p75', stackId: 'inner', fill: CHART_COLORS[0], fillOpacity: 0.12, name: 'P75' },
  { dataKey: 'p25', stackId: 'inner-base', fill: '#fff', fillOpacity: 1, name: '' },
];

/** 区间图 Line 配置（中位数 + 各百分位虚线） */
export const rangeLines = (t: TFunction) => [
  { dataKey: 'p50', stroke: CHART_COLORS[0], strokeWidth: 2, name: t('monteCarlo.results.median') },
  { dataKey: 'p5', stroke: CHART_COLORS[3], strokeWidth: 0.8, dash: '4 2', name: 'P5' },
  { dataKey: 'p95', stroke: CHART_COLORS[4], strokeWidth: 0.8, dash: '4 2', name: 'P95' },
  { dataKey: 'p25', stroke: CHART_COLORS[1], strokeWidth: 0.8, dash: '3 3', name: 'P25' },
  { dataKey: 'p75', stroke: CHART_COLORS[2], strokeWidth: 0.8, dash: '3 3', name: 'P75' },
];
