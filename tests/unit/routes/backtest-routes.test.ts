import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockLogger, createConfigMocks } from '../../helpers/mockFactories.js';
import backtestRoutes from '../../../packages/backend/src/routes/backtestRoutes.js';
import {
  configureAnalysisMocks,
  configureMonteCarloMocks,
  configurePortfolioBacktestMocks,
  configureOptimizationMocks,
  configureTickerHelpersMocks,
  createValidParameters,
  createValidPortfolio,
  createValidRequestBody,
  createBacktestApp,
  startEngineRouteServer,
  setupPortfolioServer,
  clearBacktestResultCache,
  type BacktestMockHandles,
} from '../../helpers/backtestRoutesFixtures.js';
import {
  setBacktestResultCache,
  backtestCacheKey,
} from '../../../packages/backend/src/application/backtest/backtestResultCache.js';
import { mockBacktestResult } from '../../helpers/storeFixtures.js';

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
  collectDomainTickers: vi.fn(),
  filterPriceData: vi.fn(),
  fetchPriceDataWithRange: vi.fn(),
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
  class E extends Error {
    readonly retryAfterSeconds = 30;
    readonly code = 'ENGINE_UNAVAILABLE';
    constructor(msg = '计算引擎暂不可用') {
      super(msg);
      this.name = 'EngineUnavailableError';
    }
  }
  return E;
});
const queueMocks = vi.hoisted(() => ({ add: vi.fn(), getJob: vi.fn() }));

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
  collectDomainTickers: m.collectDomainTickers,
  filterPriceData: m.filterPriceData,
  fetchPriceDataWithRange: m.fetchPriceDataWithRange,
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
vi.mock('../../../packages/backend/src/queues/backtestQueue.js', () => ({
  backtestQueue: { add: queueMocks.add, getJob: queueMocks.getJob },
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
  default: fsMocks,
  existsSync: fsMocks.existsSync,
  readFileSync: fsMocks.readFileSync,
}));

configurePortfolioBacktestMocks(m);
configureAnalysisMocks(m);
configureMonteCarloMocks(m);
configureOptimizationMocks(m);
configureTickerHelpersMocks(m);

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { res, json: await res.json() };
}
type Server = { url: string; close: () => Promise<void> };

interface EngineCase {
  name: string;
  path: string;
  enginePath: string;
  errorCode: string;
  logOnError: boolean;
  result: Record<string, unknown>;
  validBody: () => Record<string, unknown>;
  specials: Array<[string, (url: string) => Promise<void> | void]>;
}

const engineCases: EngineCase[] = [
  {
    name: 'analysis',
    path: '/api/backtest/analysis',
    enginePath: '/api/engine/analysis',
    errorCode: 'ANALYSIS_ERROR',
    logOnError: true,
    result: { tickers: [{ ticker: 'AAPL', cagr: 0.1 }], correlations: [[1]] },
    validBody: () => ({ tickers: ['AAPL', 'BND'], parameters: createValidParameters() }),
    specials: [
      [
        '缺失 tickers 应返回 400（zod 校验）',
        async (url) => {
          const { res } = await postJson(url, { parameters: createValidParameters() });
          expect(res.status).toBe(400);
          expect(m.callEngineStrict).not.toHaveBeenCalled();
        },
      ],
      [
        'ticker 数量超限应返回 400（schema refine）',
        async (url) => {
          const { res } = await postJson(url, {
            tickers: Array.from({ length: 51 }, (_, i) => `T${i}`),
            parameters: createValidParameters(),
          });
          expect(res.status).toBe(400);
          expect(m.callEngineStrict).not.toHaveBeenCalled();
        },
      ],
      [
        'tickers 为空格分隔字符串时应正常处理',
        async (url) => {
          m.callEngineStrict.mockResolvedValue({
            tickers: [{ ticker: 'AAPL' }, { ticker: 'BND' }],
            correlations: [[1]],
          });
          const { res } = await postJson(url, {
            tickers: 'AAPL BND',
            parameters: createValidParameters(),
          });
          expect(res.status).toBe(200);
          expect((m.callEngineStrict.mock.calls[0][1] as { tickers: string[] }).tickers).toEqual([
            'AAPL',
            'BND',
          ]);
        },
      ],
      [
        '引擎返回 assets 字段时应映射为 tickers',
        async (url) => {
          m.callEngineStrict.mockResolvedValue({
            success: true,
            data: { assets: [{ ticker: 'AAPL', cagr: 0.1 }], correlations: [[1]] },
          });
          const { res, json } = await postJson(url, {
            tickers: ['AAPL'],
            parameters: createValidParameters(),
          });
          expect(res.status).toBe(200);
          expect(json.data.tickers).toBeDefined();
          expect(json.data.correlations).toBeDefined();
        },
      ],
      [
        '有效请求应拉取历史数据',
        async (url) => {
          await postJson(url, { tickers: ['AAPL', 'BND'], parameters: createValidParameters() });
          expect(m.fetchHistoryData).toHaveBeenCalledTimes(1);
        },
      ],
    ],
  },
  {
    name: 'monte-carlo',
    path: '/api/backtest/monte-carlo',
    enginePath: '/api/engine/monte-carlo',
    errorCode: 'MONTE_CARLO_ERROR',
    logOnError: false,
    result: { paths: [], statistics: {} },
    validBody: () => ({
      portfolio: createValidPortfolio(),
      parameters: createValidParameters(),
      mcParams: { numSimulations: 100, seed: 42 },
    }),
    specials: [
      [
        'mcParams 应透传到引擎',
        async (url) => {
          await postJson(url, {
            portfolio: createValidPortfolio(),
            parameters: createValidParameters(),
            mcParams: { numSimulations: 100, seed: 42 },
          });
          expect((m.callEngineStrict.mock.calls[0][1] as { mcParams: unknown }).mcParams).toEqual({
            numSimulations: 100,
            seed: 42,
          });
        },
      ],
      [
        '缺少 portfolio 应返回 400（zod refine）',
        async (url) => {
          const { res } = await postJson(url, { parameters: createValidParameters() });
          expect(res.status).toBe(400);
          expect(m.callEngineStrict).not.toHaveBeenCalled();
        },
      ],
      [
        '恶意 mcParams 键应被剥离',
        async (url) => {
          await postJson(url, {
            portfolio: createValidPortfolio(),
            parameters: createValidParameters(),
            mcParams: {
              numSimulations: 50,
              __proto__: { polluted: true },
              constructor: 'evil',
              maliciousKey: 'strip-me',
            },
          });
          const mcParamsArg = (
            m.callEngineStrict.mock.calls[0][1] as { mcParams: Record<string, unknown> }
          ).mcParams;
          expect(mcParamsArg).toEqual({ numSimulations: 50 });
          expect(mcParamsArg).not.toHaveProperty('maliciousKey');
          expect(mcParamsArg).not.toHaveProperty('constructor');
        },
      ],
      [
        '多组合应返回数组结果',
        async (url) => {
          m.callEngineStrict
            .mockResolvedValueOnce({ portfolio: 0 })
            .mockResolvedValueOnce({ portfolio: 1 });
          const { res, json } = await postJson(url, {
            portfolios: [createValidPortfolio(), createValidPortfolio()],
            parameters: createValidParameters(),
          });
          expect(res.status).toBe(200);
          expect(json.success).toBe(true);
          expect(Array.isArray(json.data)).toBe(true);
          expect(json.data).toHaveLength(2);
          expect(m.callEngineStrict).toHaveBeenCalledTimes(2);
        },
      ],
    ],
  },
  {
    name: 'optimize',
    path: '/api/backtest/optimize',
    enginePath: '/api/engine/optimize',
    errorCode: 'OPTIMIZATION_ERROR',
    logOnError: false,
    result: {
      optimalWeights: { AAPL: 0.6, BND: 0.4 },
      expectedReturn: 0.1,
      expectedVolatility: 0.15,
      sharpeRatio: 1.2,
    },
    validBody: () => ({
      tickers: ['AAPL', 'BND'],
      objective: 'maxSharpe',
      parameters: createValidParameters(),
    }),
    specials: [
      [
        '无效 objective 应返回 400（zod 校验）',
        async (url) => {
          const { res } = await postJson(url, {
            tickers: ['AAPL'],
            objective: 'invalidObjective',
            parameters: createValidParameters(),
          });
          expect(res.status).toBe(400);
          expect(m.callEngineStrict).not.toHaveBeenCalled();
        },
      ],
      [
        'ticker 数量超限应返回 400（schema refine）',
        async (url) => {
          const { res } = await postJson(url, {
            tickers: Array.from({ length: 51 }, (_, i) => `T${i}`),
            objective: 'maxSharpe',
            parameters: createValidParameters(),
          });
          expect(res.status).toBe(400);
          expect(m.callEngineStrict).not.toHaveBeenCalled();
        },
      ],
      [
        'numIterations 应被正确上限截断',
        async (url) => {
          const { res } = await postJson(url, {
            tickers: ['AAPL', 'BND'],
            objective: 'minVolatility',
            parameters: createValidParameters(),
            numIterations: 50000,
          });
          expect(res.status).toBe(200);
          expect(
            (m.callEngineStrict.mock.calls[0][1] as { numIterations: number }).numIterations,
          ).toBe(50000);
        },
      ],
    ],
  },
  {
    name: 'efficient-frontier',
    path: '/api/backtest/efficient-frontier',
    enginePath: '/api/engine/efficient-frontier',
    errorCode: 'EFFICIENT_FRONTIER_ERROR',
    logOnError: false,
    result: {
      frontier: [
        { weights: { AAPL: 1 }, expectedReturn: 0.1, expectedVolatility: 0.2, sharpeRatio: 0.5 },
      ],
    },
    validBody: () => ({
      tickers: ['AAPL', 'BND'],
      parameters: createValidParameters(),
      numPoints: 10,
    }),
    specials: [
      [
        '空 tickers 数组应返回 400',
        async (url) => {
          const { res } = await postJson(url, { tickers: [], parameters: createValidParameters() });
          expect(res.status).toBe(400);
          expect(m.callEngineStrict).not.toHaveBeenCalled();
        },
      ],
      [
        'ticker 数量超限应返回 400',
        async (url) => {
          const { res } = await postJson(url, {
            tickers: Array.from({ length: 51 }, (_, i) => `T${i}`),
            parameters: createValidParameters(),
          });
          expect(res.status).toBe(400);
          expect(m.callEngineStrict).not.toHaveBeenCalled();
        },
      ],
    ],
  },
];

describe.each(engineCases)('backtestRoutes - POST $path', (c) => {
  let server: Server;
  beforeEach(async () => {
    server = await startEngineRouteServer(backtestRoutes, m);
    m.callEngineStrict.mockResolvedValue(c.result);
  });
  afterEach(async () => {
    await server.close();
  });
  it('有效参数应调用引擎并返回 200', async () => {
    const { res, json } = await postJson(`${server.url}${c.path}`, c.validBody());
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(m.callEngineStrict).toHaveBeenCalledTimes(1);
    expect(m.callEngineStrict.mock.calls[0][0]).toBe(c.enginePath);
  });
  it('引擎抛错应返回 500', async () => {
    m.callEngineStrict.mockRejectedValue(new Error('engine boom'));
    const { res, json } = await postJson(`${server.url}${c.path}`, c.validBody());
    expect(res.status).toBe(500);
    expect(json.error.code).toBe(c.errorCode);
    if (c.logOnError) expect(loggerMocks.error).toHaveBeenCalled();
  });
  it('引擎不可用应 fail-closed 返回 503', async () => {
    m.callEngineStrict.mockRejectedValue(new MockEngineUnavailableError());
    const { res, json } = await postJson(`${server.url}${c.path}`, c.validBody());
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('30');
    expect(json.error.code).toBe('ENGINE_UNAVAILABLE');
  });
  it.each(c.specials)('%s', async (_n, fn) => {
    await fn(`${server.url}${c.path}`);
  });
});

describe('backtestRoutes - POST /api/backtest/portfolio', () => {
  let server: Server;
  beforeEach(async () => {
    server = await setupPortfolioServer(backtestRoutes, m);
    queueMocks.add.mockReset();
    queueMocks.getJob.mockReset();
  });
  afterEach(async () => {
    await server.close();
  });
  it('有效参数应入队并返回 202 Accepted', async () => {
    queueMocks.add.mockResolvedValue({ id: 'job-test-001' });
    const { res, json } = await postJson(
      `${server.url}/api/backtest/portfolio`,
      createValidRequestBody(),
    );
    expect(res.status).toBe(202);
    expect(json.success).toBe(true);
    expect(json.data.jobId).toBe('job-test-001');
    expect(json.data.status).toBe('queued');
    expect(json.data.statusUrl).toContain('/api/v1/backtest/runs/');
    expect(queueMocks.add).toHaveBeenCalledTimes(1);
  });
  it('异步响应应仅包含 jobId/status/statusUrl（不含 portfolios 数据）', async () => {
    queueMocks.add.mockResolvedValue({ id: 'job-test-001' });
    const { res, json } = await postJson(
      `${server.url}/api/backtest/portfolio`,
      createValidRequestBody(),
    );
    expect(res.status).toBe(202);
    expect(json.data.portfolios).toBeUndefined();
    expect(json.data.jobId).toBeDefined();
  });
  it('应以正确的 payload 入队（含 benchmarkTicker）', async () => {
    queueMocks.add.mockResolvedValue({ id: 'job-test-001' });
    const body = createValidRequestBody();
    body.parameters.benchmarkTicker = 'SPY';
    await postJson(`${server.url}/api/backtest/portfolio`, body);
    expect(queueMocks.add).toHaveBeenCalledTimes(1);
    const [jobName, jobData] = queueMocks.add.mock.calls[0];
    expect(jobName).toBe('portfolio');
    expect(jobData.type).toBe('portfolio');
    expect(jobData.payload.portfolios).toBeDefined();
    expect(jobData.payload.parameters.benchmarkTicker).toBe('SPY');
  });
  it('无效日期格式应返回 400（zod 校验失败）', async () => {
    const body = createValidRequestBody();
    (body.parameters as Record<string, unknown>).startDate = 'not-a-date';
    const { res, json } = await postJson(`${server.url}/api/backtest/portfolio`, body);
    expect(res.status).toBe(400);
    expect(json.error.title).toBe('VALIDATION_ERROR');
    expect(queueMocks.add).not.toHaveBeenCalled();
  });
  it.each([
    ['缺少 portfolios', { parameters: { startDate: '2024-01-01', endDate: '2024-06-30' } }],
    [
      '缺少 parameters',
      {
        portfolios: [{ assets: [{ ticker: 'AAPL', weight: 100 }], rebalanceFrequency: 'monthly' }],
      },
    ],
    [
      '空 portfolios',
      { portfolios: [], parameters: { startDate: '2024-01-01', endDate: '2024-06-30' } },
    ],
  ])('%s 应返回 400', async (_n, body) => {
    const { res } = await postJson(`${server.url}/api/backtest/portfolio`, body);
    expect(res.status).toBe(400);
  });
  it('队列不可用时应 fail-closed 返回 503 + Retry-After（ADR-031）', async () => {
    queueMocks.add.mockRejectedValueOnce(new Error('Redis unavailable'));
    const { res, json } = await postJson(
      `${server.url}/api/backtest/portfolio`,
      createValidRequestBody(),
    );
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('30');
    expect(json.error.code).toBe('SERVICE_TEMPORARILY_UNAVAILABLE');
    expect(json.success).toBe(false);
  });
  it('X-Backtest-Sync: true 时仍走异步路径返回 202（同步路径已移除）', async () => {
    queueMocks.add.mockResolvedValue({ id: 'job-async-002' });
    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Backtest-Sync': 'true' },
      body: JSON.stringify(createValidRequestBody()),
    });
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.jobId).toBe('job-async-002');
    expect(m.runPortfolioBacktest).not.toHaveBeenCalled();
  });
});

describe('backtestRoutes - POST /api/backtest/portfolio/series', () => {
  let server: Server;
  beforeEach(async () => {
    server = await setupPortfolioServer(backtestRoutes, m);
  });
  afterEach(async () => {
    await server.close();
  });
  it('缓存命中时应返回请求的序列字段', async () => {
    const body = createValidRequestBody();
    await setBacktestResultCache(
      backtestCacheKey(body.portfolios, body.parameters, undefined),
      mockBacktestResult(),
    );
    const { res, json } = await postJson(`${server.url}/api/backtest/portfolio/series`, {
      ...body,
      series: ['rollingReturns'],
    });
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.portfolios[0].rollingReturns).toEqual([]);
  });
  it('缓存未命中时应返回 404', async () => {
    const body = createValidRequestBody();
    const { res } = await postJson(`${server.url}/api/backtest/portfolio/series`, {
      ...body,
      series: ['rollingReturns'],
    });
    expect(res.status).toBe(404);
  });
});

describe('backtestRoutes - GET /api/backtest/search', () => {
  let server: Server;
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

function createMockJob(overrides: {
  id?: string;
  state?: string;
  progress?: number;
  returnvalue?: unknown;
  failedReason?: string;
  data?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    id: overrides.id ?? 'job-async-001',
    data: overrides.data ?? { type: 'portfolio', payload: {} },
    progress: overrides.progress ?? 0,
    returnvalue: overrides.returnvalue,
    failedReason: overrides.failedReason,
    getState: vi.fn().mockResolvedValue(overrides.state ?? 'completed'),
  };
}

describe('backtestRoutes - GET /api/backtest/runs/:jobId — 状态查询', () => {
  let server: Server;
  beforeEach(async () => {
    server = await setupPortfolioServer(backtestRoutes, m);
    queueMocks.add.mockReset();
    queueMocks.getJob.mockReset();
  });
  afterEach(async () => {
    await server.close();
  });
  const completedResult = {
    data: { portfolios: [{ name: 'Test', growthCurve: [] }] },
    warnings: [],
    dateRange: { start: '2024-01-01', end: '2024-06-30' },
  };
  it.each([
    [
      'completed 状态返回 200 + 结果',
      {
        id: 'job-done',
        state: 'completed',
        progress: 100,
        returnvalue: { status: 'completed', result: completedResult },
      },
      { status: 'completed', progress: 100, result: completedResult },
    ],
    [
      'failed 状态返回 200 + 错误信息',
      { id: 'job-failed', state: 'failed', progress: 30, failedReason: 'Engine timeout after 90s' },
      { status: 'failed', error: 'Engine timeout after 90s', noResult: true },
    ],
    [
      'running 状态返回 200 + 进度',
      { id: 'job-running', state: 'active', progress: 45 },
      { status: 'running', progress: 45, noResult: true, noError: true },
    ],
    [
      'delayed 状态映射为 queued',
      { id: 'job-delayed', state: 'delayed', progress: 0 },
      { status: 'queued' },
    ],
    [
      'returnvalue 为 failed 时返回 error',
      {
        id: 'job-rv-failed',
        state: 'completed',
        progress: 100,
        returnvalue: { status: 'failed', error: 'Parameter validation failed' },
      },
      { status: 'completed', error: 'Parameter validation failed' },
    ],
  ])('%s', async (_n, job, expected) => {
    queueMocks.getJob.mockResolvedValue(createMockJob(job));
    const res = await fetch(`${server.url}/api/backtest/runs/${job.id}`);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.jobId).toBe(job.id);
    expect(json.data.status).toBe(expected.status);
    if (expected.progress !== undefined) expect(json.data.progress).toBe(expected.progress);
    if (expected.result !== undefined) expect(json.data.result).toEqual(expected.result);
    if (expected.error !== undefined) expect(json.data.error).toBe(expected.error);
    if (expected.noResult) expect(json.data.result).toBeUndefined();
    if (expected.noError) expect(json.data.error).toBeUndefined();
  });
  it('任务不存在时返回 404', async () => {
    queueMocks.getJob.mockResolvedValue(null);
    const res = await fetch(`${server.url}/api/backtest/runs/nonexistent`);
    const json = await res.json();
    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('JOB_NOT_FOUND');
  });
});
