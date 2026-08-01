import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { m, queueMocks } from './backtestRoutes.shared.js';
import backtestRoutes from '../../../packages/backend/src/routes/backtestRoutes.js';
import {
  createValidRequestBody,
  createBacktestApp,
  setupPortfolioServer,
  clearBacktestResultCache,
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
