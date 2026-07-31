import { useState, type Dispatch, type SetStateAction, type CSSProperties } from 'react';
import type { TFunction } from 'i18next';
import type { MonteCarloResult, PerPathMetrics } from '@backtest/shared';
import { CHART_COLORS } from '@backtest/shared';
import { apiFetch } from '@/utils/apiClient';
import i18n from '@/i18n/index.js';
import { validatePortfolioCore } from '@/utils/validation';
import { fmtDollar, fmtNum, fmtPct } from '@/utils/format';
import { percentile, mean, std } from '@/utils/stats';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE, BASE_BACKTEST_PARAMS } from '@/utils/constants';
export type PortfolioMode = 1 | 2;
export type SimMode = 'standard' | 'frontier';
export interface PortfolioState {
  name: string;
  assets: { ticker: string; weight: number }[];
  rebalanceFrequency: string;
}
export type DistMetric = 'finalValue' | 'cagr' | 'maxDrawdown' | 'volatility' | 'sharpe' | 'sortino';
export type ResultTab = 'summary' | 'range' | 'success' | 'distributions' | 'scenarios';
export const EMPTY_DATA_STYLE: CSSProperties = {
  color: 'var(--text-muted)',
  textAlign: 'center',
  padding: 24
};
export const RESULT_TABS: { key: ResultTab; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'range', label: 'Portfolio Value Range' },
  { key: 'success', label: 'Portfolio Success' },
  { key: 'distributions', label: 'Distributions' },
  { key: 'scenarios', label: 'Scenarios' }
];
interface PresetButtonProps {
  label: string;
  onClick: () => void;
}
function createDefaultPortfolio(suffix: number): {
  name: string;
  assets: { ticker: string; weight: number }[];
  rebalanceFrequency: string;
} {
  return {
    name: i18n.t('common.portfolioSuffix', { suffix }),
    assets:
      suffix === 1
        ? [
            { ticker: 'VTI', weight: 60 },
            { ticker: 'BND', weight: 40 }
          ]
        : [
            { ticker: 'VXUS', weight: 50 },
            { ticker: 'BND', weight: 50 }
          ],
    rebalanceFrequency: 'yearly'
  };
}
export function buildPresets(t: { setPortfolioMode: (m: PortfolioMode) => void; setPortfolios: (p: { name: string; assets: { ticker: string; weight: number }[]; rebalanceFrequency: string }[]) => void; setNumYears: (n: number) => void; setNumSimulations: (n: number) => void; setStartingValue: (n: number) => void; setMinBlock: (n: number) => void; setMaxBlock: (n: number) => void }): PresetButtonProps[] {
  return [
    {
      label: i18n.t('monteCarlo.presets.preset6040'),
      onClick: () => {
        t.setPortfolioMode(1);
        t.setPortfolios([
          {
            ...createDefaultPortfolio(1),
            assets: [
              { ticker: 'VTI', weight: 60 },
              { ticker: 'BND', weight: 40 }
            ]
          }
        ]);
        t.setNumYears(20);
        t.setNumSimulations(500);
        t.setStartingValue(100000);
        t.setMinBlock(1);
        t.setMaxBlock(5);
      }
    },
    {
      label: i18n.t('monteCarlo.presets.presetAllStockDCA'),
      onClick: () => {
        t.setPortfolioMode(1);
        t.setPortfolios([{ ...createDefaultPortfolio(1), assets: [{ ticker: 'VTI', weight: 100 }] }]);
        t.setNumYears(30);
        t.setNumSimulations(1000);
        t.setStartingValue(50000);
        t.setMinBlock(1);
        t.setMaxBlock(5);
      }
    },
    {
      label: i18n.t('monteCarlo.presets.presetThreeFund'),
      onClick: () => {
        t.setPortfolioMode(1);
        t.setPortfolios([
          {
            ...createDefaultPortfolio(1),
            assets: [
              { ticker: 'VTI', weight: 50 },
              { ticker: 'VXUS', weight: 30 },
              { ticker: 'BND', weight: 20 }
            ]
          }
        ]);
        t.setNumYears(25);
        t.setNumSimulations(500);
        t.setStartingValue(200000);
        t.setMinBlock(2);
        t.setMaxBlock(8);
      }
    }
  ];
}
function createParamDefaultPortfolio(suffix: number): PortfolioState {
  return {
    name: i18n.t('common.portfolioSuffix', { suffix }),
    assets:
      suffix === 1
        ? [
            { ticker: 'VTI', weight: 60 },
            { ticker: 'BND', weight: 40 }
          ]
        : [
            { ticker: 'VXUS', weight: 50 },
            { ticker: 'BND', weight: 50 }
          ],
    rebalanceFrequency: 'yearly'
  };
}
function usePortfolioOperations(portfolios: PortfolioState[], setPortfolios: Dispatch<SetStateAction<PortfolioState[]>>) {
  const updatePortfolio = (idx: number, patch: Partial<PortfolioState>) =>
    setPortfolios((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  const addAsset = (pIdx: number) => updatePortfolio(pIdx, { assets: [...portfolios[pIdx].assets, { ticker: '', weight: 0 }] });
  const removeAsset = (pIdx: number, aIdx: number) => updatePortfolio(pIdx, { assets: portfolios[pIdx].assets.filter((_, i) => i !== aIdx) });
  const updateAsset = (pIdx: number, aIdx: number, field: 'ticker' | 'weight', val: string | number) => {
    const next = [...portfolios[pIdx].assets];
    next[aIdx] = { ...next[aIdx], [field]: val };
    updatePortfolio(pIdx, { assets: next });
  };
  const getTotalWeight = (pIdx: number) => portfolios[pIdx].assets.reduce((s, a) => s + (a.weight || 0), 0);
  const isComplete = (pIdx: number) => getTotalWeight(pIdx) === 100;
  return { updatePortfolio, addAsset, removeAsset, updateAsset, getTotalWeight, isComplete };
}
function validatePortfolios(portfolios: PortfolioState[], portfolioMode: PortfolioMode, isComplete: (pIdx: number) => boolean): string | null {
  return validatePortfolioCore(portfolios, {
    limit: portfolioMode,
    emptyTickerMode: 'lenient',
    isWeightComplete: isComplete,
    onError: (idx, key) => (key === 'emptyTicker' ? i18n.t('monteCarlo.emptyTickerWarning', { index: idx + 1 }) : i18n.t('monteCarlo.weightSumWarning', { index: idx + 1 }))
  });
}
async function fetchMcResult(idx: number, portfolios: PortfolioState[], reqBody: { parameters: Record<string, unknown>; mcParams: Record<string, unknown>; objectives: Record<string, unknown> }): Promise<MonteCarloResult> {
  const p = portfolios[idx];
  const res = await apiFetch('/api/v1/backtest/monte-carlo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      portfolio: {
        name: p.name,
        assets: p.assets.filter((a) => a.ticker.trim()),
        rebalanceFrequency: p.rebalanceFrequency
      },
      ...reqBody
    })
  });
  if (!res.ok) throw new Error(i18n.t('errors.simulationFailed') + ' ' + (idx + 1));
  const json = await res.json();
  if (json.success === false) throw new Error(json.error || i18n.t('errors.simulationFailed'));
  return json.data ?? json;
}
interface SimExecParams {
  portfolios: PortfolioState[];
  portfolioMode: PortfolioMode;
  isComplete: (pIdx: number) => boolean;
  numYears: number;
  numSimulations: number;
  minBlock: number;
  maxBlock: number;
  withReplacement: boolean;
  randomSeed: string;
  startDate: string;
  endDate: string;
  startingValue: number;
  simMode: SimMode;
  goal1: string;
  goal2: string;
  goalWeight: number;
}
async function executeSimulation(
  params: SimExecParams,
  setters: {
    setError: (e: string | null) => void;
    setIsLoading: (b: boolean) => void;
    setResults1: (r: MonteCarloResult | null) => void;
    setResults2: (r: MonteCarloResult | null) => void;
  }
): Promise<void> {
  const validationError = validatePortfolios(params.portfolios, params.portfolioMode, params.isComplete);
  if (validationError) {
    setters.setError(validationError);
    return;
  }
  setters.setIsLoading(true);
  setters.setError(null);
  setters.setResults1(null);
  setters.setResults2(null);
  const mcParams = {
    numYears: params.numYears,
    numSimulations: params.numSimulations,
    minBlockYears: params.minBlock,
    maxBlockYears: params.maxBlock,
    withReplacement: params.withReplacement,
    seed: params.randomSeed ? Number(params.randomSeed) : undefined
  };
  const parameters = {
    ...BASE_BACKTEST_PARAMS,
    startDate: params.startDate,
    endDate: params.endDate,
    startingValue: params.startingValue,
    adjustForInflation: false,
    baseCurrency: 'usd' as const
  };
  const objectives = {
    mode: params.simMode,
    goal1: params.goal1,
    goal2: params.goal2,
    goal1Weight: params.goalWeight / 100,
    goal2Weight: (100 - params.goalWeight) / 100
  };
  try {
    const reqBody = { parameters, mcParams, objectives };
    const promises = [fetchMcResult(0, params.portfolios, reqBody)];
    if (params.portfolioMode === 2) promises.push(fetchMcResult(1, params.portfolios, reqBody));
    const results = await Promise.all(promises);
    setters.setResults1(results[0]);
    if (results[1]) setters.setResults2(results[1]);
  } catch (e) {
    setters.setError(e instanceof Error ? e.message : i18n.t('errors.simulationFailed'));
  } finally {
    setters.setIsLoading(false);
  }
}
function useMcSetters() {
  const [portfolioMode, setPortfolioMode] = useState<PortfolioMode>(1);
  const [numYears, setNumYears] = useState(20);
  const [numSimulations, setNumSimulations] = useState(500);
  const [startingValue, setStartingValue] = useState(100000);
  const [minBlock, setMinBlock] = useState(1);
  const [maxBlock, setMaxBlock] = useState(5);
  const [withReplacement, setWithReplacement] = useState(true);
  const [startDate, setStartDate] = useState(DEFAULT_BACKTEST_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const [randomSeed, setRandomSeed] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results1, setResults1] = useState<MonteCarloResult | null>(null);
  const [results2, setResults2] = useState<MonteCarloResult | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTab>('summary');
  const [distMetric, setDistMetric] = useState<DistMetric>('finalValue');
  const [portfolios, setPortfolios] = useState<PortfolioState[]>([createParamDefaultPortfolio(1), createParamDefaultPortfolio(2)]);
  const [simMode, setSimMode] = useState<SimMode>('standard');
  const [goal1, setGoal1] = useState('maxCagrPercentile');
  const [goal2, setGoal2] = useState('minMaxDrawdown');
  const [goalWeight, setGoalWeight] = useState(50);
  return {
    portfolioMode,
    setPortfolioMode,
    numYears,
    setNumYears,
    numSimulations,
    setNumSimulations,
    startingValue,
    setStartingValue,
    minBlock,
    setMinBlock,
    maxBlock,
    setMaxBlock,
    withReplacement,
    setWithReplacement,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    randomSeed,
    setRandomSeed,
    isLoading,
    setIsLoading,
    error,
    setError,
    results1,
    setResults1,
    results2,
    setResults2,
    activeTab,
    setActiveTab,
    distMetric,
    setDistMetric,
    portfolios,
    setPortfolios,
    simMode,
    setSimMode,
    goal1,
    setGoal1,
    goal2,
    setGoal2,
    goalWeight,
    setGoalWeight
  };
}
export function useMonteCarloState() {
  const s = useMcSetters();
  const portfolioOps = usePortfolioOperations(s.portfolios, s.setPortfolios);
  const runSimulation = () =>
    executeSimulation(
      {
        portfolios: s.portfolios,
        portfolioMode: s.portfolioMode,
        ...portfolioOps,
        numYears: s.numYears,
        numSimulations: s.numSimulations,
        minBlock: s.minBlock,
        maxBlock: s.maxBlock,
        withReplacement: s.withReplacement,
        randomSeed: s.randomSeed,
        startDate: s.startDate,
        endDate: s.endDate,
        startingValue: s.startingValue,
        simMode: s.simMode,
        goal1: s.goal1,
        goal2: s.goal2,
        goalWeight: s.goalWeight
      },
      {
        setError: s.setError,
        setIsLoading: s.setIsLoading,
        setResults1: s.setResults1,
        setResults2: s.setResults2
      }
    );
  return {
    ...s,
    ...portfolioOps,
    runSimulation
  };
}
export type McState = ReturnType<typeof useMonteCarloState>;
export const metricLabels = (t: TFunction): Record<DistMetric, string> => ({
  finalValue: t('monteCarlo.results.metrics.finalValue'),
  cagr: t('monteCarlo.results.metrics.cagr'),
  maxDrawdown: t('monteCarlo.results.metrics.maxDrawdown'),
  volatility: t('monteCarlo.results.metrics.volatility'),
  sharpe: t('monteCarlo.results.metrics.sharpe'),
  sortino: t('monteCarlo.results.metrics.sortino')
});
export const METRIC_FORMAT: Record<DistMetric, (v: number) => string> = {
  finalValue: fmtDollar,
  cagr: fmtPct,
  maxDrawdown: fmtPct,
  volatility: fmtPct,
  sharpe: fmtNum,
  sortino: fmtNum
};
export const SUMMARY_STATS = ['Min', 'P10', 'P25', 'P50', 'Mean', 'P75', 'P90', 'Max', 'Std'] as const;
export interface RangeDataPoint {
  month: number;
  label: string;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}
export interface FanDataPoint {
  month: number;
  band5_95: [number, number];
  band25_75: [number, number];
  p50: number;
}
export interface TerminalBin {
  range: string;
  count: number;
  minVal: number;
}
export interface TerminalHistogramData {
  data: TerminalBin[];
  p5Val: number;
  p50Val: number;
  p95Val: number;
  p5Label: string;
  p50Label: string;
  p95Label: string;
}
export const monthFormatter = (v: number) => {
  const y = v / 12;
  return Number.isInteger(y) ? `${y}y` : '';
};
export const dollarKFormatter = (v: number) => `$${(v / 1000).toFixed(0)}k`;
export const dollarFormatter = fmtDollar;
export const yearLabelFormatter = (t: TFunction, l: number) => `${(l / 12).toFixed(1)} ${t('monteCarlo.results.year')}`;
function sampleMonths(len: number): Array<{ day: number; month: number }> {
  const out: Array<{ day: number; month: number }> = [{ day: 0, month: 0 }];
  let day = 0,
    month = 0;
  while (day < len - 1) {
    day += 21;
    month++;
    if (day >= len) day = len - 1;
    out.push({ day, month });
    if (day >= len - 1) break;
  }
  return out;
}
function buildBins<T extends { range: string; count: number; minVal: number }>(vals: number[], binCount: number, formatBin: (v: number) => string, makeBin: (range: string, minVal: number) => T): { min: number; max: number; binWidth: number; bins: T[] } {
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const binWidth = (max - min) / binCount || 1;
  const bins = Array.from({ length: binCount }, (_, i) => makeBin(formatBin(min + i * binWidth), min + i * binWidth));
  for (const v of vals) {
    let idx = Math.floor((v - min) / binWidth);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    bins[idx].count++;
  }
  return { min, max, binWidth, bins };
}
export function buildSummaryData(r: MonteCarloResult, startingValue: number, t: TFunction) {
  const metrics = r.perPathMetrics;
  if (!metrics || metrics.length === 0) return null;
  const keys: DistMetric[] = ['finalValue', 'cagr', 'maxDrawdown', 'volatility', 'sharpe', 'sortino'];
  const labels = metricLabels(t);
  return keys.map((key) => {
    const vals = key === 'finalValue' ? metrics.map((m) => m.finalValue * startingValue) : metrics.map((m) => m[key]);
    const p = (frac: number) => percentile(vals, frac);
    const m = mean(vals);
    const s = std(vals);
    const fmt = METRIC_FORMAT[key];
    return {
      metric: labels[key],
      key,
      values: {
        Min: fmt(Math.min(...vals)),
        P10: fmt(p(0.1)),
        P25: fmt(p(0.25)),
        P50: fmt(p(0.5)),
        Mean: fmt(m),
        P75: fmt(p(0.75)),
        P90: fmt(p(0.9)),
        Max: fmt(Math.max(...vals)),
        Std: key === 'finalValue' ? fmtDollar(s) : fmtNum(s)
      } as Record<string, string>
    };
  });
}
export function buildRangeData(r: MonteCarloResult, startingValue: number): RangeDataPoint[] {
  const { p5, p25, p50, p75, p95 } = r.percentiles;
  if (!p5 || p5.length === 0) return [];
  return sampleMonths(p5.length).map(({ day, month }) => ({
    month,
    label: month % 12 === 0 ? `${month / 12}y` : '',
    p5: p5[day] * startingValue,
    p25: p25[day] * startingValue,
    p50: p50[day] * startingValue,
    p75: p75[day] * startingValue,
    p95: p95[day] * startingValue
  }));
}
export function buildSuccessData(r: MonteCarloResult) {
  const sp = r.successProbabilities;
  if (!sp || !sp.survival || sp.survival.length === 0) return [];
  return sp.survival.map((_, i) => ({
    year: i + 1,
    survival: Number((sp.survival[i] * 100).toFixed(1)),
    capitalPreservation: Number((sp.capitalPreservation[i] * 100).toFixed(1)),
    profit: Number((sp.profit[i] * 100).toFixed(1))
  }));
}
export function buildDistHistogram(metrics: PerPathMetrics[], metric: DistMetric, startingValue: number) {
  const vals = metric === 'finalValue' ? metrics.map((m) => m.finalValue * startingValue) : metrics.map((m) => m[metric]);
  if (vals.length === 0) return { data: [], medianLabel: '', meanLabel: '' };
  const formatBin = (v: number) => {
    if (metric === 'finalValue') return `$${(v / 1000).toFixed(0)}k`;
    if (metric === 'cagr' || metric === 'maxDrawdown' || metric === 'volatility') return `${(v * 100).toFixed(1)}%`;
    return v.toFixed(2);
  };
  const { min, binWidth, bins } = buildBins(vals, 40, formatBin, (range, minVal) => ({ range, count: 0, minVal }));
  const medianVal = percentile(vals, 0.5);
  const meanVal = mean(vals);
  const labelFor = (val: number) => formatBin(Math.floor((val - min) / binWidth) * binWidth + min);
  return { data: bins, medianLabel: labelFor(medianVal), meanLabel: labelFor(meanVal), medianVal, meanVal };
}
export function buildScenarioData(r: MonteCarloResult, startingValue: number) {
  const rp = r.representativePaths;
  if (!rp || !rp.best || rp.best.length === 0) return { data: [] };
  return {
    data: rp.best.map((_, i) => ({
      month: i,
      best: rp.best[i] * startingValue,
      p75: rp.p75[i] * startingValue,
      median: rp.median[i] * startingValue,
      p25: rp.p25[i] * startingValue,
      worst: rp.worst[i] * startingValue
    }))
  };
}
export const fanAreas = (t: TFunction) => [
  { dataKey: 'band5_95', fill: CHART_COLORS[0], fillOpacity: 0.08, name: t('monteCarlo.fanChart.band5_95') },
  { dataKey: 'band25_75', fill: CHART_COLORS[0], fillOpacity: 0.18, name: t('monteCarlo.fanChart.band25_75') }
];
export const fanMedianLine = (t: TFunction) => ({
  dataKey: 'p50',
  stroke: CHART_COLORS[0],
  strokeWidth: 2.5,
  name: t('monteCarlo.fanChart.median')
});
export function buildFanChartData(r: MonteCarloResult, startingValue: number): FanDataPoint[] {
  const { p5, p25, p50, p75, p95 } = r.percentiles;
  if (!p5 || p5.length === 0) return [];
  return sampleMonths(p5.length).map(({ day, month }) => ({
    month,
    band5_95: [p5[day] * startingValue, p95[day] * startingValue],
    band25_75: [p25[day] * startingValue, p75[day] * startingValue],
    p50: p50[day] * startingValue
  }));
}
export function buildTerminalHistogram(r: MonteCarloResult, startingValue: number): TerminalHistogramData {
  const metrics = r.perPathMetrics;
  if (!metrics || metrics.length === 0) {
    return { data: [], p5Val: 0, p50Val: 0, p95Val: 0, p5Label: '', p50Label: '', p95Label: '' };
  }
  const vals = metrics.map((m) => m.finalValue * startingValue);
  const formatBin = (v: number) => `$${(v / 1000).toFixed(0)}k`;
  const { min, binWidth, bins } = buildBins(vals, 25, formatBin, (range, minVal) => ({ range, count: 0, minVal }) as TerminalBin);
  const p5Val = percentile(vals, 0.05);
  const p50Val = percentile(vals, 0.5);
  const p95Val = percentile(vals, 0.95);
  const labelFor = (val: number) => formatBin(Math.floor((val - min) / binWidth) * binWidth + min);
  return { data: bins, p5Val, p50Val, p95Val, p5Label: labelFor(p5Val), p50Label: labelFor(p50Val), p95Label: labelFor(p95Val) };
}
