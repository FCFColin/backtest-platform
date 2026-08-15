import type { Statistics } from '@backtest/shared';
import { useSetterState } from '../../hooks/miscHooks.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import type { OptimizerStateParams, OptimizerResultExt, SolverType } from './optimizerApi.js';
import { fetchStats, loadInBacktesterAction, runOptimizeApi } from './optimizerApi.js';
export type { SolverType, OptimizerResultExt } from './optimizerApi.js';
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
export function useOptimizerState(t: (k: string) => string, navigate: (path: string) => void) {
  const s = useOptimizerSetters();
  const state = buildOptimizerStateParams(s);
  const runOptimize = () => runOptimizeAction(s, state, t);
  const handleLoadInBacktester = () => loadInBacktesterAction(s, t, navigate);
  return { ...s, runOptimize, handleLoadInBacktester };
}
export type EfficientFrontierState = ReturnType<typeof useOptimizerState>;
