import type { OptimizationResult, Statistics } from '@backtest/shared';
import { apiPostJSON } from '@/utils/apiClient';
import { buildBacktestParameters, buildSinglePortfolioBody } from '@/utils/constants';
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
export async function runOptimizeApi(
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
export async function fetchStats(
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
