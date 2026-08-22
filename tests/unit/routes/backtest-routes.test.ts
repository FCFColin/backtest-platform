/* eslint-disable @typescript-eslint/no-explicit-any -- test mock */
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
  createBacktestApp,
  createValidParameters as P,
  createValidPortfolio as VP,
  createValidRequestBody,
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
const get = (url: string, h?: Record<string, string>) =>
  reqJson(url, 'GET', void 0, h).then(({ res, body }) => ({ res, json: body }));
const portfolioJobServer = () => (resetQueueMocks(), setupPortfolioServer(backtestRoutes, m));
const MT = Array.from({ length: 51 }, (_, i) => `T${i}`);
const t1 = { tickers: [{ ticker: 'AAPL' }, { ticker: 'BND' }], correlations: [[1]] };
const t2 = { assets: [{ ticker: 'AAPL', cagr: 0.1 }], correlations: [[1]] };
const expMc = {
  numSimulations: 100,
  numYears: 20,
  minBlockYears: 1,
  maxBlockYears: 3,
  successThreshold: 1,
};
const evil = {
  numSimulations: 50,
  __proto__: { polluted: true },
  constructor: 'evil',
  maliciousKey: 'strip-me',
};
const sent = () => m.callEngineStrict.mock.calls[0][1] as any;
const h1 = async (url: string, c: EngineCase) => {
  m.callEngineStrict.mockResolvedValue(t1);
  const { res } = await postJson(url, { ...c.validBody(), tickers: 'AAPL BND' });
  expect(res.status).toBe(200);
  expect(sent().tickers).toEqual(['AAPL', 'BND']);
};
const h2 = async (url: string, c: EngineCase) => {
  m.callEngineStrict.mockResolvedValue(t2);
  const { res, json } = await postJson(url, { ...c.validBody(), tickers: ['AAPL'] });
  expect(res.status).toBe(200);
  expect(json.data.tickers).toEqual([{ ticker: 'AAPL', cagr: 0.1 }]);
};
const h3 = async (url: string, c: EngineCase) => {
  await postJson(url, c.validBody());
  expect(sent().mcParams).toEqual(expMc);
};
const h4 = async (url: string) => {
  await postJson(url, { portfolio: VP(), parameters: P(), mcParams: evil });
  const mp = sent().mcParams;
  expect(mp).toEqual({ numSimulations: 50 });
  expect(mp).not.toHaveProperty('maliciousKey');
};
const h5 = async (url: string, c: EngineCase) => {
  const body = { ...c.validBody(), objective: 'minVolatility', numIterations: 50000 };
  const { res } = await postJson(url, body);
  expect(res.status).toBe(200);
  expect(sent().numIterations).toBe(50000);
};
type RawEngineCase = Omit<EngineCase, 'path' | 'enginePath'>;
const rawEngineCases: RawEngineCase[] = [
  {
    name: 'analysis',
    errorCode: 'ANALYSIS_ERROR',
    logOnError: true,
    result: { tickers: [{ ticker: 'AAPL', cagr: 0.1 }], correlations: [[1]] },
    validBody: () => ({ tickers: ['AAPL', 'BND'], parameters: P() }),
    invalidBodies: [
      ['缺失 tickers', { parameters: P() }],
      ['ticker 数量超限', { tickers: MT, parameters: P() }],
    ],
    specials: [
      ['tickers 为空格分隔字符串时应正常处理', h1],
      ['引擎返回 assets 字段时应映射为 tickers', h2],
    ],
  },
  {
    name: 'monte-carlo',
    errorCode: 'MONTE_CARLO_ERROR',
    result: { paths: [], statistics: {} },
    validBody: () => ({ portfolio: VP(), parameters: P(), mcParams: expMc }),
    invalidBodies: [['缺少 portfolio', { parameters: P() }]],
    specials: [
      ['mcParams 应透传到引擎', h3],
      ['恶意 mcParams 键应被剥离', h4],
    ],
  },
  {
    name: 'optimize',
    errorCode: 'OPTIMIZATION_ERROR',
    result: {
      optimalWeights: { AAPL: 0.6, BND: 0.4 },
      expectedReturn: 0.1,
      expectedVolatility: 0.15,
      sharpeRatio: 1.2,
    },
    validBody: () => ({ tickers: ['AAPL', 'BND'], objective: 'maxSharpe', parameters: P() }),
    invalidBodies: [
      ['无效 objective', { tickers: ['AAPL'], objective: 'invalidObjective', parameters: P() }],
      ['ticker 数量超限', { tickers: MT, objective: 'maxSharpe', parameters: P() }],
    ],
    specials: [['numIterations 应被正确上限截断', h5]],
  },
  {
    name: 'efficient-frontier',
    errorCode: 'EFFICIENT_FRONTIER_ERROR',
    result: {
      frontier: [
        { weights: { AAPL: 1 }, expectedReturn: 0.1, expectedVolatility: 0.2, sharpeRatio: 0.5 },
      ],
    },
    validBody: () => ({ tickers: ['AAPL', 'BND'], parameters: P(), numPoints: 10 }),
    invalidBodies: [
      ['空 tickers 数组', { tickers: [], parameters: P() }],
      ['ticker 数量超限', { tickers: MT, parameters: P() }],
    ],
  },
];
const engineCases: EngineCase[] = rawEngineCases.map((c) => ({
  ...c,
  path: `/api/v1/backtest/${c.name}`,
  enginePath: `/api/engine/${c.name}`,
}));
describeEngineRouteTests({
  startServer: (c) => () => (
    m.callEngineStrict.mockResolvedValue(c.result),
    startEngineRouteServer(backtestRoutes, m)
  ),
  unavailableError: EngineUnavailableErrorStub,
  mocks: () => ({ callEngineStrict: m.callEngineStrict, loggerError: loggerMocks.error }),
})(engineCases);
function mkSig(t = 'SPY') {
  return {
    ticker: t,
    indicator: 'sma',
    period: 20,
    threshold: 0,
    startDate: '2020-01-01',
    endDate: '2024-01-01',
    signalType: 'both' as const,
  };
}
const mockSignalResult = {
  signals: [{ date: '2020-01-02', type: 'buy', price: 301 }],
  statistics: { totalSignals: 1, winRate: 1, avgReturn: 0.01, maxDrawdown: 0, sharpe: 2 },
  equityCurve: [{ date: '2020-01-01', value: 10000 }],
};
const noTicker = (): any => {
  const r: any = mkSig();
  delete r.ticker;
  return r;
};
const signalCases: SignalCase[] = [
  {
    path: '/api/v1/signal/analyze',
    data: { SPY: { '2020-01-01': 300, '2020-01-02': 301 } },
    engineResult: mockSignalResult,
    validReq: () => mkSig(),
    validation: [
      ['缺失 ticker', noTicker],
      ['无效 signalType', () => ({ ...mkSig(), signalType: 'invalid' })],
    ],
  },
  {
    path: '/api/v1/signal/dual',
    data: { SPY: { '2020-01-01': 300 }, QQQ: { '2020-01-01': 200 } },
    engineResult: { ...mockSignalResult, equityCurve: [] },
    validReq: () => ({ signal1: mkSig('SPY'), signal2: mkSig('QQQ'), combinationMethod: 'and' }),
    validation: [
      ['缺少 combinationMethod', () => ({ signal1: mkSig('SPY'), signal2: mkSig('QQQ') })],
    ],
  },
  {
    path: '/api/v1/signal/multi',
    data: { SPY: { '2020-01-01': 300, '2020-01-02': 301 } },
    engineResult: { ...mockSignalResult, equityCurve: [] },
    validReq: () => ({
      signals: [mkSig('SPY'), { ...mkSig('SPY'), indicator: 'rsi', period: 14, threshold: 30 }],
      aggregationMethod: 'voting',
    }),
    validation: [
      ['空 signals 数组', () => ({ signals: [], aggregationMethod: 'voting' })],
      ['缺少 aggregationMethod', () => ({ signals: [mkSig('SPY')] })],
    ],
  },
];
describeSignalRouteTests({
  startServer: (c) => () => (
    vi.clearAllMocks(),
    m.fetchHistoryData.mockResolvedValue({ data: c.data, degraded: false }),
    m.callEngineStrict.mockResolvedValue(c.engineResult),
    startExpressApp((a) => a.use('/api/v1', analysisRoutes))
  ),
  mocks: () => ({ callEngineStrict: m.callEngineStrict, fetchHistoryData: m.fetchHistoryData }),
})(signalCases);
describe('backtestRoutes - POST /api/v1/backtest/portfolio', () => {
  const getServer = withServer(portfolioJobServer);
  const url = () => `${getServer().url}/api/v1/backtest/portfolio`;
  it('有效参数应入队并返回 202', async () => {
    queueMocks.add.mockResolvedValue({ id: 'job-test-001' });
    const { res, json } = await postJson(url(), createValidRequestBody());
    expect(res.status).toBe(202);
    expect(json.data).toMatchObject({ jobId: 'job-test-001', status: 'queued' });
    expect(json.data.statusUrl).toContain('/api/v1/backtest/runs/');
  });
  const badDate = (): any => {
    const b = createValidRequestBody();
    b.parameters.startDate = 'not-a-date';
    return b;
  };
  const PF = { assets: [{ ticker: 'AAPL', weight: 100 }], rebalanceFrequency: 'monthly' };
  const dp = { startDate: '2024-01-01', endDate: '2024-06-30' };
  it.each([
    ['无效日期格式', badDate],
    ['缺少 portfolios', () => ({ parameters: dp })],
    ['缺少 parameters', () => ({ portfolios: [PF] })],
    ['空 portfolios', () => ({ portfolios: [], parameters: dp })],
  ])('%s 应返回 400 且不入队', async (_n, getBody) => {
    expect((await postJson(url(), (getBody as any)())).res.status).toBe(400);
    expect(queueMocks.add).not.toHaveBeenCalled();
  });
  it('队列不可用时应 fail-closed 返回 503 + Retry-After（ADR-008）', async () => {
    queueMocks.add.mockRejectedValueOnce(new Error('Redis unavailable'));
    const { res, json } = await postJson(url(), createValidRequestBody());
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('30');
    const exp = { success: false, error: { code: 'SERVICE_TEMPORARILY_UNAVAILABLE' } };
    expect(json).toMatchObject(exp);
  });
  it('X-Backtest-Sync: true 时仍走异步路径返回 202', async () => {
    queueMocks.add.mockResolvedValue({ id: 'job-async-002' });
    const res = await fetch(url(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Backtest-Sync': 'true' },
      body: JSON.stringify(createValidRequestBody()),
    });
    expect(res.status).toBe(202);
    const j = await res.json();
    expect(j).toMatchObject({ success: true, data: { jobId: 'job-async-002' } });
  });
});
describe('backtestRoutes - POST /api/v1/backtest/portfolio/series', () => {
  const getServer = withServer(() => setupPortfolioServer(backtestRoutes, m));
  const url = () => `${getServer().url}/api/v1/backtest/portfolio/series`;
  it('缓存命中时应返回请求的序列字段', async () => {
    const b = createValidRequestBody();
    await setBacktestResultCache(
      backtestCacheKey(b.portfolios, b.parameters, void 0),
      mockBacktestResult(),
    );
    const { res, json } = await postJson(url(), { ...b, series: ['rollingReturns'] });
    expect(res.status).toBe(200);
    expect(json.data.portfolios[0].rollingReturns).toEqual([]);
  });
  it('缓存未命中时应返回 404', async () => {
    const b = createValidRequestBody();
    b.parameters = { ...P(), startingValue: 99999 };
    const { res } = await postJson(url(), { ...b, series: ['rollingReturns'] });
    expect(res.status).toBe(404);
  });
});
describe('backtestRoutes - GET /api/v1/backtest/search', () => {
  const getServer = withServer(() => (vi.clearAllMocks(), createBacktestApp(backtestRoutes)));
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
  const cr = {
    data: { portfolios: [{ name: 'Test', growthCurve: [] }] },
    warnings: [],
    dateRange: { start: '2024-01-01', end: '2024-06-30' },
  };
  const JD = { type: 'optimizer', tenantId: 'tenant-456' };
  const RVC = { status: 'completed', result: cr };
  const RVF = { status: 'failed', error: 'Parameter validation failed' };
  const j1 = { id: 'job-done', data: JD, state: 'completed', progress: 100, returnvalue: RVC };
  const j2 = { id: 'job-failed', data: JD, state: 'failed', failedReason: 'Engine timeout' };
  const j3 = { id: 'job-running', data: JD, state: 'active', progress: 45 };
  const j4 = { id: 'job-delayed', data: JD, state: 'delayed', progress: 0 };
  const j5 = { id: 'job-rv-failed', data: JD, state: 'completed', progress: 100, returnvalue: RVF };
  it.each([
    ['completed 状态返回结果', j1, { status: 'completed', progress: 100, result: cr }],
    ['failed 状态返回错误', j2, { status: 'failed', error: 'Job execution failed', noRes: true }],
    ['running 状态返回进度', j3, { status: 'running', progress: 45, noRes: true, noErr: true }],
    ['delayed 映射为 queued', j4, { status: 'queued' }],
    ['returnvalue 为 failed', j5, { status: 'completed', error: 'Parameter validation failed' }],
  ])('%s', async (_n, job: any, exp: any) => {
    queueMocks.getJob.mockResolvedValue(createMockJob(job));
    const { res, json } = await get(`${serverUrl()}/api/v1/backtest/runs/${job.id}`);
    const d = json.data as any;
    expect(res.status).toBe(200);
    expect(d.status).toBe(exp.status);
    if (exp.progress !== void 0) expect(d.progress).toBe(exp.progress);
    if (exp.result !== void 0) expect(d.result).toEqual(exp.result);
    if (exp.error !== void 0) expect(d.error).toBe(exp.error);
    if (exp.noRes) expect(d.result).toBeUndefined();
    if (exp.noErr) expect(d.error).toBeUndefined();
  });
  it('任务不存在时返回 404', async () => {
    queueMocks.getJob.mockResolvedValue(null);
    const { res, json } = await get(`${serverUrl()}/api/v1/backtest/runs/nonexistent`);
    expect(res.status).toBe(404);
    expect(json.error.code).toBe('JOB_NOT_FOUND');
  });
});
describe('jobRoutes - GET /api/v1/jobs/:id', () => {
  const authMw = (req: TestRequest, _res: any, next: any) => {
    req.user = {
      sub: (req.headers['x-test-sub'] as string) || 'admin-user',
      role: (req.headers['x-test-role'] as string) || 'admin',
      platform_admin: (req.headers['x-test-platform'] as string) === 'true',
      iat: 0,
      exp: 0,
    };
    req.tenantId = (req.headers['x-test-tenant'] as string) || void 0;
    next();
  };
  const boot = () => startExpressApp((a) => (a.use(authMw), a.use('/api/v1', jobRoutes)));
  const getServer = withServer(() => (vi.clearAllMocks(), boot()));
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
  const mkJob = (id: string, data: any = {}) =>
    createMockJob({ id, data: { type: 'optimizer', userId: 'owner-user', ...data } });
  const oj = mkJob('job-owned');
  const mj = mkJob('job-mine');
  const ta = mkJob('job-tenant-a', { tenantId: 'org-a' });
  const ok = mkJob('job-tenant-ok', { userId: 'someone', tenantId: 'org-a' });
  const pa = mkJob('job-tenant-pa', { userId: 'someone', tenantId: 'org-a' });
  it.each([
    ['越权访问他人任务', oj, ['attacker', 'analyst'], 404],
    ['所有者本人可访问', mj, ['owner-user', 'analyst'], 200],
    ['跨租户访问应返回 404', ta, ['admin-user', 'admin', 'org-b'], 404],
    ['同租户 admin 可访问', ok, ['admin-user', 'admin', 'org-a'], 200],
    ['平台管理员可跨租户', pa, ['op', 'admin', 'org-b', 'true'], 200],
  ])('%s', async (_n: unknown, job: any, hd: string[], exp: number) => {
    queueMocks.getJob.mockResolvedValue(job);
    const h: Record<string, string> = { 'x-test-sub': hd[0], 'x-test-role': hd[1] };
    if (hd[2]) h['x-test-tenant'] = hd[2];
    if (hd[3]) h['x-test-platform'] = hd[3];
    const { res } = await get(`${getServer().url}/api/v1/jobs/${job.id}`, h);
    expect(res.status).toBe(exp);
  });
  it('未认证时应返回 401', async () => {
    const s = await startExpressApp((a) => a.use('/api/v1', jobRoutes));
    try {
      expect((await fetch(`${s.url}/api/v1/jobs/job-x`)).status).toBe(401);
    } finally {
      await s.close();
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
        finishedOn: void 0,
        getState: vi.fn().mockResolvedValue('active'),
      }),
    );
    const { json } = await get(`${getServer().url}/api/v1/jobs/job-active`);
    expect(json.data).toMatchObject({ status: 'running' });
    expect(json.data).not.toHaveProperty('result');
  });
});
