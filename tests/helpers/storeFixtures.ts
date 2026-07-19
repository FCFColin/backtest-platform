/**
 * 测试辅助：backtestStore factory + Portfolio / BacktestParams fixtures
 *
 * 保留 mockPortfolio / mockBacktestParams / mockPortfolioResult / mockBacktestResult。
 * Phase 5.6 已删除 mockEmptyBacktestResult + mockStatistics（已内联到 mockPortfolioResult）。
 *
 * 用法：
 *   import { mockPortfolio, mockBacktestParams, mockBacktestResult } from '../helpers/storeFixtures.js';
 *   useBacktestStore.getState().loadFromShare({
 *     portfolios: [mockPortfolio()],
 *     parameters: mockBacktestParams(),
 *   });
 */

import type { Portfolio, BacktestParameters } from '@backtest/shared';
import type { BacktestResult, PortfolioResult } from '../../packages/shared/types/backtest.js';

/**
 * 创建组合 fixture（VTI 60% / BND 40% 季度再平衡）
 *
 * @param overrides - 覆盖默认字段
 * @returns 完整 Portfolio
 */
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

/**
 * 创建回测参数 fixture（2010-2024 全周期，1 万起始）
 *
 * @param overrides - 覆盖默认字段
 * @returns 完整 BacktestParameters
 */
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

/**
 * 创建单个组合回测结果 fixture
 *
 * statistics 字段使用固定默认值（cagr/stdev/sharpe/sortino 等）。
 *
 * @param overrides - 覆盖默认字段（如 name、growthCurve）
 * @returns 完整 PortfolioResult
 */
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
      avgYear: 0.07,
    },
    ...overrides,
  };
}

/**
 * 创建完整回测结果 fixture
 *
 * @param overrides - 覆盖默认字段（如 portfolios/correlations）
 * @returns 完整 BacktestResult
 */
export function mockBacktestResult(overrides: Partial<BacktestResult> = {}): BacktestResult {
  return {
    portfolios: [mockPortfolioResult()],
    correlations: [[1]],
    benchmarkGrowth: [],
    ...overrides,
  };
}
