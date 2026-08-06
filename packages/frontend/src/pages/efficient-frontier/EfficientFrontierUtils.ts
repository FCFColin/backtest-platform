import { useMemo } from 'react';
import i18n from '@/i18n/index.js';
import { useNavigate } from 'react-router';
import {
  useAsyncAction,
  useListState,
  useOptimizerLikeState,
  useSetterState,
} from '../../hooks/miscHooks.js';
import { apiFetch, apiPostJSON } from '@/utils/apiClient';
import type { EfficientFrontierResult, EfficientFrontierPoint } from '@backtest/shared';
import { buildBacktestParameters, buildSinglePortfolioBody } from '@/utils/constants';
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
function buildPortfolioData(
  p: EfficientFrontierPoint,
  rebalanceFrequency: string,
  startDate: string,
  endDate: string,
) {
  return buildSinglePortfolioBody(
    i18n.t('Portfolio'),
    Object.entries(p.weights).map(([ticker, weight]) => ({
      ticker,
      weight: Math.round(weight * 10000) / 100,
    })),
    {
      id: `portfolio-${Date.now()}-1`,
      rebalanceFrequency: rebalanceFrequency || 'quarterly',
    },
    buildBacktestParameters(startDate, endDate),
  );
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
  return apiPostJSON<EfficientFrontierResult>(
    '/api/v1/backtest/efficient-frontier',
    {
      tickers: params.validTickers,
      numPoints: params.numPoints,
      solveSpeed: params.solveSpeed,
      minInclusionWeight: params.minInclusionWeight / 100,
      rebalanceFrequency: params.rebalanceFrequency,
      allowCash: params.allowCash,
      returnObjective: params.returnObjective,
      solver: params.solver,
      parameters: buildBacktestParameters(params.startDate, params.endDate),
    },
    i18n.t('Computation failed'),
  );
}
async function fetchCorrelations(
  validTickers: string[],
  startDate: string,
  endDate: string,
): Promise<{ tickers: string[]; matrix: number[][] } | null> {
  const btBody = buildSinglePortfolioBody(
    'temp',
    validTickers.map((t) => ({
      ticker: t,
      weight: Math.round((100 / validTickers.length) * 100) / 100,
    })),
    { rebalanceFrequency: 'yearly' },
    buildBacktestParameters(startDate, endDate),
  );
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
  const {
    items: tickers,
    setItems: setTickers,
    addItem,
    removeItem,
    updateItem,
  } = useListState(['VTI', 'VXUS', 'BND', 'TLT'], () => '', 2);
  const { startDate, setStartDate, endDate, setEndDate, results, setResults } =
    useOptimizerLikeState<EfficientFrontierResult>();
  const s = useSetterState({
    numPoints: 20,
    solveSpeed: 'fast' as SolveSpeed,
    minInclusionWeight: 0,
    selectedPoint: null as EfficientFrontierPoint | null,
    correlations: null as { tickers: string[]; matrix: number[][] } | null,
    correlationError: null as string | null,
    rebalanceFrequency: 'yearly',
    allowCash: false,
    returnObjective: 'maxCagr' as ReturnObjective,
    solver: 'markowitz' as FrontierSolver,
  });
  const { isLoading, error, run, setError } = useAsyncAction();
  return {
    navigate,
    tickers,
    setTickers,
    addTicker: addItem,
    removeTicker: removeItem,
    updateTicker: (i: number, val: string) => updateItem(i, () => val),
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    isLoading,
    error,
    run,
    setError,
    results,
    setResults,
    ...s,
  };
}
function useEfficientFrontierState() {
  const s = useEfficientFrontierStateInner();
  const { maxSharpe, sharpeRange, scatterData, allocationData, allAssetTickers } = useMemo(
    () => computeFrontierDerivedData(s.results),
    [s.results],
  );
  const runFrontier = () => {
    const validTickers = s.tickers.filter(Boolean);
    if (validTickers.length < 2) {
      s.setError(i18n.t('Please enter at least two tickers'));
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
      else s.setCorrelationError(i18n.t('Correlation matrix computation failed'));
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
export type FrontierState = ReturnType<typeof useEfficientFrontierState>;
