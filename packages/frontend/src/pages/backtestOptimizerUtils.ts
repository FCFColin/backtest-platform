import { useState } from 'react';
import type { RebalanceFrequency } from '@backtest/shared';
import { fmtPct, fmtNum } from '@/utils/format';
import type { Column } from '../components/SortableTable.js';

export type Objective = 'maxCagr' | 'minMaxDrawdown' | 'maxSharpe' | 'maxSortino';

export interface OptimizeResultItem {
  rebalanceFrequency: RebalanceFrequency;
  rebalanceThreshold?: number;
  initialCapital: number;
  cagr: number;
  maxDrawdown: number;
  sharpe: number;
  sortino: number;
  stdev: number;
  calmar: number;
}

export interface BestResultItem extends OptimizeResultItem {
  growthCurve: Array<{ date: string; value: number }>;
}

export const FREQ_OPTIONS: Array<{ value: RebalanceFrequency; label: string }> = [
  { value: 'daily', label: '日度' },
  { value: 'weekly', label: '周度' },
  { value: 'monthly', label: '月度' },
  { value: 'quarterly', label: '季度' },
  { value: 'annual', label: '年度' },
];

export const FREQ_LABELS: Record<string, string> = {
  daily: '日度',
  weekly: '周度',
  monthly: '月度',
  quarterly: '季度',
  annual: '年度',
  threshold: '阈值',
  none: '不调仓',
};

const fmtMoney = (v: number) => `$${v.toLocaleString('en-US')}`;

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

function buildOptimizeBody(
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

export interface OptimizerState {
  assets: Array<{ ticker: string; weight: string }>;
  frequencies: RebalanceFrequency[];
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
  isLoading: boolean;
  error: string | null;
  results: OptimizeResultItem[] | null;
  best: BestResultItem | null;
  benchmarkGrowth: Array<{ date: string; value: number }> | null;
  totalCombos: number;
  addAsset: () => void;
  removeAsset: (i: number) => void;
  updateAsset: (i: number, field: 'ticker' | 'weight', val: string) => void;
  toggleFreq: (freq: RebalanceFrequency) => void;
  setObjective: (v: Objective) => void;
  setEnableMaxDD: (v: boolean) => void;
  setMaxDD: (v: string) => void;
  setEnableMinCagr: (v: boolean) => void;
  setMinCagr: (v: string) => void;
  setThrMin: (v: string) => void;
  setThrMax: (v: string) => void;
  setThrStep: (v: string) => void;
  setCapMin: (v: string) => void;
  setCapMax: (v: string) => void;
  setCapStep: (v: string) => void;
  setStartDate: (v: string) => void;
  setEndDate: (v: string) => void;
  setBenchmarkTicker: (v: string) => void;
  runOptimize: () => Promise<void>;
}

function useAssetListState() {
  const [assets, setAssets] = useState<Array<{ ticker: string; weight: string }>>([
    { ticker: 'VTI', weight: '60' },
    { ticker: 'BND', weight: '40' },
  ]);
  const addAsset = () => setAssets([...assets, { ticker: '', weight: '' }]);
  const removeAsset = (i: number) => {
    if (assets.length > 1) setAssets(assets.filter((_, idx) => idx !== i));
  };
  const updateAsset = (i: number, field: 'ticker' | 'weight', val: string) => {
    const next = [...assets];
    next[i] = { ...next[i], [field]: val };
    setAssets(next);
  };
  return { assets, setAssets, addAsset, removeAsset, updateAsset };
}

function useFrequencyState() {
  const [frequencies, setFrequencies] = useState<RebalanceFrequency[]>(['quarterly']);
  const toggleFreq = (freq: RebalanceFrequency) =>
    setFrequencies((prev) =>
      prev.includes(freq) ? prev.filter((f) => f !== freq) : [...prev, freq],
    );
  return { frequencies, setFrequencies, toggleFreq };
}

function useBacktestOptSetters() {
  const { assets, setAssets, addAsset, removeAsset, updateAsset } = useAssetListState();
  const { frequencies, setFrequencies, toggleFreq } = useFrequencyState();
  const [thrMin, setThrMin] = useState('5');
  const [thrMax, setThrMax] = useState('20');
  const [thrStep, setThrStep] = useState('5');
  const [capMin, setCapMin] = useState('10000');
  const [capMax, setCapMax] = useState('10000');
  const [capStep, setCapStep] = useState('1000');
  const [objective, setObjective] = useState<Objective>('maxSharpe');
  const [enableMaxDD, setEnableMaxDD] = useState(false);
  const [maxDD, setMaxDD] = useState('20');
  const [enableMinCagr, setEnableMinCagr] = useState(false);
  const [minCagr, setMinCagr] = useState('5');
  const [startDate, setStartDate] = useState('2010-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [benchmarkTicker, setBenchmarkTicker] = useState('VTI');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<OptimizeResultItem[] | null>(null);
  const [best, setBest] = useState<BestResultItem | null>(null);
  const [benchmarkGrowth, setBenchmarkGrowth] = useState<Array<{
    date: string;
    value: number;
  }> | null>(null);
  const [totalCombos, setTotalCombos] = useState(0);

  return {
    assets,
    frequencies,
    thrMin,
    thrMax,
    thrStep,
    capMin,
    capMax,
    capStep,
    objective,
    enableMaxDD,
    maxDD,
    enableMinCagr,
    minCagr,
    startDate,
    endDate,
    benchmarkTicker,
    isLoading,
    error,
    results,
    best,
    benchmarkGrowth,
    totalCombos,
    setAssets,
    setFrequencies,
    setThrMin,
    setThrMax,
    setThrStep,
    setCapMin,
    setCapMax,
    setCapStep,
    setObjective,
    setEnableMaxDD,
    setMaxDD,
    setEnableMinCagr,
    setMinCagr,
    setStartDate,
    setEndDate,
    setBenchmarkTicker,
    setIsLoading,
    setError,
    setResults,
    setBest,
    setBenchmarkGrowth,
    setTotalCombos,
    addAsset,
    removeAsset,
    updateAsset,
    toggleFreq,
  };
}

async function runBacktestOptimize(s: ReturnType<typeof useBacktestOptSetters>) {
  const validAssets = s.assets.filter((a) => a.ticker.trim());
  if (validAssets.length === 0) {
    s.setError('请至少输入一个标的代码');
    return;
  }
  if (s.frequencies.length === 0) {
    s.setError('请至少选择一个再平衡频率');
    return;
  }
  s.setIsLoading(true);
  s.setError(null);
  s.setResults(null);
  s.setBest(null);
  s.setBenchmarkGrowth(null);
  try {
    const body = buildOptimizeBody(
      validAssets,
      s.frequencies,
      {
        thrMin: s.thrMin,
        thrMax: s.thrMax,
        thrStep: s.thrStep,
        capMin: s.capMin,
        capMax: s.capMax,
        capStep: s.capStep,
      },
      { startDate: s.startDate, endDate: s.endDate, benchmarkTicker: s.benchmarkTicker },
      {
        objective: s.objective,
        enableMaxDD: s.enableMaxDD,
        maxDD: s.maxDD,
        enableMinCagr: s.enableMinCagr,
        minCagr: s.minCagr,
      },
    );
    const res = await fetch('/api/backtest-optimizer/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.success === false) throw new Error(json.error || '优化失败');
    const data = json.data;
    s.setResults(data.results ?? []);
    s.setBest(data.best ?? null);
    s.setBenchmarkGrowth(data.benchmarkGrowth ?? null);
    s.setTotalCombos(data.totalCombinations ?? 0);
  } catch (e) {
    s.setError(e instanceof Error ? e.message : '优化失败');
  } finally {
    s.setIsLoading(false);
  }
}

export function useOptimizerState(): OptimizerState {
  const s = useBacktestOptSetters();
  const runOptimize = () => runBacktestOptimize(s);

  return {
    assets: s.assets,
    frequencies: s.frequencies,
    thrMin: s.thrMin,
    thrMax: s.thrMax,
    thrStep: s.thrStep,
    capMin: s.capMin,
    capMax: s.capMax,
    capStep: s.capStep,
    objective: s.objective,
    enableMaxDD: s.enableMaxDD,
    maxDD: s.maxDD,
    enableMinCagr: s.enableMinCagr,
    minCagr: s.minCagr,
    startDate: s.startDate,
    endDate: s.endDate,
    benchmarkTicker: s.benchmarkTicker,
    isLoading: s.isLoading,
    error: s.error,
    results: s.results,
    best: s.best,
    benchmarkGrowth: s.benchmarkGrowth,
    totalCombos: s.totalCombos,
    addAsset: s.addAsset,
    removeAsset: s.removeAsset,
    updateAsset: s.updateAsset,
    toggleFreq: s.toggleFreq,
    setObjective: s.setObjective,
    setEnableMaxDD: s.setEnableMaxDD,
    setMaxDD: s.setMaxDD,
    setEnableMinCagr: s.setEnableMinCagr,
    setMinCagr: s.setMinCagr,
    setThrMin: s.setThrMin,
    setThrMax: s.setThrMax,
    setThrStep: s.setThrStep,
    setCapMin: s.setCapMin,
    setCapMax: s.setCapMax,
    setCapStep: s.setCapStep,
    setStartDate: s.setStartDate,
    setEndDate: s.setEndDate,
    setBenchmarkTicker: s.setBenchmarkTicker,
    runOptimize,
  };
}
