/** @file Optimizer state management hook */
import { useState } from 'react';
import type { Statistics } from '@backtest/shared/types';
import type {
  OptimizerState,
  OptimizerResultExt,
  SolverType,
} from '../components/optimizer/types.js';
import { BASE_PARAMS } from '../components/optimizer/types.js';
import { runOptimizeApi, fetchStats } from '../components/optimizer/utils.js';

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

  const state: OptimizerState = {
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
    runOptimize: async () => {
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
    },
    handleLoadInBacktester: () => {
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
        parameters: {
          ...BASE_PARAMS,
          startDate,
          endDate,
          startingValue: 10000,
          baseCurrency: 'usd',
        },
      };
      localStorage.setItem('bt_load_from_optimizer', JSON.stringify(data));
      navigate('/');
    },
  };
  return state;
}
