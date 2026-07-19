/**
 * 回测路由单元测试 - analysis 端点组（Task 3.2 拆分）
 *
 * 覆盖端点：
 * - POST /api/backtest/analysis（相关性分析：校验/引擎错误/fail-closed）
 * - POST /api/backtest/monte-carlo（蒙特卡洛模拟：校验/mcParams 净化/多组合/错误）
 *
 * 共享 mock 实现配置见 tests/helpers/backtestRoutesFixtures.ts。
 * vi.mock 工厂因 vitest 文件级提升只能引用同文件 vi.hoisted 值，
 * 故各句柄用 vi.hoisted 创建，再由细粒度 configureXxxMocks 函数注入实现。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockLogger, createConfigMocks } from '../../helpers/mockFactories.js';
import backtestRoutes from '../../../packages/backend/src/routes/backtestRoutes.js';
import {
  configureAnalysisMocks,
  configureMonteCarloMocks,
  configureTickerHelpersMocks,
  createValidParameters,
  createValidPortfolio,
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
vi.mock('../../../packages/backend/src/services/analysis-orchestrator.js', () => ({
  runAnalysis: m.runAnalysis,
}));
vi.mock('../../../packages/backend/src/application/montecarlo-service.js', () => ({
  runMonteCarlo: m.runMonteCarlo,
}));
vi.mock('../../../packages/backend/src/application/optimize-service.js', () => ({
  runOptimization: m.runOptimization,
  runEfficientFrontier: m.runEfficientFrontier,
}));
vi.mock('../../../packages/backend/src/services/dataService.js', () => ({
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
  SUNSET_DATE_STR: '2025-12-31',
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
  };
});
vi.mock('fs', () => ({
  default: fsMocks,
  existsSync: fsMocks.existsSync,
  readFileSync: fsMocks.readFileSync,
}));

// ===== 注入 mock 实现（在 import 解析后执行；clearAllMocks 只清调用记录不清实现） =====
configureAnalysisMocks(m);
configureMonteCarloMocks(m);
configureTickerHelpersMocks(m);

describe('backtestRoutes - POST /api/backtest/analysis', () => {
  let server: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    server = await startEngineRouteServer(backtestRoutes, m);
    m.callEngineStrict.mockResolvedValue({
      tickers: [{ ticker: 'AAPL', cagr: 0.1 }],
      correlations: [[1]],
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it('有效参数应调用引擎并返回 200', async () => {
    const res = await fetch(`${server.url}/api/backtest/analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['AAPL', 'BND'],
        parameters: createValidParameters(),
      }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
    expect(m.callEngineStrict).toHaveBeenCalledTimes(1);
    expect(m.callEngineStrict.mock.calls[0][0]).toBe('/api/engine/analysis');
    expect(m.fetchHistoryData).toHaveBeenCalledTimes(1);
  });

  it('无效 objective 缺失 tickers 应返回 422（zod 校验）', async () => {
    const res = await fetch(`${server.url}/api/backtest/analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameters: createValidParameters() }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.detail).toContain('validation failed');
    expect(m.callEngineStrict).not.toHaveBeenCalled();
  });

  it('ticker 数量超限应返回 400（schema refine）', async () => {
    const tickers = Array.from({ length: 51 }, (_, i) => `T${i}`);
    const res = await fetch(`${server.url}/api/backtest/analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers, parameters: createValidParameters() }),
    });

    expect(res.status).toBe(400);
    expect(m.callEngineStrict).not.toHaveBeenCalled();
  });

  it('引擎抛错应返回 500', async () => {
    m.callEngineStrict.mockRejectedValue(new Error('analysis engine boom'));

    const res = await fetch(`${server.url}/api/backtest/analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['AAPL'],
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error.code).toBe('ANALYSIS_ERROR');
    expect(loggerMocks.error).toHaveBeenCalled();
  });

  it('tickers 为空格分隔字符串时应正常处理', async () => {
    m.callEngineStrict.mockResolvedValue({
      tickers: [{ ticker: 'AAPL' }, { ticker: 'BND' }],
      correlations: [[1]],
    });

    const res = await fetch(`${server.url}/api/backtest/analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: 'AAPL BND',
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(200);
    expect(m.callEngineStrict).toHaveBeenCalledTimes(1);
    const callArg = m.callEngineStrict.mock.calls[0][1] as { tickers: string[] };
    expect(callArg.tickers).toEqual(['AAPL', 'BND']);
  });

  it('引擎返回 assets 字段时应映射为 tickers', async () => {
    m.callEngineStrict.mockResolvedValue({
      success: true,
      data: {
        assets: [{ ticker: 'AAPL', cagr: 0.1 }],
        correlations: [[1]],
      },
    });

    const res = await fetch(`${server.url}/api/backtest/analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['AAPL'],
        parameters: createValidParameters(),
      }),
    });

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.tickers).toBeDefined();
    expect(json.data.correlations).toBeDefined();
  });

  it('引擎不可用应 fail-closed 返回 503', async () => {
    m.callEngineStrict.mockRejectedValue(new MockEngineUnavailableError());

    const res = await fetch(`${server.url}/api/backtest/analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['AAPL'],
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('30');
    const json = await res.json();
    expect(json.error.code).toBe('ENGINE_UNAVAILABLE');
  });
});

describe('backtestRoutes - POST /api/backtest/monte-carlo', () => {
  let server: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    server = await startEngineRouteServer(backtestRoutes, m);
    m.callEngineStrict.mockResolvedValue({ paths: [], statistics: {} });
  });

  afterEach(async () => {
    await server.close();
  });

  it('有效参数应调用引擎并返回 200', async () => {
    const res = await fetch(`${server.url}/api/backtest/monte-carlo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolio: createValidPortfolio(),
        parameters: createValidParameters(),
        mcParams: { numSimulations: 100, seed: 42 },
      }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(m.callEngineStrict).toHaveBeenCalledTimes(1);
    expect(m.callEngineStrict.mock.calls[0][0]).toBe('/api/engine/monte-carlo');
    expect((m.callEngineStrict.mock.calls[0][1] as { mcParams: unknown }).mcParams).toEqual({
      numSimulations: 100,
      seed: 42,
    });
  });

  it('缺少 portfolio 应返回 422（zod refine）', async () => {
    const res = await fetch(`${server.url}/api/backtest/monte-carlo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameters: createValidParameters() }),
    });

    expect(res.status).toBe(400);
    expect(m.callEngineStrict).not.toHaveBeenCalled();
  });

  it('恶意 mcParams 键应被剥离', async () => {
    await fetch(`${server.url}/api/backtest/monte-carlo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolio: createValidPortfolio(),
        parameters: createValidParameters(),
        mcParams: {
          numSimulations: 50,
          __proto__: { polluted: true },
          constructor: 'evil',
          maliciousKey: 'strip-me',
        },
      }),
    });

    const mcParamsArg = (
      m.callEngineStrict.mock.calls[0][1] as { mcParams: Record<string, unknown> }
    ).mcParams;
    expect(mcParamsArg).toEqual({ numSimulations: 50 });
    expect(mcParamsArg).not.toHaveProperty('maliciousKey');
    expect(mcParamsArg).not.toHaveProperty('constructor');
  });

  it('多组合应返回数组结果', async () => {
    m.callEngineStrict
      .mockResolvedValueOnce({ portfolio: 0 })
      .mockResolvedValueOnce({ portfolio: 1 });

    const res = await fetch(`${server.url}/api/backtest/monte-carlo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolios: [createValidPortfolio(), createValidPortfolio()],
        parameters: createValidParameters(),
      }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data).toHaveLength(2);
    expect(m.callEngineStrict).toHaveBeenCalledTimes(2);
  });

  it('引擎抛错应返回 500', async () => {
    m.callEngineStrict.mockRejectedValue(new Error('mc engine boom'));

    const res = await fetch(`${server.url}/api/backtest/monte-carlo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolio: createValidPortfolio(),
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('MONTE_CARLO_ERROR');
  });

  it('引擎不可用应 fail-closed 返回 503', async () => {
    m.callEngineStrict.mockRejectedValue(new MockEngineUnavailableError());

    const res = await fetch(`${server.url}/api/backtest/monte-carlo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolio: createValidPortfolio(),
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('30');
    const json = await res.json();
    expect(json.error.code).toBe('ENGINE_UNAVAILABLE');
  });
});
