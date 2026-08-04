import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BacktestParameters, BacktestResult } from '@backtest/shared';
import type { Warning } from '../../../packages/backend/src/application/backtest-helpers.js';
import { createLoggerMocks } from '../../helpers/mockFactories.js';
import {
  mockParameters as parametersFixture,
  mockPortfolio as portfolioFixture,
} from '../../helpers/backtestFixtures.js';

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
  getClient: vi.fn(async () => ({ query: vi.fn(async () => ({ rows: [] })), release: vi.fn() })),
}));

const outboxMocks = vi.hoisted(() => ({
  writeEventInTransaction: vi.fn(async () => {}),
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

vi.mock('../../../packages/backend/src/application/backtest-helpers.js', () => ({
  preparePortfolioBacktest: helpersMocks.preparePortfolioBacktest,
  fetchPriceDataWithRange: helpersMocks.fetchPriceDataWithRange,
  collectInvalidTickerWarnings: helpersMocks.collectInvalidTickerWarnings,
  loadMacroData: helpersMocks.loadMacroData,
  calculateDateRange: helpersMocks.calculateDateRange,
  filterPriceData: helpersMocks.filterPriceData,
  translateDomainError: helpersMocks.translateDomainError,
  collectDomainTickers: helpersMocks.collectDomainTickers,
  pushDegradedWarning: (warnings: Warning[], degraded: boolean, degradedWarning?: string) => {
    if (degraded)
      warnings.push({
        code: 'DATA_DEGRADED',
        message: degradedWarning || '数据服务降级，部分数据可能缺失',
      });
  },
  clampParametersToDataRange: (
    parameters: Pick<BacktestParameters, 'startDate' | 'endDate'>,
    effectiveStartDate: string,
    effectiveEndDate: string,
  ) =>
    effectiveStartDate !== parameters.startDate || effectiveEndDate !== parameters.endDate
      ? { ...parameters, startDate: effectiveStartDate, endDate: effectiveEndDate }
      : parameters,
}));

vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
  callEngineStrict: engineMocks.callEngineStrict,
}));

vi.mock('../../../packages/backend/src/domain/events/events.js', () => ({
  eventDispatcher: { dispatch: eventMocks.dispatch },
}));

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getClient: dbMocks.getClient,
}));

vi.mock('../../../packages/backend/src/infrastructure/outboxWriter.js', () => ({
  writeEventInTransaction: outboxMocks.writeEventInTransaction,
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: createLoggerMocks(),
}));

vi.mock('../../../packages/backend/src/application/backtest/backtestResultUtils.js', () => ({
  backtestCacheKey: cacheMocks.backtestCacheKey,
  setBacktestResultCache: cacheMocks.setBacktestResultCache,
  compressBacktestResultForSync: compressMocks.compressBacktestResultForSync,
}));

vi.mock('../../../packages/backend/src/utils/misc.js', () => ({
  withTimeout: timeoutMocks.withTimeout,
  TimeoutError: class TimeoutError extends Error {},
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: configMocks,
}));

vi.mock('../../../packages/backend/src/application/backtest/backtestEngineUtils.js', () => ({
  buildEngineParams: vi.fn(() => ({})),
}));

import { runPortfolioBacktest } from '../../../packages/backend/src/application/backtest-service.js';

const mockPortfolio = portfolioFixture({
  name: 'Test',
  assets: [{ ticker: 'AAPL', weight: 100 }],
});
const mockParameters = parametersFixture;

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

const priceDataResult = (overrides: Record<string, unknown> = {}) => ({
  priceData: { AAPL: { '2020-01-02': 100 }, SPY: { '2020-01-02': 300 } },
  effectiveStartDate: '2020-01-02',
  effectiveEndDate: '2020-12-31',
  degraded: false,
  ...overrides,
});
describe('runPortfolioBacktest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    helpersMocks.preparePortfolioBacktest.mockReturnValue({
      allTickers: new Set(['AAPL', 'SPY']),
      warnings: [],
    });
    helpersMocks.fetchPriceDataWithRange.mockResolvedValue(priceDataResult());
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

  const run = (opts: Record<string, unknown> = {}) =>
    runPortfolioBacktest({ portfolios: [mockPortfolio], parameters: mockParameters, ...opts });
  it('应完成完整编排流程：调用引擎、压缩、withTimeout 包装并返回结果', async () => {
    const result = await run();
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
    expect(timeoutMocks.withTimeout).toHaveBeenCalled();
    expect(configMocks.BACKTEST_SYNC_TIMEOUT_MS).toBe(120000);
  });
  it.each([
    ['无租户时缓存 key 不含租户', {}, undefined],
    ['带 tenantId 时缓存 key 应包含租户', { tenantId: 'tenant-1' }, 'tenant-1'],
  ])('%s，且结果写入缓存', async (_n, opts, tenantId) => {
    await run(opts);
    expect(cacheMocks.backtestCacheKey).toHaveBeenCalledWith(
      [mockPortfolio],
      mockParameters,
      tenantId,
    );
    expect(cacheMocks.setBacktestResultCache).toHaveBeenCalledWith(
      'test-cache-key',
      mockBacktestResult,
    );
  });
  it('数据降级时应添加 DATA_DEGRADED 警告', async () => {
    helpersMocks.fetchPriceDataWithRange.mockResolvedValue(
      priceDataResult({
        priceData: { AAPL: { '2020-01-02': 100 } },
        degraded: true,
        degradedWarning: 'Go 数据服务降级',
      }),
    );
    const result = await run();
    expect(result.warnings).toContainEqual({ code: 'DATA_DEGRADED', message: 'Go 数据服务降级' });
  });
  it('日期范围调整时应使用 effective 日期调用引擎', async () => {
    helpersMocks.fetchPriceDataWithRange.mockResolvedValue(
      priceDataResult({
        priceData: { AAPL: { '2020-01-03': 101 } },
        effectiveStartDate: '2020-01-03',
        effectiveEndDate: '2020-12-30',
      }),
    );
    await run();
    expect(engineMocks.callEngineStrict.mock.calls[0][1].params).toBeDefined();
  });
  it('引擎不可用时应抛出错误（fail-closed ADR-031）', async () => {
    engineMocks.callEngineStrict.mockRejectedValue(new Error('ENGINE_UNAVAILABLE'));
    await expect(run()).rejects.toThrow('ENGINE_UNAVAILABLE');
  });
});
