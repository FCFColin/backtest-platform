import { vi } from 'vitest';
import { mockLogger, createConfigMocks } from '../../helpers/mockFactories.js';
import {
  configureAnalysisMocks,
  configureMonteCarloMocks,
  configureOptimizationMocks,
  configurePortfolioBacktestMocks,
  configureTickerHelpersMocks,
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
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  },
  fs: {
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn(),
  },
  engineUnavailable: class E extends Error {
    readonly retryAfterSeconds = 30;
    readonly code = 'ENGINE_UNAVAILABLE';
    constructor(msg = '计算引擎暂不可用') {
      super(msg);
      this.name = 'EngineUnavailableError';
    }
  },
  queue: { add: vi.fn(), getJob: vi.fn() },
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(internalMocks.logger),
  httpLogger: vi.fn(),
}));
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
  EngineUnavailableError: internalMocks.engineUnavailable,
  resetEngineAvailability: vi.fn(),
}));
vi.mock('../../../packages/backend/src/application/backtest/engineBodyBuilder.js', () => ({
  buildEngineParams: internalMocks.m.buildEngineParams,
}));
vi.mock('../../../packages/backend/src/queues/backtestQueue.js', () => ({
  backtestQueue: { add: internalMocks.queue.add, getJob: internalMocks.queue.getJob },
}));
vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: createConfigMocks(),
  validateConfig: vi.fn(),
}));
vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => {
  const noop = () => {};
  return {
    redisConnection: { on: noop },
    appRedis: {
      on: noop,
      ping: async () => 'PONG',
      set: async () => 'OK',
      get: async () => null,
      scan: async () => ['0', []] as [string, string[]],
      del: async () => 0,
    },
    getRedisHealth: vi.fn().mockResolvedValue(true),
    markRedisUnhealthy: vi.fn(),
    buildRedisBaseOptions: () => ({ host: 'localhost', port: 6379 }),
    isSentinelMode: false,
  };
});
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
export const loggerMocks = internalMocks.logger;
export const fsMocks = internalMocks.fs;
export const MockEngineUnavailableError = internalMocks.engineUnavailable;
export const queueMocks = internalMocks.queue;
