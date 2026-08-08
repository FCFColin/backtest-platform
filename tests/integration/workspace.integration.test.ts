import '../helpers/loggerMock.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import '../helpers/middlewareMocks.js';
import workspaceRoutes from '../../packages/backend/src/routes/workspaceRoutes.js';
import {
  isDockerAvailable,
  setupTestContainer,
  seedOrgAndUser,
  startSaasTestServer,
  type TestContainerContext,
} from '../helpers/testcontainersPg.js';

const dockerAvailable = isDockerAvailable();

let ctx: TestContainerContext | null = null;
let baseUrl = '';

beforeAll(async () => {
  if (!dockerAvailable) return;
  ctx = await setupTestContainer();
  const seed = await seedOrgAndUser();
  const server = await startSaasTestServer(seed.orgId, seed.userId, '/api/v1', workspaceRoutes);
  baseUrl = server.url;
}, 120000);

afterAll(async () => {
  if (ctx) await ctx.cleanup();
});

const RESOURCES = [
  {
    path: 'configs',
    body: {
      name: '回测配置 V1',
      config: {
        portfolios: [{ name: 'Test', assets: [{ ticker: 'VTI', weight: 100 }] }],
        parameters: { startDate: '2020-01-01', endDate: '2024-12-31', startingValue: 10000 },
      },
    },
  },
  {
    path: 'portfolios',
    body: {
      name: '60/40 组合',
      assets: [
        { ticker: 'VTI', weight: 60 },
        { ticker: 'BND', weight: 40 },
      ],
      rebalanceFrequency: 'quarterly',
    },
  },
  {
    path: 'runs',
    body: {
      name: 'VTI 回测',
      request: {
        portfolios: [{ name: 'Test', assets: [{ ticker: 'VTI', weight: 100 }] }],
        parameters: { startDate: '2020-01-01', endDate: '2024-12-31', startingValue: 10000 },
      },
      result: { cagr: 0.12, maxDrawdown: 0.25 },
      status: 'completed',
    },
  },
] as const;

describe.skipIf(!dockerAvailable)('Workspace CRUD 集成测试', () => {
  it.each(RESOURCES)('POST 创建$path 返回 201', async ({ path, body }) => {
    const res = await fetch(`${baseUrl}/api/v1/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBeDefined();
    expect(json.data.name).toBe(body.name);
  });

  it.each(RESOURCES)('GET 列表返回已创建$path', async ({ path }) => {
    const res = await fetch(`${baseUrl}/api/v1/${path}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.length).toBeGreaterThanOrEqual(1);
  });

  it.each(RESOURCES)('GET /:id 返回单个$path', async ({ path, body }) => {
    const createRes = await fetch(`${baseUrl}/api/v1/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, name: `${body.name}单查` }),
    });
    const created = await createRes.json();
    const res = await fetch(`${baseUrl}/api/v1/${path}/${created.data.id}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.id).toBe(created.data.id);
  });

  it.each(RESOURCES)('PUT 更新$path 名称', async ({ path, body }) => {
    const createRes = await fetch(`${baseUrl}/api/v1/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, name: `${body.name}更新前` }),
    });
    const created = await createRes.json();
    const res = await fetch(`${baseUrl}/api/v1/${path}/${created.data.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, name: `${body.name}更新后` }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.name).toBe(`${body.name}更新后`);
  });

  it.each(RESOURCES)('DELETE 删除$path', async ({ path, body }) => {
    const createRes = await fetch(`${baseUrl}/api/v1/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, name: `${body.name}删除` }),
    });
    const created = await createRes.json();
    const res = await fetch(`${baseUrl}/api/v1/${path}/${created.data.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    const getRes = await fetch(`${baseUrl}/api/v1/${path}/${created.data.id}`);
    expect(getRes.status).toBe(404);
  });

  it.each(RESOURCES)('GET /:id 非法 UUID 返回 400（$path）', async ({ path }) => {
    const res = await fetch(`${baseUrl}/api/v1/${path}/invalid-id`);
    expect(res.status).toBe(400);
  });
});
