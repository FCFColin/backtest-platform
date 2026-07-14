/**
 * 异步任务状态查询集成测试（RO-049）
 *
 * 验证 ADR-019 IDOR 防护：任务结果仅提交者本人或 admin 可读，且需通过多租户隔离。
 * backtestQueue 被 mock 以注入可控的 job.data（owner/tenant）。
 * 鉴权中间件可按用例切换角色，覆盖 admin 放行、非 admin 越权拒绝、跨租户拒绝。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../../packages/backend/src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));

const fakeJobs = new Map<string, FakeJob>();

interface FakeJobData {
  type: 'optimizer' | 'grid-search';
  payload: Record<string, unknown>;
  userId?: string;
  tenantId?: string;
  ownerUserId?: string | null;
}

interface FakeJob {
  id: string;
  data: FakeJobData;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  returnvalue?: unknown;
  failedReason?: string;
  state: string;
  getState: () => Promise<string>;
}

vi.mock('../../packages/backend/src/queues/backtestQueue.js', () => ({
  backtestQueue: {
    getJob: vi.fn(async (id: string) => fakeJobs.get(id) ?? null),
  },
}));

import express from 'express';
import { jobRoutes } from '../../packages/backend/src/routes/jobRoutes.js';

const requesterUserId = 'requester-user-id';
const orgA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const orgB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

/** 当前生效的鉴权上下文（按用例切换角色与租户） */
let currentRole: 'admin' | 'analyst' | 'readonly' = 'analyst';
let currentTenant: string | undefined = orgA;

function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  (req as unknown as { tenantId: string | undefined }).tenantId = currentTenant;
  (req as unknown as { user: unknown }).user = {
    sub: requesterUserId,
    role: currentRole,
    tenant_id: currentTenant,
    org_role: currentRole === 'admin' ? 'owner' : currentRole,
    platform_admin: false,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  next();
}

let baseUrl = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(authMiddleware);
  app.use('/api/v1', jobRoutes);

  await new Promise<void>((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(() => {
  fakeJobs.clear();
});

function createFakeJob(overrides: Partial<FakeJobData> & { id?: string } = {}): FakeJob {
  const id = overrides.id ?? `job-${fakeJobs.size + 100}`;
  const job: FakeJob = {
    id,
    data: {
      type: 'optimizer',
      payload: {},
      userId: 'someone-else',
      tenantId: orgA,
      ...overrides,
    },
    timestamp: Date.now(),
    state: 'completed',
    getState: async () => 'completed',
  };
  fakeJobs.set(id, job);
  return job;
}

describe('异步任务 IDOR 防护集成测试', () => {
  it('非 admin 且非 owner 被拒绝（404 不泄露存在性）', async () => {
    currentRole = 'analyst';
    currentTenant = orgA;
    const job = createFakeJob({ userId: 'someone-else', tenantId: orgA });
    const res = await fetch(`${baseUrl}/api/v1/jobs/${job.id}`);
    expect(res.status).toBe(404);
  });

  it('跨租户访问被拒绝（404），即便同租户 owner', async () => {
    currentRole = 'analyst';
    currentTenant = orgA;
    const job = createFakeJob({
      userId: requesterUserId,
      tenantId: orgB,
    });
    const res = await fetch(`${baseUrl}/api/v1/jobs/${job.id}`);
    expect(res.status).toBe(404);
  });

  it('提交者本人可读（owner）', async () => {
    currentRole = 'analyst';
    currentTenant = orgA;
    const job = createFakeJob({
      userId: requesterUserId,
      tenantId: orgA,
    });
    job.returnvalue = { metrics: { sharpe: 1.5 } };
    const res = await fetch(`${baseUrl}/api/v1/jobs/${job.id}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.state).toBe('completed');
    expect(json.data.result).toEqual({ metrics: { sharpe: 1.5 } });
  });

  it('admin 可读同租户任意任务', async () => {
    currentRole = 'admin';
    currentTenant = orgA;
    const job = createFakeJob({ userId: 'another-user', tenantId: orgA });
    job.returnvalue = { ok: true };
    const res = await fetch(`${baseUrl}/api/v1/jobs/${job.id}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.state).toBe('completed');
  });

  it('不存在的任务返回 404', async () => {
    const res = await fetch(`${baseUrl}/api/v1/jobs/nonexistent-job-id`);
    expect(res.status).toBe(404);
  });
});
