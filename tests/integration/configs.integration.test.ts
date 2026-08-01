import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createLoggerMocks } from '../helpers/mockFactories.js';

vi.mock('../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

vi.mock('../../packages/backend/src/middleware/jwtAuth.js', () => ({
  jwtAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  optionalJwtAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  assignGuestReadonly: (_req: unknown, _res: unknown, next: () => void) => next(),
  auditLog: (_req: unknown, _res: unknown, next: () => void) => next(),
  idempotencyKey: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../packages/backend/src/middleware/tenantContext.js', () => ({
  resolveTenant: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireTenant: (_req: unknown, _res: unknown, next: () => void) => next(),
  hasTenant: vi.fn(() => true),
}));

vi.mock('../../packages/backend/src/middleware/rbac.js', () => ({
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  Permission: {
    BACKTEST_RUN: 'backtest:run',
    ADMIN_ACCESS: 'admin:access',
    OPTIMIZER_RUN: 'optimizer:run',
    STRATEGY_MANAGE: 'strategy:manage',
    SIGNAL_READ: 'signal:read',
    DATA_READ: 'data:read',
  },
}));

vi.mock('../../packages/backend/src/middleware/quota.js', () => ({
  enforceQuota: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import workspaceRoutes from '../../packages/backend/src/routes/workspaceRoutes.js';
import {
  isDockerAvailable,
  setupTestContainer,
  seedOrgAndUser,
  startSaasTestServer,
  type TestContainerContext,
  type SeedData,
} from '../helpers/testcontainersPg.js';

const dockerAvailable = isDockerAvailable();

let ctx: TestContainerContext | null = null;
let seed: SeedData | null = null;
let baseUrl = '';

beforeAll(async () => {
  if (!dockerAvailable) return;
  ctx = await setupTestContainer();
  seed = await seedOrgAndUser();

  const server = await startSaasTestServer(
    seed.orgId,
    seed.userId,
    '/api/v1/configs',
    workspaceRoutes,
  );
  baseUrl = server.url;
}, 120000);

afterAll(async () => {
  if (ctx) await ctx.cleanup();
});

describe.skipIf(!dockerAvailable)('Configs CRUD 集成测试', () => {
  const validBody = {
    name: '回测配置 V1',
    config: {
      portfolios: [{ name: 'Test', assets: [{ ticker: 'VTI', weight: 100 }] }],
      parameters: { startDate: '2020-01-01', endDate: '2024-12-31', startingValue: 10000 },
    },
  };

  it('POST 创建配置返回 201', async () => {
    const res = await fetch(`${baseUrl}/api/v1/configs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBeDefined();
    expect(json.data.name).toBe(validBody.name);
    expect(json.data.config).toBeDefined();
  });

  it('GET 列表返回已创建配置', async () => {
    const res = await fetch(`${baseUrl}/api/v1/configs`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /:id 返回单个配置', async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/configs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, name: '单查配置' }),
    });
    const created = await createRes.json();

    const res = await fetch(`${baseUrl}/api/v1/configs/${created.data.id}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.id).toBe(created.data.id);
  });

  it('PUT 更新配置名称', async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/configs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, name: '更新前' }),
    });
    const created = await createRes.json();

    const res = await fetch(`${baseUrl}/api/v1/configs/${created.data.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, name: '更新后' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.name).toBe('更新后');
  });

  it('DELETE 删除配置', async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/configs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, name: '删除配置' }),
    });
    const created = await createRes.json();

    const res = await fetch(`${baseUrl}/api/v1/configs/${created.data.id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);

    const getRes = await fetch(`${baseUrl}/api/v1/configs/${created.data.id}`);
    expect(getRes.status).toBe(404);
  });

  it('GET /:id 非法 UUID 返回 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/configs/invalid-id`);
    expect(res.status).toBe(400);
  });
});
