import { useSetterState } from '@/hooks/miscHooks.js';
import type { TFunction } from 'i18next';
import {
  type MonteCarloResult,
  type PerPathMetrics,
  type BacktestParameters,
} from '@backtest/shared';
import { apiFetch } from '@/utils/apiClient';
import i18n from '@/i18n/index.js';
import { validatePortfolioCore } from '@/utils/validation';
import { fmtAmount, fmtNum, fmtPct, percentile, mean, std } from '@/utils/format';
import {
  DEFAULT_BACKTEST_START_DATE,
  DEFAULT_END_DATE,
  buildBacktestParameters,
} from '@/utils/constants';

export type PortfolioMode = 1 | 2;
type SimMode = 'standard' | 'frontier';
export interface PortfolioState {
  name: string;
  assets: { ticker: string; weight: number }[];
  rebalanceFrequency: string;
}
export type DistMetric =
  'finalValue' | 'cagr' | 'maxDrawdown' | 'volatility' | 'sharpe' | 'sortino';
export type ResultTab = 'summary' | 'range' | 'success' | 'distributions' | 'scenarios';
export const RESULT_TABS: { key: ResultTab; label: string }[] = [
  { key: 'summary', label: 'tabs.summary' },
  { key: 'range', label: 'Portfolio Value Range' },
  { key: 'success', label: 'Portfolio Success' },
  { key: 'distributions', label: 'Distributions' },
  { key: 'scenarios', label: 'Scenarios' },
];
const DEFAULT_ASSETS: Record<1 | 2, PortfolioState['assets']> = {
  1: [
    { ticker: 'VTI', weight: 60 },
    { ticker: 'BND', weight: 40 },
  ],
  2: [
    { ticker: 'VXUS', weight: 50 },
    { ticker: 'BND', weight: 50 },
  ],
};
const createDefaultPortfolio = (suffix: number): PortfolioState => ({
  name: i18n.t('Portfolio {{suffix}}', { suffix }),
  assets: DEFAULT_ASSETS[suffix === 1 ? 1 : 2],
  rebalanceFrequency: 'yearly',
});
const PRESETS: [string, PortfolioState['assets'], number, number, number, number, number][] = [
  ['monteCarlo.presets.preset6040', DEFAULT_ASSETS[1], 20, 500, 100000, 1, 5],
  ['monteCarlo.presets.presetAllStockDCA', [{ ticker: 'VTI', weight: 100 }], 30, 1000, 50000, 1, 5],
  [
    'monteCarlo.presets.presetThreeFund',
    [
      { ticker: 'VTI', weight: 50 },
      { ticker: 'VXUS', weight: 30 },
      { ticker: 'BND', weight: 20 },
    ],
    25,
    500,
    200000,
    2,
    8,
  ],
];
export function buildPresets(t: McSetters): Array<{ label: string; onClick: () => void }> {
  return PRESETS.map(([labelKey, assets, years, sims, value, min, max]) => ({
    label: i18n.t(labelKey),
    onClick: () => {
      t.setPortfolioMode(1);
      t.setPortfolios([{ ...createDefaultPortfolio(1), assets }]);
      t.setNumYears(years);
      t.setNumSimulations(sims);
      t.setStartingValue(value);
      t.setMinBlock(min);
      t.setMaxBlock(max);
    },
  }));
}
function usePortfolioOperations(
  portfolios: PortfolioState[],
  setPortfolios: (v: PortfolioState[]) => void,
) {
  const updatePortfolio = (idx: number, patch: Partial<PortfolioState>) =>
    setPortfolios(portfolios.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  const addAsset = (pIdx: number) =>
    updatePortfolio(pIdx, { assets: [...portfolios[pIdx].assets, { ticker: '', weight: 0 }] });
  const removeAsset = (pIdx: number, aIdx: number) =>
    updatePortfolio(pIdx, { assets: portfolios[pIdx].assets.filter((_, i) => i !== aIdx) });
  const updateAsset = (
    pIdx: number,
    aIdx: number,
    field: 'ticker' | 'weight',
    val: string | number,
  ) =>
    updatePortfolio(pIdx, {
      assets: portfolios[pIdx].assets.map((a, i) => (i === aIdx ? { ...a, [field]: val } : a)),
    });
  const getTotalWeight = (pIdx: number) =>
    portfolios[pIdx].assets.reduce((s, a) => s + (a.weight || 0), 0);
  const isComplete = (pIdx: number) => getTotalWeight(pIdx) === 100;
  return { updatePortfolio, addAsset, removeAsset, updateAsset, getTotalWeight, isComplete };
}
const validatePortfolios = (
  portfolios: PortfolioState[],
  portfolioMode: PortfolioMode,
  isComplete: (pIdx: number) => boolean,
): string | null =>
  validatePortfolioCore(portfolios, {
    limit: portfolioMode,
    emptyTickerMode: 'lenient',
    isWeightComplete: isComplete,
    onError: (idx, key) =>
      key === 'emptyTicker'
        ? i18n.t('Portfolio {{index}}: please add at least one ticker', { index: idx + 1 })
        : i18n.t('Portfolio {{index}}: weights must sum to 100%', { index: idx + 1 }),
  });
async function fetchMcResult(
  idx: number,
  portfolios: PortfolioState[],
  reqBody: {
    parameters: Record<string, unknown> | BacktestParameters;
    mcParams: Record<string, unknown>;
    objectives: Record<string, unknown>;
  },
): Promise<MonteCarloResult> {
  const p = portfolios[idx];
  const res = await apiFetch('/api/v1/backtest/monte-carlo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      portfolio: {
        name: p.name,
        assets: p.assets.filter((a) => a.ticker.trim()),
        rebalanceFrequency: p.rebalanceFrequency,
      },
      ...reqBody,
    }),
  });
  if (!res.ok) throw new Error(i18n.t('Simulation failed') + ' ' + (idx + 1));
  const json = await res.json();
  if (json.success === false) throw new Error(json.error || i18n.t('Simulation failed'));
  return json.data ?? json;
}
const MC_INITIAL = {
  portfolioMode: 1 as PortfolioMode,
  numYears: 20,
  numSimulations: 500,
  startingValue: 100000,
  minBlock: 1,
  maxBlock: 5,
  startDate: DEFAULT_BACKTEST_START_DATE,
  endDate: DEFAULT_END_DATE,
  randomSeed: '',
  isLoading: false,
  error: null as string | null,
  results1: null as MonteCarloResult | null,
  results2: null as MonteCarloResult | null,
  activeTab: 'summary' as ResultTab,
  distMetric: 'finalValue' as DistMetric,
  portfolios: [createDefaultPortfolio(1), createDefaultPortfolio(2)],
  simMode: 'standard' as SimMode,
  goal1: 'maxCagrPercentile',
  goal2: 'minMaxDrawdown',
  goalWeight: 50,
};
function useMcSetters(): typeof MC_INITIAL & {
  [K in keyof typeof MC_INITIAL as `set${Capitalize<string & K>}`]: (
    v: (typeof MC_INITIAL)[K],
  ) => void;
} {
  return useSetterState(MC_INITIAL);
}
type McSetters = ReturnType<typeof useMcSetters>;
type PortfolioOps = ReturnType<typeof usePortfolioOperations>;
async function executeSimulation(s: McSetters, ops: PortfolioOps): Promise<void> {
  const validationError = validatePortfolios(s.portfolios, s.portfolioMode, ops.isComplete);
  if (validationError) {
    s.setError(validationError);
    return;
  }
  s.setIsLoading(true);
  s.setError(null);
  // 保留上一次结果，失败仅展示错误横幅
  const reqBody = {
    parameters: buildBacktestParameters(s.startDate, s.endDate, {
      startingValue: s.startingValue,
      adjustForInflation: false,
      baseCurrency: 'usd',
    }),
    mcParams: {
      numYears: s.numYears,
      numSimulations: s.numSimulations,
      minBlockYears: s.minBlock,
      maxBlockYears: s.maxBlock,
      seed: s.randomSeed ? Number(s.randomSeed) : undefined,
    },
    objectives: {
      mode: s.simMode,
      goal1: s.goal1,
      goal2: s.goal2,
      goal1Weight: s.goalWeight / 100,
      goal2Weight: (100 - s.goalWeight) / 100,
    },
  };
  try {
    const fetch = (idx: number) => fetchMcResult(idx, s.portfolios, reqBody);
    const [r1, r2] = await Promise.all(s.portfolioMode === 2 ? [fetch(0), fetch(1)] : [fetch(0)]);
    s.setResults1(r1);
    if (r2) s.setResults2(r2);
  } catch (e) {
    s.setError(e instanceof Error ? e.message : i18n.t('Simulation failed'));
  } finally {
    s.setIsLoading(false);
  }
}
export function useMonteCarloState() {
  const s = useMcSetters();
  const ops = usePortfolioOperations(s.portfolios, s.setPortfolios);
  return { ...s, ...ops, runSimulation: () => executeSimulation(s, ops) };
}
export type McState = ReturnType<typeof useMonteCarloState>;
const DIST_METRICS: Array<{ key: DistMetric; labelKey: string; format: (v: number) => string }> = [
  { key: 'finalValue', labelKey: 'lumpSumDca.stats.finalValue', format: fmtAmount },
  { key: 'cagr', labelKey: 'stats.cagr', format: fmtPct },
  { key: 'maxDrawdown', labelKey: 'Max Drawdown', format: fmtPct },
  { key: 'volatility', labelKey: 'Volatility', format: fmtPct },
  { key: 'sharpe', labelKey: 'backtest.sharpeRatio', format: fmtNum },
  { key: 'sortino', labelKey: 'lumpSumDca.stats.sortino', format: fmtNum },
];
export const metricLabels = (t: TFunction) =>
  Object.fromEntries(DIST_METRICS.map((m) => [m.key, t(m.labelKey)])) as Record<DistMetric, string>;
export const METRIC_FORMAT = Object.fromEntries(
  DIST_METRICS.map((m) => [m.key, m.format]),
) as Record<DistMetric, (v: number) => string>;
const SUMMARY_QUANTILES: Array<[string, number]> = [
  ['Min', 0],
  ['P10', 0.1],
  ['P25', 0.25],
  ['P50', 0.5],
  ['Mean', -1],
  ['P75', 0.75],
  ['P90', 0.9],
  ['Max', 1],
];
export const SUMMARY_STATS = SUMMARY_QUANTILES.map(([name]) => name).concat('Std');
export interface FanDataPoint {
  month: number;
  band5_95: [number, number];
  band25_75: [number, number];
  p50: number;
}
export function buildFanChartData(r: MonteCarloResult, startingValue: number): FanDataPoint[] {
  const { p5, p25, p50, p75, p95 } = r.percentiles;
  if (!p5 || p5.length === 0) return [];
  return sampleMonths(p5.length).map(({ day, month }) => ({
    month,
    band5_95: [p5[day] * startingValue, p95[day] * startingValue],
    band25_75: [p25[day] * startingValue, p75[day] * startingValue],
    p50: p50[day] * startingValue,
  }));
}
export function buildTerminalHistogram(r: MonteCarloResult, startingValue: number) {
  const metrics = r.perPathMetrics;
  if (!metrics || metrics.length === 0) {
    return { data: [], p5Val: 0, p50Val: 0, p95Val: 0, p5Label: '', p50Label: '', p95Label: '' };
  }
  const vals = metrics.map((m) => m.finalValue * startingValue);
  const { bins, labelFor } = buildBinData(vals, 25, dollarKFormatter);
  const p5Val = percentile(vals, 0.05);
  const p50Val = percentile(vals, 0.5);
  const p95Val = percentile(vals, 0.95);
  return {
    data: bins,
    p5Val,
    p50Val,
    p95Val,
    p5Label: labelFor(p5Val),
    p50Label: labelFor(p50Val),
    p95Label: labelFor(p95Val),
  };
}
export const monthFormatter = (v: number) => (Number.isInteger(v / 12) ? `${v / 12}y` : '');
export const dollarKFormatter = (v: number) => `$${(v / 1000).toFixed(0)}k`;
export const yearLabelFormatter = (t: TFunction, l: number) => `${(l / 12).toFixed(1)} ${t('y')}`;
function sampleMonths(len: number) {
  const out = [{ day: 0, month: 0 }];
  for (let day = 0, month = 1; day < len - 1; month++) {
    day = Math.min(day + 21, len - 1);
    out.push({ day, month });
  }
  return out;
}
function buildBinData(vals: number[], binCount: number, formatBin: (v: number) => string) {
  const min = Math.min(...vals);
  const binWidth = (Math.max(...vals) - min) / binCount || 1;
  const bins = Array.from({ length: binCount }, (_, i) => ({
    range: formatBin(min + i * binWidth),
    count: 0,
    minVal: min + i * binWidth,
  }));
  for (const v of vals) {
    bins[Math.min(binCount - 1, Math.max(0, Math.floor((v - min) / binWidth)))].count++;
  }
  const labelFor = (val: number) => formatBin(Math.floor((val - min) / binWidth) * binWidth + min);
  return { bins, labelFor };
}
const BIN_FORMATTERS: Record<DistMetric, (v: number) => string> = {
  finalValue: dollarKFormatter,
  cagr: (v) => fmtPct(v, 1),
  maxDrawdown: (v) => fmtPct(v, 1),
  volatility: (v) => fmtPct(v, 1),
  sharpe: fmtNum,
  sortino: fmtNum,
};
const metricValues = (metrics: PerPathMetrics[], metric: DistMetric, startingValue: number) =>
  metric === 'finalValue'
    ? metrics.map((m) => m.finalValue * startingValue)
    : metrics.map((m) => m[metric]);
export function buildSummaryData(r: MonteCarloResult, startingValue: number, t: TFunction) {
  const metrics = r.perPathMetrics;
  if (!metrics || metrics.length === 0) return null;
  const labels = metricLabels(t);
  return (Object.keys(METRIC_FORMAT) as DistMetric[]).map((key) => {
    const vals = metricValues(metrics, key, startingValue);
    const p = (frac: number) => percentile(vals, frac);
    const m = mean(vals);
    const s = std(vals);
    const fmt = METRIC_FORMAT[key];
    const values: Record<string, string> = { Std: key === 'finalValue' ? fmtAmount(s) : fmtNum(s) };
    for (const [name, frac] of SUMMARY_QUANTILES) {
      values[name] = fmt(
        frac === -1 ? m : frac === 0 ? Math.min(...vals) : frac === 1 ? Math.max(...vals) : p(frac),
      );
    }
    return { metric: labels[key], key, values };
  });
}
export function buildSuccessData(r: MonteCarloResult) {
  const sp = r.successProbabilities;
  if (!sp || !sp.survival || sp.survival.length === 0) return [];
  return sp.survival.map((_, i) => ({
    year: i + 1,
    survival: Number((sp.survival[i] * 100).toFixed(1)),
    capitalPreservation: Number((sp.capitalPreservation[i] * 100).toFixed(1)),
    profit: Number((sp.profit[i] * 100).toFixed(1)),
  }));
}
export function buildDistHistogram(
  metrics: PerPathMetrics[],
  metric: DistMetric,
  startingValue: number,
) {
  const vals = metricValues(metrics, metric, startingValue);
  if (vals.length === 0) return { data: [], medianLabel: '', meanLabel: '' };
  const { bins, labelFor } = buildBinData(vals, 40, BIN_FORMATTERS[metric]);
  const medianVal = percentile(vals, 0.5);
  const meanVal = mean(vals);
  return {
    data: bins,
    medianLabel: labelFor(medianVal),
    meanLabel: labelFor(meanVal),
    medianVal,
    meanVal,
  };
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
      worst: rp.worst[i] * startingValue,
    })),
  };
}
