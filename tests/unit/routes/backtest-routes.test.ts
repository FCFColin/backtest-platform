import { describe, it, expect, vi } from 'vitest';
import {
  startExpressApp,
  useTestServer,
  type TestRequest,
  postJson,
  reqJson,
} from '../../helpers/expressApp.js';
import { withServer } from '../../helpers/serverLifecycle.js';
import { m, loggerMocks, queueMocks, resetQueueMocks } from './backtestRoutes.shared.js';
import backtestRoutes from '../../../packages/backend/src/routes/backtestRoutes.js';
import {
  createValidParameters,
  createValidPortfolio,
  createValidRequestBody,
  createBacktestApp,
  setupPortfolioServer,
  startEngineRouteServer,
} from '../../helpers/backtestRoutesFixtures.js';
import { createMockJob } from '../../helpers/jobFixtures.js';
import { EngineUnavailableErrorStub } from '../../helpers/engineFixture.js';
import {
  setBacktestResultCache,
  backtestCacheKey,
} from '../../../packages/backend/src/application/backtest/backtestResultUtils.js';
import { mockBacktestResult } from '../../helpers/storeFixtures.js';
import analysisRoutes from '../../../packages/backend/src/routes/analysisRoutes.js';
import { jobRoutes } from '../../../packages/backend/src/routes/jobRoutes.js';
import {
  describeEngineRouteTests,
  describeSignalRouteTests,
  type EngineCase,
  type SignalCase,
} from '../../helpers/routeTestDsl.js';

const get = (url: string, headers?: Record<string, string>) =>
  reqJson(url, 'GET', undefined, headers).then(({ res, body }) => ({ res, json: body }));

const portfolioJobServer = () => (resetQueueMocks(), setupPortfolioServer(backtestRoutes, m));

const manyTickers = Array.from({ length: 51 }, (_, i) => `T${i}`);

const engineCases: EngineCase[] = [
  {
    name: 'analysis',
    path: '/api/v1/backtest/analysis',
    enginePath: '/api/engine/analysis',
    errorCode: 'ANALYSIS_ERROR',
    logOnError: true,
    result: { tickers: [{ ticker: 'AAPL', cagr: 0.1 }], correlations: [[1]] },
    validBody: () => ({ tickers: ['AAPL', 'BND'], parameters: createValidParameters() }),
    invalidBodies: [
      ['缺失 tickers', { parameters: createValidParameters() }],
      ['ticker 数量超限', { tickers: manyTickers, parameters: createValidParameters() }],
    ],
    specials: [
      [
        'tickers 为空格分隔字符串时应正常处理',
        async (url, c) => {
          m.callEngineStrict.mockResolvedValue({
            tickers: [{ ticker: 'AAPL' }, { ticker: 'BND' }],
            correlations: [[1]],
          });
          const { res } = await postJson(url, { ...c.validBody(), tickers: 'AAPL BND' });
          expect(res.status).toBe(200);
          expect((m.callEngineStrict.mock.calls[0][1] as { tickers: string[] }).tickers).toEqual([
            'AAPL',
            'BND',
          ]);
        },
      ],
      [
        '引擎返回 assets 字段时应映射为 tickers',
        async (url, c) => {
          m.callEngineStrict.mockResolvedValue({
            assets: [{ ticker: 'AAPL', cagr: 0.1 }],
            correlations: [[1]],
          });
          const { res, json } = await postJson(url, { ...c.validBody(), tickers: ['AAPL'] });
          expect(res.status).toBe(200);
          expect(json.data.tickers).toEqual([{ ticker: 'AAPL', cagr: 0.1 }]);
        },
      ],
    ],
  },
  {
    name: 'monte-carlo',
    path: '/api/v1/backtest/monte-carlo',
    enginePath: '/api/engine/monte-carlo',
    errorCode: 'MONTE_CARLO_ERROR',
    logOnError: false,
    result: { paths: [], statistics: {} },
    validBody: () => ({
      portfolio: createValidPortfolio(),
      parameters: createValidParameters(),
      mcParams: {
        numSimulations: 100,
        numYears: 20,
        minBlockYears: 1,
        maxBlockYears: 3,
        successThreshold: 1.0,
      },
    }),
    invalidBodies: [['缺少 portfolio', { parameters: createValidParameters() }]],
    specials: [
      [
        'mcParams 应透传到引擎',
        async (url, c) => {
          await postJson(url, c.validBody());
          expect((m.callEngineStrict.mock.calls[0][1] as { mcParams: unknown }).mcParams).toEqual({
            numSimulations: 100,
            numYears: 20,
            minBlockYears: 1,
            maxBlockYears: 3,
            successThreshold: 1.0,
          });
        },
      ],
      [
        '恶意 mcParams 键应被剥离',
        async (url, _c) => {
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
        },
      ],
    ],
  },
  {
    name: 'optimize',
    path: '/api/v1/backtest/optimize',
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
        '无效 objective',
        { tickers: ['AAPL'], objective: 'invalidObjective', parameters: createValidParameters() },
      ],
      [
        'ticker 数量超限',
        { tickers: manyTickers, objective: 'maxSharpe', parameters: createValidParameters() },
      ],
    ],
    specials: [
      [
        'numIterations 应被正确上限截断',
        async (url, c) => {
          const { res } = await postJson(url, {
            ...c.validBody(),
            objective: 'minVolatility',
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
    path: '/api/v1/backtest/efficient-frontier',
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
      ['ticker 数量超限', { tickers: manyTickers, parameters: createValidParameters() }],
    ],
    specials: [],
  },
];

describeEngineRouteTests({
  startServer: (c) => () => {
    m.callEngineStrict.mockResolvedValue(c.result);
    return startEngineRouteServer(backtestRoutes, m);
  },
  unavailableError: EngineUnavailableErrorStub,
  mocks: () => ({ callEngineStrict: m.callEngineStrict, loggerError: loggerMocks.error }),
})(engineCases);

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

const signalCases: SignalCase[] = [
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
];

describeSignalRouteTests({
  startServer: (c) => () => {
    vi.clearAllMocks();
    m.fetchHistoryData.mockResolvedValue({ data: c.data, degraded: false });
    m.callEngineStrict.mockResolvedValue(c.engineResult);
    return startExpressApp((app) => app.use('/api/v1', analysisRoutes));
  },
  mocks: () => ({ callEngineStrict: m.callEngineStrict, fetchHistoryData: m.fetchHistoryData }),
})(signalCases);

describe('backtestRoutes - POST /api/v1/backtest/portfolio', () => {
  const getServer = withServer(portfolioJobServer);
  it('有效参数应入队并返回 202', async () => {
    queueMocks.add.mockResolvedValue({ id: 'job-test-001' });
    const { res, json } = await postJson(
      `${getServer().url}/api/v1/backtest/portfolio`,
      createValidRequestBody(),
    );
    expect(res.status).toBe(202);
    expect(json.data).toMatchObject({ jobId: 'job-test-001', status: 'queued' });
    expect(json.data.statusUrl).toContain('/api/v1/backtest/runs/');
  });
  it.each([
    [
      '无效日期格式',
      () => {
        const body = createValidRequestBody();
        (body.parameters as Record<string, unknown>).startDate = 'not-a-date';
        return body;
      },
    ],
    ['缺少 portfolios', () => ({ parameters: { startDate: '2024-01-01', endDate: '2024-06-30' } })],
    [
      '缺少 parameters',
      () => ({
        portfolios: [{ assets: [{ ticker: 'AAPL', weight: 100 }], rebalanceFrequency: 'monthly' }],
      }),
    ],
    [
      '空 portfolios',
      () => ({ portfolios: [], parameters: { startDate: '2024-01-01', endDate: '2024-06-30' } }),
    ],
  ])('%s 应返回 400 且不入队', async (_n, getBody) => {
    const { res } = await postJson(`${getServer().url}/api/v1/backtest/portfolio`, getBody());
    expect(res.status).toBe(400);
    expect(queueMocks.add).not.toHaveBeenCalled();
  });
  it('队列不可用时应 fail-closed 返回 503 + Retry-After（ADR-008）', async () => {
    queueMocks.add.mockRejectedValueOnce(new Error('Redis unavailable'));
    const { res, json } = await postJson(
      `${getServer().url}/api/v1/backtest/portfolio`,
      createValidRequestBody(),
    );
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('30');
    expect(json).toMatchObject({
      success: false,
      error: { code: 'SERVICE_TEMPORARILY_UNAVAILABLE' },
    });
  });
  it('X-Backtest-Sync: true 时仍走异步路径返回 202', async () => {
    queueMocks.add.mockResolvedValue({ id: 'job-async-002' });
    const res = await fetch(`${getServer().url}/api/v1/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Backtest-Sync': 'true' },
      body: JSON.stringify(createValidRequestBody()),
    });
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, data: { jobId: 'job-async-002' } });
  });
});

describe('backtestRoutes - POST /api/v1/backtest/portfolio/series', () => {
  const getServer = withServer(() => setupPortfolioServer(backtestRoutes, m));
  it('缓存命中时应返回请求的序列字段', async () => {
    const body = createValidRequestBody();
    await setBacktestResultCache(
      backtestCacheKey(body.portfolios, body.parameters, undefined),
      mockBacktestResult(),
    );
    const { res, json } = await postJson(`${getServer().url}/api/v1/backtest/portfolio/series`, {
      ...body,
      series: ['rollingReturns'],
    });
    expect(res.status).toBe(200);
    expect(json.data.portfolios[0].rollingReturns).toEqual([]);
  });
  it('缓存未命中时应返回 404', async () => {
    const body = createValidRequestBody();
    const { res } = await postJson(`${getServer().url}/api/v1/backtest/portfolio/series`, {
      ...body,
      parameters: { ...body.parameters, startingValue: 99999 },
      series: ['rollingReturns'],
    });
    expect(res.status).toBe(404);
  });
});

describe('backtestRoutes - GET /api/v1/backtest/search', () => {
  const getServer = withServer(() => {
    vi.clearAllMocks();
    return createBacktestApp(backtestRoutes);
  });
  it('应返回搜索结果', async () => {
    m.searchTickers.mockResolvedValue([{ ticker: 'AAPL', name: 'Apple', market: 'US' }]);
    const { res, json } = await get(`${getServer().url}/api/v1/backtest/search?query=aapl`);
    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
  });
  it('缺少 query 参数应返回 422', async () => {
    const { res } = await get(`${getServer().url}/api/v1/backtest/search`);
    expect(res.status).toBe(422);
  });
  it('搜索服务抛错时应返回 500', async () => {
    m.searchTickers.mockRejectedValue(new Error('search failed'));
    const { res } = await get(`${getServer().url}/api/v1/backtest/search?query=aapl`);
    expect(res.status).toBe(500);
  });
});

describe('backtestRoutes - GET /api/v1/backtest/runs/:jobId', () => {
  const { url: serverUrl } = useTestServer('/api/v1/backtest', backtestRoutes, {
    auth: { user: { sub: 'test-user', role: 'admin' }, tenantId: 'tenant-456' },
    configure: () => resetQueueMocks(),
  });
  const completedResult = {
    data: { portfolios: [{ name: 'Test', growthCurve: [] }] },
    warnings: [],
    dateRange: { start: '2024-01-01', end: '2024-06-30' },
  };
  it.each([
    [
      'completed 状态返回结果',
      {
        id: 'job-done',
        data: { type: 'optimizer', tenantId: 'tenant-456' },
        state: 'completed',
        progress: 100,
        returnvalue: { status: 'completed', result: completedResult },
      },
      { status: 'completed', progress: 100, result: completedResult },
    ],
    [
      'failed 状态返回错误',
      {
        id: 'job-failed',
        data: { type: 'optimizer', tenantId: 'tenant-456' },
        state: 'failed',
        progress: 30,
        failedReason: 'Engine timeout',
      },
      { status: 'failed', error: 'Job execution failed', noResult: true },
    ],
    [
      'running 状态返回进度',
      {
        id: 'job-running',
        data: { type: 'optimizer', tenantId: 'tenant-456' },
        state: 'active',
        progress: 45,
      },
      { status: 'running', progress: 45, noResult: true, noError: true },
    ],
    [
      'delayed 映射为 queued',
      {
        id: 'job-delayed',
        data: { type: 'optimizer', tenantId: 'tenant-456' },
        state: 'delayed',
        progress: 0,
      },
      { status: 'queued' },
    ],
    [
      'returnvalue 为 failed',
      {
        id: 'job-rv-failed',
        data: { type: 'optimizer', tenantId: 'tenant-456' },
        state: 'completed',
        progress: 100,
        returnvalue: { status: 'failed', error: 'Parameter validation failed' },
      },
      { status: 'completed', error: 'Parameter validation failed' },
    ],
  ])('%s', async (_n, job, expected) => {
    queueMocks.getJob.mockResolvedValue(createMockJob(job));
    const { res, json } = await get(`${serverUrl()}/api/v1/backtest/runs/${job.id}`);
    const data = json.data as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(data.status).toBe(expected.status);
    if (expected.progress !== undefined) expect(data.progress).toBe(expected.progress);
    if (expected.result !== undefined) expect(data.result).toEqual(expected.result);
    if (expected.error !== undefined) expect(data.error).toBe(expected.error);
    if (expected.noResult) expect(data.result).toBeUndefined();
    if (expected.noError) expect(data.error).toBeUndefined();
  });
  it('任务不存在时返回 404', async () => {
    queueMocks.getJob.mockResolvedValue(null);
    const { res, json } = await get(`${serverUrl()}/api/v1/backtest/runs/nonexistent`);
    expect(res.status).toBe(404);
    expect(json.error.code).toBe('JOB_NOT_FOUND');
  });
});

describe('jobRoutes - GET /api/v1/jobs/:id', () => {
  const getServer = withServer(() => {
    vi.clearAllMocks();
    return startExpressApp((app) => {
      app.use((req: TestRequest, _res, next) => {
        req.user = {
          sub: (req.headers['x-test-sub'] as string) || 'admin-user',
          role: (req.headers['x-test-role'] as string) || 'admin',
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

  it('任务存在且已完成时应返回结果', async () => {
    queueMocks.getJob.mockResolvedValue(
      createMockJob({ id: 'job-123', returnvalue: { best: { cagr: 0.12 } } }),
    );
    const { res, json } = await get(`${getServer().url}/api/v1/jobs/job-123`);
    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({
      id: 'job-123',
      status: 'completed',
      result: { best: { cagr: 0.12 } },
    });
  });

  it('任务失败时应返回通用错误', async () => {
    queueMocks.getJob.mockResolvedValue(
      createMockJob({
        id: 'job-456',
        data: { type: 'grid-search' },
        failedReason: 'Engine timeout',
        getState: vi.fn().mockResolvedValue('failed'),
      }),
    );
    const { json } = await get(`${getServer().url}/api/v1/jobs/job-456`);
    expect(json.data.status).toBe('failed');
    expect(json.data.error).not.toContain('Engine timeout');
  });

  it.each([
    [
      '越权访问他人任务',
      createMockJob({ id: 'job-owned', data: { type: 'optimizer', userId: 'owner-user' } }),
      { 'x-test-sub': 'attacker', 'x-test-role': 'analyst' },
      404,
    ],
    [
      '所有者本人可访问',
      createMockJob({ id: 'job-mine', data: { type: 'optimizer', userId: 'owner-user' } }),
      { 'x-test-sub': 'owner-user', 'x-test-role': 'analyst' },
      200,
    ],
    [
      '跨租户访问应返回 404',
      createMockJob({
        id: 'job-tenant-a',
        data: { type: 'optimizer', userId: 'owner-user', tenantId: 'org-a' },
      }),
      { 'x-test-sub': 'admin-user', 'x-test-role': 'admin', 'x-test-tenant': 'org-b' },
      404,
    ],
    [
      '同租户 admin 可访问',
      createMockJob({
        id: 'job-tenant-ok',
        data: { type: 'optimizer', userId: 'someone', tenantId: 'org-a' },
      }),
      { 'x-test-sub': 'admin-user', 'x-test-role': 'admin', 'x-test-tenant': 'org-a' },
      200,
    ],
    [
      '平台管理员可跨租户',
      createMockJob({
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
    const { res } = await get(`${getServer().url}/api/v1/jobs/${job.id}`, headers);
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
    const { res, json } = await get(`${getServer().url}/api/v1/jobs/nonexistent`);
    expect(res.status).toBe(404);
    expect(json.error).toMatchObject({ status: 404, title: 'JOB_NOT_FOUND' });
  });
  it('getJob 抛错时应返回 500', async () => {
    queueMocks.getJob.mockRejectedValue(new Error('Redis connection failed'));
    const { res, json } = await get(`${getServer().url}/api/v1/jobs/job-err`);
    expect(res.status).toBe(500);
    expect(json.error).toMatchObject({ status: 500, title: 'JOB_STATUS_ERROR' });
  });

  it('active 状态归一化为 running', async () => {
    queueMocks.getJob.mockResolvedValue(
      createMockJob({
        id: 'job-active',
        finishedOn: undefined,
        getState: vi.fn().mockResolvedValue('active'),
      }),
    );
    const { json } = await get(`${getServer().url}/api/v1/jobs/job-active`);
    expect(json.data).toMatchObject({ status: 'running' });
    expect(json.data).not.toHaveProperty('result');
  });
});
