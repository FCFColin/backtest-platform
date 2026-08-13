import type { BacktestParameters, Portfolio } from '@backtest/shared';
import { mockPortfolio as baseMockPortfolio } from './storeFixtures.js';

export const mockParameters: BacktestParameters = {
  startDate: '2020-01-02',
  endDate: '2020-12-31',
  startingValue: 10000,
  adjustForInflation: false,
  rollingWindowMonths: 12,
  benchmarkTicker: 'SPY',
};

export function mockPortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return baseMockPortfolio({
    name: 'Test Portfolio',
    assets: [
      { ticker: 'AAPL', weight: 60 },
      { ticker: 'BND', weight: 40 },
    ],
    rebalanceFrequency: 'monthly',
    ...overrides,
  });
}
