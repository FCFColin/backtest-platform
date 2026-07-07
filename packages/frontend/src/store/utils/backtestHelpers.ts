import i18n from '../../i18n/index.js';
import type { BacktestResult, Portfolio, BacktestParameters, Statistics } from '@backtest/shared';

export function extractApiErrorDetail(json: unknown): string {
  if (!json || typeof json !== 'object') return i18n.t('backtest.runFailed');
  const body = json as Record<string, unknown>;
  if (typeof body.detail === 'string') return body.detail;
  const err = body.error;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (typeof e.detail === 'string') return e.detail;
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
  startDate: '2010-01-01',
  endDate: '2024-12-31',
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

export function validatePortfolios(portfolios: Portfolio[]): string | null {
  const allAssets = portfolios.flatMap((p) => p.assets);
  if (allAssets.some((a) => !a.ticker.trim())) {
    return i18n.t('backtest.emptyTickerWarning');
  }
  for (const p of portfolios) {
    const tw = p.assets.reduce((s, a) => s + a.weight, 0);
    if (Math.abs(tw - 100) > 0.01) {
      return i18n.t('backtest.weightSumWarning', { name: p.name, total: tw.toFixed(2) });
    }
  }
  return null;
}
