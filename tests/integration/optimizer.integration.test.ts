import '../helpers/loggerMock.js';
/**
 * 优化器全链路集成测试（RO-049 SubTask 33.1）
 *
 * 跨层验证：Express 路由 → Zod 校验 → BullMQ 异步提交 → 响应。
 * 重点覆盖 ADR-009 异步任务携带租户/owner 归属，与 ADR-008 fail-closed。
 */
import { describe, it, expect, vi } from 'vitest';
import { useTestServer } from '../helpers/expressApp.js';

const { queueAddMock } = vi.hoisted(() => ({
  queueAddMock: vi.fn(),
}));

vi.mock('../../packages/backend/src/queues/backtestQueue.js', () => ({
  backtestQueue: { add: queueAddMock },
}));

import '../helpers/middlewareMocks.js';
import { jobRoutes } from '../../packages/backend/src/routes/jobRoutes.js';

const orgId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const userId = 'optimizer-user';
const server = useTestServer('/api/v1', jobRoutes, {
  auth: {
    user: { sub: userId, role: 'admin', tenant_id: orgId, org_role: 'owner' },
    tenantId: orgId,
  },
});

const validBody = {
  portfolio: {
    name: '测试组合',
    assets: [{ ticker: 'AAPL', weight: 60 }],
  },
  parameterSpace: {
    rebalanceFrequencies: ['quarterly'],
    initialCapital: { min: 10000, max: 50000, step: 10000 },
  },
  parameters: { startDate: '2020-01-01', endDate: '2023-12-31' },
  objective: 'maxSharpe',
};

describe('优化器全链路集成测试', () => {
  it('POST /optimize 队列可用时返回 202 + jobId（携带租户归属 ADR-009）', async () => {
    queueAddMock.mockResolvedValueOnce({ id: 'job-async-1' });

    const { res, body } = await server.post('/backtest-optimizer/optimize', validBody);
    expect(res.status).toBe(202);
    expect(body.success).toBe(true);
    expect(body.data.jobId).toBe('job-async-1');
    expect(body.data.statusUrl).toBe('/api/v1/jobs/job-async-1');

    expect(queueAddMock).toHaveBeenCalledWith(
      'optimizer',
      expect.objectContaining({
        type: 'optimizer',
        tenantId: orgId,
        ownerUserId: userId,
      }),
      // ADR-009：BullMQ 自增 id 写不进 UUID 主键，显式传 UUID jobId
      expect.objectContaining({ jobId: expect.any(String) }),
    );
  });

  it('POST /optimize 队列不可用时 fail-closed 返回 503（ADR-008）', async () => {
    queueAddMock.mockRejectedValueOnce(new Error('Redis 不可用'));

    const { res, body } = await server.post('/backtest-optimizer/optimize', validBody);
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(body.error.code).toBe('OPTIMIZER_QUEUE_UNAVAILABLE');
    expect(body.success).toBe(false);
    expect(body.data).toBeUndefined();
  });

  it('POST /optimize 非法 objective 返回校验错误', async () => {
    const { res } = await server.post('/backtest-optimizer/optimize', {
      ...validBody,
      objective: 'invalid',
    });
    expect(res.status).toBe(400);
  });

  it('POST /optimize 空资产数组返回校验错误', async () => {
    const { res } = await server.post('/backtest-optimizer/optimize', {
      ...validBody,
      portfolio: { assets: [] },
    });
    expect(res.status).toBe(400);
  });
});
