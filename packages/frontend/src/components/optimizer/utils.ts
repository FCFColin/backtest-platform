/** @file Optimizer utility functions */
import type { Statistics } from '@backtest/shared/types';
import type { OptimizerState, OptimizerResultExt } from './types.js';
import { BASE_PARAMS } from './types.js';

export function buildConstraints(s: OptimizerState): Record<string, number> {
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
  s: OptimizerState,
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
  const res = await fetch('/api/backtest/optimize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.success === false) throw new Error(json.error || t('optimizer.optFailed'));
  return json.data ?? json;
}

export async function fetchStats(
  optResult: OptimizerResultExt,
  s: OptimizerState,
  t: (k: string) => string,
): Promise<Statistics | null> {
  const weights = Object.entries(optResult.optimalWeights as Record<string, number>);
  const btBody = {
    portfolios: [
      {
        name: t('optimizer.optimalPortfolio'),
        assets: weights.map(([tk, w]) => ({ ticker: tk, weight: Math.round(w * 10000) / 100 })),
        rebalanceFrequency: 'quarterly',
        rebalanceOffset: 0,
        drag: 0,
        totalReturn: true,
      },
    ],
    parameters: { ...BASE_PARAMS, startDate: s.startDate, endDate: s.endDate },
  };
  const r = await fetch('/api/backtest/portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(btBody),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return (j.data ?? j).portfolios?.[0]?.statistics ?? null;
}
