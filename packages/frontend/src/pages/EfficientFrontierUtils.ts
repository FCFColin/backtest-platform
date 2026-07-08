import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAsyncAction } from '../hooks/useAsyncAction.js';
import type { EfficientFrontierResult, EfficientFrontierPoint } from '@backtest/shared';

function buildBacktestParameters(startDate: string, endDate: string) {
  return {
    startDate,
    endDate,
    startingValue: 10000,
    adjustForInflation: false,
    rollingWindowMonths: 12,
    benchmarkTicker: '',
    baseCurrency: 'usd',
    extendedWithdrawalStats: false,
    cashflowLegs: [],
    oneTimeCashflows: [],
  };
}

function buildPortfolioData(
  p: EfficientFrontierPoint,
  rebalanceFrequency: string,
  startDate: string,
  endDate: string,
) {
  return {
    portfolios: [
      {
        id: `portfolio-${Date.now()}-1`,
        name: '前沿组合',
        assets: Object.entries(p.weights).map(([ticker, weight]) => ({
          ticker,
          weight: Math.round(weight * 10000) / 100,
        })),
        rebalanceFrequency: rebalanceFrequency || 'quarterly',
        rebalanceOffset: 0,
        drag: 0,
        totalReturn: true,
      },
    ],
    parameters: {
      startDate,
      endDate,
      startingValue: 10000,
      baseCurrency: 'usd',
      adjustForInflation: false,
      rollingWindowMonths: 12,
      benchmarkTicker: '',
      extendedWithdrawalStats: false,
      cashflowLegs: [],
      oneTimeCashflows: [],
    },
  };
}

type SolveSpeed = 'ultrafast' | 'fast' | 'medium' | 'slow';
type FrontierSolver = 'markowitz' | 'nsga2';
type ReturnObjective = 'maxCagr' | 'minVolatility';

interface FetchFrontierParams {
  validTickers: string[];
  numPoints: number;
  solveSpeed: SolveSpeed;
  minInclusionWeight: number;
  rebalanceFrequency: string;
  allowCash: boolean;
  returnObjective: ReturnObjective;
  solver: FrontierSolver;
  startDate: string;
  endDate: string;
}

async function fetchFrontier(params: FetchFrontierParams): Promise<EfficientFrontierResult> {
  const res = await fetch('/api/backtest/efficient-frontier', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tickers: params.validTickers,
      numPoints: params.numPoints,
      solveSpeed: params.solveSpeed,
      minInclusionWeight: params.minInclusionWeight / 100,
      rebalanceFrequency: params.rebalanceFrequency,
      allowCash: params.allowCash,
      returnObjective: params.returnObjective,
      solver: params.solver,
      parameters: buildBacktestParameters(params.startDate, params.endDate),
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.success === false) throw new Error(json.error || '计算失败');
  return json.data ?? json;
}

async function fetchCorrelations(
  validTickers: string[],
  startDate: string,
  endDate: string,
): Promise<{ tickers: string[]; matrix: number[][] } | null> {
  const btBody = {
    portfolios: [
      {
        name: 'temp',
        assets: validTickers.map((t) => ({
          ticker: t,
          weight: Math.round((100 / validTickers.length) * 100) / 100,
        })),
        rebalanceFrequency: 'yearly',
        rebalanceOffset: 0,
        drag: 0,
        totalReturn: true,
      },
    ],
    parameters: buildBacktestParameters(startDate, endDate),
  };
  const btRes = await fetch('/api/backtest/portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(btBody),
  });
  if (!btRes.ok) return null;
  const btJson = await btRes.json();
  const btData = btJson.data ?? btJson;
  if (btData.assetTickers && btData.assetCorrelations)
    return { tickers: btData.assetTickers, matrix: btData.assetCorrelations };
  return null;
}

function computeFrontierDerivedData(results: EfficientFrontierResult | null) {
  const maxSharpe = results?.frontier.length
    ? results.frontier.reduce(
        (best, p) => (p.sharpeRatio > best.sharpeRatio ? p : best),
        results.frontier[0],
      )
    : undefined;
  const sharpeRange = results?.frontier.length
    ? {
        min: Math.min(...results.frontier.map((p) => p.sharpeRatio)),
        max: Math.max(...results.frontier.map((p) => p.sharpeRatio)),
      }
    : { min: 0, max: 1 };
  const scatterData = results
    ? results.frontier.map((p, idx) => ({
        expectedVolatility: p.expectedVolatility,
        expectedReturn: p.expectedReturn,
        sharpeRatio: p.sharpeRatio,
        idx,
      }))
    : [];
  const allocationData = results
    ? results.frontier.map((point, idx) => {
        const row: Record<string, number | string> = { point: idx + 1 };
        Object.entries(point.weights).forEach(([ticker, weight]) => {
          row[ticker] = Number((weight * 100).toFixed(1));
        });
        return row;
      })
    : [];
  const allAssetTickers = results?.frontier.length ? Object.keys(results.frontier[0].weights) : [];
  return { maxSharpe, sharpeRange, scatterData, allocationData, allAssetTickers };
}

function useEfficientFrontierStateInner() {
  const navigate = useNavigate();
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
    navigate,
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

function useEfficientFrontierState() {
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
    s.navigate('/');
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

export { useEfficientFrontierState };
export type { SolveSpeed, FrontierSolver, ReturnObjective };
