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
import { getErrorI18nKey } from '../utils/errorI18nMap.js';

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

/**
 * 创建一个空的投资组合（预置3个空资产行供用户填写）。
 * @param counter - 组合计数器
 * @returns 含3个空资产行的 Portfolio 对象
 */
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

/** 预设组合中的单项资产配置 */
export interface PortfolioPresetAsset {
  ticker: string;
  weight: number;
}

/** 预设组合定义 */
export interface PortfolioPreset {
  id: string;
  labelKey: string;
  descriptionKey: string;
  assets: PortfolioPresetAsset[];
  rebalanceFrequency: RebalanceFrequency;
}

/** 内置经典资产配置预设清单（i18n key 在 `portfolio.preset.<id>.{label,description}` 下） */
export const PORTFOLIO_PRESETS: readonly PortfolioPreset[] = [
  {
    id: '60-40',
    labelKey: 'portfolio.preset.60-40.label',
    descriptionKey: 'portfolio.preset.60-40.description',
    assets: [
      { ticker: 'VTI', weight: 60 },
      { ticker: 'BND', weight: 40 },
    ],
    rebalanceFrequency: 'quarterly',
  },
  {
    id: '80-20',
    labelKey: 'portfolio.preset.80-20.label',
    descriptionKey: 'portfolio.preset.80-20.description',
    assets: [
      { ticker: 'VTI', weight: 80 },
      { ticker: 'BND', weight: 20 },
    ],
    rebalanceFrequency: 'quarterly',
  },
  {
    id: '40-60',
    labelKey: 'portfolio.preset.40-60.label',
    descriptionKey: 'portfolio.preset.40-60.description',
    assets: [
      { ticker: 'VTI', weight: 40 },
      { ticker: 'BND', weight: 60 },
    ],
    rebalanceFrequency: 'quarterly',
  },
  {
    id: 'three-fund',
    labelKey: 'portfolio.preset.three-fund.label',
    descriptionKey: 'portfolio.preset.three-fund.description',
    assets: [
      { ticker: 'VTI', weight: 50 },
      { ticker: 'VXUS', weight: 30 },
      { ticker: 'BND', weight: 20 },
    ],
    rebalanceFrequency: 'quarterly',
  },
  {
    id: 'all-weather',
    labelKey: 'portfolio.preset.all-weather.label',
    descriptionKey: 'portfolio.preset.all-weather.description',
    assets: [
      { ticker: 'VTI', weight: 30 },
      { ticker: 'TLT', weight: 40 },
      { ticker: 'GLD', weight: 15 },
      { ticker: 'DBC', weight: 15 },
    ],
    rebalanceFrequency: 'quarterly',
  },
  {
    id: 'permanent',
    labelKey: 'portfolio.preset.permanent.label',
    descriptionKey: 'portfolio.preset.permanent.description',
    assets: [
      { ticker: 'VTI', weight: 25 },
      { ticker: 'TLT', weight: 25 },
      { ticker: 'GLD', weight: 25 },
      { ticker: 'SHV', weight: 25 },
    ],
    rebalanceFrequency: 'quarterly',
  },
];

/**
 * 根据预设 ID 创建投资组合（名称取自 i18n labelKey，资产 id 含 Date.now() 保证唯一）。
 * @param presetId - PORTFOLIO_PRESETS 中某一项的 id
 * @param counter - 组合计数器，用于生成组合 id
 * @returns 与预设配置匹配的 Portfolio 对象
 * @throws 当 presetId 不匹配任何预设时抛出 Error
 */
export const createPortfolioFromPreset = (presetId: string, counter: number): Portfolio => {
  const preset = PORTFOLIO_PRESETS.find((p) => p.id === presetId);
  if (!preset) {
    throw new Error(`Unknown portfolio preset: ${presetId}`);
  }
  const now = Date.now();
  return {
    id: `portfolio-${now}-${counter}`,
    name: i18n.t(preset.labelKey),
    assets: preset.assets.map((a, idx) => ({
      id: `asset-${now}-${idx}`,
      ticker: a.ticker,
      weight: a.weight,
    })),
    rebalanceFrequency: preset.rebalanceFrequency,
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
