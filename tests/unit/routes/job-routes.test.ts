import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer, type TestRequest } from '../../helpers/expressApp.js';

const queueMocks = vi.hoisted(() => ({ getJob: vi.fn() }));

vi.mock('../../../packages/backend/src/queues/backtestQueue.js', () => ({
  backtestQueue: { getJob: queueMocks.getJob },
}));

import { createLoggerMocks } from '../../helpers/mockFactories.js';
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

import { jobRoutes } from '../../../packages/backend/src/routes/jobRoutes.js';

function mockJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-123',
    data: { type: 'optimizer' },
    timestamp: 1700000000000,
    processedOn: 1700000001000,
    finishedOn: 1700000005000,
    returnvalue: undefined,
    failedReason: undefined,
    getState: vi.fn().mockResolvedValue('completed'),
    ...overrides,
  };
}

describe('jobRoutes - GET /api/v1/jobs/:id', () => {
  let server: TestServer;
  beforeEach(async () => {
    vi.clearAllMocks();
    // 测试替身：注入认证身份。默认 admin（绕过所有权校验）；可经 header 覆盖为指定 sub。
    // ADR-019：jobRoutes 依赖 req.user 做认证 + 所有权校验。
    server = await startExpressApp((app) => {
      app.use((req: TestRequest, _res, next) => {
        const sub = (req.headers['x-test-sub'] as string) || 'admin-user';
        const role = (req.headers['x-test-role'] as string) || 'admin';
        req.user = {
          sub,
          role,
          platform_admin: req.headers['x-test-platform'] === 'true',
          iat: 0,
          exp: 0,
        };
        req.tenantId = (req.headers['x-test-tenant'] as string) || undefined;
        next();
      });
      app.use('/api/v1', jobRoutes);
    });
  });
  afterEach(async () => {
    await server.close();
  });

  it('任务存在且已完成时应返回结果', async () => {
    queueMocks.getJob.mockResolvedValue(
      mockJob({ id: 'job-123', returnvalue: { best: { cagr: 0.12 } } }),
    );
    const res = await fetch(`${server.url}/api/v1/jobs/job-123`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.id).toBe('job-123');
    expect(body.data.type).toBe('optimizer');
    expect(body.data.state).toBe('completed');
    expect(body.data.createdAt).toBe(1700000000000);
    expect(body.data.processedAt).toBe(1700000001000);
    expect(body.data.finishedAt).toBe(1700000005000);
    expect(body.data.result).toEqual({ best: { cagr: 0.12 } });
    expect(queueMocks.getJob).toHaveBeenCalledWith('job-123');
  });

  it('任务存在且失败时应返回通用错误（不泄露内部 failedReason）', async () => {
    queueMocks.getJob.mockResolvedValue(
      mockJob({
        id: 'job-456',
        data: { type: 'grid-search' },
        failedReason: 'Engine timeout',
        getState: vi.fn().mockResolvedValue('failed'),
      }),
    );
    const res = await fetch(`${server.url}/api/v1/jobs/job-456`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.state).toBe('failed');
    // T-28：不回传真实 failedReason，仅通用错误，避免泄露引擎/栈内部细节。
    expect(body.data.error).toBe('Job execution failed');
    expect(body.data.error).not.toContain('Engine timeout');
    expect(body.data.result).toBeUndefined();
  });

  it.each([
    [
      '越权访问他人任务应返回 404（ADR-019）',
      mockJob({ id: 'job-owned', data: { type: 'optimizer', userId: 'owner-user' } }),
      { 'x-test-sub': 'attacker', 'x-test-role': 'analyst' },
      404,
    ],
    [
      '所有者本人可访问自己的任务',
      mockJob({ id: 'job-mine', data: { type: 'optimizer', userId: 'owner-user' } }),
      { 'x-test-sub': 'owner-user', 'x-test-role': 'analyst' },
      200,
    ],
    [
      '跨租户访问任务应返回 404，即便是 admin（ADR-034）',
      mockJob({
        id: 'job-tenant-a',
        data: { type: 'optimizer', userId: 'owner-user', tenantId: 'org-a' },
      }),
      { 'x-test-sub': 'admin-user', 'x-test-role': 'admin', 'x-test-tenant': 'org-b' },
      404,
    ],
    [
      '同租户 admin 可访问租户任务',
      mockJob({
        id: 'job-tenant-ok',
        data: { type: 'optimizer', userId: 'someone', tenantId: 'org-a' },
      }),
      { 'x-test-sub': 'admin-user', 'x-test-role': 'admin', 'x-test-tenant': 'org-a' },
      200,
    ],
    [
      '平台管理员可跨租户访问任务（运维）',
      mockJob({
        id: 'job-tenant-pa',
        data: { type: 'optimizer', userId: 'someone', tenantId: 'org-a' },
      }),
      {
        'x-test-sub': 'op',
        'x-test-role': 'admin',
        'x-test-tenant': 'org-b',
        'x-test-platform': 'true',
      },
      200,
    ],
  ])('%s', async (_n, job, headers, expected) => {
    queueMocks.getJob.mockResolvedValue(job);
    const res = await fetch(`${server.url}/api/v1/jobs/${job.id}`, { headers });
    expect(res.status).toBe(expected);
  });

  it('未认证时应返回 401', async () => {
    const unauthServer = await startExpressApp((app) => {
      app.use('/api/v1', jobRoutes);
    });
    try {
      const res = await fetch(`${unauthServer.url}/api/v1/jobs/job-x`);
      expect(res.status).toBe(401);
    } finally {
      await unauthServer.close();
    }
  });

  it('任务不存在时应返回 404', async () => {
    queueMocks.getJob.mockResolvedValue(null);
    const res = await fetch(`${server.url}/api/v1/jobs/nonexistent`);
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error.status).toBe(404);
    expect(body.error.title).toBe('JOB_NOT_FOUND');
  });

  it('getJob 抛错时应返回 500', async () => {
    queueMocks.getJob.mockRejectedValue(new Error('Redis connection failed'));
    const res = await fetch(`${server.url}/api/v1/jobs/job-err`);
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error.status).toBe(500);
    expect(body.error.title).toBe('JOB_STATUS_ERROR');
  });

  it('任务处于 active 状态时不应包含 result 或 error', async () => {
    queueMocks.getJob.mockResolvedValue(
      mockJob({
        id: 'job-active',
        finishedOn: undefined,
        getState: vi.fn().mockResolvedValue('active'),
      }),
    );
    const res = await fetch(`${server.url}/api/v1/jobs/job-active`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.state).toBe('active');
    expect(body.data.result).toBeUndefined();
    expect(body.data.error).toBeUndefined();
  });
});
