/* eslint-disable @typescript-eslint/no-explicit-any -- test mock */
import { describe, it, expect, vi } from 'vitest';
import {
  startExpressApp,
  useTestServer,
  injectAuth,
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
  setBacktestResultCache as setCache,
  backtestCacheKey as cacheKey,
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
const tk = (mock: any, body: any, ck: (d: any) => void) => async (url: string, c: EngineCase) => {
  m.callEngineStrict.mockResolvedValue(mock);
  const { res, json } = await postJson(url, { ...c.validBody(), tickers: body });
  expect(res.status).toBe(200);
  ck(json.data);
};
const h1 = tk(t1, 'AAPL BND', () => expect(sent().tickers).toEqual(['AAPL', 'BND']));
const h2 = tk(t2, ['AAPL'], (d) => expect(d.tickers).toEqual([{ ticker: 'AAPL', cagr: 0.1 }]));
const h3 = async (url: string, c: EngineCase) => {
  await postJson(url, c.validBody());
  expect(sent().mcParams).toEqual(expMc);
};
const h4 = async (url: string) => {
  await postJson(url, { portfolio: VP(), parameters: P(), mcParams: evil });
  expect(sent().mcParams).toEqual({ numSimulations: 50 });
  expect(sent().mcParams).not.toHaveProperty('maliciousKey');
};
const h5 = async (url: string, c: EngineCase) => {
  const body = { ...c.validBody(), objective: 'minVolatility', numIterations: 50000 };
  const { res } = await postJson(url, body);
  expect(res.status).toBe(200);
  expect(sent().numIterations).toBe(50000);
};
const fp = { weights: { AAPL: 1 }, expectedReturn: 0.1, expectedVolatility: 0.2, sharpeRatio: 0.5 };
const metrics = { expectedReturn: 0.1, expectedVolatility: 0.15, sharpeRatio: 1.2 };
const rawEngineCases: Omit<EngineCase, 'path' | 'enginePath'>[] = [
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
    result: { optimalWeights: { AAPL: 0.6, BND: 0.4 }, ...metrics },
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
    result: { frontier: [fp] },
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
const SD = '2020-01-01',
  ED = '2024-01-01';
const sigBase = { indicator: 'sma', period: 20, threshold: 0, startDate: SD, endDate: ED };
const mkSig = (t = 'SPY') => ({ ticker: t, signalType: 'both' as const, ...sigBase });
const mockSignalResult = {
  signals: [{ date: '2020-01-02', type: 'buy', price: 301 }],
  statistics: { totalSignals: 1, winRate: 1, avgReturn: 0.01, maxDrawdown: 0, sharpe: 2 },
  equityCurve: [{ date: '2020-01-01', value: 10000 }],
};
const noTicker = (): any => ((r: any) => (delete r.ticker, r))(mkSig());
const dualPair = () => ({ signal1: mkSig('SPY'), signal2: mkSig('QQQ') });
const rsi = { ...mkSig('SPY'), indicator: 'rsi', period: 14, threshold: 30 };
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
    validReq: () => ({ ...dualPair(), combinationMethod: 'and' }),
    validation: [['缺少 combinationMethod', dualPair]],
  },
  {
    path: '/api/v1/signal/multi',
    data: { SPY: { '2020-01-01': 300, '2020-01-02': 301 } },
    engineResult: { ...mockSignalResult, equityCurve: [] },
    validReq: () => ({ signals: [mkSig('SPY'), rsi], aggregationMethod: 'voting' }),
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
  const badDate = (): any =>
    Object.assign(createValidRequestBody(), { parameters: { ...P(), startDate: 'not-a-date' } });
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
    const { res, body: j } = await reqJson(url(), 'POST', createValidRequestBody(), {
      'X-Backtest-Sync': 'true',
    });
    expect(res.status).toBe(202);
    expect(j).toMatchObject({ success: true, data: { jobId: 'job-async-002' } });
  });
  const surl = () => `${getServer().url}/api/v1/backtest/portfolio/series`;
  it('缓存命中时应返回请求的序列字段', async () => {
    const b = createValidRequestBody();
    await setCache(cacheKey(b.portfolios, b.parameters, void 0), mockBacktestResult());
    const { res, json } = await postJson(surl(), { ...b, series: ['rollingReturns'] });
    expect(res.status).toBe(200);
    expect(json.data.portfolios[0].rollingReturns).toEqual([]);
  });
  it('缓存未命中时应返回 404', async () => {
    const b = { ...createValidRequestBody(), parameters: { ...P(), startingValue: 99999 } };
    const { res } = await postJson(surl(), { ...b, series: ['rollingReturns'] });
    expect(res.status).toBe(404);
  });
});
describe('backtestRoutes - GET /api/v1/backtest/search', () => {
  const getServer = withServer(() => (vi.clearAllMocks(), createBacktestApp(backtestRoutes)));
  it.each([
    ['应返回搜索结果', [{ ticker: 'AAPL', name: 'Apple', market: 'US' }], '?query=aapl', 200],
    ['缺少 query 参数应返回 422', void 0, '', 422],
    ['搜索服务抛错时应返回 500', new Error('search failed'), '?query=aapl', 500],
  ])('%s', async (_n, mockVal, q, exp) => {
    if (mockVal instanceof Error) m.searchTickers.mockRejectedValue(mockVal);
    else if (mockVal) m.searchTickers.mockResolvedValue(mockVal);
    const { res, json } = await get(`${getServer().url}/api/v1/backtest/search${q}`);
    expect(res.status).toBe(exp);
    if (res.ok) expect(json.data).toHaveLength(1);
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
  const authMw = injectAuth((req) => ({
    sub: (req.headers['x-test-sub'] as string) || 'admin-user',
    role: (req.headers['x-test-role'] as string) || 'admin',
    platformAdmin: (req.headers['x-test-platform'] as string) === 'true',
    tenantId: (req.headers['x-test-tenant'] as string) || undefined,
  }));
  const boot = () => startExpressApp((a) => (a.use(authMw), a.use('/api/v1', jobRoutes)));
  const getServer = withServer(() => (vi.clearAllMocks(), boot()));
  it('任务存在且已完成时应返回结果', async () => {
    const rb = { best: { cagr: 0.12 } };
    queueMocks.getJob.mockResolvedValue(
      createMockJob({
        id: 'job-123',
        returnvalue: rb,
        data: { type: 'optimizer', userId: 'test-user' },
      }),
    );
    const { res, json } = await get(`${getServer().url}/api/v1/jobs/job-123`, {
      'x-test-platform': 'true',
    });
    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({ id: 'job-123', status: 'completed', result: rb });
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
    const { json } = await get(`${getServer().url}/api/v1/jobs/job-456`, {
      'x-test-platform': 'true',
    });
    expect(json.data.status).toBe('failed');
    expect(json.data.error).not.toContain('Engine timeout');
  });
  const mkJob = (id: string, data: any = {}) =>
    createMockJob({ id, data: { type: 'optimizer', userId: 'owner-user', ...data } });
  const st = (s: string) => vi.fn().mockResolvedValue(s);
  const oj = mkJob('job-owned'),
    mj = mkJob('job-mine');
  const ta = mkJob('job-tenant-a', { tenantId: 'org-a' });
  const ok = mkJob('job-tenant-ok', { userId: 'someone', tenantId: 'org-a' });
  const pa = mkJob('job-tenant-pa', { userId: 'someone', tenantId: 'org-a' });
  const TEST_HDRS = ['x-test-sub', 'x-test-role', 'x-test-tenant', 'x-test-platform'];
  it.each([
    ['越权访问他人任务', oj, ['attacker', 'analyst'], 404],
    ['所有者本人可访问', mj, ['owner-user', 'analyst'], 200],
    ['跨租户访问应返回 404', ta, ['admin-user', 'admin', 'org-b'], 404],
    ['同租户 admin 可访问', ok, ['admin-user', 'admin', 'org-a'], 200],
    ['平台管理员可跨租户', pa, ['op', 'admin', 'org-b', 'true'], 200],
  ])('%s', async (_n: unknown, job: any, hd: string[], exp: number) => {
    queueMocks.getJob.mockResolvedValue(job);
    const h = Object.fromEntries(hd.map((v, i) => [TEST_HDRS[i], v]));
    const { res } = await get(`${getServer().url}/api/v1/jobs/${job.id}`, h);
    expect(res.status).toBe(exp);
  });
  const anonServer = withServer(() => startExpressApp((a) => a.use('/api/v1', jobRoutes)));
  it('未认证时应返回 401', async () => {
    expect((await fetch(`${anonServer().url}/api/v1/jobs/job-x`)).status).toBe(401);
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
    const ja = createMockJob({
      id: 'ja',
      finishedOn: void 0,
      getState: st('active'),
      data: { type: 'optimizer', userId: 'test-user' },
    });
    queueMocks.getJob.mockResolvedValue(ja);
    const { json } = await get(`${getServer().url}/api/v1/jobs/${ja.id}`, {
      'x-test-sub': 'test-user',
    });
    expect(json.data).toMatchObject({ status: 'running' });
    expect(json.data).not.toHaveProperty('result');
  });
});
