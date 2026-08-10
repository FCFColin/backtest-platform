import type { Portfolio, BacktestParameters } from '@backtest/shared';
import type { BacktestResult, PortfolioResult } from '../../packages/shared/types/backtest.js';

export function mockPortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return {
    id: 'p1',
    name: 'Portfolio 1',
    assets: [
      { ticker: 'VTI', weight: 60 },
      { ticker: 'BND', weight: 40 },
    ],
    rebalanceFrequency: 'quarterly',
    ...overrides,
  };
}

export function mockBacktestParams(
  overrides: Partial<BacktestParameters> = {},
): BacktestParameters {
  return {
    startDate: '2010-01-01',
    endDate: '2024-12-31',
    startingValue: 10000,
    adjustForInflation: false,
    rollingWindowMonths: 12,
    benchmarkTicker: 'SPY',
    ...overrides,
  };
}

export function mockPortfolioResult(overrides: Partial<PortfolioResult> = {}): PortfolioResult {
  return {
    name: 'Test',
    growthCurve: [{ date: '2020-01-02', value: 10000 }],
    drawdownCurve: [{ date: '2020-01-02', drawdown: 0 }],
    rollingReturns: [],
    annualReturns: [],
    monthlyReturns: [],
    statistics: {
      cagr: 0.069,
      stdev: 0.12,
      sharpe: 0.47,
      sortino: 0.6,
      maxDrawdown: 0.228,
      maxDrawdownDuration: 8,
      mwrr: 0.07,
      bestYear: 0.15,
      worstYear: -0.05,
    },
    ...overrides,
  };
}

export const mockBacktestStats: BacktestResult['portfolios'][number]['statistics'] = {
  cagr: 0.1,
  mwrr: 0.1,
  stdev: 0.15,
  sharpe: 1.5,
  sortino: 1.8,
  maxDrawdown: 0.15,
  maxDrawdownDuration: 30,
  bestYear: 0.2,
  worstYear: -0.1,
  totalReturn: 0.2,
};

export function mockBacktestResult(overrides: Partial<BacktestResult> = {}): BacktestResult {
  return {
    portfolios: [mockPortfolioResult()],
    correlations: [[1]],
    benchmarkGrowth: [],
    ...overrides,
  };
}

interface MockPriceDataOptions {
  numDays?: number;
  startPrice?: number;
  ticker?: string;
}

export function createMockPriceData(
  opts: MockPriceDataOptions = {},
): Record<string, Record<string, number>> {
  const { numDays = 2, startPrice = 300, ticker = 'SPY' } = opts;
  const data: Record<string, number> = {};
  for (let i = 0; i < numDays; i++) {
    const day = String(i + 1).padStart(2, '0');
    data[`2020-01-${day}`] = startPrice + i;
  }
  return { [ticker]: data };
}
