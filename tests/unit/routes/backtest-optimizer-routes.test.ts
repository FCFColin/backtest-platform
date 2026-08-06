import { describe, it, expect, vi } from 'vitest';
import { useTestServer } from '../../helpers/expressApp.js';
import { loggerMocks } from '../../helpers/loggerFixture.js';
import { mockConfigModule, mockBacktestQueue } from '../../helpers/mockFactories.js';

const queueMocks = vi.hoisted(() => ({
  add: vi.fn(),
}));
vi.mock('../../../packages/backend/src/queues/backtestQueue.js', () =>
  mockBacktestQueue(queueMocks.add),
);

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: loggerMocks,
}));

vi.mock('../../../packages/backend/src/config/index.js', () =>
  mockConfigModule({ SYNC_COMPUTE_TIMEOUT_MS: 500 }),
);

import '../../helpers/middlewareMocks.js';
import { jobRoutes } from '../../../packages/backend/src/routes/jobRoutes.js';

const OPTIMIZE_PATH = '/backtest-optimizer/optimize';

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

const invalidRequests: Array<[string, (r: Record<string, unknown>) => void]> = [
  ['缺少 portfolio', (r) => delete r.portfolio],
  [
    '空 assets 数组',
    (r) => {
      (r.portfolio as { assets: unknown[] }).assets = [];
    },
  ],
  [
    '空 rebalanceFrequencies',
    (r) => {
      (r.parameterSpace as { rebalanceFrequencies: unknown[] }).rebalanceFrequencies = [];
    },
  ],
  ['缺少 startDate', (r) => delete (r.parameters as Record<string, unknown>).startDate],
  [
    '无效 objective',
    (r) => {
      r.objective = 'invalid';
    },
  ],
];

describe('backtestOptimizerRoutes - POST /api/backtest-optimizer/optimize', () => {
  const server = useTestServer('/api/v1', jobRoutes, {
    clearMocks: true,
    configure: () => {
      queueMocks.add.mockResolvedValue({ id: 'opt-job-456' });
    },
  });

  it('异步提交成功时应返回 202 和标准成功形状 {success, data:{jobId, statusUrl}}', async () => {
    const { res, body } = await server.post(OPTIMIZE_PATH, createValidRequest());

    expect(res.status).toBe(202);
    expect(body.success).toBe(true);
    expect(body.data.jobId).toBe('opt-job-456');
    expect(body.data.statusUrl).toContain('/api/v1/jobs/opt-job-456');
    expect(queueMocks.add).toHaveBeenCalledTimes(1);
  });

  it('BullMQ 不可用时应 fail-closed 返回 503 + Retry-After（ADR-031）', async () => {
    queueMocks.add.mockRejectedValue(new Error('Redis unavailable'));

    const { res, body } = await server.post(OPTIMIZE_PATH, createValidRequest());

    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('OPTIMIZER_QUEUE_UNAVAILABLE');
    // fail-closed：不应有同步回退产生的数据
    expect(body.data).toBeUndefined();
  });

  it.each(invalidRequests)('%s 应返回 400（zod 校验失败）', async (_name, mutate) => {
    const req = createValidRequest() as unknown as Record<string, unknown>;
    mutate(req);

    const { res } = await server.post(OPTIMIZE_PATH, req);

    expect(res.status).toBe(400);
    expect(queueMocks.add).not.toHaveBeenCalled();
  });
});

describe('认证用户请求', () => {
  const server = useTestServer('/api/v1', jobRoutes, {
    clearMocks: true,
    auth: { user: { sub: 'user-123', role: 'admin' }, tenantId: 'tenant-456' },
    configure: () => {
      queueMocks.add.mockResolvedValue({ id: 'opt-job-auth-789' });
    },
  });

  it('应设置 ownerUserId 为实际用户 ID', async () => {
    await server.post(OPTIMIZE_PATH, createValidRequest());

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
