import i18n from '../i18n/index.js';
import type {
  BacktestResult,
  Portfolio,
  BacktestParameters,
  Statistics,
  RebalanceFrequency,
} from '@backtest/shared';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { validatePortfolioCore } from '@/utils/validation';
import { getErrorI18nKey } from '../utils/errorReporter.js';
import { PRESET_PORTFOLIOS, findPresetPortfolio } from './presetPortfolios.js';
export function extractApiErrorDetail(json: unknown): string {
  if (!json || typeof json !== 'object') return i18n.t('backtest.runFailed');
  const body = json as Record<string, unknown>;
  if (typeof body.detail === 'string' && body.detail) return body.detail;
  const err = body.error;
  if (typeof err === 'string' && err) return err;
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (typeof e.detail === 'string' && e.detail) return e.detail;
    const code = typeof e.code === 'string' ? e.code : undefined;
    if (code) {
      return i18n.t(getErrorI18nKey(code));
    }
  }
  return i18n.t('backtest.runFailed');
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
  extendedWithdrawalStats: false,
  cashflowLegs: [],
  oneTimeCashflows: [],
};
export const createDefaultPortfolio = (counter: number): Portfolio => {
  return {
    id: `portfolio-${Date.now()}-${counter}`,
    name: `Portfolio ${counter}`,
    assets: [
      { id: `asset-${Date.now()}-1`, ticker: 'VTI', weight: 60 },
      { id: `asset-${Date.now()}-2`, ticker: 'BND', weight: 40 },
    ],
    rebalanceFrequency: 'quarterly',
    rebalanceOffset: 0,
    drag: 0,
    totalReturn: true,
  };
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
    totalReturn: true,
  };
};
export interface PortfolioPresetAsset {
  ticker: string;
  weight: number;
}
export interface PortfolioPreset {
  id: string;
  labelKey: string;
  descriptionKey: string;
  assets: PortfolioPresetAsset[];
  rebalanceFrequency: RebalanceFrequency;
}
// D1 合并：预设数据统一来自 store/presetPortfolios.ts（唯一权威源），
// 此处为兼容旧编辑器（components/PortfolioEditor.tsx）的派生视图。
export const PORTFOLIO_PRESETS: readonly PortfolioPreset[] = PRESET_PORTFOLIOS.map((p) => ({
  id: p.id,
  labelKey: p.nameKey,
  descriptionKey: p.descriptionKey,
  assets: p.assets,
  rebalanceFrequency: p.rebalanceFrequency ?? 'quarterly',
}));
export const createPortfolioFromPreset = (presetId: string, counter: number): Portfolio => {
  const preset = findPresetPortfolio(presetId);
  if (!preset) {
    throw new Error(`Unknown portfolio preset: ${presetId}`);
  }
  const now = Date.now();
  return {
    id: `portfolio-${now}-${counter}`,
    name: i18n.t(preset.nameKey),
    assets: preset.assets.map((a, idx) => ({
      id: `asset-${now}-${idx}`,
      ticker: a.ticker,
      weight: a.weight,
    })),
    rebalanceFrequency: preset.rebalanceFrequency ?? 'quarterly',
    rebalanceOffset: 0,
    drag: 0,
    totalReturn: true,
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
        ? i18n.t('backtest.emptyTickerWarning')
        : i18n.t('backtest.weightSumWarning', {
            name: portfolios[idx].name,
            total: total.toFixed(2),
          }),
  });
}
