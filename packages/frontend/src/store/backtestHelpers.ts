import i18n from '../i18n/index.js';
import type {
  BacktestResult,
  Portfolio,
  Asset,
  BacktestParameters,
  Statistics,
} from '@backtest/shared';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { validatePortfolioCore } from '@/utils/validation';
import { getErrorI18nKey, reportError } from '../utils/errorReporter.js';
import { useToastStore } from './toastStore.js';
import { findPresetPortfolio } from './presetPortfolios.js';
export function extractApiErrorDetail(json: unknown): string {
  if (!json || typeof json !== 'object')
    return i18n.t('Backtest failed. Please check ticker symbols and parameters.');
  const body = json as Record<string, unknown>;
  if (typeof body.detail === 'string' && body.detail) return body.detail;
  const err = body.error;
  if (typeof err === 'string' && err) return err;
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (typeof e.detail === 'string' && e.detail) return e.detail;
    const code = typeof e.code === 'string' ? e.code : undefined;
    if (code) return i18n.t(getErrorI18nKey(code));
  }
  return i18n.t('Backtest failed. Please check ticker symbols and parameters.');
}
export function normalizeBacktestResult(raw: unknown): BacktestResult {
  const data = (raw && typeof raw === 'object' ? raw : {}) as BacktestResult;
  const emptyStats = {} as Statistics;
  return {
    ...data,
    portfolios: (Array.isArray(data.portfolios) ? data.portfolios : []).map((p) => ({
      ...p,
      growthCurve: p.growthCurve ?? [],
      drawdownCurve: p.drawdownCurve ?? [],
      annualReturns: p.annualReturns ?? [],
      monthlyReturns: p.monthlyReturns ?? [],
      rollingReturns: p.rollingReturns ?? [],
      allocationHistory: p.allocationHistory ?? [],
      drawdownEpisodes: p.drawdownEpisodes ?? [],
      statistics: p.statistics ?? emptyStats,
    })),
    correlations: data.correlations ?? [],
    assetTickers: data.assetTickers ?? [],
    assetCorrelations: data.assetCorrelations ?? [],
    benchmarkGrowth: data.benchmarkGrowth ?? [],
  };
}
export const defaultParameters: BacktestParameters = {
  startDate: DEFAULT_BACKTEST_START_DATE,
  endDate: DEFAULT_END_DATE,
  startingValue: 10000,
  baseCurrency: 'usd',
  adjustForInflation: false,
  rollingWindowMonths: 12,
  benchmarkTicker: 'SPY',
  cashflowLegs: [],
  oneTimeCashflows: [],
};
export const createEmptyPortfolio = (counter: number): Portfolio => {
  const now = Date.now();
  return {
    id: `portfolio-${now}-${counter}`,
    name: `Portfolio ${counter}`,
    assets: [
      { id: `asset-${now}-0`, ticker: '', weight: 0 },
      { id: `asset-${now}-1`, ticker: '', weight: 0 },
      { id: `asset-${now}-2`, ticker: '', weight: 0 },
    ],
    rebalanceFrequency: 'quarterly',
    rebalanceOffset: 0,
    drag: 0,
  };
};
export const toAssetsWithIds = (
  assets: { ticker: string; weight: number }[],
  now = Date.now(),
): Asset[] =>
  assets.map((a, idx) => ({ id: `asset-${now}-${idx}`, ticker: a.ticker, weight: a.weight }));
export const createPortfolioFromPreset = (presetId: string, counter: number): Portfolio => {
  const preset = findPresetPortfolio(presetId);
  if (!preset) {
    throw new Error(`Unknown portfolio preset: ${presetId}`);
  }
  const now = Date.now();
  return {
    id: `portfolio-${now}-${counter}`,
    name: i18n.t(preset.nameKey),
    assets: toAssetsWithIds(preset.assets, now),
    rebalanceFrequency: preset.rebalanceFrequency ?? 'quarterly',
    rebalanceOffset: 0,
    drag: 0,
  };
};
export function validatePortfolios(portfolios: Portfolio[]): string | null {
  return validatePortfolioCore(portfolios, {
    emptyTickerMode: 'strict',
    passStrategy: 'two-pass',
    isWeightComplete: (idx) => {
      const tw = portfolios[idx].assets.reduce((s, a) => s + a.weight, 0);
      return Math.abs(tw - 100) <= 0.01;
    },
    onError: (idx, key, total) =>
      key === 'emptyTicker'
        ? i18n.t('Some ticker symbols are empty. Please fill them in before running.')
        : i18n.t('{{name}} weights sum to {{total}}%, should be 100%', {
            name: portfolios[idx].name,
            total: total.toFixed(2),
          }),
  });
}
const PORTFOLIO_BODY_KEYS = [
  'name',
  'assets',
  'rebalanceFrequency',
  'rebalanceThreshold',
  'rebalanceOffset',
  'rebalanceBands',
  'drag',
  'isGlidepath',
  'glidepathToWeights',
  'glidepathYears',
] as const;
export function buildBacktestRequestBody(portfolios: Portfolio[], parameters: BacktestParameters) {
  return {
    portfolios: portfolios.map((p) =>
      Object.fromEntries(PORTFOLIO_BODY_KEYS.map((k) => [k, p[k]])),
    ),
    parameters,
  };
}
export function handleBacktestError(error: unknown): string {
  reportError(error, { component: 'backtestStore', action: 'handleBacktestError' });
  const isAbort = error instanceof DOMException && error.name === 'AbortError';
  const msg = isAbort
    ? i18n.t('Backtest request timed out. Please try again later.')
    : error instanceof TypeError
      ? i18n.t('Network connection failed. Please check if the backend is running.')
      : (error instanceof Error && error.message) ||
        i18n.t('Backtest failed. Please check ticker symbols and parameters.');
  useToastStore.getState().addToast('error', msg);
  return msg;
}
export function cancellableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const timeoutId = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
