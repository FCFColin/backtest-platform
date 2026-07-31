import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';
import { mockLogger, createConfigMocks } from '../../helpers/mockFactories.js';
import { EngineUnavailableErrorStub } from '../../helpers/backtestRoutesFixtures.js';
import { createMockPriceData } from '../../helpers/storeFixtures.js';

const dataServiceMocks = vi.hoisted(() => ({ fetchHistoryData: vi.fn() }));
const engineMocks = vi.hoisted(() => ({ callEngineStrict: vi.fn() }));
const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

vi.mock('../../../packages/backend/src/infrastructure/dataFacade.js', () => ({
  fetchHistoryData: dataServiceMocks.fetchHistoryData,
}));
vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
  callEngineStrict: engineMocks.callEngineStrict,
  EngineUnavailableError: EngineUnavailableErrorStub,
}));
vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: createConfigMocks({ NODE_ENV: 'test' }),
  validateConfig: vi.fn(),
}));
vi.mock('../../../packages/backend/src/middleware/auth.js', () => ({
  jwtAuth: (_r: unknown, _s: unknown, next: () => void) => next(),
}));
vi.mock('../../../packages/backend/src/middleware/rbac.js', () => ({
  requirePermission: () => (_r: unknown, _s: unknown, next: () => void) => next(),
  Permission: { STRATEGY_MANAGE: 'strategy:manage' },
}));
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

import tacticalRoutes from '../../../packages/backend/src/routes/tacticalRoutes.js';

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
    server = await startExpressApp((app) => app.use('/api/tactical', tacticalRoutes));
  });
  afterEach(async () => {
    await server.close();
  });

  it('有效参数应返回回测结果和基准', async () => {
    const { res, body } = await postJson(server, '/api/tactical/backtest', validBacktestReq());
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.portfolio).toBeDefined();
    expect(body.data.benchmark).toBeDefined();
    expect(body.data.signalHistory).toHaveLength(1);
    expect(engineMocks.callEngineStrict).toHaveBeenCalledTimes(2);
  });
  it('无效标的数据应返回 404', async () => {
    dataServiceMocks.fetchHistoryData.mockResolvedValue({ data: {}, degraded: false });
    const { res, body } = await postJson(server, '/api/tactical/backtest', validBacktestReq());
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
    const { res } = await postJson(server, '/api/tactical/backtest', req);
    expect(res.status).toBe(400);
  });
  it('引擎抛错时应返回 500', async () => {
    engineMocks.callEngineStrict
      .mockReset()
      .mockRejectedValueOnce(new Error('tactical engine error'));
    const { res } = await postJson(server, '/api/tactical/backtest', validBacktestReq());
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
    const { res, body } = await postJson(server, '/api/tactical/backtest', validBacktestReq());
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
    server = await startExpressApp((app) => app.use('/api/tactical', tacticalRoutes));
  });
  afterEach(async () => {
    await server.close();
  });

  it('有效参数应返回信号状态', async () => {
    const { res, body } = await postJson(server, '/api/tactical/what-if', {
      tickers: ['SPY'],
      strategy: createValidStrategy(),
    });
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data[0].ticker).toBe('SPY');
    expect(body.data[0].weight).toBe(100);
  });
  it('空 tickers 数组应返回 400（zod 校验失败）', async () => {
    const { res } = await postJson(server, '/api/tactical/what-if', { tickers: [] });
    expect(res.status).toBe(400);
  });
  it('引擎抛错时应返回 500', async () => {
    engineMocks.callEngineStrict.mockRejectedValueOnce(new Error('what-if error'));
    const { res } = await postJson(server, '/api/tactical/what-if', {
      tickers: ['SPY'],
      strategy: createValidStrategy(),
    });
    expect(res.status).toBe(500);
  });
});
