import { useState, useMemo } from 'react';
import type { CSSProperties } from 'react';
import i18n from '@/i18n/index.js';
import { useNavigate } from 'react-router-dom';
import { useAsyncAction, useOptimizerLikeState } from '../../hooks/miscHooks.js';
import { apiFetch } from '@/utils/apiClient';
import type { EfficientFrontierResult, EfficientFrontierPoint } from '@backtest/shared';
import { buildBacktestParameters } from '@/utils/constants';
export type SolveSpeed = 'ultrafast' | 'fast' | 'medium' | 'slow';
export type FrontierSolver = 'markowitz' | 'nsga2';
export type ReturnObjective = 'maxCagr' | 'minVolatility';
export function sharpeToColor(sharpe: number, minSharpe: number, maxSharpe: number): string {
  if (maxSharpe === minSharpe) return '#2e8b57';
  const t = Math.max(0, Math.min(1, (sharpe - minSharpe) / (maxSharpe - minSharpe)));
  const r = t < 0.5 ? 220 : Math.round(220 - (t - 0.5) * 2 * 220);
  const g = t < 0.5 ? Math.round(t * 2 * 180) : 180;
  const b = t < 0.5 ? 50 : Math.round(50 + (t - 0.5) * 2 * 37);
  return `rgb(${r},${g},${b})`;
}
export const SECTION_TITLE_STYLE: CSSProperties = {
  fontWeight: 600,
  fontSize: 14,
  color: 'var(--text-strong)',
  marginBottom: 12,
  marginTop: 24,
};
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
        name: i18n.t('statsTable.portfolioName'),
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
    parameters: buildBacktestParameters(startDate, endDate),
  };
}
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
  const res = await apiFetch('/api/v1/backtest/efficient-frontier', {
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
  if (json.success === false) throw new Error(json.error || i18n.t('errors.computeFailed'));
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
  const btRes = await apiFetch('/api/v1/backtest/portfolio', {
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
  const { startDate, setStartDate, endDate, setEndDate, results, setResults } =
    useOptimizerLikeState<EfficientFrontierResult>();
  const [numPoints, setNumPoints] = useState(20);
  const [solveSpeed, setSolveSpeed] = useState<SolveSpeed>('fast');
  const [minInclusionWeight, setMinInclusionWeight] = useState(0);
  const { isLoading, error, run, setError } = useAsyncAction();
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
      s.setError(i18n.t('errors.atLeastTwoTickers'));
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
      else s.setCorrelationError(i18n.t('errors.correlationFailed'));
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
