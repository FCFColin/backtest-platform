/**
 * 回测优化器路由单元测试
 *
 * 企业理由：参数优化遍历大量组合运行回测，异步任务提交和同步回退
 * 影响系统可用性。测试覆盖：异步提交、同步回退、参数校验、无效标的。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';
import { mockLogger } from '../../helpers/mockFactories.js';
import { EngineUnavailableErrorStub } from '../../helpers/engineRouteMocks.js';

const dataServiceMocks = vi.hoisted(() => ({
  fetchHistoryData: vi.fn(),
}));

const engineClientMocks = vi.hoisted(() => ({
  callEngineStrict: vi.fn(),
}));

const queueMocks = vi.hoisted(() => ({
  add: vi.fn(),
}));

const timeoutMocks = vi.hoisted(() => ({
  withTimeout: vi.fn((promise: Promise<unknown>) => promise),
  TimeoutError: class TimeoutError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'TimeoutError';
    }
  },
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../../../packages/backend/src/services/dataService.js', () => ({
  fetchHistoryData: dataServiceMocks.fetchHistoryData,
}));

vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
  callEngineStrict: engineClientMocks.callEngineStrict,
  EngineUnavailableError: EngineUnavailableErrorStub,
}));

vi.mock('../../../packages/backend/src/queues/backtestQueue.js', () => ({
  backtestQueue: {
    add: queueMocks.add,
  },
}));

vi.mock('../../../packages/backend/src/utils/timeout.js', () => ({
  withTimeout: timeoutMocks.withTimeout,
  TimeoutError: timeoutMocks.TimeoutError,
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

import backtestOptimizerRoutes from '../../../packages/backend/src/routes/backtestOptimizerRoutes.js';

function createValidRequest() {
  return {
    portfolio: {
      name: 'Test Portfolio',
      assets: [{ ticker: 'SPY', weight: 100 }],
    },
    parameterSpace: {
      rebalanceFrequencies: ['monthly'] as const[],
      initialCapital: { min: 10000, max: 10000, step: 1000 },
    },
    parameters: {
      startDate: '2020-01-01',
      endDate: '2024-01-01',
    },
    objective: 'maxCagr' as const,
  };
}

function createMockPriceData() {
  return {
    SPY: { '2020-01-01': 300.0, '2020-01-02': 301.0 },
  };
}

function createMockBacktestResult() {
  return {
    portfolios: [
      {
        statistics: {
          cagr: 0.1,
          maxDrawdown: 0.15,
          sharpe: 1.5,
          sortino: 1.8,
          stdev: 0.15,
          calmar: 0.67,
        },
        growthCurve: [
          { date: '2020-01-01', value: 10000 },
          { date: '2020-01-02', value: 10100 },
        ],
      },
    ],
    benchmarkGrowth: [{ date: '2020-01-01', value: 10000 }],
  };
}

describe('backtestOptimizerRoutes - POST /api/backtest-optimizer/optimize', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    queueMocks.add.mockResolvedValue({ id: 'opt-job-456' });
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      data: createMockPriceData(),
      degraded: false,
    });
    engineClientMocks.callEngineStrict.mockResolvedValue(createMockBacktestResult());
    server = await startExpressApp((app) =>
      app.use('/api/backtest-optimizer', backtestOptimizerRoutes),
    );
  });

  afterEach(async () => {
    await server.close();
  });

  it('异步提交成功时应返回 202 和标准成功形状 {success, data:{jobId, statusUrl}}', async () => {
    const res = await fetch(`${server.url}/api/backtest-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body.success).toBe(true);
    expect(body.data.jobId).toBe('opt-job-456');
    expect(body.data.statusUrl).toContain('/api/v1/jobs/opt-job-456');
    expect(queueMocks.add).toHaveBeenCalledTimes(1);
  });

  it('BullMQ 不可用时应回退到同步执行并返回 200', async () => {
    queueMocks.add.mockRejectedValue(new Error('Redis unavailable'));

    const res = await fetch(`${server.url}/api/backtest-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.results).toBeDefined();
    expect(body.data.best).toBeDefined();
    expect(body.data.totalCombinations).toBeGreaterThan(0);
    expect(engineClientMocks.callEngineStrict).toHaveBeenCalledWith(
      '/api/engine/backtest',
      expect.objectContaining({ portfolios: expect.any(Array) }),
    );
  });

  it('同步回退时无效标的应返回 400', async () => {
    queueMocks.add.mockRejectedValue(new Error('Redis unavailable'));
    dataServiceMocks.fetchHistoryData.mockResolvedValue({ data: {}, degraded: false });

    const res = await fetch(`${server.url}/api/backtest-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    // T-18：错误统一为 RFC 7807 problem+json（detail 字段携带错误详情，无 success 字段）。
    expect(res.status).toBe(400);
    expect(body.error.detail).toContain('SPY');
  });

  it('缺少 portfolio 应返回 400（zod 校验失败）', async () => {
    const req = createValidRequest();
    delete (req as Record<string, unknown>).portfolio;

    const res = await fetch(`${server.url}/api/backtest-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
    expect(queueMocks.add).not.toHaveBeenCalled();
  });

  it('空 assets 数组应返回 400（zod 校验失败）', async () => {
    const req = createValidRequest();
    req.portfolio.assets = [];

    const res = await fetch(`${server.url}/api/backtest-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
  });

  it('空 rebalanceFrequencies 应返回 400（zod 校验失败）', async () => {
    const req = createValidRequest();
    req.parameterSpace.rebalanceFrequencies = [];

    const res = await fetch(`${server.url}/api/backtest-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
  });

  it('缺少 startDate 应返回 400（zod 校验失败）', async () => {
    const req = createValidRequest();
    delete (req as Record<string, unknown>).parameters.startDate;

    const res = await fetch(`${server.url}/api/backtest-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
  });

  it('无效 objective 应返回 400（zod 校验失败）', async () => {
    const req = createValidRequest();
    (req as Record<string, unknown>).objective = 'invalid';

    const res = await fetch(`${server.url}/api/backtest-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
  });

  it('同步回退时 callEngineStrict 抛错应返回 500', async () => {
    queueMocks.add.mockRejectedValue(new Error('Redis unavailable'));
    engineClientMocks.callEngineStrict.mockRejectedValue(new Error('backtest engine error'));

    const res = await fetch(`${server.url}/api/backtest-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });

    expect(res.status).toBe(500);
  });

  it('同步回退时应按 objective 排序结果', async () => {
    queueMocks.add.mockRejectedValue(new Error('Redis unavailable'));
    engineClientMocks.callEngineStrict.mockResolvedValue({
      portfolios: [
        {
          statistics: {
            cagr: 0.12,
            maxDrawdown: 0.1,
            sharpe: 1.8,
            sortino: 2.0,
            stdev: 0.12,
            calmar: 1.2,
          },
          growthCurve: [{ date: '2020-01-01', value: 10000 }],
        },
      ],
      benchmarkGrowth: [{ date: '2020-01-01', value: 10000 }],
    });

    const res = await fetch(`${server.url}/api/backtest-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.results[0].cagr).toBe(0.12);
    expect(body.data.best.cagr).toBe(0.12);
    expect(body.data.best.growthCurve).toBeDefined();
  });

  it('Go 引擎不可用时同步回退应返回 503 + Retry-After + degraded（fail-closed，不回退 Node）', async () => {
    queueMocks.add.mockRejectedValue(new Error('Redis unavailable'));
    engineClientMocks.callEngineStrict.mockRejectedValue(
      new EngineUnavailableErrorStub('/api/engine/backtest'),
    );

    const res = await fetch(`${server.url}/api/backtest-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('30');
    expect(body.error.code).toBe('ENGINE_UNAVAILABLE');
    expect(body.degraded).toBe(true);
    expect(body.degradedWarning).toBeDefined();
    // 仅尝试调用 Go 引擎，未回退 Node 的 runPortfolioBacktest
    expect(engineClientMocks.callEngineStrict).toHaveBeenCalledWith(
      '/api/engine/backtest',
      expect.objectContaining({ portfolios: expect.any(Array) }),
    );
  });

  it('同步回退超时应返回 503', async () => {
    queueMocks.add.mockRejectedValue(new Error('Redis unavailable'));
    timeoutMocks.withTimeout.mockRejectedValueOnce(new timeoutMocks.TimeoutError('计算超时'));

    const res = await fetch(`${server.url}/api/backtest-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error.detail).toContain('超时');
  });
});

describe('认证用户请求', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    queueMocks.add.mockResolvedValue({ id: 'opt-job-auth-789' });
    server = await startExpressApp((app) => {
      app.use((req, _res, next) => {
        (req as Record<string, unknown>).user = { sub: 'user-123', role: 'admin' };
        (req as Record<string, unknown>).tenantId = 'tenant-456';
        next();
      });
      app.use('/api/backtest-optimizer', backtestOptimizerRoutes);
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it('应设置 ownerUserId 为实际用户 ID', async () => {
    await fetch(`${server.url}/api/backtest-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });

    expect(queueMocks.add).toHaveBeenCalledWith(
      'optimizer',
      expect.objectContaining({
        userId: 'user-123',
        ownerUserId: 'user-123',
        tenantId: 'tenant-456',
      }),
    );
  });
});
