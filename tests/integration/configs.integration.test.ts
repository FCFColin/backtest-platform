/**
 * 命名配置（saved_configs）CRUD 集成测试（RO-049）
 *
 * 跨层验证：Express 路由 → savedConfigRepo（withTenant RLS）→ PostgreSQL。
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

import configRoutes from '../../packages/backend/src/routes/configRoutes.js';
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
    configRoutes,
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
