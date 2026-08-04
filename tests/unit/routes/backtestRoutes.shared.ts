import { vi } from 'vitest';
import { createConfigMocks } from '../../helpers/mockFactories.js';
import { loggerMocks } from '../../helpers/middlewareMocks.js';
import {
  configureAnalysisMocks,
  configureMonteCarloMocks,
  configureOptimizationMocks,
  configurePortfolioBacktestMocks,
  configureTickerHelpersMocks,
  EngineUnavailableErrorStub,
  type BacktestMockHandles,
} from '../../helpers/backtestRoutesFixtures.js';

/**
 * backtest-routes.test.ts / backtest-async-routes.test.ts 共享的 mock 配置。
 *
 * vitest 的 vi.mock 会提升执行，且 hoisted 变量不能直接 export（参见
 * tests/helpers/dataManageRoutesFixtures.ts 既有模式），因此统一放入
 * internalMocks 容器，vi.mock 工厂与对外导出均通过属性引用获取。
 */
const internalMocks = vi.hoisted(() => ({
  m: {
    runBacktest: vi.fn(),
    runPortfolioBacktest: vi.fn(),
    runAnalysis: vi.fn(),
    runMonteCarlo: vi.fn(),
    runOptimization: vi.fn(),
    runEfficientFrontier: vi.fn(),
    fetchHistoryData: vi.fn(),
    searchTickers: vi.fn(),
    callEngineStrict: vi.fn(),
    buildEngineParams: vi.fn(),
    preparePortfolioBacktest: vi.fn(),
    collectInvalidTickerWarnings: vi.fn(),
    collectDomainTickers: vi.fn(),
    filterPriceData: vi.fn(),
    fetchPriceDataWithRange: vi.fn(),
    loadMacroData: vi.fn(),
    validateTickers: vi.fn(),
    portfolioToDomain: vi.fn(),
    sanitizeMcParams: vi.fn(),
  } as BacktestMockHandles,
  fs: {
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn(),
  },
  queue: { add: vi.fn(), getJob: vi.fn() },
}));

import '../../helpers/middlewareMocks.js';
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: loggerMocks }));
vi.mock('../../../packages/backend/src/application/backtest-service.js', () => ({
  runPortfolioBacktest: internalMocks.m.runPortfolioBacktest,
  runBacktest: internalMocks.m.runBacktest,
}));
vi.mock('../../../packages/backend/src/application/analysis-orchestrator.js', () => ({
  runAnalysis: internalMocks.m.runAnalysis,
}));
vi.mock('../../../packages/backend/src/application/montecarlo-service.js', () => ({
  runMonteCarlo: internalMocks.m.runMonteCarlo,
}));
vi.mock('../../../packages/backend/src/application/optimize-service.js', () => ({
  runOptimization: internalMocks.m.runOptimization,
  runEfficientFrontier: internalMocks.m.runEfficientFrontier,
}));
vi.mock('../../../packages/backend/src/infrastructure/dataFacade.js', () => ({
  searchTickers: internalMocks.m.searchTickers,
  fetchHistoryData: internalMocks.m.fetchHistoryData,
  validateTickers: internalMocks.m.validateTickers,
  initDb: vi.fn(),
  invalidateCache: vi.fn(),
}));
vi.mock('../../../packages/backend/src/infrastructure/dataServices.js', () => ({
  SYNTHETIC_TICKERS: [
    {
      ticker: 'SPYSIM',
      name: 'S&P 500 Index',
      category: 'Index',
      description: '',
      earliestDate: '',
      methodology: 'splice_by_return',
    },
  ],
}));
vi.mock('../../../packages/backend/src/application/backtest-helpers.js', () => ({
  preparePortfolioBacktest: internalMocks.m.preparePortfolioBacktest,
  collectInvalidTickerWarnings: internalMocks.m.collectInvalidTickerWarnings,
  collectDomainTickers: internalMocks.m.collectDomainTickers,
  filterPriceData: internalMocks.m.filterPriceData,
  fetchPriceDataWithRange: internalMocks.m.fetchPriceDataWithRange,
  loadMacroData: internalMocks.m.loadMacroData,
  sanitizeMcParams: internalMocks.m.sanitizeMcParams,
  validateTickers: internalMocks.m.validateTickers,
  translateDomainError: vi.fn(<T>(fn: () => T): T => fn()),
}));
vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
  callEngineStrict: internalMocks.m.callEngineStrict,
  EngineUnavailableError: EngineUnavailableErrorStub,
  resetEngineAvailability: vi.fn(),
  unwrapEngineData: <T>(r: unknown): T => ((r as { data?: T })?.data ?? r) as T,
}));
vi.mock(
  '../../../packages/backend/src/application/backtest/backtestEngineUtils.js',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../../packages/backend/src/application/backtest/backtestEngineUtils.js')
      >();
    return { ...actual, buildEngineParams: internalMocks.m.buildEngineParams };
  },
);
vi.mock('../../../packages/backend/src/queues/backtestQueue.js', () => ({
  backtestQueue: { add: internalMocks.queue.add, getJob: internalMocks.queue.getJob },
}));
vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: createConfigMocks(),
  validateConfig: vi.fn(),
  USAGE_METRIC: { BACKTEST: 'backtest' },
}));
vi.mock('fs', () => ({
  default: internalMocks.fs,
  existsSync: internalMocks.fs.existsSync,
  readFileSync: internalMocks.fs.readFileSync,
}));

configurePortfolioBacktestMocks(internalMocks.m);
configureAnalysisMocks(internalMocks.m);
configureMonteCarloMocks(internalMocks.m);
configureOptimizationMocks(internalMocks.m);
configureTickerHelpersMocks(internalMocks.m);

export const m = internalMocks.m;
export { loggerMocks } from '../../helpers/middlewareMocks.js';
export const fsMocks = internalMocks.fs;
export const queueMocks = internalMocks.queue;
