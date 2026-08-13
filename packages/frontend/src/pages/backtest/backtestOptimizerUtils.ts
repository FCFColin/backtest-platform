import { useState } from 'react';
import i18n from '@/i18n/index.js';
import {
  REBALANCE_LABELS,
  type BacktestOptimizerObjective as Objective,
  type BestResultItem,
  type OptimizeResultItem,
  type RebalanceFrequency,
} from '@backtest/shared';
import { fmtPct, fmtNum, fmtAmount } from '@/utils/format';
import type { TableColumn } from '../../components/tables.js';
import { apiFetch } from '@/utils/apiClient';
import { extractApiErrorDetail } from '@/store/backtestHelpers.js';
import { pollJobStatus } from '@/store/backtestStore.js';
import { useAssetList } from '../../hooks/miscHooks.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { normalizeTicker } from '@/utils/ticker';
export type { Objective };
export const OBJECTIVE_SORT_KEY: Record<Objective, keyof OptimizeResultItem> = {
  maxCagr: 'cagr',
  minMaxDrawdown: 'maxDrawdown',
  maxSharpe: 'sharpe',
  maxSortino: 'sortino',
};
const pctCol = (key: keyof OptimizeResultItem, label: string): TableColumn<OptimizeResultItem> => ({
  key,
  label,
  sortValue: (r) => r[key] as number,
  render: (r) => fmtPct(r[key] as number),
});
const numCol = (key: keyof OptimizeResultItem, label: string): TableColumn<OptimizeResultItem> => ({
  key,
  label,
  sortValue: (r) => r[key] as number,
  render: (r) => fmtNum(r[key] as number),
});
export const TABLE_COLUMNS: TableColumn<OptimizeResultItem>[] = [
  {
    key: 'rebalanceFrequency',
    label: i18n.t('Rebalancing Frequency'),
    sortValue: (r) => r.rebalanceFrequency,
    render: (r) =>
      r.rebalanceFrequency === 'threshold'
        ? i18n.t('Threshold ({{value}}%)', { value: r.rebalanceThreshold })
        : i18n.t(REBALANCE_LABELS[r.rebalanceFrequency]) || r.rebalanceFrequency,
  },
  {
    key: 'rebalanceThreshold',
    label: i18n.t('Threshold'),
    sortValue: (r) => r.rebalanceThreshold ?? 0,
    render: (r) => (r.rebalanceThreshold !== undefined ? `${r.rebalanceThreshold}%` : '-'),
  },
  {
    key: 'initialCapital',
    label: i18n.t('Initial Capital'),
    sortValue: (r) => r.initialCapital,
    render: (r) => fmtAmount(r.initialCapital),
  },
  pctCol('cagr', i18n.t('stats.cagr')),
  pctCol('maxDrawdown', i18n.t('Max Drawdown')),
  pctCol('stdev', i18n.t('Volatility')),
  numCol('sharpe', i18n.t('Sharpe')),
  numCol('sortino', 'Sortino'),
  numCol('calmar', 'Calmar'),
];
export interface OptimizerFormState {
  thrMin: string;
  thrMax: string;
  thrStep: string;
  capMin: string;
  capMax: string;
  capStep: string;
  objective: Objective;
  enableMaxDD: boolean;
  maxDD: string;
  enableMinCagr: boolean;
  minCagr: string;
  startDate: string;
  endDate: string;
  benchmarkTicker: string;
}
interface OptimizerResultState {
  isLoading: boolean;
  error: string | null;
  results: OptimizeResultItem[] | null;
  best: BestResultItem | null;
  benchmarkGrowth: Array<{ date: string; value: number }> | null;
  totalCombos: number;
}
export interface BacktestOptimizerState {
  assets: Array<{ ticker: string; weight: string }>;
  frequencies: RebalanceFrequency[];
  form: OptimizerFormState;
  patchForm: (patch: Partial<OptimizerFormState>) => void;
  result: OptimizerResultState;
  addAsset: () => void;
  removeAsset: (i: number) => void;
  updateAsset: (i: number, field: 'ticker' | 'weight', val: string) => void;
  toggleFreq: (freq: RebalanceFrequency) => void;
  runOptimize: () => Promise<void>;
}
export interface OptimizerSectionProps {
  s: BacktestOptimizerState;
}
export interface BestMetricsCardProps {
  best: BestResultItem | null;
  totalCombos: number;
}
export interface GrowthComparisonChartProps {
  best: BestResultItem | null;
  benchmarkGrowth: Array<{ date: string; value: number }> | null;
}
export interface ComparisonTableSectionProps {
  results: OptimizeResultItem[];
  objective: Objective;
}
const DEFAULT_FORM: OptimizerFormState = {
  thrMin: '5',
  thrMax: '20',
  thrStep: '5',
  capMin: '10000',
  capMax: '10000',
  capStep: '1000',
  objective: 'maxSharpe',
  enableMaxDD: false,
  maxDD: '20',
  enableMinCagr: false,
  minCagr: '5',
  startDate: DEFAULT_BACKTEST_START_DATE,
  endDate: DEFAULT_END_DATE,
  benchmarkTicker: 'VTI',
};
const EMPTY_RESULT: OptimizerResultState = {
  isLoading: false,
  error: null,
  results: null,
  best: null,
  benchmarkGrowth: null,
  totalCombos: 0,
};
function buildOptimizeBody(
  validAssets: Array<{ ticker: string; weight: string }>,
  frequencies: RebalanceFrequency[],
  form: OptimizerFormState,
): Record<string, unknown> {
  const c: Record<string, number> = {};
  if (form.enableMaxDD && form.maxDD !== '') c.maxDrawdown = Number(form.maxDD);
  if (form.enableMinCagr && form.minCagr !== '') c.minCagr = Number(form.minCagr);
  return {
    portfolio: {
      assets: validAssets.map((a) => ({
        ticker: normalizeTicker(a.ticker),
        weight: Number(a.weight) || 0,
      })),
    },
    parameterSpace: {
      rebalanceFrequencies: frequencies,
      rebalanceThreshold: {
        min: Number(form.thrMin),
        max: Number(form.thrMax),
        step: Number(form.thrStep),
      },
      initialCapital: {
        min: Number(form.capMin),
        max: Number(form.capMax),
        step: Number(form.capStep),
      },
    },
    parameters: {
      startDate: form.startDate,
      endDate: form.endDate,
      benchmarkTicker: normalizeTicker(form.benchmarkTicker),
      baseCurrency: 'usd',
      adjustForInflation: false,
    },
    objective: form.objective,
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
const BEST_METRIC_DEFS: Array<[keyof BestResultItem, string, (v: number) => string]> = [
  ['cagr', 'CAGR', fmtPct],
  ['maxDrawdown', '最大回撤', fmtPct],
  ['stdev', '波动率', fmtPct],
  ['sharpe', 'Sharpe', fmtNum],
  ['sortino', 'Sortino', fmtNum],
  ['calmar', 'Calmar', fmtNum],
];
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
          : i18n.t(REBALANCE_LABELS[best.rebalanceFrequency]) || best.rebalanceFrequency,
    },
    { label: '初始资金', value: fmtAmount(best.initialCapital) },
    ...BEST_METRIC_DEFS.map(([key, label, fmt]) => ({ label, value: fmt(best[key] as number) })),
  ];
}
export function useOptimizerState(): BacktestOptimizerState {
  const { assets, addAsset, removeAsset, updateAsset } = useAssetList<{
    ticker: string;
    weight: string;
  }>(
    [
      { ticker: 'VTI', weight: '60' },
      { ticker: 'BND', weight: '40' },
    ],
    () => ({ ticker: '', weight: '' }),
    1,
  );
  const [frequencies, setFrequencies] = useState<RebalanceFrequency[]>(['quarterly']);
  const toggleFreq = (freq: RebalanceFrequency) =>
    setFrequencies((prev) =>
      prev.includes(freq) ? prev.filter((f) => f !== freq) : [...prev, freq],
    );
  const [form, setForm] = useState<OptimizerFormState>(DEFAULT_FORM);
  const patchForm = (patch: Partial<OptimizerFormState>) =>
    setForm((prev) => ({ ...prev, ...patch }));
  const [result, setResult] = useState<OptimizerResultState>(EMPTY_RESULT);
  const patchResult = (patch: Partial<OptimizerResultState>) =>
    setResult((prev) => ({ ...prev, ...patch }));
  const runOptimize = async () => {
    const validAssets = assets.filter((a) => a.ticker.trim());
    if (validAssets.length === 0) {
      patchResult({ error: i18n.t('Please enter at least one ticker') });
      return;
    }
    if (frequencies.length === 0) {
      patchResult({ error: i18n.t('Please select at least one rebalancing frequency') });
      return;
    }
    patchResult({ isLoading: true, error: null, results: null, best: null, benchmarkGrowth: null });
    try {
      const res = await apiFetch('/api/v1/backtest-optimizer/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildOptimizeBody(validAssets, frequencies, form)),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(extractApiErrorDetail(json));
      // 端点走队列（submitQueueJob），202 + statusUrl 时轮询直至完成
      const data = (
        json.data?.statusUrl
          ? (await pollJobStatus(json.data.statusUrl, new AbortController().signal, null)).data
          : json.data
      ) as {
        results?: OptimizeResultItem[];
        best?: BestResultItem | null;
        benchmarkGrowth?: { date: string; value: number }[] | null;
        totalCombinations?: number;
      };
      patchResult({
        results: data.results ?? [],
        best: data.best ?? null,
        benchmarkGrowth: data.benchmarkGrowth ?? null,
        totalCombos: data.totalCombinations ?? 0,
      });
    } catch (e) {
      patchResult({ error: e instanceof Error ? e.message : i18n.t('Optimization Failed') });
    } finally {
      patchResult({ isLoading: false });
    }
  };
  return {
    assets,
    frequencies,
    form,
    patchForm,
    result,
    addAsset,
    removeAsset,
    updateAsset,
    toggleFreq,
    runOptimize,
  };
}
