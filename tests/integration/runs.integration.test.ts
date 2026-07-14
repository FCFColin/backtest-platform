/**
 * 回测运行历史（backtest_runs）CRUD 集成测试（RO-049）
 *
 * 跨层验证：Express 路由 → backtestRunRepo（withTenant RLS）→ PostgreSQL。
 * 运行记录是不可变快照，无 PUT 更新语义。使用 testcontainers 起真实 PG。
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

import express from 'express';
import runRoutes from '../../packages/backend/src/routes/runRoutes.js';
import {
  isDockerAvailable,
  setupTestContainer,
  seedOrgAndUser,
  mockAuthMiddleware,
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

  const app = express();
  app.use(express.json());
  app.use(mockAuthMiddleware(seed.orgId, seed.userId));
  app.use('/api/v1/runs', runRoutes);

  await new Promise<void>((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}, 120000);

afterAll(async () => {
  if (ctx) await ctx.cleanup();
});

describe.skipIf(!dockerAvailable)('Runs CRUD 集成测试', () => {
  const validBody = {
    name: 'VTI 回测',
    request: {
      portfolios: [{ name: 'Test', assets: [{ ticker: 'VTI', weight: 100 }] }],
      parameters: { startDate: '2020-01-01', endDate: '2024-12-31', startingValue: 10000 },
    },
    result: { cagr: 0.12, maxDrawdown: 0.25 },
    status: 'completed' as const,
  };

  it('POST 创建运行记录返回 201', async () => {
    const res = await fetch(`${baseUrl}/api/v1/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBeDefined();
    expect(json.data.name).toBe(validBody.name);
    expect(json.data.status).toBe('completed');
  });

  it('GET 列表返回已创建记录', async () => {
    const res = await fetch(`${baseUrl}/api/v1/runs`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /:id 返回单个记录', async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, name: '单查记录' }),
    });
    const created = await createRes.json();

    const res = await fetch(`${baseUrl}/api/v1/runs/${created.data.id}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.id).toBe(created.data.id);
  });

  it('DELETE 删除运行记录', async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, name: '删除记录' }),
    });
    const created = await createRes.json();

    const res = await fetch(`${baseUrl}/api/v1/runs/${created.data.id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);

    const getRes = await fetch(`${baseUrl}/api/v1/runs/${created.data.id}`);
    expect(getRes.status).toBe(404);
  });

  it('GET /:id 非法 UUID 返回 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/runs/not-uuid`);
    expect(res.status).toBe(400);
  });
});
