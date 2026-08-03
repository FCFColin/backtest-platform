import { useState } from 'react';
import i18n from '@/i18n/index.js';
import {
  REBALANCE_FREQUENCY_OPTIONS,
  REBALANCE_LABELS,
  type BacktestOptimizerObjective as Objective,
  type BestResultItem,
  type OptimizeResultItem,
  type RebalanceFrequency,
} from '@backtest/shared';
import { fmtPct, fmtNum, fmtDollar } from '@/utils/format';
import type { Column } from '../../components/tables.js';
import { apiPostJSON } from '@/utils/apiClient';
import { useListState } from '../../hooks/miscHooks.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
export type { Objective };
export const FREQ_OPTIONS = REBALANCE_FREQUENCY_OPTIONS;
export const OBJECTIVE_SORT_KEY: Record<Objective, keyof OptimizeResultItem> = {
  maxCagr: 'cagr',
  minMaxDrawdown: 'maxDrawdown',
  maxSharpe: 'sharpe',
  maxSortino: 'sortino',
};
const pctCol = (key: keyof OptimizeResultItem, label: string): Column<OptimizeResultItem> => ({
  key,
  label,
  sortValue: (r) => r[key] as number,
  render: (r) => fmtPct(r[key] as number),
});
const numCol = (key: keyof OptimizeResultItem, label: string): Column<OptimizeResultItem> => ({
  key,
  label,
  sortValue: (r) => r[key] as number,
  render: (r) => fmtNum(r[key] as number),
});
export const TABLE_COLUMNS: Column<OptimizeResultItem>[] = [
  {
    key: 'rebalanceFrequency',
    label: i18n.t('params.rebalanceFrequency'),
    sortValue: (r) => r.rebalanceFrequency,
    render: (r) =>
      r.rebalanceFrequency === 'threshold'
        ? i18n.t('params.thresholdWithValue', { value: r.rebalanceThreshold })
        : (REBALANCE_LABELS[r.rebalanceFrequency] ?? r.rebalanceFrequency),
  },
  {
    key: 'rebalanceThreshold',
    label: i18n.t('params.threshold'),
    sortValue: (r) => r.rebalanceThreshold ?? 0,
    render: (r) => (r.rebalanceThreshold !== undefined ? `${r.rebalanceThreshold}%` : '-'),
  },
  {
    key: 'initialCapital',
    label: i18n.t('params.initialCapital'),
    sortValue: (r) => r.initialCapital,
    render: (r) => fmtDollar(r.initialCapital),
  },
  pctCol('cagr', 'CAGR'),
  pctCol('maxDrawdown', i18n.t('statsTable.maxDrawdown')),
  pctCol('stdev', i18n.t('statsTable.volatility')),
  numCol('sharpe', 'Sharpe'),
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
export interface OptimizerResultState {
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
export interface ConstraintRowProps {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  label: string;
  value: string;
  setValue: (v: string) => void;
  placeholder: string;
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
        ticker: a.ticker.trim().toUpperCase(),
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
      benchmarkTicker: form.benchmarkTicker.trim().toUpperCase(),
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
          : (REBALANCE_LABELS[best.rebalanceFrequency] ?? best.rebalanceFrequency),
    },
    { label: '初始资金', value: fmtDollar(best.initialCapital) },
    ...BEST_METRIC_DEFS.map(([key, label, fmt]) => ({ label, value: fmt(best[key] as number) })),
  ];
}
export function useOptimizerState(): BacktestOptimizerState {
  const {
    items: assets,
    addItem: addAsset,
    removeItem: removeAsset,
    updateItem,
  } = useListState<{ ticker: string; weight: string }>(
    [
      { ticker: 'VTI', weight: '60' },
      { ticker: 'BND', weight: '40' },
    ],
    () => ({ ticker: '', weight: '' }),
    1,
  );
  const updateAsset = (i: number, field: 'ticker' | 'weight', val: string) =>
    updateItem(i, (prev) => ({ ...prev, [field]: val }));
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
      patchResult({ error: i18n.t('errors.atLeastOneTicker') });
      return;
    }
    if (frequencies.length === 0) {
      patchResult({ error: i18n.t('errors.atLeastOneRebalanceFreq') });
      return;
    }
    patchResult({ isLoading: true, error: null, results: null, best: null, benchmarkGrowth: null });
    try {
      const data = await apiPostJSON<{
        results?: OptimizeResultItem[];
        best?: BestResultItem | null;
        benchmarkGrowth?: { date: string; value: number }[] | null;
        totalCombinations?: number;
      }>(
        '/api/v1/backtest-optimizer/optimize',
        buildOptimizeBody(validAssets, frequencies, form),
        i18n.t('errors.optimizerFailed'),
      );
      patchResult({
        results: data.results ?? [],
        best: data.best ?? null,
        benchmarkGrowth: data.benchmarkGrowth ?? null,
        totalCombos: data.totalCombinations ?? 0,
      });
    } catch (e) {
      patchResult({ error: e instanceof Error ? e.message : i18n.t('errors.optimizerFailed') });
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
