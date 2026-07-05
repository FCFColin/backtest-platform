import { useState, useMemo } from 'react';
import type { EfficientFrontierResult, EfficientFrontierPoint } from '@backtest/shared/types';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import type { SolveSpeed, ReturnObjective, FrontierSolver } from './types.js';
import {
  fetchFrontier,
  fetchCorrelations,
  computeFrontierDerivedData,
  buildPortfolioData,
} from './utils.js';

export function useEfficientFrontierState(navigate: (path: string) => void) {
  const [tickers, setTickers] = useState(['VTI', 'VXUS', 'BND', 'TLT']);
  const [startDate, setStartDate] = useState('2010-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [numPoints, setNumPoints] = useState(20);
  const [solveSpeed, setSolveSpeed] = useState<SolveSpeed>('fast');
  const [minInclusionWeight, setMinInclusionWeight] = useState(0);
  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<EfficientFrontierResult | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<EfficientFrontierPoint | null>(null);
  const [correlations, setCorrelations] = useState<{
    tickers: string[];
    matrix: number[][];
  } | null>(null);
  const [correlationError, setCorrelationError] = useState<string | null>(null);
  const [rebalanceFrequency, setRebalanceFrequency] = useState<string>('yearly');
  const [allowCash, setAllowCash] = useState(false);
  const [returnObjective, setReturnObjective] = useState<ReturnObjective>('maxCagr');
  const [solver, setSolver] = useState<FrontierSolver>('markowitz');

  const addTicker = () => setTickers([...tickers, '']);
  const removeTicker = (i: number) => {
    if (tickers.length > 2) setTickers(tickers.filter((_, idx) => idx !== i));
  };
  const updateTicker = (i: number, val: string) => {
    const n = [...tickers];
    n[i] = val;
    setTickers(n);
  };

  const { maxSharpe, sharpeRange, scatterData, allocationData, allAssetTickers } = useMemo(
    () => computeFrontierDerivedData(results),
    [results],
  );

  const runFrontier = () => {
    const validTickers = tickers.filter(Boolean);
    if (validTickers.length < 2) {
      setError('请至少输入两个标的代码');
      return;
    }
    setSelectedPoint(null);
    setCorrelations(null);
    setCorrelationError(null);
    run(async () => {
      const data = await fetchFrontier({
        validTickers,
        numPoints,
        solveSpeed,
        minInclusionWeight,
        rebalanceFrequency,
        allowCash,
        returnObjective,
        solver,
        startDate,
        endDate,
      });
      setResults(data);
      const corr = await fetchCorrelations(validTickers, startDate, endDate);
      if (corr) setCorrelations(corr);
      else setCorrelationError('相关性矩阵计算失败');
    });
  };

  const handleLoadInBacktester = (point?: EfficientFrontierPoint) => {
    const p = point || maxSharpe;
    if (!p) return;
    localStorage.setItem(
      'bt_load_from_optimizer',
      JSON.stringify(buildPortfolioData(p, rebalanceFrequency, startDate, endDate)),
    );
    navigate('/');
  };

  return {
    tickers,
    startDate,
    endDate,
    numPoints,
    solveSpeed,
    minInclusionWeight,
    isLoading,
    error,
    results,
    selectedPoint,
    correlations,
    correlationError,
    rebalanceFrequency,
    allowCash,
    returnObjective,
    solver,
    maxSharpe,
    sharpeRange,
    scatterData,
    allocationData,
    allAssetTickers,
    addTicker,
    removeTicker,
    updateTicker,
    runFrontier,
    handleLoadInBacktester,
    setStartDate,
    setEndDate,
    setNumPoints,
    setSolveSpeed,
    setMinInclusionWeight,
    setRebalanceFrequency,
    setAllowCash,
    setReturnObjective,
    setSolver,
    setSelectedPoint,
  };
}
