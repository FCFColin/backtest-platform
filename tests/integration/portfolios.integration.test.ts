/**
 * 组合（portfolios）CRUD 集成测试（RO-049）
 *
 * 跨层验证：Express 路由 → portfolioRepo（withTenant RLS）→ PostgreSQL。
 * 使用 testcontainers 起真实 PG，验证 RLS 租户隔离与完整 CRUD 生命周期。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../../packages/backend/src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));

import portfolioRoutes from '../../packages/backend/src/routes/portfolioRoutes.js';
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
    '/api/v1/portfolios',
    portfolioRoutes,
  );
  baseUrl = server.url;
}, 120000);

afterAll(async () => {
  if (ctx) await ctx.cleanup();
});

describe.skipIf(!dockerAvailable)('Portfolios CRUD 集成测试', () => {
  const validBody = {
    name: '60/40 组合',
    assets: [
      { ticker: 'VTI', weight: 60 },
      { ticker: 'BND', weight: 40 },
    ],
    rebalanceFrequency: 'quarterly',
  };

  it('POST 创建组合返回 201', async () => {
    const res = await fetch(`${baseUrl}/api/v1/portfolios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBeDefined();
    expect(json.data.name).toBe(validBody.name);
    expect(json.data.assets).toHaveLength(2);
    expect(json.data.rebalanceFrequency).toBe('quarterly');
  });

  it('GET 列表返回已创建组合', async () => {
    await fetch(`${baseUrl}/api/v1/portfolios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, name: '列表测试' }),
    });

    const res = await fetch(`${baseUrl}/api/v1/portfolios`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.length).toBeGreaterThanOrEqual(2);
  });

  it('GET /:id 返回单个组合', async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/portfolios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, name: '单查测试' }),
    });
    const created = await createRes.json();

    const res = await fetch(`${baseUrl}/api/v1/portfolios/${created.data.id}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe(created.data.id);
  });

  it('PUT 更新组合名称', async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/portfolios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, name: '更新前' }),
    });
    const created = await createRes.json();

    const res = await fetch(`${baseUrl}/api/v1/portfolios/${created.data.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, name: '更新后' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.name).toBe('更新后');
  });

  it('DELETE 删除组合', async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/portfolios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, name: '删除测试' }),
    });
    const created = await createRes.json();

    const res = await fetch(`${baseUrl}/api/v1/portfolios/${created.data.id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.deleted).toBe(true);

    const getRes = await fetch(`${baseUrl}/api/v1/portfolios/${created.data.id}`);
    expect(getRes.status).toBe(404);
  });

  it('GET /:id 非法 UUID 返回 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/portfolios/not-a-uuid`);
    expect(res.status).toBe(400);
  });

  it('POST 空名称返回校验错误', async () => {
    const res = await fetch(`${baseUrl}/api/v1/portfolios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', assets: [{ ticker: 'VTI', weight: 100 }] }),
    });
    expect(res.status).toBe(400);
  });
});
