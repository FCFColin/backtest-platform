/**
 * 任务状态路由单元测试
 *
 * 企业理由：异步任务提交后，客户端需轮询获取结果，状态查询的正确性
 * 直接影响前端展示。测试覆盖：任务存在（completed/failed）、任务不存在、查询异常。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer, type TestRequest } from '../../helpers/expressApp.js';

const queueMocks = vi.hoisted(() => ({
  getJob: vi.fn(),
}));

vi.mock('../../../api/queues/backtestQueue.js', () => ({
  backtestQueue: {
    getJob: queueMocks.getJob,
  },
}));

import { createLoggerMocks } from '../../helpers/mockFactories.js';
vi.mock('../../../api/utils/logger.js', () => ({ logger: createLoggerMocks() }));

import { jobRoutes } from '../../../api/routes/jobRoutes.js';

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
        const platformAdmin = req.headers['x-test-platform'] === 'true';
        const tenantId = (req.headers['x-test-tenant'] as string) || undefined;
        req.user = {
          sub,
          role,
          platform_admin: platformAdmin,
          iat: 0,
          exp: 0,
        };
        req.tenantId = tenantId;
        next();
      });
      app.use('/api/v1', jobRoutes);
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it('任务存在且已完成时应返回结果', async () => {
    const mockJob = {
      id: 'job-123',
      data: { type: 'optimizer' },
      timestamp: 1700000000000,
      processedOn: 1700000001000,
      finishedOn: 1700000005000,
      returnvalue: { best: { cagr: 0.12 } },
      failedReason: undefined,
      getState: vi.fn().mockResolvedValue('completed'),
    };
    queueMocks.getJob.mockResolvedValue(mockJob);

    const res = await fetch(`${server.url}/api/v1/jobs/job-123`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe('job-123');
    expect(body.type).toBe('optimizer');
    expect(body.state).toBe('completed');
    expect(body.createdAt).toBe(1700000000000);
    expect(body.processedAt).toBe(1700000001000);
    expect(body.finishedAt).toBe(1700000005000);
    expect(body.result).toEqual({ best: { cagr: 0.12 } });
    expect(queueMocks.getJob).toHaveBeenCalledWith('job-123');
  });

  it('任务存在且失败时应返回通用错误（不泄露内部 failedReason）', async () => {
    const mockJob = {
      id: 'job-456',
      data: { type: 'grid-search' },
      timestamp: 1700000000000,
      processedOn: 1700000001000,
      finishedOn: 1700000005000,
      returnvalue: undefined,
      failedReason: 'Engine timeout',
      getState: vi.fn().mockResolvedValue('failed'),
    };
    queueMocks.getJob.mockResolvedValue(mockJob);

    const res = await fetch(`${server.url}/api/v1/jobs/job-456`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.state).toBe('failed');
    // T-28：不回传真实 failedReason，仅通用错误，避免泄露引擎/栈内部细节。
    expect(body.error).toBe('Job execution failed');
    expect(body.error).not.toContain('Engine timeout');
    expect(body.result).toBeUndefined();
  });

  it('未认证时应返回 401', async () => {
    // 模拟无 req.user：通过一个不注入 user 的独立 app。
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

  it('越权访问他人任务应返回 404（ADR-019）', async () => {
    const mockJob = {
      id: 'job-owned',
      data: { type: 'optimizer', userId: 'owner-user' },
      timestamp: 1700000000000,
      processedOn: 1700000001000,
      finishedOn: 1700000005000,
      returnvalue: { ok: true },
      getState: vi.fn().mockResolvedValue('completed'),
    };
    queueMocks.getJob.mockResolvedValue(mockJob);

    // 以非所有者、非 admin 身份访问
    const res = await fetch(`${server.url}/api/v1/jobs/job-owned`, {
      headers: { 'x-test-sub': 'attacker', 'x-test-role': 'analyst' },
    });
    expect(res.status).toBe(404);
  });

  it('所有者本人可访问自己的任务', async () => {
    const mockJob = {
      id: 'job-mine',
      data: { type: 'optimizer', userId: 'owner-user' },
      timestamp: 1700000000000,
      processedOn: 1700000001000,
      finishedOn: 1700000005000,
      returnvalue: { ok: true },
      getState: vi.fn().mockResolvedValue('completed'),
    };
    queueMocks.getJob.mockResolvedValue(mockJob);

    const res = await fetch(`${server.url}/api/v1/jobs/job-mine`, {
      headers: { 'x-test-sub': 'owner-user', 'x-test-role': 'analyst' },
    });
    expect(res.status).toBe(200);
  });

  it('跨租户访问任务应返回 404，即便是 admin（ADR-034）', async () => {
    const mockJob = {
      id: 'job-tenant-a',
      data: { type: 'optimizer', userId: 'owner-user', tenantId: 'org-a' },
      timestamp: 1700000000000,
      processedOn: 1700000001000,
      finishedOn: 1700000005000,
      returnvalue: { ok: true },
      getState: vi.fn().mockResolvedValue('completed'),
    };
    queueMocks.getJob.mockResolvedValue(mockJob);

    // admin 但活跃租户为 org-b，与任务的 org-a 不符
    const res = await fetch(`${server.url}/api/v1/jobs/job-tenant-a`, {
      headers: { 'x-test-sub': 'admin-user', 'x-test-role': 'admin', 'x-test-tenant': 'org-b' },
    });
    expect(res.status).toBe(404);
  });

  it('同租户 admin 可访问租户任务', async () => {
    const mockJob = {
      id: 'job-tenant-ok',
      data: { type: 'optimizer', userId: 'someone', tenantId: 'org-a' },
      timestamp: 1700000000000,
      processedOn: 1700000001000,
      finishedOn: 1700000005000,
      returnvalue: { ok: true },
      getState: vi.fn().mockResolvedValue('completed'),
    };
    queueMocks.getJob.mockResolvedValue(mockJob);

    const res = await fetch(`${server.url}/api/v1/jobs/job-tenant-ok`, {
      headers: { 'x-test-sub': 'admin-user', 'x-test-role': 'admin', 'x-test-tenant': 'org-a' },
    });
    expect(res.status).toBe(200);
  });

  it('平台管理员可跨租户访问任务（运维）', async () => {
    const mockJob = {
      id: 'job-tenant-pa',
      data: { type: 'optimizer', userId: 'someone', tenantId: 'org-a' },
      timestamp: 1700000000000,
      processedOn: 1700000001000,
      finishedOn: 1700000005000,
      returnvalue: { ok: true },
      getState: vi.fn().mockResolvedValue('completed'),
    };
    queueMocks.getJob.mockResolvedValue(mockJob);

    const res = await fetch(`${server.url}/api/v1/jobs/job-tenant-pa`, {
      headers: {
        'x-test-sub': 'op',
        'x-test-role': 'admin',
        'x-test-tenant': 'org-b',
        'x-test-platform': 'true',
      },
    });
    expect(res.status).toBe(200);
  });

  it('任务不存在时应返回 404', async () => {
    queueMocks.getJob.mockResolvedValue(null);

    const res = await fetch(`${server.url}/api/v1/jobs/nonexistent`);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.status).toBe(404);
    expect(body.title).toBe('Not Found');
    expect(body.detail).toContain('not found');
  });

  it('getJob 抛错时应返回 500', async () => {
    queueMocks.getJob.mockRejectedValue(new Error('Redis connection failed'));

    const res = await fetch(`${server.url}/api/v1/jobs/job-err`);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.status).toBe(500);
    expect(body.detail).toBe('Failed to fetch job status');
  });

  it('任务处于 active 状态时不应包含 result 或 error', async () => {
    const mockJob = {
      id: 'job-active',
      data: { type: 'optimizer' },
      timestamp: 1700000000000,
      processedOn: 1700000001000,
      finishedOn: undefined,
      returnvalue: undefined,
      failedReason: undefined,
      getState: vi.fn().mockResolvedValue('active'),
    };
    queueMocks.getJob.mockResolvedValue(mockJob);

    const res = await fetch(`${server.url}/api/v1/jobs/job-active`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.state).toBe('active');
    expect(body.result).toBeUndefined();
    expect(body.error).toBeUndefined();
  });
});
