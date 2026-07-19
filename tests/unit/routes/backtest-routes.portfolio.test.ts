/**
 * 回测路由单元测试 - portfolio 端点组（Task 3.2 拆分）
 *
 * 覆盖端点：
 * - POST /api/backtest/portfolio（含校验/超时/引擎不可用 fail-closed）
 * - POST /api/backtest/portfolio/series（缓存命中/未命中）
 * - GET /api/backtest/search（搜索/校验/错误）
 *
 * 共享 mock 实现配置见 tests/helpers/backtestRoutesFixtures.ts。
 * vi.mock 工厂因 vitest 文件级提升只能引用同文件 vi.hoisted 值，
 * 故各句柄用 vi.hoisted 创建，再由细粒度 configureXxxMocks 函数注入实现。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockLogger, createConfigMocks } from '../../helpers/mockFactories.js';
import backtestRoutes from '../../../packages/backend/src/routes/backtestRoutes.js';
import {
  configurePortfolioBacktestMocks,
  configureTickerHelpersMocks,
  createBacktestApp,
  createValidRequestBody,
  setupPortfolioServer,
  TimeoutError,
  ValidationError,
  clearBacktestResultCache,
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
configurePortfolioBacktestMocks(m);
configureTickerHelpersMocks(m);

describe('backtestRoutes - POST /api/backtest/portfolio', () => {
  let server: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    server = await setupPortfolioServer(backtestRoutes, m);
  });

  afterEach(async () => {
    await server.close();
  });

  it('有效参数应调用 Application Service 并返回 200', async () => {
    const body = createValidRequestBody();

    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
    expect(m.runBacktest).toHaveBeenCalledTimes(1);
    expect(m.fetchHistoryData).toHaveBeenCalledTimes(1);
  });

  it('sync 响应应省略 rollingReturns（由 /portfolio/series 补全）', async () => {
    const body = createValidRequestBody();
    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    expect(json.data.portfolios[0].rollingReturns).toBeUndefined();
  });
});

describe('backtestRoutes - POST /api/backtest/portfolio/series', () => {
  let server: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    server = await setupPortfolioServer(backtestRoutes, m);
  });

  afterEach(async () => {
    await server.close();
  });

  it('缓存命中时应返回请求的序列字段', async () => {
    const body = createValidRequestBody();

    await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const res = await fetch(`${server.url}/api/backtest/portfolio/series`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, series: ['rollingReturns'] }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.portfolios[0].rollingReturns).toEqual([]);
  });

  it('缓存未命中时应返回 404', async () => {
    const body = createValidRequestBody();
    const res = await fetch(`${server.url}/api/backtest/portfolio/series`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, series: ['rollingReturns'] }),
    });
    expect(res.status).toBe(404);
  });
});

describe('backtestRoutes - POST /api/backtest/portfolio (continued)', () => {
  let server: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    server = await setupPortfolioServer(backtestRoutes, m);
  });

  afterEach(async () => {
    await server.close();
  });

  it('应以正确的参数调用 fetchHistoryData（含 benchmarkTicker）', async () => {
    const body = createValidRequestBody();
    body.parameters.benchmarkTicker = 'SPY';

    m.fetchHistoryData.mockResolvedValue({
      AAPL: { '2024-01-02': 185.5 },
      BND: { '2024-01-02': 72.3 },
      SPY: { '2024-01-02': 450.0 },
    });

    await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const callArgs = m.fetchHistoryData.mock.calls[0];
    const tickers = callArgs[0] as string[];
    expect(tickers).toContain('AAPL');
    expect(tickers).toContain('BND');
    expect(tickers).toContain('SPY');
    expect(callArgs[1]).toBe('2024-01-01');
    expect(callArgs[2]).toBe('2024-06-30');
  });

  it('无效日期格式应返回 400（zod 校验失败）', async () => {
    const body = createValidRequestBody();
    (body.parameters as Record<string, unknown>).startDate = 'not-a-date';

    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.status).toBe(400);
    expect(json.error.detail).toContain('validation failed');
    expect(m.runBacktest).not.toHaveBeenCalled();
  });

  it('缺少 portfolios 字段应返回 400', async () => {
    const body = {
      parameters: { startDate: '2024-01-01', endDate: '2024-06-30' },
    };

    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(400);
    expect(m.runBacktest).not.toHaveBeenCalled();
  });

  it('缺少 parameters 字段应返回 400', async () => {
    const body = {
      portfolios: [
        {
          assets: [{ ticker: 'AAPL', weight: 100 }],
          rebalanceFrequency: 'monthly',
        },
      ],
    };

    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(400);
    expect(m.runBacktest).not.toHaveBeenCalled();
  });

  it('空 portfolios 数组应返回 400（min(1) 校验）', async () => {
    const body = {
      portfolios: [],
      parameters: { startDate: '2024-01-01', endDate: '2024-06-30' },
    };

    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(400);
  });

  it('Application Service 抛错时应返回 500', async () => {
    m.runBacktest.mockRejectedValue(new Error('engine boom'));

    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequestBody()),
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error.status).toBe(500);
    expect(json.error.code).toBe('BACKTEST_ERROR');
    expect(loggerMocks.error).toHaveBeenCalled();
  });

  it('preparePortfolioBacktest 抛错时应返回 422', async () => {
    m.preparePortfolioBacktest.mockImplementationOnce(() => {
      throw new ValidationError('组合资产权重之和应约为 100');
    });

    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequestBody()),
    });

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('存在警告时应包含 warnings 字段', async () => {
    m.preparePortfolioBacktest.mockImplementationOnce(
      (
        portfolios: { assets: { ticker: string }[] }[],
        parameters: { benchmarkTicker?: string },
      ) => {
        const allTickers = new Set(portfolios.flatMap((p) => p.assets.map((a) => a.ticker)));
        if (parameters?.benchmarkTicker) allTickers.add(parameters.benchmarkTicker);
        return { allTickers, warnings: ['AAPL: 部分数据缺失'] };
      },
    );

    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequestBody()),
    });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.warnings).toBeDefined();
    expect(json.warnings).toContain('AAPL: 部分数据缺失');
  });

  it('回测超时应返回 503 Gateway Timeout', async () => {
    m.runBacktest.mockRejectedValue(new TimeoutError('回测超时（30000ms）'));

    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequestBody()),
    });
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error.code).toBe('COMPUTE_TIMEOUT');
  });

  it('价格数据缺失（无效 ticker）时应返回 success: false', async () => {
    m.fetchHistoryData.mockResolvedValue({});

    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequestBody()),
    });

    const json = await res.json();
    expect(res.status).toBe(422);
    expect(json.error.code).toBe('INVALID_TICKERS');
    expect(m.runBacktest).not.toHaveBeenCalled();
  });

  it('引擎不可用时应 fail-closed 返回 503 + Retry-After（ADR-031）', async () => {
    m.runBacktest.mockRejectedValue(new MockEngineUnavailableError());

    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequestBody()),
    });

    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('30');
    const json = await res.json();
    expect(json.error.code).toBe('ENGINE_UNAVAILABLE');
    expect(json.degraded).toBe(true);
  });
});

describe('backtestRoutes - GET /api/backtest/search', () => {
  let server: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    vi.clearAllMocks();
    clearBacktestResultCache();
    server = await createBacktestApp(backtestRoutes);
  });

  afterEach(async () => {
    await server.close();
  });

  it('应返回搜索结果', async () => {
    m.searchTickers.mockResolvedValue([{ ticker: 'AAPL', name: 'Apple', market: 'US' }]);

    const res = await fetch(`${server.url}/api/backtest/search?query=aapl`);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].ticker).toBe('AAPL');
  });

  it('缺少 query 参数应返回 422', async () => {
    const res = await fetch(`${server.url}/api/backtest/search`);

    expect(res.status).toBe(422);
  });

  it('搜索服务抛错时应返回 500', async () => {
    m.searchTickers.mockRejectedValue(new Error('search failed'));

    const res = await fetch(`${server.url}/api/backtest/search?query=aapl`);
    expect(res.status).toBe(500);
  });
});
