/**
 * 测试辅助：backtestStore factory + Portfolio / BacktestParams fixtures
 *
 * 保留 mockPortfolio / mockBacktestParams / mockPortfolioResult / mockBacktestResult。
 * Phase 5.6 已删除 mockEmptyBacktestResult + mockStatistics（已内联到 mockPortfolioResult）。
 * 2026-07 合并 routeFixtures.ts：新增 createMockPriceData（路由测试 mock 价格工厂）。
 *
 * 用法：
 *   import { mockPortfolio, mockBacktestParams, mockBacktestResult, createMockPriceData } from '../helpers/storeFixtures.js';
 *   useBacktestStore.getState().loadFromShare({
 *     portfolios: [mockPortfolio()],
 *     parameters: mockBacktestParams(),
 *   });
 *   const priceData = createMockPriceData({ numDays: 30, startPrice: 301 });
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

/**
 * createMockPriceData 配置选项（合并自 routeFixtures.ts）
 */
export interface MockPriceDataOptions {
  /** 生成天数（默认 2）
   * 对应原 backtest-optimizer-routes（2 天）/tactical-routes（3 天）/tactical-grid-routes（30 天）
   */
  numDays?: number;
  /** 第 0 天起始价（默认 300），第 i 天价格为 startPrice + i */
  startPrice?: number;
  /** 标的 ticker（默认 'SPY'） */
  ticker?: string;
}

/**
 * 构造 mock 价格数据 `{ ticker: { 'YYYY-MM-DD': price } }`
 *
 * 默认生成 SPY 2020-01-01..2020-01-02 两天数据，价格为 300/301。
 * 通过 opts 可调整天数、起始价与 ticker。
 *
 * 日期固定 '2020-01-DD' 模式（DD 从 01 递增到 numDays），与原 3 处实现保持一致。
 *
 * @param opts - 配置选项，见 MockPriceDataOptions
 * @returns `{ [ticker]: { [date]: price } }` 形式的 mock 数据
 */
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
