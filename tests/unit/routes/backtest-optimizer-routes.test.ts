import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';
import { mockLogger } from '../../helpers/mockFactories.js';

const queueMocks = vi.hoisted(() => ({
  add: vi.fn(),
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

vi.mock('../../../packages/backend/src/queues/backtestQueue.js', () => ({
  backtestQueue: {
    add: queueMocks.add,
  },
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: { SYNC_COMPUTE_TIMEOUT_MS: 500 },
  validateConfig: vi.fn(),
  USAGE_METRIC: { BACKTEST: 'backtest' },
}));

import '../../helpers/middlewareMocks.js';
import { jobRoutes } from '../../../packages/backend/src/routes/jobRoutes.js';

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

describe('backtestOptimizerRoutes - POST /api/backtest-optimizer/optimize', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    queueMocks.add.mockResolvedValue({ id: 'opt-job-456' });
    server = await startExpressApp((app) => app.use('/api/v1', jobRoutes));
  });

  afterEach(async () => {
    await server.close();
  });

  it('异步提交成功时应返回 202 和标准成功形状 {success, data:{jobId, statusUrl}}', async () => {
    const res = await fetch(`${server.url}/api/v1/backtest-optimizer/optimize`, {
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

  it('BullMQ 不可用时应 fail-closed 返回 503 + Retry-After（ADR-031）', async () => {
    queueMocks.add.mockRejectedValue(new Error('Redis unavailable'));

    const res = await fetch(`${server.url}/api/v1/backtest-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('OPTIMIZER_QUEUE_UNAVAILABLE');
    // fail-closed：不应有同步回退产生的数据
    expect(body.data).toBeUndefined();
  });

  it('缺少 portfolio 应返回 400（zod 校验失败）', async () => {
    const req = createValidRequest();
    delete (req as Record<string, unknown>).portfolio;

    const res = await fetch(`${server.url}/api/v1/backtest-optimizer/optimize`, {
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

    const res = await fetch(`${server.url}/api/v1/backtest-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
  });

  it('空 rebalanceFrequencies 应返回 400（zod 校验失败）', async () => {
    const req = createValidRequest();
    req.parameterSpace.rebalanceFrequencies = [];

    const res = await fetch(`${server.url}/api/v1/backtest-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
  });

  it('缺少 startDate 应返回 400（zod 校验失败）', async () => {
    const req = createValidRequest();
    delete (req as Record<string, unknown>).parameters.startDate;

    const res = await fetch(`${server.url}/api/v1/backtest-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
  });

  it('无效 objective 应返回 400（zod 校验失败）', async () => {
    const req = createValidRequest();
    (req as Record<string, unknown>).objective = 'invalid';

    const res = await fetch(`${server.url}/api/v1/backtest-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
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
      app.use('/api/v1', jobRoutes);
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it('应设置 ownerUserId 为实际用户 ID', async () => {
    await fetch(`${server.url}/api/v1/backtest-optimizer/optimize`, {
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
