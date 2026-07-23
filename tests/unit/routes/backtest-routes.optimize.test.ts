/**
 * 回测路由单元测试 - optimize 端点组（Task 3.2 拆分）
 *
 * 覆盖端点：
 * - POST /api/backtest/optimize（组合优化：校验/numIterations 截断/引擎错误/fail-closed）
 * - POST /api/backtest/efficient-frontier（有效前沿：校验/引擎错误/fail-closed）
 *
 * 共享 mock 实现配置见 tests/helpers/backtestRoutesFixtures.ts。
 * vi.mock 工厂因 vitest 文件级提升只能引用同文件 vi.hoisted 值，
 * 故各句柄用 vi.hoisted 创建，再由细粒度 configureXxxMocks 函数注入实现。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockLogger, createConfigMocks } from '../../helpers/mockFactories.js';
import backtestRoutes from '../../../packages/backend/src/routes/backtestRoutes.js';
import {
  configureOptimizationMocks,
  configureTickerHelpersMocks,
  createValidParameters,
  startEngineRouteServer,
  type BacktestMockHandles,
} from '../../helpers/backtestRoutesFixtures.js';

// ===== vi.hoisted: 创建 mock 句柄（vi.mock 工厂引用这些句柄，不能引用 import） =====

const m = vi.hoisted<BacktestMockHandles>(() => ({
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
  collectTickersFromPortfolios: vi.fn(),
  filterPriceData: vi.fn(),
  fetchPriceData: vi.fn(),
  loadMacroData: vi.fn(),
  validateTickers: vi.fn(),
  portfolioToDomain: vi.fn(),
  sanitizeMcParams: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
}));

const MockEngineUnavailableError = vi.hoisted(() => {
  class MockEngineUnavailableError extends Error {
    readonly retryAfterSeconds = 30;
    readonly code = 'ENGINE_UNAVAILABLE';
    constructor(message = '计算引擎暂不可用') {
      super(message);
      this.name = 'EngineUnavailableError';
    }
  }
  return MockEngineUnavailableError;
});

// ===== vi.mock: 工厂引用 hoisted 句柄 =====

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
  httpLogger: vi.fn(),
}));
vi.mock('../../../packages/backend/src/application/backtest-service.js', () => ({
  runPortfolioBacktest: m.runPortfolioBacktest,
  runBacktest: m.runBacktest,
}));
vi.mock('../../../packages/backend/src/application/analysis-orchestrator.js', () => ({
  runAnalysis: m.runAnalysis,
}));
vi.mock('../../../packages/backend/src/application/montecarlo-service.js', () => ({
  runMonteCarlo: m.runMonteCarlo,
}));
vi.mock('../../../packages/backend/src/application/optimize-service.js', () => ({
  runOptimization: m.runOptimization,
  runEfficientFrontier: m.runEfficientFrontier,
}));
vi.mock('../../../packages/backend/src/infrastructure/dataFacade.js', () => ({
  searchTickers: m.searchTickers,
  fetchHistoryData: m.fetchHistoryData,
  validateTickers: m.validateTickers,
  initDb: vi.fn(),
  invalidateCache: vi.fn(),
}));
vi.mock('../../../packages/backend/src/application/backtest-helpers.js', () => ({
  preparePortfolioBacktest: m.preparePortfolioBacktest,
  collectInvalidTickerWarnings: m.collectInvalidTickerWarnings,
  collectTickersFromPortfolios: m.collectTickersFromPortfolios,
  filterPriceData: m.filterPriceData,
  fetchPriceData: m.fetchPriceData,
  loadMacroData: m.loadMacroData,
  sanitizeMcParams: m.sanitizeMcParams,
  validateTickers: m.validateTickers,
  translateDomainError: vi.fn(<T>(fn: () => T): T => fn()),
}));
vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
  callEngineStrict: m.callEngineStrict,
  EngineUnavailableError: MockEngineUnavailableError,
  resetEngineAvailability: vi.fn(),
}));
vi.mock('../../../packages/backend/src/application/backtest/engineBodyBuilder.js', () => ({
  buildEngineParams: m.buildEngineParams,
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
  };
});
vi.mock('fs', () => ({
  default: fsMocks,
  existsSync: fsMocks.existsSync,
  readFileSync: fsMocks.readFileSync,
}));

// ===== 注入 mock 实现（在 import 解析后执行；clearAllMocks 只清调用记录不清实现） =====
configureOptimizationMocks(m);
configureTickerHelpersMocks(m);

describe('backtestRoutes - POST /api/backtest/optimize', () => {
  let server: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    server = await startEngineRouteServer(backtestRoutes, m);
    m.callEngineStrict.mockResolvedValue({
      optimalWeights: { AAPL: 0.6, BND: 0.4 },
      expectedReturn: 0.1,
      expectedVolatility: 0.15,
      sharpeRatio: 1.2,
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it('有效参数应调用引擎并返回 200', async () => {
    const res = await fetch(`${server.url}/api/backtest/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['AAPL', 'BND'],
        objective: 'maxSharpe',
        parameters: createValidParameters(),
      }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(m.callEngineStrict).toHaveBeenCalledTimes(1);
    expect(m.callEngineStrict.mock.calls[0][0]).toBe('/api/engine/optimize');
  });

  it('无效 objective 应返回 422（zod 校验）', async () => {
    const res = await fetch(`${server.url}/api/backtest/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['AAPL'],
        objective: 'invalidObjective',
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(400);
    expect(m.callEngineStrict).not.toHaveBeenCalled();
  });

  it('ticker 数量超限应返回 400（schema refine）', async () => {
    const res = await fetch(`${server.url}/api/backtest/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: Array.from({ length: 51 }, (_, i) => `T${i}`),
        objective: 'maxSharpe',
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(400);
    expect(m.callEngineStrict).not.toHaveBeenCalled();
  });

  it('引擎抛错应返回 500', async () => {
    m.callEngineStrict.mockRejectedValue(new Error('optimize boom'));

    const res = await fetch(`${server.url}/api/backtest/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['AAPL', 'BND'],
        objective: 'minVolatility',
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('OPTIMIZATION_ERROR');
  });

  it('numIterations 应被正确上限截断', async () => {
    const res = await fetch(`${server.url}/api/backtest/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['AAPL', 'BND'],
        objective: 'maxSharpe',
        parameters: createValidParameters(),
        numIterations: 50000,
      }),
    });

    expect(res.status).toBe(200);
    const callArg = m.callEngineStrict.mock.calls[0][1] as {
      numIterations: number;
    };
    expect(callArg.numIterations).toBe(50000);
  });

  it('引擎不可用应 fail-closed 返回 503', async () => {
    m.callEngineStrict.mockRejectedValue(new MockEngineUnavailableError());

    const res = await fetch(`${server.url}/api/backtest/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['AAPL', 'BND'],
        objective: 'maxSharpe',
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('30');
    const json = await res.json();
    expect(json.error.code).toBe('ENGINE_UNAVAILABLE');
  });
});

describe('backtestRoutes - POST /api/backtest/efficient-frontier', () => {
  let server: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    server = await startEngineRouteServer(backtestRoutes, m);
    m.callEngineStrict.mockResolvedValue({
      frontier: [
        { weights: { AAPL: 1 }, expectedReturn: 0.1, expectedVolatility: 0.2, sharpeRatio: 0.5 },
      ],
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it('有效参数应调用引擎并返回 200', async () => {
    const res = await fetch(`${server.url}/api/backtest/efficient-frontier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['AAPL', 'BND'],
        numPoints: 10,
        parameters: createValidParameters(),
      }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(m.callEngineStrict).toHaveBeenCalledTimes(1);
    expect(m.callEngineStrict.mock.calls[0][0]).toBe('/api/engine/efficient-frontier');
  });

  it('空 tickers 数组应返回 422（zod min(1)）', async () => {
    const res = await fetch(`${server.url}/api/backtest/efficient-frontier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: [],
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(400);
    expect(m.callEngineStrict).not.toHaveBeenCalled();
  });

  it('ticker 数量超限应返回 400（schema refine）', async () => {
    const res = await fetch(`${server.url}/api/backtest/efficient-frontier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: Array.from({ length: 51 }, (_, i) => `T${i}`),
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(400);
    expect(m.callEngineStrict).not.toHaveBeenCalled();
  });

  it('引擎抛错应返回 500', async () => {
    m.callEngineStrict.mockRejectedValue(new Error('frontier boom'));

    const res = await fetch(`${server.url}/api/backtest/efficient-frontier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['AAPL', 'BND'],
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('EFFICIENT_FRONTIER_ERROR');
  });

  it('引擎不可用应 fail-closed 返回 503', async () => {
    m.callEngineStrict.mockRejectedValue(new MockEngineUnavailableError());

    const res = await fetch(`${server.url}/api/backtest/efficient-frontier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['AAPL', 'BND'],
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('30');
    const json = await res.json();
    expect(json.error.code).toBe('ENGINE_UNAVAILABLE');
  });
});
