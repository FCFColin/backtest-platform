import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockLogger, createConfigMocks } from '../../helpers/mockFactories.js';
import backtestRoutes from '../../../packages/backend/src/routes/backtestRoutes.js';
import {
  configureAnalysisMocks, configureMonteCarloMocks, configurePortfolioBacktestMocks,
  configureOptimizationMocks, configureTickerHelpersMocks, createValidParameters,
  createValidPortfolio, createValidRequestBody, createBacktestApp, startEngineRouteServer,
  setupPortfolioServer, clearBacktestResultCache, type BacktestMockHandles,
} from '../../helpers/backtestRoutesFixtures.js';
import { setBacktestResultCache, backtestCacheKey } from '../../../packages/backend/src/application/backtest/backtestResultCache.js';
import { mockBacktestResult } from '../../helpers/storeFixtures.js';

const m = vi.hoisted<BacktestMockHandles>(() => ({
  runBacktest: vi.fn(), runPortfolioBacktest: vi.fn(), runAnalysis: vi.fn(), runMonteCarlo: vi.fn(),
  runOptimization: vi.fn(), runEfficientFrontier: vi.fn(), fetchHistoryData: vi.fn(), searchTickers: vi.fn(),
  callEngineStrict: vi.fn(), buildEngineParams: vi.fn(), preparePortfolioBacktest: vi.fn(),
  collectInvalidTickerWarnings: vi.fn(), collectDomainTickers: vi.fn(), filterPriceData: vi.fn(),
  fetchPriceDataWithRange: vi.fn(), loadMacroData: vi.fn(), validateTickers: vi.fn(),
  portfolioToDomain: vi.fn(), sanitizeMcParams: vi.fn(),
}));
const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));
const fsMocks = vi.hoisted(() => ({ existsSync: vi.fn().mockReturnValue(false), readFileSync: vi.fn() }));
const MockEngineUnavailableError = vi.hoisted(() => {
  class E extends Error {
    readonly retryAfterSeconds = 30; readonly code = 'ENGINE_UNAVAILABLE';
    constructor(msg = '计算引擎暂不可用') { super(msg); this.name = 'EngineUnavailableError'; }
  }
  return E;
});
const queueMocks = vi.hoisted(() => ({ add: vi.fn(), getJob: vi.fn() }));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: mockLogger(loggerMocks), httpLogger: vi.fn() }));
vi.mock('../../../packages/backend/src/application/backtest-service.js', () => ({ runPortfolioBacktest: m.runPortfolioBacktest, runBacktest: m.runBacktest }));
vi.mock('../../../packages/backend/src/application/analysis-orchestrator.js', () => ({ runAnalysis: m.runAnalysis }));
vi.mock('../../../packages/backend/src/application/montecarlo-service.js', () => ({ runMonteCarlo: m.runMonteCarlo }));
vi.mock('../../../packages/backend/src/application/optimize-service.js', () => ({ runOptimization: m.runOptimization, runEfficientFrontier: m.runEfficientFrontier }));
vi.mock('../../../packages/backend/src/infrastructure/dataFacade.js', () => ({ searchTickers: m.searchTickers, fetchHistoryData: m.fetchHistoryData, validateTickers: m.validateTickers, initDb: vi.fn(), invalidateCache: vi.fn() }));
vi.mock('../../../packages/backend/src/application/backtest-helpers.js', () => ({
  preparePortfolioBacktest: m.preparePortfolioBacktest, collectInvalidTickerWarnings: m.collectInvalidTickerWarnings,
  collectDomainTickers: m.collectDomainTickers, filterPriceData: m.filterPriceData, fetchPriceDataWithRange: m.fetchPriceDataWithRange,
  loadMacroData: m.loadMacroData, sanitizeMcParams: m.sanitizeMcParams, validateTickers: m.validateTickers,
  translateDomainError: vi.fn(<T>(fn: () => T): T => fn()),
}));
vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({ callEngineStrict: m.callEngineStrict, EngineUnavailableError: MockEngineUnavailableError, resetEngineAvailability: vi.fn() }));
vi.mock('../../../packages/backend/src/application/backtest/engineBodyBuilder.js', () => ({ buildEngineParams: m.buildEngineParams }));
vi.mock('../../../packages/backend/src/queues/backtestQueue.js', () => ({ backtestQueue: { add: queueMocks.add, getJob: queueMocks.getJob } }));
vi.mock('../../../packages/backend/src/config/index.js', () => ({ config: createConfigMocks(), validateConfig: vi.fn() }));
vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => {
  const noop = () => {};
  return { redisConnection: { on: noop }, appRedis: { on: noop, ping: async () => 'PONG', set: async () => 'OK', get: async () => null, scan: async () => ['0', []] as [string, string[]], del: async () => 0 }, getRedisHealth: vi.fn().mockResolvedValue(true), markRedisUnhealthy: vi.fn(), buildRedisBaseOptions: () => ({ host: 'localhost', port: 6379 }), isSentinelMode: false };
});
vi.mock('fs', () => ({ default: fsMocks, existsSync: fsMocks.existsSync, readFileSync: fsMocks.readFileSync }));

configurePortfolioBacktestMocks(m);
configureAnalysisMocks(m);
configureMonteCarloMocks(m);
configureOptimizationMocks(m);
configureTickerHelpersMocks(m);

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { res, json: await res.json() };
}

describe('backtestRoutes - POST /api/backtest/analysis', () => {
  let server: { url: string; close: () => Promise<void> };
  beforeEach(async () => {
    server = await startEngineRouteServer(backtestRoutes, m);
    m.callEngineStrict.mockResolvedValue({ tickers: [{ ticker: 'AAPL', cagr: 0.1 }], correlations: [[1]] });
  });
  afterEach(async () => { await server.close(); });
  const url = () => `${server.url}/api/backtest/analysis`;

  it('有效参数应调用引擎并返回 200', async () => {
    const { res, json } = await postJson(url(), { tickers: ['AAPL', 'BND'], parameters: createValidParameters() });
    expect(res.status).toBe(200); expect(json.success).toBe(true); expect(json.data).toBeDefined();
    expect(m.callEngineStrict).toHaveBeenCalledTimes(1);
    expect(m.callEngineStrict.mock.calls[0][0]).toBe('/api/engine/analysis');
    expect(m.fetchHistoryData).toHaveBeenCalledTimes(1);
  });
  it('缺失 tickers 应返回 400（zod 校验）', async () => {
    const { res, json } = await postJson(url(), { parameters: createValidParameters() });
    expect(res.status).toBe(400); expect(json.error.title).toBe('VALIDATION_ERROR');
    expect(m.callEngineStrict).not.toHaveBeenCalled();
  });
  it('ticker 数量超限应返回 400（schema refine）', async () => {
    const tickers = Array.from({ length: 51 }, (_, i) => `T${i}`);
    const { res } = await postJson(url(), { tickers, parameters: createValidParameters() });
    expect(res.status).toBe(400); expect(m.callEngineStrict).not.toHaveBeenCalled();
  });
  it('引擎抛错应返回 500', async () => {
    m.callEngineStrict.mockRejectedValue(new Error('analysis engine boom'));
    const { res, json } = await postJson(url(), { tickers: ['AAPL'], parameters: createValidParameters() });
    expect(res.status).toBe(500); expect(json.error.code).toBe('ANALYSIS_ERROR');
    expect(loggerMocks.error).toHaveBeenCalled();
  });
  it('tickers 为空格分隔字符串时应正常处理', async () => {
    m.callEngineStrict.mockResolvedValue({ tickers: [{ ticker: 'AAPL' }, { ticker: 'BND' }], correlations: [[1]] });
    const { res } = await postJson(url(), { tickers: 'AAPL BND', parameters: createValidParameters() });
    expect(res.status).toBe(200); expect(m.callEngineStrict).toHaveBeenCalledTimes(1);
    expect((m.callEngineStrict.mock.calls[0][1] as { tickers: string[] }).tickers).toEqual(['AAPL', 'BND']);
  });
  it('引擎返回 assets 字段时应映射为 tickers', async () => {
    m.callEngineStrict.mockResolvedValue({ success: true, data: { assets: [{ ticker: 'AAPL', cagr: 0.1 }], correlations: [[1]] } });
    const { res, json } = await postJson(url(), { tickers: ['AAPL'], parameters: createValidParameters() });
    expect(res.status).toBe(200); expect(json.data.tickers).toBeDefined(); expect(json.data.correlations).toBeDefined();
  });
  it('引擎不可用应 fail-closed 返回 503', async () => {
    m.callEngineStrict.mockRejectedValue(new MockEngineUnavailableError());
    const { res, json } = await postJson(url(), { tickers: ['AAPL'], parameters: createValidParameters() });
    expect(res.status).toBe(503); expect(res.headers.get('retry-after')).toBe('30');
    expect(json.error.code).toBe('ENGINE_UNAVAILABLE');
  });
});

describe('backtestRoutes - POST /api/backtest/monte-carlo', () => {
  let server: { url: string; close: () => Promise<void> };
  beforeEach(async () => {
    server = await startEngineRouteServer(backtestRoutes, m);
    m.callEngineStrict.mockResolvedValue({ paths: [], statistics: {} });
  });
  afterEach(async () => { await server.close(); });
  const url = () => `${server.url}/api/backtest/monte-carlo`;
  const validBody = (extra: Record<string, unknown> = {}) => ({ portfolio: createValidPortfolio(), parameters: createValidParameters(), ...extra });

  it('有效参数应调用引擎并返回 200', async () => {
    const { res, json } = await postJson(url(), validBody({ mcParams: { numSimulations: 100, seed: 42 } }));
    expect(res.status).toBe(200); expect(json.success).toBe(true);
    expect(m.callEngineStrict).toHaveBeenCalledTimes(1);
    expect(m.callEngineStrict.mock.calls[0][0]).toBe('/api/engine/monte-carlo');
    expect((m.callEngineStrict.mock.calls[0][1] as { mcParams: unknown }).mcParams).toEqual({ numSimulations: 100, seed: 42 });
  });
  it('缺少 portfolio 应返回 400（zod refine）', async () => {
    const { res } = await postJson(url(), { parameters: createValidParameters() });
    expect(res.status).toBe(400); expect(m.callEngineStrict).not.toHaveBeenCalled();
  });
  it('恶意 mcParams 键应被剥离', async () => {
    await postJson(url(), validBody({ mcParams: { numSimulations: 50, __proto__: { polluted: true }, constructor: 'evil', maliciousKey: 'strip-me' } }));
    const mcParamsArg = (m.callEngineStrict.mock.calls[0][1] as { mcParams: Record<string, unknown> }).mcParams;
    expect(mcParamsArg).toEqual({ numSimulations: 50 });
    expect(mcParamsArg).not.toHaveProperty('maliciousKey');
    expect(mcParamsArg).not.toHaveProperty('constructor');
  });
  it('多组合应返回数组结果', async () => {
    m.callEngineStrict.mockResolvedValueOnce({ portfolio: 0 }).mockResolvedValueOnce({ portfolio: 1 });
    const { res, json } = await postJson(url(), { portfolios: [createValidPortfolio(), createValidPortfolio()], parameters: createValidParameters() });
    expect(res.status).toBe(200); expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true); expect(json.data).toHaveLength(2);
    expect(m.callEngineStrict).toHaveBeenCalledTimes(2);
  });
  it('引擎抛错应返回 500', async () => {
    m.callEngineStrict.mockRejectedValue(new Error('mc engine boom'));
    const { res, json } = await postJson(url(), validBody());
    expect(res.status).toBe(500); expect(json.error.code).toBe('MONTE_CARLO_ERROR');
  });
  it('引擎不可用应 fail-closed 返回 503', async () => {
    m.callEngineStrict.mockRejectedValue(new MockEngineUnavailableError());
    const { res, json } = await postJson(url(), validBody());
    expect(res.status).toBe(503); expect(res.headers.get('retry-after')).toBe('30');
    expect(json.error.code).toBe('ENGINE_UNAVAILABLE');
  });
});

describe('backtestRoutes - POST /api/backtest/portfolio', () => {
  let server: { url: string; close: () => Promise<void> };
  beforeEach(async () => { server = await setupPortfolioServer(backtestRoutes, m); queueMocks.add.mockReset(); queueMocks.getJob.mockReset(); });
  afterEach(async () => { await server.close(); });

  it('有效参数应入队并返回 202 Accepted', async () => {
    queueMocks.add.mockResolvedValue({ id: 'job-test-001' });
    const { res, json } = await postJson(`${server.url}/api/backtest/portfolio`, createValidRequestBody());
    expect(res.status).toBe(202); expect(json.success).toBe(true);
    expect(json.data.jobId).toBe('job-test-001'); expect(json.data.status).toBe('queued');
    expect(json.data.statusUrl).toContain('/api/v1/backtest/runs/');
    expect(queueMocks.add).toHaveBeenCalledTimes(1);
  });
  it('异步响应应仅包含 jobId/status/statusUrl（不含 portfolios 数据）', async () => {
    queueMocks.add.mockResolvedValue({ id: 'job-test-001' });
    const { res, json } = await postJson(`${server.url}/api/backtest/portfolio`, createValidRequestBody());
    expect(res.status).toBe(202); expect(json.data.portfolios).toBeUndefined(); expect(json.data.jobId).toBeDefined();
  });
  it('应以正确的 payload 入队（含 benchmarkTicker）', async () => {
    queueMocks.add.mockResolvedValue({ id: 'job-test-001' });
    const body = createValidRequestBody(); body.parameters.benchmarkTicker = 'SPY';
    await postJson(`${server.url}/api/backtest/portfolio`, body);
    expect(queueMocks.add).toHaveBeenCalledTimes(1);
    const [jobName, jobData] = queueMocks.add.mock.calls[0];
    expect(jobName).toBe('portfolio'); expect(jobData.type).toBe('portfolio');
    expect(jobData.payload.portfolios).toBeDefined(); expect(jobData.payload.parameters.benchmarkTicker).toBe('SPY');
  });
  it('无效日期格式应返回 400（zod 校验失败）', async () => {
    const body = createValidRequestBody(); (body.parameters as Record<string, unknown>).startDate = 'not-a-date';
    const { res, json } = await postJson(`${server.url}/api/backtest/portfolio`, body);
    expect(res.status).toBe(400); expect(json.error.title).toBe('VALIDATION_ERROR');
    expect(queueMocks.add).not.toHaveBeenCalled();
  });
  it.each([
    ['缺少 portfolios', { parameters: { startDate: '2024-01-01', endDate: '2024-06-30' } }],
    ['缺少 parameters', { portfolios: [{ assets: [{ ticker: 'AAPL', weight: 100 }], rebalanceFrequency: 'monthly' }] }],
    ['空 portfolios', { portfolios: [], parameters: { startDate: '2024-01-01', endDate: '2024-06-30' } }],
  ])('%s 应返回 400', async (_n, body) => {
    const { res } = await postJson(`${server.url}/api/backtest/portfolio`, body);
    expect(res.status).toBe(400);
  });
  it('队列不可用时应 fail-closed 返回 503 + Retry-After（ADR-031）', async () => {
    queueMocks.add.mockRejectedValueOnce(new Error('Redis unavailable'));
    const { res, json } = await postJson(`${server.url}/api/backtest/portfolio`, createValidRequestBody());
    expect(res.status).toBe(503); expect(res.headers.get('retry-after')).toBe('30');
    expect(json.error.code).toBe('SERVICE_TEMPORARILY_UNAVAILABLE'); expect(json.success).toBe(false);
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
  let server: { url: string; close: () => Promise<void> };
  beforeEach(async () => { server = await setupPortfolioServer(backtestRoutes, m); });
  afterEach(async () => { await server.close(); });

  it('缓存命中时应返回请求的序列字段', async () => {
    const body = createValidRequestBody();
    await setBacktestResultCache(backtestCacheKey(body.portfolios, body.parameters, undefined), mockBacktestResult());
    const { res, json } = await postJson(`${server.url}/api/backtest/portfolio/series`, { ...body, series: ['rollingReturns'] });
    expect(res.status).toBe(200); expect(json.success).toBe(true);
    expect(json.data.portfolios[0].rollingReturns).toEqual([]);
  });
  it('缓存未命中时应返回 404', async () => {
    const body = createValidRequestBody();
    const { res } = await postJson(`${server.url}/api/backtest/portfolio/series`, { ...body, series: ['rollingReturns'] });
    expect(res.status).toBe(404);
  });
});

describe('backtestRoutes - GET /api/backtest/search', () => {
  let server: { url: string; close: () => Promise<void> };
  beforeEach(async () => { vi.clearAllMocks(); clearBacktestResultCache(); server = await createBacktestApp(backtestRoutes); });
  afterEach(async () => { await server.close(); });

  it('应返回搜索结果', async () => {
    m.searchTickers.mockResolvedValue([{ ticker: 'AAPL', name: 'Apple', market: 'US' }]);
    const res = await fetch(`${server.url}/api/backtest/search?query=aapl`);
    const json = await res.json();
    expect(res.status).toBe(200); expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1); expect(json.data[0].ticker).toBe('AAPL');
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

describe('backtestRoutes - POST /api/backtest/optimize', () => {
  let server: { url: string; close: () => Promise<void> };
  beforeEach(async () => {
    server = await startEngineRouteServer(backtestRoutes, m);
    m.callEngineStrict.mockResolvedValue({ optimalWeights: { AAPL: 0.6, BND: 0.4 }, expectedReturn: 0.1, expectedVolatility: 0.15, sharpeRatio: 1.2 });
  });
  afterEach(async () => { await server.close(); });
  const url = () => `${server.url}/api/backtest/optimize`;
  const validBody = (extra: Record<string, unknown> = {}) => ({ tickers: ['AAPL', 'BND'], objective: 'maxSharpe', parameters: createValidParameters(), ...extra });

  it('有效参数应调用引擎并返回 200', async () => {
    const { res, json } = await postJson(url(), validBody());
    expect(res.status).toBe(200); expect(json.success).toBe(true);
    expect(m.callEngineStrict).toHaveBeenCalledTimes(1);
    expect(m.callEngineStrict.mock.calls[0][0]).toBe('/api/engine/optimize');
  });
  it('无效 objective 应返回 400（zod 校验）', async () => {
    const { res } = await postJson(url(), validBody({ objective: 'invalidObjective', tickers: ['AAPL'] }));
    expect(res.status).toBe(400); expect(m.callEngineStrict).not.toHaveBeenCalled();
  });
  it('ticker 数量超限应返回 400（schema refine）', async () => {
    const { res } = await postJson(url(), validBody({ tickers: Array.from({ length: 51 }, (_, i) => `T${i}`) }));
    expect(res.status).toBe(400); expect(m.callEngineStrict).not.toHaveBeenCalled();
  });
  it('引擎抛错应返回 500', async () => {
    m.callEngineStrict.mockRejectedValue(new Error('optimize boom'));
    const { res, json } = await postJson(url(), validBody({ objective: 'minVolatility' }));
    expect(res.status).toBe(500); expect(json.error.code).toBe('OPTIMIZATION_ERROR');
  });
  it('numIterations 应被正确上限截断', async () => {
    const { res } = await postJson(url(), validBody({ numIterations: 50000 }));
    expect(res.status).toBe(200);
    expect((m.callEngineStrict.mock.calls[0][1] as { numIterations: number }).numIterations).toBe(50000);
  });
  it('引擎不可用应 fail-closed 返回 503', async () => {
    m.callEngineStrict.mockRejectedValue(new MockEngineUnavailableError());
    const { res, json } = await postJson(url(), validBody());
    expect(res.status).toBe(503); expect(res.headers.get('retry-after')).toBe('30');
    expect(json.error.code).toBe('ENGINE_UNAVAILABLE');
  });
});

describe('backtestRoutes - POST /api/backtest/efficient-frontier', () => {
  let server: { url: string; close: () => Promise<void> };
  beforeEach(async () => {
    server = await startEngineRouteServer(backtestRoutes, m);
    m.callEngineStrict.mockResolvedValue({ frontier: [{ weights: { AAPL: 1 }, expectedReturn: 0.1, expectedVolatility: 0.2, sharpeRatio: 0.5 }] });
  });
  afterEach(async () => { await server.close(); });
  const url = () => `${server.url}/api/backtest/efficient-frontier`;
  const validBody = (extra: Record<string, unknown> = {}) => ({ tickers: ['AAPL', 'BND'], parameters: createValidParameters(), ...extra });

  it('有效参数应调用引擎并返回 200', async () => {
    const { res, json } = await postJson(url(), validBody({ numPoints: 10 }));
    expect(res.status).toBe(200); expect(json.success).toBe(true);
    expect(m.callEngineStrict).toHaveBeenCalledTimes(1);
    expect(m.callEngineStrict.mock.calls[0][0]).toBe('/api/engine/efficient-frontier');
  });
  it.each([
    ['空 tickers 数组', { tickers: [] }],
    ['ticker 数量超限', { tickers: Array.from({ length: 51 }, (_, i) => `T${i}`) }],
  ])('%s 应返回 400', async (_n, extra) => {
    const { res } = await postJson(url(), validBody(extra));
    expect(res.status).toBe(400); expect(m.callEngineStrict).not.toHaveBeenCalled();
  });
  it('引擎抛错应返回 500', async () => {
    m.callEngineStrict.mockRejectedValue(new Error('frontier boom'));
    const { res, json } = await postJson(url(), validBody());
    expect(res.status).toBe(500); expect(json.error.code).toBe('EFFICIENT_FRONTIER_ERROR');
  });
  it('引擎不可用应 fail-closed 返回 503', async () => {
    m.callEngineStrict.mockRejectedValue(new MockEngineUnavailableError());
    const { res, json } = await postJson(url(), validBody());
    expect(res.status).toBe(503); expect(res.headers.get('retry-after')).toBe('30');
    expect(json.error.code).toBe('ENGINE_UNAVAILABLE');
  });
});

function createMockJob(overrides: {
  id?: string; state?: string; progress?: number; returnvalue?: unknown;
  failedReason?: string; data?: Record<string, unknown>;
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
  let server: { url: string; close: () => Promise<void> };
  beforeEach(async () => {
    server = await setupPortfolioServer(backtestRoutes, m);
    queueMocks.add.mockReset();
    queueMocks.getJob.mockReset();
  });
  afterEach(async () => { await server.close(); });

  it('completed 状态返回 200 + 结果', async () => {
    const mockResult = { data: { portfolios: [{ name: 'Test', growthCurve: [] }] }, warnings: [], dateRange: { start: '2024-01-01', end: '2024-06-30' } };
    queueMocks.getJob.mockResolvedValue(createMockJob({ id: 'job-done', state: 'completed', progress: 100, returnvalue: { status: 'completed', result: mockResult } }));
    const res = await fetch(`${server.url}/api/backtest/runs/job-done`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.jobId).toBe('job-done');
    expect(json.data.status).toBe('completed');
    expect(json.data.progress).toBe(100);
    expect(json.data.result).toEqual(mockResult);
  });
  it('failed 状态返回 200 + 错误信息', async () => {
    queueMocks.getJob.mockResolvedValue(createMockJob({ id: 'job-failed', state: 'failed', progress: 30, failedReason: 'Engine timeout after 90s' }));
    const res = await fetch(`${server.url}/api/backtest/runs/job-failed`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.jobId).toBe('job-failed');
    expect(json.data.status).toBe('failed');
    expect(json.data.error).toBe('Engine timeout after 90s');
  });
  it('running 状态返回 200 + 进度', async () => {
    queueMocks.getJob.mockResolvedValue(createMockJob({ id: 'job-running', state: 'active', progress: 45 }));
    const res = await fetch(`${server.url}/api/backtest/runs/job-running`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.jobId).toBe('job-running');
    expect(json.data.status).toBe('running');
    expect(json.data.progress).toBe(45);
    expect(json.data.result).toBeUndefined();
    expect(json.data.error).toBeUndefined();
  });
  it('delayed 状态映射为 queued', async () => {
    queueMocks.getJob.mockResolvedValue(createMockJob({ id: 'job-delayed', state: 'delayed', progress: 0 }));
    const res = await fetch(`${server.url}/api/backtest/runs/job-delayed`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe('queued');
  });
  it('任务不存在时返回 404', async () => {
    queueMocks.getJob.mockResolvedValue(null);
    const res = await fetch(`${server.url}/api/backtest/runs/nonexistent`);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('JOB_NOT_FOUND');
  });
  it('returnvalue 为 failed 时返回 error', async () => {
    queueMocks.getJob.mockResolvedValue(createMockJob({ id: 'job-rv-failed', state: 'completed', progress: 100, returnvalue: { status: 'failed', error: 'Parameter validation failed' } }));
    const res = await fetch(`${server.url}/api/backtest/runs/job-rv-failed`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe('completed');
    expect(json.data.error).toBe('Parameter validation failed');
  });
});