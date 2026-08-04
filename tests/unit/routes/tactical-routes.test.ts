import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';
import { createConfigMocks, createLoggerMocks } from '../../helpers/mockFactories.js';
import { EngineUnavailableErrorStub } from '../../helpers/backtestRoutesFixtures.js';
import { createMockPriceData } from '../../helpers/storeFixtures.js';

const dataServiceMocks = vi.hoisted(() => ({ fetchHistoryData: vi.fn() }));
const engineMocks = vi.hoisted(() => ({ callEngineStrict: vi.fn() }));
const queueMocks = vi.hoisted(() => ({ add: vi.fn() }));
vi.hoisted(() => {
  process.env.SYNC_COMPUTE_TIMEOUT_MS = '500';
});

vi.mock('../../../packages/backend/src/infrastructure/dataFacade.js', () => ({
  fetchHistoryData: dataServiceMocks.fetchHistoryData,
}));
vi.mock('../../../packages/backend/src/queues/backtestQueue.js', () => ({
  backtestQueue: { add: queueMocks.add },
}));
vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
  callEngineStrict: engineMocks.callEngineStrict,
  EngineUnavailableError: EngineUnavailableErrorStub,
  unwrapEngineData: <T>(r: unknown): T => ((r as { data?: T })?.data ?? r) as T,
}));
vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: createConfigMocks({ NODE_ENV: 'test', SYNC_COMPUTE_TIMEOUT_MS: 500 }),
  validateConfig: vi.fn(),
  USAGE_METRIC: { BACKTEST: 'backtest' },
}));
import '../../helpers/middlewareMocks.js';
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: createLoggerMocks(),
  sanitizeLog: (s: string) => s.replace(/[\n\r]/g, '').substring(0, 50),
}));

import analysisRoutes from '../../../packages/backend/src/routes/analysisRoutes.js';

function createValidStrategy() {
  return {
    id: 'strat-1',
    name: 'Test Strategy',
    signals: [
      {
        id: 'sig-1',
        name: 'SMA Signal',
        conditions: [
          { indicator: 'sma' as const, period: 20, operator: 'cross_above' as const, threshold: 0 },
        ],
        targetWeights: [{ ticker: 'SPY', weight: 100 }],
      },
    ],
    aggregationMethod: 'weighted_average' as const,
  };
}
function createMockPortfolioResult() {
  return {
    name: 'Portfolio',
    growthCurve: [{ date: '2020-01-01', value: 10000 }],
    drawdownCurve: [],
    rollingReturns: [],
    annualReturns: [],
    monthlyReturns: [],
    statistics: {
      cagr: 0.1,
      mwrr: 0.1,
      stdev: 0.15,
      sharpe: 1.5,
      sortino: 1.8,
      maxDrawdown: 0.1,
      maxDrawdownDuration: 10,
      bestYear: 0.2,
      worstYear: -0.05,
      avgYear: 0.1,
      totalReturn: 0.2,
    },
  };
}
const validBacktestReq = (strategyOverride?: Record<string, unknown>) => ({
  strategy: strategyOverride ?? createValidStrategy(),
  startDate: '2020-01-01',
  endDate: '2020-01-03',
  startingValue: 10000,
  rebalanceFrequency: 'monthly' as const,
});
async function postJson(server: TestServer, path: string, body: unknown) {
  const res = await fetch(`${server.url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { res, body: await res.json() };
}

describe('tacticalRoutes - POST /api/tactical/backtest', () => {
  let server: TestServer;
  beforeEach(async () => {
    vi.clearAllMocks();
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      data: createMockPriceData({ numDays: 3, startPrice: 300 }),
      degraded: false,
    });
    engineMocks.callEngineStrict
      .mockResolvedValueOnce({
        portfolio: createMockPortfolioResult(),
        signalHistory: [
          {
            date: '2020-01-01',
            activeSignals: ['sig-1'],
            weights: [{ ticker: 'SPY', weight: 100 }],
          },
        ],
      })
      .mockResolvedValueOnce({ portfolios: [createMockPortfolioResult()] });
    server = await startExpressApp((app) => app.use('/api/v1', analysisRoutes));
  });
  afterEach(async () => {
    await server.close();
  });

  it('有效参数应返回回测结果和基准', async () => {
    const { res, body } = await postJson(server, '/api/v1/tactical/backtest', validBacktestReq());
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.portfolio).toBeDefined();
    expect(body.data.benchmark).toBeDefined();
    expect(body.data.signalHistory).toHaveLength(1);
    expect(engineMocks.callEngineStrict).toHaveBeenCalledTimes(2);
  });
  it('无效标的数据应返回 404', async () => {
    dataServiceMocks.fetchHistoryData.mockResolvedValue({ data: {}, degraded: false });
    const { res, body } = await postJson(server, '/api/v1/tactical/backtest', validBacktestReq());
    expect(res.status).toBe(404);
    expect(body.error.code).toBe('DATA_NOT_FOUND');
  });
  it.each([
    [
      '缺少 strategy',
      {
        startDate: '2020-01-01',
        endDate: '2020-01-03',
        startingValue: 10000,
        rebalanceFrequency: 'monthly',
      },
    ],
    ['空 signals 数组', validBacktestReq({ ...createValidStrategy(), signals: [] })],
  ])('%s 应返回 400（zod 校验失败）', async (_n, req) => {
    const { res } = await postJson(server, '/api/v1/tactical/backtest', req);
    expect(res.status).toBe(400);
  });
  it('引擎抛错时应返回 500', async () => {
    engineMocks.callEngineStrict
      .mockReset()
      .mockRejectedValueOnce(new Error('tactical engine error'));
    const { res } = await postJson(server, '/api/v1/tactical/backtest', validBacktestReq());
    expect(res.status).toBe(500);
  });
  it('基准回测失败时应使用空结果兜底', async () => {
    engineMocks.callEngineStrict
      .mockReset()
      .mockResolvedValueOnce({
        portfolio: createMockPortfolioResult(),
        signalHistory: [
          {
            date: '2020-01-01',
            activeSignals: ['sig-1'],
            weights: [{ ticker: 'SPY', weight: 100 }],
          },
        ],
      })
      .mockRejectedValueOnce(new Error('benchmark error'));
    const { res, body } = await postJson(server, '/api/v1/tactical/backtest', validBacktestReq());
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.benchmark.growthCurve).toEqual([]);
  });
});

describe('tacticalRoutes - POST /api/tactical/what-if', () => {
  let server: TestServer;
  beforeEach(async () => {
    vi.clearAllMocks();
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      data: createMockPriceData({ numDays: 3, startPrice: 300 }),
      degraded: false,
    });
    engineMocks.callEngineStrict.mockResolvedValue({
      signalHistory: [
        { date: '2020-01-03', activeSignals: ['sig-1'], weights: [{ ticker: 'SPY', weight: 100 }] },
      ],
    });
    server = await startExpressApp((app) => app.use('/api/v1', analysisRoutes));
  });
  afterEach(async () => {
    await server.close();
  });

  it('有效参数应返回信号状态', async () => {
    const { res, body } = await postJson(server, '/api/v1/tactical/what-if', {
      tickers: ['SPY'],
      strategy: createValidStrategy(),
    });
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data[0].ticker).toBe('SPY');
    expect(body.data[0].weight).toBe(100);
  });
  it('空 tickers 数组应返回 400（zod 校验失败）', async () => {
    const { res } = await postJson(server, '/api/v1/tactical/what-if', { tickers: [] });
    expect(res.status).toBe(400);
  });
  it('引擎抛错时应返回 500', async () => {
    engineMocks.callEngineStrict.mockRejectedValueOnce(new Error('what-if error'));
    const { res } = await postJson(server, '/api/v1/tactical/what-if', {
      tickers: ['SPY'],
      strategy: createValidStrategy(),
    });
    expect(res.status).toBe(500);
  });
});

import { jobRoutes } from '../../../packages/backend/src/routes/jobRoutes.js';

function createValidGridRequest() {
  return {
    indicator: 'sma' as const,
    param1: { min: 10, max: 20, step: 10 },
    param2: { min: 10, max: 20, step: 10 },
    tickers: ['SPY'],
    startDate: '2020-01-01',
    endDate: '2024-01-01',
    startingValue: 10000,
    rebalanceFrequency: 'monthly' as const,
    objective: 'maxCAGR' as const,
  };
}
const mockGridResult = {
  results: [{ param1: 10, param2: 10, cagr: 0.1, maxDrawdown: 0.05, sharpe: 1.5 }],
  heatmap: {
    param1Values: [10, 20],
    param2Values: [10, 20],
    matrix: [
      [0.1, 0.08],
      [0.09, 0.07],
    ],
  },
  best: { param1: 10, param2: 10, cagr: 0.1 },
};

describe('tacticalGridRoutes - POST /api/tactical-grid/search', () => {
  let server: TestServer;
  beforeEach(async () => {
    vi.clearAllMocks();
    queueMocks.add.mockResolvedValue({ id: 'grid-job-123' });
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      data: createMockPriceData({ numDays: 30, startPrice: 301 }),
      degraded: false,
    });
    engineMocks.callEngineStrict.mockResolvedValue(mockGridResult);
    server = await startExpressApp((app) => app.use('/api/v1', jobRoutes));
  });
  afterEach(async () => {
    await server.close();
  });
  async function postGrid(body: unknown) {
    const res = await fetch(`${server.url}/api/v1/tactical-grid/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { res, body: await res.json().catch(() => null) };
  }

  it('异步提交成功时应返回 202 和 jobId', async () => {
    const { res, body } = await postGrid(createValidGridRequest());
    expect(res.status).toBe(202);
    expect(body.status).toBe(202);
    expect(body.jobId).toBe('grid-job-123');
    expect(body.statusUrl).toContain('/api/v1/jobs/grid-job-123');
    expect(queueMocks.add).toHaveBeenCalledTimes(1);
  });
  it.each([
    [
      '缺少 indicator',
      (r: Record<string, unknown>) => {
        delete r.indicator;
      },
    ],
    [
      '空 tickers 数组',
      (r: Record<string, unknown>) => {
        r.tickers = [];
      },
    ],
    [
      '无效日期格式',
      (r: Record<string, unknown>) => {
        r.startDate = 'not-a-date';
      },
    ],
  ])('%s 应返回 400（zod 校验失败）', async (_n, mutate) => {
    const req = createValidGridRequest() as unknown as Record<string, unknown>;
    mutate(req);
    const { res } = await postGrid(req);
    expect(res.status).toBe(400);
  });
  it('参数组合超过上限应返回 422', async () => {
    const req = createValidGridRequest();
    req.param1 = { min: 1, max: 100, step: 1 };
    req.param2 = { min: 1, max: 100, step: 1 };
    const { res, body } = await postGrid(req);
    expect(res.status).toBe(422);
    expect(body.error.code).toBe('GRID_TOO_MANY_COMBINATIONS');
    expect(queueMocks.add).not.toHaveBeenCalled();
  });
  it('BullMQ 不可用时应回退到同步执行并返回 200', async () => {
    queueMocks.add.mockRejectedValue(new Error('Redis unavailable'));
    const { res, body } = await postGrid(createValidGridRequest());
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.results).toHaveLength(1);
    expect(engineMocks.callEngineStrict).toHaveBeenCalledTimes(1);
  });
  it('同步回退时价格数据缺失应返回 400', async () => {
    queueMocks.add.mockRejectedValue(new Error('Redis unavailable'));
    dataServiceMocks.fetchHistoryData.mockResolvedValue({ data: {}, degraded: false });
    const { res, body } = await postGrid(createValidGridRequest());
    expect(res.status).toBe(400);
    expect(body.error.code).toBe('GRID_BAD_REQUEST');
  });
  it.each([new Error('grid engine error'), new Error('')])(
    '同步回退引擎抛错（%s）应返回 500',
    async (err) => {
      queueMocks.add.mockRejectedValue(new Error('Redis unavailable'));
      engineMocks.callEngineStrict.mockRejectedValue(err);
      const { res } = await postGrid(createValidGridRequest());
      expect(res.status).toBe(500);
    },
  );
  it('BullMQ 回退同步执行超时应返回 503', async () => {
    queueMocks.add.mockRejectedValue(new Error('Redis unavailable'));
    dataServiceMocks.fetchHistoryData.mockImplementation(() => new Promise(() => {}));
    const { res } = await postGrid(createValidGridRequest());
    expect(res.status).toBe(503);
  });
});

describe('认证用户请求', () => {
  let server: TestServer;
  beforeEach(async () => {
    vi.clearAllMocks();
    queueMocks.add.mockResolvedValue({ id: 'grid-job-auth-789' });
    server = await startExpressApp((app) => {
      app.use((req, _res, next) => {
        (req as Record<string, unknown>).user = { sub: 'user-123', role: 'admin' };
        (req as Record<string, unknown>).tenantId = 'tenant-456';
        next();
      });
      app.use('/api/v1', jobRoutes);
    });
  });
  afterEach(async () => {
    await server.close();
  });
  it('应设置 ownerUserId 为实际用户 ID', async () => {
    await fetch(`${server.url}/api/v1/tactical-grid/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidGridRequest()),
    });
    expect(queueMocks.add).toHaveBeenCalledWith(
      'grid-search',
      expect.objectContaining({
        userId: 'user-123',
        ownerUserId: 'user-123',
        tenantId: 'tenant-456',
      }),
    );
  });
});
