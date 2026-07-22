import { useState } from 'react';
import type {
  RebalanceFrequency,
  BacktestOptimizerObjective as Objective,
  OptimizeResultItem,
  BestResultItem,
} from '@backtest/shared';
import { apiPostJSON } from '@/utils/apiClient';
import { useListState } from '../../hooks/useListState.js';
import { useOptimizerLikeState } from '../../hooks/useOptimizerLikeState.js';
import { buildOptimizeBody } from './backtestOptimizerBuilders.js';

// 三个类型已上提到 @backtest/shared，此处 re-export 保留本模块既有导入路径
// （Objective 为兼容别名，对应 shared 中的 BacktestOptimizerObjective）。
export type { Objective, OptimizeResultItem, BestResultItem };

// 常量与构建器已拆分到独立模块，此处 re-export 保留本模块既有导入路径。
export { FREQ_OPTIONS, OBJECTIVE_SORT_KEY, TABLE_COLUMNS } from './backtestOptimizerConstants.js';
export { buildChartData, buildBestMetrics } from './backtestOptimizerBuilders.js';

export interface BacktestOptimizerState {
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
  const { items, setItems, addItem, removeItem, updateItem } = useListState<{
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
  const updateAsset = (i: number, field: 'ticker' | 'weight', val: string) =>
    updateItem(i, (prev) => ({ ...prev, [field]: val }));
  return {
    assets: items,
    setAssets: setItems,
    addAsset: addItem,
    removeAsset: removeItem,
    updateAsset,
  };
}

function useFrequencyState() {
  const [frequencies, setFrequencies] = useState<RebalanceFrequency[]>(['quarterly']);
  const toggleFreq = (freq: RebalanceFrequency) =>
    setFrequencies((prev) =>
      prev.includes(freq) ? prev.filter((f) => f !== freq) : [...prev, freq],
    );
  return { frequencies, setFrequencies, toggleFreq };
}

function useGridParams() {
  const [thrMin, setThrMin] = useState('5');
  const [thrMax, setThrMax] = useState('20');
  const [thrStep, setThrStep] = useState('5');
  const [capMin, setCapMin] = useState('10000');
  const [capMax, setCapMax] = useState('10000');
  const [capStep, setCapStep] = useState('1000');
  return {
    thrMin,
    setThrMin,
    thrMax,
    setThrMax,
    thrStep,
    setThrStep,
    capMin,
    setCapMin,
    capMax,
    setCapMax,
    capStep,
    setCapStep,
  };
}

function useConstraintState() {
  const [objective, setObjective] = useState<Objective>('maxSharpe');
  const [enableMaxDD, setEnableMaxDD] = useState(false);
  const [maxDD, setMaxDD] = useState('20');
  const [enableMinCagr, setEnableMinCagr] = useState(false);
  const [minCagr, setMinCagr] = useState('5');
  return {
    objective,
    setObjective,
    enableMaxDD,
    setEnableMaxDD,
    maxDD,
    setMaxDD,
    enableMinCagr,
    setEnableMinCagr,
    minCagr,
    setMinCagr,
  };
}

function useBacktestOptSetters() {
  const { assets, setAssets, addAsset, removeAsset, updateAsset } = useAssetListState();
  const { frequencies, setFrequencies, toggleFreq } = useFrequencyState();
  const grid = useGridParams();
  const constraints = useConstraintState();
  const {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    isLoading,
    setIsLoading,
    error,
    setError,
    results,
    setResults,
  } = useOptimizerLikeState<OptimizeResultItem[]>();
  const [benchmarkTicker, setBenchmarkTicker] = useState('VTI');
  const [best, setBest] = useState<BestResultItem | null>(null);
  const [benchmarkGrowth, setBenchmarkGrowth] = useState<Array<{
    date: string;
    value: number;
  }> | null>(null);
  const [totalCombos, setTotalCombos] = useState(0);

  return {
    ...grid,
    ...constraints,
    assets,
    frequencies,
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
    const data = await apiPostJSON<{
      results?: OptimizeResultItem[];
      best?: BestResultItem | null;
      benchmarkGrowth?: { date: string; value: number }[] | null;
      totalCombinations?: number;
    }>('/api/v1/backtest-optimizer/optimize', body, '优化失败');
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

export function useOptimizerState(): BacktestOptimizerState {
  const s = useBacktestOptSetters();
  const runOptimize = () => runBacktestOptimize(s);
  // 内部 setter（setAssets/setFrequencies/setIsLoading/setError/setResults/setBest/
  // setBenchmarkGrowth/setTotalCombos）随 spread 暴露到运行时但不在 BacktestOptimizerState 类型中，
  // TypeScript 结构类型允许返回对象包含额外字段，消费者无法经由类型系统访问这些内部字段。
  return { ...s, runOptimize };
}
