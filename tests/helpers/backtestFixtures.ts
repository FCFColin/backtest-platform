import type { Portfolio, BacktestParameters } from '@backtest/shared';

/** 服务层测试共享的默认回测参数。 */
export const mockParameters: BacktestParameters = {
  startDate: '2020-01-02',
  endDate: '2020-12-31',
  startingValue: 10000,
  adjustForInflation: false,
  rollingWindowMonths: 12,
  benchmarkTicker: 'SPY',
};

/** 创建默认回测组合，可覆写任意字段。 */
export function mockPortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return {
    id: 'p1',
    name: 'Test Portfolio',
    assets: [
      { ticker: 'AAPL', weight: 60 },
      { ticker: 'BND', weight: 40 },
    ],
    rebalanceFrequency: 'monthly',
    ...overrides,
  };
}
