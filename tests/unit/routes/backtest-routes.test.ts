import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer, type TestRequest } from '../../helpers/expressApp.js';
import { m, loggerMocks, queueMocks, MockEngineUnavailableError } from './backtestRoutes.shared.js';
import backtestRoutes from '../../../packages/backend/src/routes/backtestRoutes.js';
import {
  createValidParameters,
  createValidPortfolio,
  createValidRequestBody,
  createBacktestApp,
  setupPortfolioServer,
  clearBacktestResultCache,
  startEngineRouteServer,
} from '../../helpers/backtestRoutesFixtures.js';
import {
  setBacktestResultCache,
  backtestCacheKey,
} from '../../../packages/backend/src/application/backtest/backtestResultUtils.js';
import { mockBacktestResult } from '../../helpers/storeFixtures.js';

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
  invalidBodies: Array<[string, Record<string, unknown>]>;
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
    invalidBodies: [
      ['缺失 tickers（zod 校验）', { parameters: createValidParameters() }],
      [
        'ticker 数量超限（schema refine）',
        {
          tickers: Array.from({ length: 51 }, (_, i) => `T${i}`),
          parameters: createValidParameters(),
        },
      ],
    ],
    specials: [
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
    invalidBodies: [['缺少 portfolio（zod refine）', { parameters: createValidParameters() }]],
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
    invalidBodies: [
      [
        '无效 objective（zod 校验）',
        { tickers: ['AAPL'], objective: 'invalidObjective', parameters: createValidParameters() },
      ],
      [
        'ticker 数量超限（schema refine）',
        {
          tickers: Array.from({ length: 51 }, (_, i) => `T${i}`),
          objective: 'maxSharpe',
          parameters: createValidParameters(),
        },
      ],
    ],
    specials: [
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
    invalidBodies: [
      ['空 tickers 数组', { tickers: [], parameters: createValidParameters() }],
      [
        'ticker 数量超限',
        {
          tickers: Array.from({ length: 51 }, (_, i) => `T${i}`),
          parameters: createValidParameters(),
        },
      ],
    ],
    specials: [],
  },
];

describe.each(engineCases)('backtestRoutes - POST $path', (c) => {
  let server: Server;
  beforeEach(async () => {
    server = await startEngineRouteServer(backtestRoutes, m);
    m.callEngineStrict.mockResolvedValue(c.result);
  });
  afterEach(() => server.close());
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
  it.each(c.invalidBodies)('%s 应返回 400 且不调用引擎', async (_n, body) => {
    const { res } = await postJson(`${server.url}${c.path}`, body);
    expect(res.status).toBe(400);
    expect(m.callEngineStrict).not.toHaveBeenCalled();
  });
  it.each(c.specials)('%s', async (_n, fn) => {
    await fn(`${server.url}${c.path}`);
  });
});

import analysisRoutes from '../../../packages/backend/src/routes/analysisRoutes.js';

function createSignalConfig(ticker = 'SPY') {
  return {
    ticker,
    indicator: 'sma',
    period: 20,
    threshold: 0,
    startDate: '2020-01-01',
    endDate: '2024-01-01',
    signalType: 'both' as const,
  };
}

const mockSignalResult = {
  signals: [{ date: '2020-01-02', type: 'buy', price: 301.0 }],
  statistics: { totalSignals: 1, winRate: 1.0, avgReturn: 0.01, maxDrawdown: 0, sharpe: 2.0 },
  equityCurve: [{ date: '2020-01-01', value: 10000 }],
};

async function apiPost(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { res, body: await res.json().catch(() => null) };
}

describe.each([
  {
    path: '/api/v1/signal/analyze',
    data: { SPY: { '2020-01-01': 300.0, '2020-01-02': 301.0 } },
    engineResult: mockSignalResult,
    validReq: () => createSignalConfig(),
    validation: [
      [
        '缺少 ticker',
        () => {
          const r = createSignalConfig();
          delete (r as Record<string, unknown>).ticker;
          return r;
        },
      ],
      ['无效 signalType', () => ({ ...createSignalConfig(), signalType: 'invalid' })],
    ],
  },
  {
    path: '/api/v1/signal/dual',
    data: { SPY: { '2020-01-01': 300.0 }, QQQ: { '2020-01-01': 200.0 } },
    engineResult: { ...mockSignalResult, equityCurve: [] },
    validReq: () => ({
      signal1: createSignalConfig('SPY'),
      signal2: createSignalConfig('QQQ'),
      combinationMethod: 'and',
    }),
    validation: [
      [
        '缺少 combinationMethod',
        () => ({ signal1: createSignalConfig('SPY'), signal2: createSignalConfig('QQQ') }),
      ],
    ],
  },
  {
    path: '/api/v1/signal/multi',
    data: { SPY: { '2020-01-01': 300.0, '2020-01-02': 301.0 } },
    engineResult: { ...mockSignalResult, equityCurve: [] },
    validReq: () => ({
      signals: [
        createSignalConfig('SPY'),
        { ...createSignalConfig('SPY'), indicator: 'rsi', period: 14, threshold: 30 },
      ],
      aggregationMethod: 'voting',
    }),
    validation: [
      ['空 signals 数组', () => ({ signals: [], aggregationMethod: 'voting' })],
      ['缺少 aggregationMethod', () => ({ signals: [createSignalConfig('SPY')] })],
    ],
  },
])('signalRoutes - POST $path', (c) => {
  let server: Server;
  beforeEach(async () => {
    vi.clearAllMocks();
    m.fetchHistoryData.mockResolvedValue({ data: c.data, degraded: false });
    m.callEngineStrict.mockResolvedValue(c.engineResult);
    server = await startExpressApp((app) => app.use('/api/v1', analysisRoutes));
  });
  afterEach(() => server.close());

  it('有效参数应返回分析结果', async () => {
    const { res, body } = await apiPost(`${server.url}${c.path}`, c.validReq());
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.signals).toHaveLength(1);
    expect(m.callEngineStrict).toHaveBeenCalledTimes(1);
  });
  it.each(c.validation)('%s 应返回 400（zod 校验失败）', async (_n, getReq) => {
    const { res } = await apiPost(`${server.url}${c.path}`, getReq());
    expect(res.status).toBe(400);
    expect(m.callEngineStrict).not.toHaveBeenCalled();
  });
  it('价格数据缺失时应返回 404', async () => {
    m.fetchHistoryData.mockResolvedValue({ data: { SPY: {} }, degraded: false });
    const { res, body } = await apiPost(`${server.url}${c.path}`, c.validReq());
    expect(res.status).toBe(404);
    expect(body.error.code).toBe('DATA_NOT_FOUND');
  });
  it('引擎抛错时应返回 500', async () => {
    m.callEngineStrict.mockRejectedValueOnce(new Error('signal engine error'));
    const { res } = await apiPost(`${server.url}${c.path}`, c.validReq());
    expect(res.status).toBe(500);
  });
});

describe('backtestRoutes - POST /api/backtest/portfolio', () => {
  let server: Server;
  beforeEach(async () => {
    server = await setupPortfolioServer(backtestRoutes, m);
    queueMocks.add.mockReset();
    queueMocks.getJob.mockReset();
  });
  afterEach(() => server.close());
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
  afterEach(() => server.close());
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
  afterEach(() => server.close());
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
  afterEach(() => server.close());
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

import { jobRoutes } from '../../../packages/backend/src/routes/jobRoutes.js';

function mockJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-123',
    data: { type: 'optimizer' },
    timestamp: 1700000000000,
    processedOn: 1700000001000,
    finishedOn: 1700000005000,
    returnvalue: undefined,
    failedReason: undefined,
    getState: vi.fn().mockResolvedValue('completed'),
    ...overrides,
  };
}

describe('jobRoutes - GET /api/v1/jobs/:id', () => {
  let server: TestServer;
  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startExpressApp((app) => {
      app.use((req: TestRequest, _res, next) => {
        const sub = (req.headers['x-test-sub'] as string) || 'admin-user';
        const role = (req.headers['x-test-role'] as string) || 'admin';
        req.user = {
          sub,
          role,
          platform_admin: req.headers['x-test-platform'] === 'true',
          iat: 0,
          exp: 0,
        };
        req.tenantId = (req.headers['x-test-tenant'] as string) || undefined;
        next();
      });
      app.use('/api/v1', jobRoutes);
    });
  });
  afterEach(async () => {
    await server.close();
  });

  it('任务存在且已完成时应返回结果', async () => {
    queueMocks.getJob.mockResolvedValue(
      mockJob({ id: 'job-123', returnvalue: { best: { cagr: 0.12 } } }),
    );
    const res = await fetch(`${server.url}/api/v1/jobs/job-123`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.id).toBe('job-123');
    expect(body.data.type).toBe('optimizer');
    expect(body.data.state).toBe('completed');
    expect(body.data.createdAt).toBe(1700000000000);
    expect(body.data.processedAt).toBe(1700000001000);
    expect(body.data.finishedAt).toBe(1700000005000);
    expect(body.data.result).toEqual({ best: { cagr: 0.12 } });
    expect(queueMocks.getJob).toHaveBeenCalledWith('job-123');
  });

  it('任务存在且失败时应返回通用错误（不泄露内部 failedReason）', async () => {
    queueMocks.getJob.mockResolvedValue(
      mockJob({
        id: 'job-456',
        data: { type: 'grid-search' },
        failedReason: 'Engine timeout',
        getState: vi.fn().mockResolvedValue('failed'),
      }),
    );
    const res = await fetch(`${server.url}/api/v1/jobs/job-456`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.state).toBe('failed');
    expect(body.data.error).toBe('Job execution failed');
    expect(body.data.error).not.toContain('Engine timeout');
    expect(body.data.result).toBeUndefined();
  });

  it.each([
    [
      '越权访问他人任务应返回 404（ADR-019）',
      mockJob({ id: 'job-owned', data: { type: 'optimizer', userId: 'owner-user' } }),
      { 'x-test-sub': 'attacker', 'x-test-role': 'analyst' },
      404,
    ],
    [
      '所有者本人可访问自己的任务',
      mockJob({ id: 'job-mine', data: { type: 'optimizer', userId: 'owner-user' } }),
      { 'x-test-sub': 'owner-user', 'x-test-role': 'analyst' },
      200,
    ],
    [
      '跨租户访问任务应返回 404，即便是 admin（ADR-034）',
      mockJob({
        id: 'job-tenant-a',
        data: { type: 'optimizer', userId: 'owner-user', tenantId: 'org-a' },
      }),
      { 'x-test-sub': 'admin-user', 'x-test-role': 'admin', 'x-test-tenant': 'org-b' },
      404,
    ],
    [
      '同租户 admin 可访问租户任务',
      mockJob({
        id: 'job-tenant-ok',
        data: { type: 'optimizer', userId: 'someone', tenantId: 'org-a' },
      }),
      { 'x-test-sub': 'admin-user', 'x-test-role': 'admin', 'x-test-tenant': 'org-a' },
      200,
    ],
    [
      '平台管理员可跨租户访问任务（运维）',
      mockJob({
        id: 'job-tenant-pa',
        data: { type: 'optimizer', userId: 'someone', tenantId: 'org-a' },
      }),
      {
        'x-test-sub': 'op',
        'x-test-role': 'admin',
        'x-test-tenant': 'org-b',
        'x-test-platform': 'true',
      },
      200,
    ],
  ])('%s', async (_n, job, headers, expected) => {
    queueMocks.getJob.mockResolvedValue(job);
    const res = await fetch(`${server.url}/api/v1/jobs/${job.id}`, { headers });
    expect(res.status).toBe(expected);
  });

  it('未认证时应返回 401', async () => {
    const unauthServer = await startExpressApp((app) => {
      app.use('/api/v1', jobRoutes);
    });
    try {
      const res = await fetch(`${unauthServer.url}/api/v1/jobs/job-x`);
      expect(res.status).toBe(401);
    } finally {
      await unauthServer.close();
    }
  });

  it('任务不存在时应返回 404', async () => {
    queueMocks.getJob.mockResolvedValue(null);
    const res = await fetch(`${server.url}/api/v1/jobs/nonexistent`);
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error.status).toBe(404);
    expect(body.error.title).toBe('JOB_NOT_FOUND');
  });

  it('getJob 抛错时应返回 500', async () => {
    queueMocks.getJob.mockRejectedValue(new Error('Redis connection failed'));
    const res = await fetch(`${server.url}/api/v1/jobs/job-err`);
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error.status).toBe(500);
    expect(body.error.title).toBe('JOB_STATUS_ERROR');
  });

  it('任务处于 active 状态时不应包含 result 或 error', async () => {
    queueMocks.getJob.mockResolvedValue(
      mockJob({
        id: 'job-active',
        finishedOn: undefined,
        getState: vi.fn().mockResolvedValue('active'),
      }),
    );
    const res = await fetch(`${server.url}/api/v1/jobs/job-active`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.state).toBe('active');
    expect(body.data.result).toBeUndefined();
    expect(body.data.error).toBeUndefined();
  });
});
