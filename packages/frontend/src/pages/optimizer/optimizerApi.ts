import type { OptimizationResult, Statistics } from '@backtest/shared';
import { apiFetch } from '@/utils/apiClient';
import { buildBacktestParameters } from '@/utils/constants';
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
const BASE_PARAMS = buildBacktestParameters('2010-01-01', '2024-12-31', {
  startingValue: 10000,
  adjustForInflation: false,
  baseCurrency: 'usd',
});
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
    parameters: { ...BASE_PARAMS, startDate: s.startDate, endDate: s.endDate },
    allowShort: s.allowShort,
    solver: s.solver,
  };
  if (s.maxHoldings !== '') body.maxHoldings = Number(s.maxHoldings);
  if (s.minWeightToInclude !== '') body.minWeightToInclude = Number(s.minWeightToInclude) / 100;
  const res = await apiFetch('/api/v1/backtest/optimize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.success === false) throw new Error(json.error || t('Optimization Failed'));
  return json.data ?? json;
}
export async function fetchStats(
  optResult: OptimizerResultExt,
  s: OptimizerStateParams,
  t: (k: string) => string,
): Promise<Statistics | null> {
  const weights = Object.entries(optResult.optimalWeights as Record<string, number>);
  const btBody = {
    portfolios: [
      {
        name: t('Optimal Portfolio'),
        assets: weights.map(([tk, w]) => ({ ticker: tk, weight: Math.round(w * 10000) / 100 })),
        rebalanceFrequency: 'quarterly',
        rebalanceOffset: 0,
        drag: 0,
        totalReturn: true,
      },
    ],
    parameters: { ...BASE_PARAMS, startDate: s.startDate, endDate: s.endDate },
  };
  const r = await apiFetch('/api/v1/backtest/portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(btBody),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return (j.data ?? j).portfolios?.[0]?.statistics ?? null;
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
  const weights = Object.entries(s.results.optimalWeights);
  const data = {
    portfolios: [
      {
        id: `portfolio-${Date.now()}-1`,
        name: t('Optimal Portfolio'),
        assets: weights.map(([tk, w]) => ({ ticker: tk, weight: Math.round(w * 10000) / 100 })),
        rebalanceFrequency: 'quarterly',
        rebalanceOffset: 0,
        drag: 0,
        totalReturn: true,
      },
    ],
    parameters: {
      ...BASE_PARAMS,
      startDate: s.startDate,
      endDate: s.endDate,
      startingValue: 10000,
      baseCurrency: 'usd',
    },
  };
  localStorage.setItem('bt_load_from_optimizer', JSON.stringify(data));
  navigate('/');
}
