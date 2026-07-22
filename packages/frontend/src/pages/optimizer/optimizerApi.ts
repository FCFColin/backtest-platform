import type { OptimizationResult, Statistics } from '@backtest/shared';
import { apiFetch } from '@/utils/apiClient';
import { BASE_BACKTEST_PARAMS } from '@/utils/constants';

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

const BASE_PARAMS = {
  ...BASE_BACKTEST_PARAMS,
  startingValue: 10000,
  adjustForInflation: false,
  baseCurrency: 'usd' as const,
};

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

/**
 * 调用后端优化 API 并返回最优组合结果。
 *
 * @param s - 优化器表单状态参数。
 * @param t - i18n 翻译函数，用于错误兜底文案。
 * @returns 优化结果（含有效前沿数据，若 API 返回）。
 * @throws {Error} 当 HTTP 状态非 2xx 或响应 `success === false` 时抛出。
 */
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
  if (json.success === false) throw new Error(json.error || t('optimizer.optFailed'));
  return json.data ?? json;
}

/**
 * 基于最优权重构造组合并回测，提取统计指标。
 *
 * @param optResult - `runOptimizeApi` 返回的优化结果。
 * @param s - 优化器表单状态参数，用于日期范围。
 * @param t - i18n 翻译函数，用于组合命名。
 * @returns 组合统计指标；HTTP 失败时返回 `null`。
 */
export async function fetchStats(
  optResult: OptimizerResultExt,
  s: OptimizerStateParams,
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

/**
 * 将最优组合写入 `localStorage` 并跳转回测页，由回测页读取并预填。
 *
 * @param s - 优化器状态切片，仅消费 `results` / `startDate` / `endDate`。
 * @param t - i18n 翻译函数，用于组合命名。
 * @param navigate - 路由跳转函数。
 * @returns 无返回值；`s.results` 为空时直接短路返回。
 */
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
        name: t('optimizer.optimalPortfolio'),
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
