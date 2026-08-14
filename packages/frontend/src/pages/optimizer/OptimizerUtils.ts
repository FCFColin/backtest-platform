import type { Statistics } from '@backtest/shared';
import { useSetterState } from '../../hooks/miscHooks.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import type { OptimizerStateParams, OptimizerResultExt, SolverType } from './optimizerApi.js';
import { fetchStats, loadInBacktesterAction, runOptimizeApi } from './optimizerApi.js';
export type { SolverType, OptimizerResultExt } from './optimizerApi.js';
export interface EfficientFrontierState {
  tickers: string[];
  setTickers: (v: string[]) => void;
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
  return useSetterState({
    minWeight: 0,
    maxWeight: 100,
    tbillRate: 5.0,
    allowShort: false,
    solver: 'markowitz' as SolverType,
  });
}
function useOptimizerConstraints() {
  return useSetterState({
    minCagr: '',
    minSharpe: '',
    minSortino: '',
    maxVol: '',
    maxMaxDD: '',
    maxAvgDD: '',
    maxHoldings: '',
    minWeightToInclude: '',
    enableMaxDD: false,
    enableMinCagr: false,
    enableMaxVol: false,
  });
}
function useOptimizerSetters() {
  return {
    ...useSetterState({
      startDate: DEFAULT_BACKTEST_START_DATE,
      endDate: DEFAULT_END_DATE,
      isLoading: false,
      error: null as string | null,
      results: null as OptimizerResultExt | null,
      tickers: ['VTI', 'VXUS', 'BND'],
      objective: 'maxSharpe',
      isCalculatingStats: false,
      backtestStats: null as Statistics | null,
    }),
    ...useWeightConstraints(),
    ...useOptimizerConstraints(),
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
    s.setError(t('Please enter at least two ticker symbols'));
    return;
  }
  if (s.minWeight > s.maxWeight) {
    s.setError(t('Min weight cannot be greater than max weight'));
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
    s.setError(e instanceof Error ? e.message : t('Optimization failed'));
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
  return { ...s, runOptimize, handleLoadInBacktester };
}
