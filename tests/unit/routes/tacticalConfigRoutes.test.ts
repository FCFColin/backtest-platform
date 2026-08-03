import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer, type TestRequest } from '../../helpers/expressApp.js';
import { createLoggerMocks } from '../../helpers/mockFactories.js';

const mocks = vi.hoisted(() => ({
  repo: {
    findByTenant: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    count: vi.fn(),
  },
  membership: { getOrg: vi.fn() },
  planLimits: { getPlanLimits: vi.fn() },
}));

vi.mock('../../../packages/backend/src/repositories/tacticalConfigRepository.js', () => mocks.repo);
vi.mock('../../../packages/backend/src/application/org/membershipService.js', () => ({
  getOrg: mocks.membership.getOrg,
}));
vi.mock('../../../packages/backend/src/application/billing/planLimitsService.js', () => ({
  getPlanLimits: mocks.planLimits.getPlanLimits,
}));
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));
vi.mock('../../../packages/backend/src/middleware/tenantContext.js', () => ({
  resolveTenant: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireTenant: (_req: unknown, _res: unknown, next: () => void) => next(),
  hasTenant: vi.fn(() => true),
}));
vi.mock('../../../packages/backend/src/middleware/rbac.js', () => ({
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  Permission: { STRATEGY_MANAGE: 'strategy:manage' },
}));

import tacticalConfigRoutes from '../../../packages/backend/src/routes/tacticalConfigRoutes.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const CONFIG_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RECORD = {
  id: CONFIG_ID,
  name: 'Strategy A',
  description: 'desc',
  config: { foo: 'bar' },
  userId: USER_ID,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

let server: TestServer;

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.planLimits.getPlanLimits.mockReturnValue({ maxTacticalConfigs: 50 });
  mocks.membership.getOrg.mockResolvedValue({ plan: 'pro' });
  server = await startExpressApp((app) => {
    app.use((req: TestRequest, _res, next) => {
      req.tenantId = ORG;
      req.user = { sub: USER_ID, role: 'admin', org_role: 'admin' };
      next();
    });
    app.use('/api/v1/tactical/configs', tacticalConfigRoutes);
  });
});

afterEach(async () => {
  await server.close();
});

describe('GET /', () => {
  it('应返回配置列表', async () => {
    mocks.repo.findByTenant.mockResolvedValue([RECORD]);
    const res = await fetch(`${server.url}/api/v1/tactical/configs`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(mocks.repo.findByTenant).toHaveBeenCalledWith(ORG, 50, 0);
  });
});

describe('GET /:id', () => {
  it('存在时应返回配置', async () => {
    mocks.repo.findById.mockResolvedValue(RECORD);
    const res = await fetch(`${server.url}/api/v1/tactical/configs/${CONFIG_ID}`);
    expect(res.status).toBe(200);
  });

  it('不存在时应返回 404', async () => {
    mocks.repo.findById.mockResolvedValue(null);
    const res = await fetch(`${server.url}/api/v1/tactical/configs/${CONFIG_ID}`);
    expect(res.status).toBe(404);
  });

  it('无效 UUID 应返回 400', async () => {
    const res = await fetch(`${server.url}/api/v1/tactical/configs/not-a-uuid`);
    expect(res.status).toBe(400);
  });
});

describe('POST /', () => {
  it('配额未超时应创建配置', async () => {
    mocks.repo.count.mockResolvedValue(10);
    mocks.repo.create.mockResolvedValue(RECORD);
    const res = await fetch(`${server.url}/api/v1/tactical/configs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Strategy A', config: { foo: 'bar' } }),
    });
    expect(res.status).toBe(201);
    expect(mocks.repo.create).toHaveBeenCalledWith(ORG, USER_ID, {
      name: 'Strategy A',
      config: { foo: 'bar' },
    });
  });

  it('配额超限时应返回 402', async () => {
    mocks.repo.count.mockResolvedValue(50);
    const res = await fetch(`${server.url}/api/v1/tactical/configs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x', config: {} }),
    });
    expect(res.status).toBe(402);
    expect(mocks.repo.create).not.toHaveBeenCalled();
  });

  it('组织查询失败时应降级为 free 配额', async () => {
    mocks.membership.getOrg.mockRejectedValue(new Error('db down'));
    mocks.planLimits.getPlanLimits.mockReturnValue({ maxTacticalConfigs: 5 });
    mocks.repo.count.mockResolvedValue(3);
    mocks.repo.create.mockResolvedValue(RECORD);
    const res = await fetch(`${server.url}/api/v1/tactical/configs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x', config: {} }),
    });
    expect(res.status).toBe(201);
    expect(mocks.planLimits.getPlanLimits).toHaveBeenCalledWith('free');
  });
});

describe('PUT /:id', () => {
  it('应更新配置', async () => {
    mocks.repo.update.mockResolvedValue({ ...RECORD, name: 'Updated' });
    const res = await fetch(`${server.url}/api/v1/tactical/configs/${CONFIG_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated' }),
    });
    expect(res.status).toBe(200);
  });

  it('不存在时应返回 404', async () => {
    mocks.repo.update.mockResolvedValue(null);
    const res = await fetch(`${server.url}/api/v1/tactical/configs/${CONFIG_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /:id', () => {
  it('应删除配置', async () => {
    mocks.repo.remove.mockResolvedValue(true);
    const res = await fetch(`${server.url}/api/v1/tactical/configs/${CONFIG_ID}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
  });

  it('不存在时应返回 404', async () => {
    mocks.repo.remove.mockResolvedValue(false);
    const res = await fetch(`${server.url}/api/v1/tactical/configs/${CONFIG_ID}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(404);
  });
});
