import { useState, useMemo } from 'react';
import type { EfficientFrontierResult, EfficientFrontierPoint } from '@backtest/shared';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import type { SolveSpeed, ReturnObjective, FrontierSolver } from './types.js';
import {
  fetchFrontier,
  fetchCorrelations,
  computeFrontierDerivedData,
  buildPortfolioData,
} from './utils.js';

function useEfficientFrontierStateInner() {
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
  return {
    tickers,
    setTickers,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    numPoints,
    setNumPoints,
    solveSpeed,
    setSolveSpeed,
    minInclusionWeight,
    setMinInclusionWeight,
    isLoading,
    error,
    run,
    setError,
    results,
    setResults,
    selectedPoint,
    setSelectedPoint,
    correlations,
    setCorrelations,
    correlationError,
    setCorrelationError,
    rebalanceFrequency,
    setRebalanceFrequency,
    allowCash,
    setAllowCash,
    returnObjective,
    setReturnObjective,
    solver,
    setSolver,
  };
}

export function useEfficientFrontierState(navigate: (path: string) => void) {
  const s = useEfficientFrontierStateInner();

  const addTicker = () => s.setTickers([...s.tickers, '']);
  const removeTicker = (i: number) => {
    if (s.tickers.length > 2) s.setTickers(s.tickers.filter((_, idx) => idx !== i));
  };
  const updateTicker = (i: number, val: string) => {
    const n = [...s.tickers];
    n[i] = val;
    s.setTickers(n);
  };

  const { maxSharpe, sharpeRange, scatterData, allocationData, allAssetTickers } = useMemo(
    () => computeFrontierDerivedData(s.results),
    [s.results],
  );

  const runFrontier = () => {
    const validTickers = s.tickers.filter(Boolean);
    if (validTickers.length < 2) {
      s.setError('请至少输入两个标的代码');
      return;
    }
    s.setSelectedPoint(null);
    s.setCorrelations(null);
    s.setCorrelationError(null);
    s.run(async () => {
      const data = await fetchFrontier({
        validTickers,
        numPoints: s.numPoints,
        solveSpeed: s.solveSpeed,
        minInclusionWeight: s.minInclusionWeight,
        rebalanceFrequency: s.rebalanceFrequency,
        allowCash: s.allowCash,
        returnObjective: s.returnObjective,
        solver: s.solver,
        startDate: s.startDate,
        endDate: s.endDate,
      });
      s.setResults(data);
      const corr = await fetchCorrelations(validTickers, s.startDate, s.endDate);
      if (corr) s.setCorrelations(corr);
      else s.setCorrelationError('相关性矩阵计算失败');
    });
  };

  const handleLoadInBacktester = (point?: EfficientFrontierPoint) => {
    const p = point || maxSharpe;
    if (!p) return;
    localStorage.setItem(
      'bt_load_from_optimizer',
      JSON.stringify(buildPortfolioData(p, s.rebalanceFrequency, s.startDate, s.endDate)),
    );
    navigate('/');
  };

  return {
    ...s,
    addTicker,
    removeTicker,
    updateTicker,
    maxSharpe,
    sharpeRange,
    scatterData,
    allocationData,
    allAssetTickers,
    runFrontier,
    handleLoadInBacktester,
  };
}
