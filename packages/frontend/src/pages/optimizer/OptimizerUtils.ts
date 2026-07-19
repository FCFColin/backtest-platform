import { useState } from 'react';
import type { OptimizationResult, Statistics } from '@backtest/shared';
import { apiFetch } from '@/utils/apiClient';
import {
  DEFAULT_BACKTEST_START_DATE,
  DEFAULT_END_DATE,
  BASE_BACKTEST_PARAMS,
} from '@/utils/constants';

export type SolverType = 'markowitz' | 'ga';
export type OptimizerResultExt = OptimizationResult & {
  frontier?: Array<{ expectedReturn: number; expectedVolatility: number; sharpeRatio: number }>;
};

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

async function runOptimizeApi(
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

async function fetchStats(
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

interface OptimizerStateParams {
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

export interface OptimizerState {
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

function useOptimizerSetters() {
  const [tickers, setTickers] = useState(['VTI', 'VXUS', 'BND']);
  const [objective, setObjective] = useState('maxSharpe');
  const [startDate, setStartDate] = useState(DEFAULT_BACKTEST_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const [minWeight, setMinWeight] = useState(0);
  const [maxWeight, setMaxWeight] = useState(100);
  const [tbillRate, setTbillRate] = useState(5.0);
  const [allowShort, setAllowShort] = useState(false);
  const [solver, setSolver] = useState<SolverType>('markowitz');
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
  const [isLoading, setIsLoading] = useState(false);
  const [isCalculatingStats, setIsCalculatingStats] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<OptimizerResultExt | null>(null);
  const [backtestStats, setBacktestStats] = useState<Statistics | null>(null);
  return {
    tickers,
    setTickers,
    objective,
    setObjective,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
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
    isLoading,
    setIsLoading,
    isCalculatingStats,
    setIsCalculatingStats,
    error,
    setError,
    results,
    setResults,
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

function loadInBacktesterAction(
  s: ReturnType<typeof useOptimizerSetters>,
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

export function useOptimizerState(
  t: (k: string) => string,
  navigate: (path: string) => void,
): OptimizerState {
  const s = useOptimizerSetters();
  const state = buildOptimizerStateParams(s);
  const runOptimize = () => runOptimizeAction(s, state, t);
  const handleLoadInBacktester = () => loadInBacktesterAction(s, t, navigate);
  // 内部 setter（setIsLoading/setIsCalculatingStats/setError/setResults/setBacktestStats）
  // 随 spread 暴露到运行时但不在 OptimizerState 类型中，TypeScript 结构类型允许返回对象
  // 包含额外字段，消费者无法经由类型系统访问这些内部字段。
  return { ...s, runOptimize, handleLoadInBacktester };
}
