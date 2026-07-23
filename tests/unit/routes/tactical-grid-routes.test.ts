/**
 * 战术网格搜索路由单元测试
 *
 * 企业理由：网格搜索遍历参数组合运行回测，异步任务提交和同步回退
 * 影响系统可用性。测试覆盖：异步提交、同步回退、参数校验、组合上限。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';
import { mockLogger } from '../../helpers/mockFactories.js';
import { EngineUnavailableErrorStub } from '../../helpers/engineRouteMocks.js';
import { createMockPriceData } from '../../helpers/storeFixtures.js';

const dataServiceMocks = vi.hoisted(() => ({
  fetchHistoryData: vi.fn(),
}));

const queueMocks = vi.hoisted(() => ({
  add: vi.fn(),
}));

const engineMocks = vi.hoisted(() => ({
  callEngineStrict: vi.fn(),
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

// 设置同步降级路径超时，使超时测试可接受等待时长
vi.hoisted(() => {
  process.env.SYNC_COMPUTE_TIMEOUT_MS = '500';
});

vi.mock('../../../packages/backend/src/infrastructure/dataFacade.js', () => ({
  fetchHistoryData: dataServiceMocks.fetchHistoryData,
}));

vi.mock('../../../packages/backend/src/queues/backtestQueue.js', () => ({
  backtestQueue: {
    add: queueMocks.add,
  },
}));

vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
  callEngineStrict: engineMocks.callEngineStrict,
  EngineUnavailableError: EngineUnavailableErrorStub,
}));

vi.mock('../../../packages/backend/src/utils/logSanitizer.js', () => ({
  sanitizeLog: (s: string) => s.replace(/[\n\r]/g, '').substring(0, 50),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

import tacticalGridRoutes from '../../../packages/backend/src/routes/tacticalGridRoutes.js';

function createValidRequest() {
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

describe('tacticalGridRoutes - POST /api/tactical-grid/search', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    queueMocks.add.mockResolvedValue({ id: 'grid-job-123' });
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      data: createMockPriceData({ numDays: 30, startPrice: 301 }),
      degraded: false,
    });
    engineMocks.callEngineStrict.mockResolvedValue({
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
    });
    server = await startExpressApp((app) => app.use('/api/tactical-grid', tacticalGridRoutes));
  });

  afterEach(async () => {
    await server.close();
  });

  it('异步提交成功时应返回 202 和 jobId', async () => {
    const res = await fetch(`${server.url}/api/tactical-grid/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body.status).toBe(202);
    expect(body.jobId).toBe('grid-job-123');
    expect(body.statusUrl).toContain('/api/v1/jobs/grid-job-123');
    expect(queueMocks.add).toHaveBeenCalledTimes(1);
  });

  it('BullMQ 不可用时应回退到同步执行并返回 200', async () => {
    queueMocks.add.mockRejectedValue(new Error('Redis unavailable'));

    const res = await fetch(`${server.url}/api/tactical-grid/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.results).toHaveLength(1);
    expect(engineMocks.callEngineStrict).toHaveBeenCalledTimes(1);
  });

  it('同步回退时价格数据缺失应返回 400', async () => {
    queueMocks.add.mockRejectedValue(new Error('Redis unavailable'));
    dataServiceMocks.fetchHistoryData.mockResolvedValue({ data: {}, degraded: false });

    const res = await fetch(`${server.url}/api/tactical-grid/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    // T-18：错误统一为 RFC 7807 problem+json（detail 携带详情，无 success 字段）。
    expect(res.status).toBe(400);
    expect(body.error.code).toBe('GRID_BAD_REQUEST');
  });

  it('参数组合超过上限应返回 400', async () => {
    const req = createValidRequest();
    req.param1 = { min: 1, max: 100, step: 1 };
    req.param2 = { min: 1, max: 100, step: 1 };

    const res = await fetch(`${server.url}/api/tactical-grid/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error.code).toBe('GRID_TOO_MANY_COMBINATIONS');
    expect(queueMocks.add).not.toHaveBeenCalled();
  });

  it('缺少 indicator 应返回 400（zod 校验失败）', async () => {
    const req = createValidRequest();
    delete (req as Record<string, unknown>).indicator;

    const res = await fetch(`${server.url}/api/tactical-grid/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
  });

  it('空 tickers 数组应返回 400（zod 校验失败）', async () => {
    const req = createValidRequest();
    req.tickers = [];

    const res = await fetch(`${server.url}/api/tactical-grid/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
  });

  it('无效日期格式应返回 400（zod 校验失败）', async () => {
    const req = createValidRequest();
    req.startDate = 'not-a-date';

    const res = await fetch(`${server.url}/api/tactical-grid/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
  });

  it('runGridSearch 抛错时应返回 500', async () => {
    queueMocks.add.mockRejectedValue(new Error('Redis unavailable'));
    engineMocks.callEngineStrict.mockRejectedValue(new Error('grid engine error'));

    const res = await fetch(`${server.url}/api/tactical-grid/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });

    expect(res.status).toBe(500);
  });

  it('BullMQ 回退同步执行超时应返回 503', async () => {
    queueMocks.add.mockRejectedValue(new Error('Redis unavailable'));
    dataServiceMocks.fetchHistoryData.mockImplementation(() => new Promise(() => {}));

    const res = await fetch(`${server.url}/api/tactical-grid/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });

    expect(res.status).toBe(503);
  });

  it('同步回退时引擎抛空消息 Error 应返回 500 默认信息', async () => {
    queueMocks.add.mockRejectedValue(new Error('Redis unavailable'));
    engineMocks.callEngineStrict.mockRejectedValue(new Error(''));

    const res = await fetch(`${server.url}/api/tactical-grid/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });

    expect(res.status).toBe(500);
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
      app.use('/api/tactical-grid', tacticalGridRoutes);
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it('应设置 ownerUserId 为实际用户 ID', async () => {
    await fetch(`${server.url}/api/tactical-grid/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
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
