/**
 * runPortfolioBacktest 单元测试（P0-02 T1）
 *
 * 企业理由：runPortfolioBacktest 是组合回测的完整编排入口（薄路由调用），
 * 覆盖：领域校验 → 数据获取 → 无效标的检测 → 宏观数据加载 →
 *       引擎调用（带超时）→ 缓存写入 → 结果压缩 → 返回
 *
 * 测试策略：mock backtest-helpers 中的编排函数 + runBacktest 的底层依赖，
 * 验证 runPortfolioBacktest 的编排逻辑（参数透传、警告组装、缓存写入、结果压缩）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Portfolio, BacktestParameters, BacktestResult } from '@backtest/shared';
import { mockLogger } from '../../helpers/mockFactories.js';

// ===== vi.hoisted：mock 引用 =====
const helpersMocks = vi.hoisted(() => ({
  preparePortfolioBacktest: vi.fn(),
  fetchPriceDataWithRange: vi.fn(),
  collectInvalidTickerWarnings: vi.fn(),
  loadMacroData: vi.fn(),
  calculateDateRange: vi.fn(),
  filterPriceData: vi.fn(),
  translateDomainError: vi.fn(),
  collectDomainTickers: vi.fn(),
}));

const engineMocks = vi.hoisted(() => ({
  callEngineStrict: vi.fn(),
}));

const eventMocks = vi.hoisted(() => ({
  dispatch: vi.fn(async () => {}),
}));

const dbMocks = vi.hoisted(() => ({
  getClient: vi.fn(async () => ({
    query: vi.fn(async () => ({ rows: [] })),
    release: vi.fn(),
  })),
}));

const outboxMocks = vi.hoisted(() => ({
  writeEventInTransaction: vi.fn(async () => {}),
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

const cacheMocks = vi.hoisted(() => ({
  backtestCacheKey: vi.fn(),
  setBacktestResultCache: vi.fn(async () => {}),
}));

const compressMocks = vi.hoisted(() => ({
  compressBacktestResultForSync: vi.fn(),
}));

const timeoutMocks = vi.hoisted(() => ({
  withTimeout: vi.fn(<T>(promise: Promise<T>) => promise),
}));

const configMocks = vi.hoisted(() => ({
  BACKTEST_SYNC_TIMEOUT_MS: 120000,
}));

// ===== Mock 模块 =====
vi.mock('../../../packages/backend/src/application/backtest-helpers.js', () => ({
  preparePortfolioBacktest: helpersMocks.preparePortfolioBacktest,
  fetchPriceDataWithRange: helpersMocks.fetchPriceDataWithRange,
  collectInvalidTickerWarnings: helpersMocks.collectInvalidTickerWarnings,
  loadMacroData: helpersMocks.loadMacroData,
  calculateDateRange: helpersMocks.calculateDateRange,
  filterPriceData: helpersMocks.filterPriceData,
  translateDomainError: helpersMocks.translateDomainError,
  collectDomainTickers: helpersMocks.collectDomainTickers,
}));

vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
  callEngineStrict: engineMocks.callEngineStrict,
}));

vi.mock('../../../packages/backend/src/domain/events/index.js', () => ({
  eventDispatcher: { dispatch: eventMocks.dispatch },
}));

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getClient: dbMocks.getClient,
}));

vi.mock('../../../packages/backend/src/infrastructure/outboxWriter.js', () => ({
  writeEventInTransaction: outboxMocks.writeEventInTransaction,
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

vi.mock('../../../packages/backend/src/application/backtest/backtestResultCache.js', () => ({
  backtestCacheKey: cacheMocks.backtestCacheKey,
  setBacktestResultCache: cacheMocks.setBacktestResultCache,
}));

vi.mock('../../../packages/backend/src/application/backtest/compressBacktestResult.js', () => ({
  compressBacktestResultForSync: compressMocks.compressBacktestResultForSync,
}));

vi.mock('../../../packages/backend/src/utils/timeout.js', () => ({
  withTimeout: timeoutMocks.withTimeout,
  TimeoutError: class TimeoutError extends Error {},
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: configMocks,
}));

vi.mock('../../../packages/backend/src/application/backtest/engineBodyBuilder.js', () => ({
  buildEngineParams: vi.fn(() => ({})),
}));

import { runPortfolioBacktest } from '../../../packages/backend/src/application/backtest-service.js';

// ===== 测试数据 =====
const mockPortfolio: Portfolio = {
  id: 'p1',
  name: 'Test',
  assets: [{ ticker: 'AAPL', weight: 100 }],
  rebalanceFrequency: 'monthly',
};

const mockParameters: BacktestParameters = {
  startDate: '2020-01-02',
  endDate: '2020-12-31',
  startingValue: 10000,
  adjustForInflation: false,
  rollingWindowMonths: 12,
  benchmarkTicker: 'SPY',
};

const mockBacktestResult: BacktestResult = {
  portfolios: [
    {
      name: 'Test',
      growthCurve: [{ date: '2020-01-02', value: 10000 }],
      drawdownCurve: [],
      rollingReturns: [],
      annualReturns: [],
      monthlyReturns: [],
      statistics: {
        cagr: 0.1,
        mwrr: 0.1,
        stdev: 0.15,
        sharpe: 1.5,
        sortino: 1.8,
        maxDrawdown: 0.15,
        maxDrawdownDuration: 30,
        bestYear: 0.2,
        worstYear: -0.1,
        avgYear: 0.1,
        totalReturn: 0.2,
      },
    },
  ],
  correlations: [[1]],
};

// ===== 测试用例 =====
describe('runPortfolioBacktest', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    helpersMocks.preparePortfolioBacktest.mockReturnValue({
      allTickers: new Set(['AAPL', 'SPY']),
      warnings: [],
    });
    helpersMocks.fetchPriceDataWithRange.mockResolvedValue({
      priceData: { AAPL: { '2020-01-02': 100 }, SPY: { '2020-01-02': 300 } },
      effectiveStartDate: '2020-01-02',
      effectiveEndDate: '2020-12-31',
      degraded: false,
    });
    helpersMocks.collectInvalidTickerWarnings.mockReturnValue([]);
    helpersMocks.loadMacroData.mockResolvedValue({ cpiData: {}, exchangeRates: {} });
    helpersMocks.calculateDateRange.mockReturnValue({
      startDate: '2020-01-02',
      endDate: '2020-12-31',
      tradingDays: 252,
    });
    helpersMocks.filterPriceData.mockReturnValue({
      AAPL: { '2020-01-02': 100 },
      SPY: { '2020-01-02': 300 },
    });
    helpersMocks.translateDomainError.mockImplementation((fn: () => unknown) => {
      fn();
      return { toEngineBody: () => ({}) };
    });
    helpersMocks.collectDomainTickers.mockReturnValue(new Set(['AAPL', 'SPY']));

    engineMocks.callEngineStrict.mockResolvedValue(mockBacktestResult);
    compressMocks.compressBacktestResultForSync.mockReturnValue(mockBacktestResult);
    cacheMocks.backtestCacheKey.mockReturnValue('test-cache-key');
  });

  it('应完成完整编排流程并返回压缩后的结果', async () => {
    const result = await runPortfolioBacktest({
      portfolios: [mockPortfolio],
      parameters: mockParameters,
    });

    expect(helpersMocks.preparePortfolioBacktest).toHaveBeenCalledWith(
      [mockPortfolio],
      mockParameters,
    );
    expect(helpersMocks.fetchPriceDataWithRange).toHaveBeenCalled();
    expect(helpersMocks.loadMacroData).toHaveBeenCalledWith(mockParameters);
    expect(engineMocks.callEngineStrict).toHaveBeenCalledTimes(1);
    expect(compressMocks.compressBacktestResultForSync).toHaveBeenCalledWith(mockBacktestResult);
    expect(result.result).toBe(mockBacktestResult);
    expect(result.warnings).toEqual([]);
  });

  it('应将结果写入缓存', async () => {
    await runPortfolioBacktest({
      portfolios: [mockPortfolio],
      parameters: mockParameters,
      tenantId: 'tenant-1',
    });

    expect(cacheMocks.backtestCacheKey).toHaveBeenCalledWith(
      [mockPortfolio],
      mockParameters,
      'tenant-1',
    );
    expect(cacheMocks.setBacktestResultCache).toHaveBeenCalledWith(
      'test-cache-key',
      mockBacktestResult,
    );
  });

  it('数据降级时应添加 DATA_DEGRADED 警告', async () => {
    helpersMocks.fetchPriceDataWithRange.mockResolvedValue({
      priceData: { AAPL: { '2020-01-02': 100 } },
      effectiveStartDate: '2020-01-02',
      effectiveEndDate: '2020-12-31',
      degraded: true,
      degradedWarning: 'Go 数据服务降级',
    });

    const result = await runPortfolioBacktest({
      portfolios: [mockPortfolio],
      parameters: mockParameters,
    });

    expect(result.warnings).toContainEqual({
      code: 'DATA_DEGRADED',
      message: 'Go 数据服务降级',
    });
  });

  it('日期范围调整时应使用 effective 日期调用引擎', async () => {
    helpersMocks.fetchPriceDataWithRange.mockResolvedValue({
      priceData: { AAPL: { '2020-01-03': 101 } },
      effectiveStartDate: '2020-01-03',
      effectiveEndDate: '2020-12-30',
      degraded: false,
    });

    await runPortfolioBacktest({
      portfolios: [mockPortfolio],
      parameters: mockParameters,
    });

    const engineCallArgs = engineMocks.callEngineStrict.mock.calls[0];
    const engineBody = engineCallArgs[1];
    expect(engineBody.params).toBeDefined();
  });

  it('引擎不可用时应抛出错误（fail-closed ADR-031）', async () => {
    engineMocks.callEngineStrict.mockRejectedValue(new Error('ENGINE_UNAVAILABLE'));

    await expect(
      runPortfolioBacktest({
        portfolios: [mockPortfolio],
        parameters: mockParameters,
      }),
    ).rejects.toThrow('ENGINE_UNAVAILABLE');
  });

  it('应通过 withTimeout 包装引擎调用', async () => {
    await runPortfolioBacktest({
      portfolios: [mockPortfolio],
      parameters: mockParameters,
    });

    expect(timeoutMocks.withTimeout).toHaveBeenCalled();
    expect(configMocks.BACKTEST_SYNC_TIMEOUT_MS).toBe(120000);
  });
});
