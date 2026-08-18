import type { Statistics, OptimizationResult } from '@backtest/shared';
import { useSetterState } from '../../hooks/miscHooks.js';
import {
  DEFAULT_BACKTEST_START_DATE,
  DEFAULT_END_DATE,
  buildBacktestParameters,
  buildSinglePortfolioBody,
} from '@/utils/constants';
import { apiPostJSON } from '@/utils/apiClient';
export type SolverType = 'markowitz' | 'ga';
export type OptimizerResultExt = OptimizationResult & {
  frontier?: Array<{ expectedReturn: number; expectedVolatility: number; sharpeRatio: number }>;
};
export interface OptimizerStateParams {
  tickers: string[];
  startDate: string;
  endDate: string;
  minWeight: number;
  maxWeight: number;
  tbillRate: number;
  allowShort: boolean;
  solver: SolverType;
  objective: string;
  minCagr: string;
  minSharpe: string;
  minSortino: string;
  maxVol: string;
  maxMaxDD: string;
  maxAvgDD: string;
  maxHoldings: string;
  minWeightToInclude: string;
  enableMaxDD: boolean;
  enableMinCagr: boolean;
  enableMaxVol: boolean;
}
function buildConstraints(s: OptimizerStateParams): Record<string, number> {
  const c: Record<string, number> = {
    minWeight: s.minWeight / 100,
    maxWeight: s.maxWeight / 100,
    tbillRate: s.tbillRate,
  };
  if (s.enableMinCagr && s.minCagr !== '') c.minCagr = Number(s.minCagr) / 100;
  if (s.minSharpe !== '') c.minSharpe = Number(s.minSharpe);
  if (s.minSortino !== '') c.minSortino = Number(s.minSortino);
  if (s.enableMaxVol && s.maxVol !== '') c.maxVol = Number(s.maxVol) / 100;
  if (s.enableMaxDD && s.maxMaxDD !== '') c.maxMaxDD = Number(s.maxMaxDD) / 100;
  if (s.maxAvgDD !== '') c.maxAvgDD = Number(s.maxAvgDD) / 100;
  return c;
}
async function runOptimizeApi(
  s: OptimizerStateParams,
  t: (k: string) => string,
): Promise<OptimizerResultExt> {
  const validTickers = s.tickers.filter(Boolean);
  const body: Record<string, unknown> = {
    tickers: validTickers,
    objective: s.objective,
    constraints: buildConstraints(s),
    parameters: buildBacktestParameters(s.startDate, s.endDate),
    allowShort: s.allowShort,
    solver: s.solver,
  };
  if (s.maxHoldings !== '') body.maxHoldings = Number(s.maxHoldings);
  if (s.minWeightToInclude !== '') body.minWeightToInclude = Number(s.minWeightToInclude) / 100;
  return apiPostJSON<OptimizerResultExt>(
    '/api/v1/backtest/optimize',
    body,
    t('Optimization failed'),
  );
}
function buildPortfolioBody(
  name: string,
  weights: Record<string, number>,
  startDate: string,
  endDate: string,
  id?: string,
) {
  return buildSinglePortfolioBody(
    name,
    Object.entries(weights).map(([tk, w]) => ({ ticker: tk, weight: Math.round(w * 10000) / 100 })),
    { id },
    buildBacktestParameters(startDate, endDate),
  );
}
async function fetchStats(
  optResult: OptimizerResultExt,
  s: OptimizerStateParams,
  t: (k: string) => string,
): Promise<Statistics | null> {
  try {
    const j = await apiPostJSON<{ portfolios?: Array<{ statistics?: Statistics }> }>(
      '/api/v1/backtest/portfolio',
      buildPortfolioBody(t('Optimal Portfolio'), optResult.optimalWeights, s.startDate, s.endDate),
    );
    return j.portfolios?.[0]?.statistics ?? null;
  } catch {
    return null;
  }
}
interface LoadInBacktesterParams {
  results: OptimizerResultExt | null;
  startDate: string;
  endDate: string;
}
export function loadInBacktesterAction(
  s: LoadInBacktesterParams,
  t: (k: string) => string,
  navigate: (path: string) => void,
) {
  if (!s.results) return;
  const data = buildPortfolioBody(
    t('Optimal Portfolio'),
    s.results.optimalWeights,
    s.startDate,
    s.endDate,
    `portfolio-${Date.now()}-1`,
  );
  localStorage.setItem('bt_load_from_optimizer', JSON.stringify(data));
  navigate('/');
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
export function useOptimizerState(t: (k: string) => string, navigate: (path: string) => void) {
  const s = useOptimizerSetters();
  const state = buildOptimizerStateParams(s);
  const runOptimize = () => runOptimizeAction(s, state, t);
  const handleLoadInBacktester = () => loadInBacktesterAction(s, t, navigate);
  return { ...s, runOptimize, handleLoadInBacktester };
}
export type EfficientFrontierState = ReturnType<typeof useOptimizerState>;
