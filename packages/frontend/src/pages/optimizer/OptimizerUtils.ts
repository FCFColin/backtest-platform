import { useState } from 'react';
import type { Statistics } from '@backtest/shared';
import { useOptimizerLikeState } from '../../hooks/useOptimizerLikeState.js';
import type { OptimizerStateParams, OptimizerResultExt, SolverType } from './optimizerApi.js';
import { fetchStats, loadInBacktesterAction, runOptimizeApi } from './optimizerApi.js';

export type { SolverType, OptimizerResultExt } from './optimizerApi.js';

export interface EfficientFrontierState {
  tickers: string[];
  setTickers: React.Dispatch<React.SetStateAction<string[]>>;
  objective: string;
  setObjective: (v: string) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  minWeight: number;
  setMinWeight: (v: number) => void;
  maxWeight: number;
  setMaxWeight: (v: number) => void;
  tbillRate: number;
  setTbillRate: (v: number) => void;
  allowShort: boolean;
  setAllowShort: (v: boolean) => void;
  solver: SolverType;
  setSolver: (v: SolverType) => void;
  minCagr: string;
  setMinCagr: (v: string) => void;
  minSharpe: string;
  setMinSharpe: (v: string) => void;
  minSortino: string;
  setMinSortino: (v: string) => void;
  maxVol: string;
  setMaxVol: (v: string) => void;
  maxMaxDD: string;
  setMaxMaxDD: (v: string) => void;
  maxAvgDD: string;
  setMaxAvgDD: (v: string) => void;
  maxHoldings: string;
  setMaxHoldings: (v: string) => void;
  minWeightToInclude: string;
  setMinWeightToInclude: (v: string) => void;
  enableMaxDD: boolean;
  setEnableMaxDD: (v: boolean) => void;
  enableMinCagr: boolean;
  setEnableMinCagr: (v: boolean) => void;
  enableMaxVol: boolean;
  setEnableMaxVol: (v: boolean) => void;
  isLoading: boolean;
  isCalculatingStats: boolean;
  error: string | null;
  results: OptimizerResultExt | null;
  backtestStats: Statistics | null;
  runOptimize: () => Promise<void>;
  handleLoadInBacktester: () => void;
}

function useWeightConstraints() {
  const [minWeight, setMinWeight] = useState(0);
  const [maxWeight, setMaxWeight] = useState(100);
  const [tbillRate, setTbillRate] = useState(5.0);
  const [allowShort, setAllowShort] = useState(false);
  const [solver, setSolver] = useState<SolverType>('markowitz');
  return {
    minWeight,
    setMinWeight,
    maxWeight,
    setMaxWeight,
    tbillRate,
    setTbillRate,
    allowShort,
    setAllowShort,
    solver,
    setSolver,
  };
}

function useOptimizerConstraints() {
  const [minCagr, setMinCagr] = useState('');
  const [minSharpe, setMinSharpe] = useState('');
  const [minSortino, setMinSortino] = useState('');
  const [maxVol, setMaxVol] = useState('');
  const [maxMaxDD, setMaxMaxDD] = useState('');
  const [maxAvgDD, setMaxAvgDD] = useState('');
  const [maxHoldings, setMaxHoldings] = useState('');
  const [minWeightToInclude, setMinWeightToInclude] = useState('');
  const [enableMaxDD, setEnableMaxDD] = useState(false);
  const [enableMinCagr, setEnableMinCagr] = useState(false);
  const [enableMaxVol, setEnableMaxVol] = useState(false);
  return {
    minCagr,
    setMinCagr,
    minSharpe,
    setMinSharpe,
    minSortino,
    setMinSortino,
    maxVol,
    setMaxVol,
    maxMaxDD,
    setMaxMaxDD,
    maxAvgDD,
    setMaxAvgDD,
    maxHoldings,
    setMaxHoldings,
    minWeightToInclude,
    setMinWeightToInclude,
    enableMaxDD,
    setEnableMaxDD,
    enableMinCagr,
    setEnableMinCagr,
    enableMaxVol,
    setEnableMaxVol,
  };
}

function useOptimizerSetters() {
  const [tickers, setTickers] = useState(['VTI', 'VXUS', 'BND']);
  const [objective, setObjective] = useState('maxSharpe');
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
  } = useOptimizerLikeState<OptimizerResultExt>();
  const weights = useWeightConstraints();
  const constraints = useOptimizerConstraints();
  const [isCalculatingStats, setIsCalculatingStats] = useState(false);
  const [backtestStats, setBacktestStats] = useState<Statistics | null>(null);
  return {
    ...weights,
    ...constraints,
    tickers,
    setTickers,
    objective,
    setObjective,
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
    isCalculatingStats,
    setIsCalculatingStats,
    backtestStats,
    setBacktestStats,
  };
}

function buildOptimizerStateParams(
  s: ReturnType<typeof useOptimizerSetters>,
): OptimizerStateParams {
  return {
    tickers: s.tickers,
    startDate: s.startDate,
    endDate: s.endDate,
    minWeight: s.minWeight,
    maxWeight: s.maxWeight,
    tbillRate: s.tbillRate,
    allowShort: s.allowShort,
    solver: s.solver,
    objective: s.objective,
    minCagr: s.minCagr,
    minSharpe: s.minSharpe,
    minSortino: s.minSortino,
    maxVol: s.maxVol,
    maxMaxDD: s.maxMaxDD,
    maxAvgDD: s.maxAvgDD,
    maxHoldings: s.maxHoldings,
    minWeightToInclude: s.minWeightToInclude,
    enableMaxDD: s.enableMaxDD,
    enableMinCagr: s.enableMinCagr,
    enableMaxVol: s.enableMaxVol,
  };
}

async function runOptimizeAction(
  s: ReturnType<typeof useOptimizerSetters>,
  state: OptimizerStateParams,
  t: (k: string) => string,
) {
  if (s.tickers.filter(Boolean).length < 2) {
    s.setError(t('optimizer.errorMinTwoTickers'));
    return;
  }
  if (s.minWeight > s.maxWeight) {
    s.setError(t('optimizer.errorMinGtMax'));
    return;
  }
  s.setIsLoading(true);
  s.setError(null);
  s.setBacktestStats(null);
  try {
    const opt = await runOptimizeApi(state, t);
    s.setResults(opt);
    s.setIsCalculatingStats(true);
    try {
      s.setBacktestStats(await fetchStats(opt, state, t));
    } finally {
      s.setIsCalculatingStats(false);
    }
  } catch (e) {
    s.setError(e instanceof Error ? e.message : t('optimizer.optFailed'));
  } finally {
    s.setIsLoading(false);
  }
}

export function useOptimizerState(
  t: (k: string) => string,
  navigate: (path: string) => void,
): EfficientFrontierState {
  const s = useOptimizerSetters();
  const state = buildOptimizerStateParams(s);
  const runOptimize = () => runOptimizeAction(s, state, t);
  const handleLoadInBacktester = () => loadInBacktesterAction(s, t, navigate);
  // 内部 setter（setIsLoading/setIsCalculatingStats/setError/setResults/setBacktestStats）
  // 随 spread 暴露到运行时但不在 EfficientFrontierState 类型中，TypeScript 结构类型允许返回对象
  // 包含额外字段，消费者无法经由类型系统访问这些内部字段。
  return { ...s, runOptimize, handleLoadInBacktester };
}
