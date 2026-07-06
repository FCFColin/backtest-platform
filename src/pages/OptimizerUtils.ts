import { useState } from 'react';
import type { OptimizationResult, Statistics } from '../../shared/types';

export type SolverType = 'markowitz' | 'ga';
export type OptimizerResultExt = OptimizationResult & {
  frontier?: Array<{ expectedReturn: number; expectedVolatility: number; sharpeRatio: number }>;
};

export const BASE_PARAMS = {
  startingValue: 10000,
  adjustForInflation: false,
  rollingWindowMonths: 12,
  benchmarkTicker: '',
  baseCurrency: 'usd',
  extendedWithdrawalStats: false,
  cashflowLegs: [] as unknown[],
  oneTimeCashflows: [] as unknown[],
};

export function buildConstraints(s: OptimizerStateParams): Record<string, number> {
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
  const r = await fetch('/api/backtest/portfolio', {
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

export function useOptimizerState(
  t: (k: string) => string,
  navigate: (path: string) => void,
): OptimizerState {
  const [tickers, setTickers] = useState(['VTI', 'VXUS', 'BND']);
  const [objective, setObjective] = useState('maxSharpe');
  const [startDate, setStartDate] = useState('2010-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
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

  const state: OptimizerStateParams = {
    tickers,
    startDate,
    endDate,
    minWeight,
    maxWeight,
    tbillRate,
    allowShort,
    solver,
    objective,
    minCagr,
    minSharpe,
    minSortino,
    maxVol,
    maxMaxDD,
    maxAvgDD,
    maxHoldings,
    minWeightToInclude,
    enableMaxDD,
    enableMinCagr,
    enableMaxVol,
  };

  const runOptimize = async () => {
    if (tickers.filter(Boolean).length < 2) {
      setError(t('optimizer.errorMinTwoTickers'));
      return;
    }
    if (minWeight > maxWeight) {
      setError(t('optimizer.errorMinGtMax'));
      return;
    }
    setIsLoading(true);
    setError(null);
    setBacktestStats(null);
    try {
      const opt = await runOptimizeApi(state, t);
      setResults(opt);
      setIsCalculatingStats(true);
      try {
        setBacktestStats(await fetchStats(opt, state, t));
      } finally {
        setIsCalculatingStats(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('optimizer.optFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadInBacktester = () => {
    if (!results) return;
    const weights = Object.entries(results.optimalWeights);
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
      parameters: { ...BASE_PARAMS, startDate, endDate, startingValue: 10000, baseCurrency: 'usd' },
    };
    localStorage.setItem('bt_load_from_optimizer', JSON.stringify(data));
    navigate('/');
  };

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
    isCalculatingStats,
    error,
    results,
    backtestStats,
    runOptimize,
    handleLoadInBacktester,
  };
}
