import type { RebalanceFrequency } from '@backtest/shared/types';
import type { Column } from '../SortableTable';
import type { Objective, OptimizeResultItem, BestResultItem } from './types.js';

const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
const fmtNum = (v: number) => v.toFixed(2);
const fmtMoney = (v: number) => `$${v.toLocaleString('en-US')}`;

export const FREQ_OPTIONS: Array<{ value: RebalanceFrequency; label: string }> = [
  { value: 'daily', label: '日度' },
  { value: 'weekly', label: '周度' },
  { value: 'monthly', label: '月度' },
  { value: 'quarterly', label: '季度' },
  { value: 'annual', label: '年度' },
];

const FREQ_LABELS: Record<string, string> = {
  daily: '日度',
  weekly: '周度',
  monthly: '月度',
  quarterly: '季度',
  annual: '年度',
  threshold: '阈值',
  none: '不调仓',
};

export const OBJECTIVE_SORT_KEY: Record<Objective, keyof OptimizeResultItem> = {
  maxCagr: 'cagr',
  minMaxDrawdown: 'maxDrawdown',
  maxSharpe: 'sharpe',
  maxSortino: 'sortino',
};

export const TABLE_COLUMNS: Column<OptimizeResultItem>[] = [
  {
    key: 'rebalanceFrequency',
    label: '再平衡频率',
    sortValue: (r) => r.rebalanceFrequency,
    render: (r) =>
      r.rebalanceFrequency === 'threshold'
        ? `阈值(${r.rebalanceThreshold}%)`
        : (FREQ_LABELS[r.rebalanceFrequency] ?? r.rebalanceFrequency),
  },
  {
    key: 'rebalanceThreshold',
    label: '阈值',
    sortValue: (r) => r.rebalanceThreshold ?? 0,
    render: (r) => (r.rebalanceThreshold !== undefined ? `${r.rebalanceThreshold}%` : '—'),
  },
  {
    key: 'initialCapital',
    label: '初始资金',
    sortValue: (r) => r.initialCapital,
    render: (r) => fmtMoney(r.initialCapital),
  },
  { key: 'cagr', label: 'CAGR', sortValue: (r) => r.cagr, render: (r) => fmtPct(r.cagr) },
  {
    key: 'maxDrawdown',
    label: '最大回撤',
    sortValue: (r) => r.maxDrawdown,
    render: (r) => fmtPct(r.maxDrawdown),
  },
  { key: 'stdev', label: '波动率', sortValue: (r) => r.stdev, render: (r) => fmtPct(r.stdev) },
  { key: 'sharpe', label: 'Sharpe', sortValue: (r) => r.sharpe, render: (r) => fmtNum(r.sharpe) },
  {
    key: 'sortino',
    label: 'Sortino',
    sortValue: (r) => r.sortino,
    render: (r) => fmtNum(r.sortino),
  },
  { key: 'calmar', label: 'Calmar', sortValue: (r) => r.calmar, render: (r) => fmtNum(r.calmar) },
];

export function buildOptimizeBody(
  validAssets: Array<{ ticker: string; weight: string }>,
  frequencies: RebalanceFrequency[],
  range: {
    thrMin: string;
    thrMax: string;
    thrStep: string;
    capMin: string;
    capMax: string;
    capStep: string;
  },
  dates: { startDate: string; endDate: string; benchmarkTicker: string },
  config: {
    objective: Objective;
    enableMaxDD: boolean;
    maxDD: string;
    enableMinCagr: boolean;
    minCagr: string;
  },
): Record<string, unknown> {
  const c: Record<string, number> = {};
  if (config.enableMaxDD && config.maxDD !== '') c.maxDrawdown = Number(config.maxDD);
  if (config.enableMinCagr && config.minCagr !== '') c.minCagr = Number(config.minCagr);
  return {
    portfolio: {
      assets: validAssets.map((a) => ({
        ticker: a.ticker.trim().toUpperCase(),
        weight: Number(a.weight) || 0,
      })),
    },
    parameterSpace: {
      rebalanceFrequencies: frequencies,
      rebalanceThreshold: {
        min: Number(range.thrMin),
        max: Number(range.thrMax),
        step: Number(range.thrStep),
      },
      initialCapital: {
        min: Number(range.capMin),
        max: Number(range.capMax),
        step: Number(range.capStep),
      },
    },
    parameters: {
      startDate: dates.startDate,
      endDate: dates.endDate,
      benchmarkTicker: dates.benchmarkTicker.trim().toUpperCase(),
      baseCurrency: 'usd',
      adjustForInflation: false,
    },
    objective: config.objective,
    constraints: c,
  };
}

export function buildChartData(
  best: BestResultItem | null,
  benchmarkGrowth: Array<{ date: string; value: number }> | null,
): Array<{ date: string; portfolio: number; benchmark?: number }> {
  if (!best?.growthCurve) return [];
  const map = new Map<string, { date: string; portfolio: number; benchmark?: number }>();
  for (const p of best.growthCurve) map.set(p.date, { date: p.date, portfolio: p.value });
  if (benchmarkGrowth) {
    for (const p of benchmarkGrowth) {
      const entry = map.get(p.date);
      if (entry) entry.benchmark = p.value;
      else map.set(p.date, { date: p.date, portfolio: 0, benchmark: p.value });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function buildBestMetrics(
  best: BestResultItem | null,
): Array<{ label: string; value: string }> {
  if (!best) return [];
  return [
    {
      label: '再平衡频率',
      value:
        best.rebalanceFrequency === 'threshold'
          ? `阈值(${best.rebalanceThreshold}%)`
          : (FREQ_LABELS[best.rebalanceFrequency] ?? best.rebalanceFrequency),
    },
    { label: '初始资金', value: fmtMoney(best.initialCapital) },
    { label: 'CAGR', value: fmtPct(best.cagr) },
    { label: '最大回撤', value: fmtPct(best.maxDrawdown) },
    { label: '波动率', value: fmtPct(best.stdev) },
    { label: 'Sharpe', value: fmtNum(best.sharpe) },
    { label: 'Sortino', value: fmtNum(best.sortino) },
    { label: 'Calmar', value: fmtNum(best.calmar) },
  ];
}
