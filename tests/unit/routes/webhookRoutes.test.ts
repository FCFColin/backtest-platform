import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer, type TestRequest } from '../../helpers/expressApp.js';
import { createLoggerMocks } from '../../helpers/mockFactories.js';

const mocks = vi.hoisted(() => ({
  pool: { withTenant: vi.fn() },
  webhookService: {
    createWebhook: vi.fn(),
    deliverWebhook: vi.fn(),
  },
  crypto: { decrypt: vi.fn() },
}));

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  withTenant: <T>(orgId: string, fn: (c: unknown) => Promise<T>) => {
    mocks.pool.withTenant(orgId);
    return fn(mocks.pool);
  },
}));
vi.mock('../../../packages/backend/src/application/webhookService.js', () => ({
  createWebhook: mocks.webhookService.createWebhook,
  deliverWebhook: mocks.webhookService.deliverWebhook,
  processPendingDeliveries: vi.fn(),
  triggerWebhooks: vi.fn(),
  signPayload: vi.fn(),
  cleanupOldDeliveries: vi.fn(),
}));
vi.mock('../../../packages/backend/src/utils/crypto.js', () => ({ decrypt: mocks.crypto.decrypt }));
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));
vi.mock('../../../packages/backend/src/middleware/tenantContext.js', () => ({
  resolveTenant: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireTenant: (_req: unknown, _res: unknown, next: () => void) => next(),
  hasTenant: vi.fn(() => true),
}));
vi.mock('../../../packages/backend/src/middleware/rbac.js', () => ({
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  Permission: { ADMIN_ACCESS: 'admin:access' },
}));

import webhookRoutes from '../../../packages/backend/src/routes/webhookRoutes.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const WH_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

let server: TestServer;

beforeEach(async () => {
  vi.clearAllMocks();
  server = await startExpressApp((app) => {
    app.use((req: TestRequest, _res, next) => {
      req.tenantId = ORG;
      req.user = { sub: USER_ID, role: 'admin', org_role: 'admin' };
      next();
    });
    app.use('/api/v1/webhooks', webhookRoutes);
  });
});

afterEach(async () => {
  await server.close();
});

describe('GET /', () => {
  it('应返回 webhook 列表', async () => {
    const rows = [
      {
        id: WH_ID,
        url: 'https://example.com/hook',
        description: 'test',
        is_active: true,
        subscribed_events: ['backtest.completed'],
        failed_consecutive_count: 0,
        disabled_at: null,
        created_at: new Date('2026-01-01'),
        updated_at: new Date('2026-06-01'),
      },
    ];
    mocks.pool.query = vi.fn().mockResolvedValue({ rows });
    const res = await fetch(`${server.url}/api/v1/webhooks`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: WH_ID, isActive: true });
  });
});

describe('POST /', () => {
  it('应创建 webhook 并返回 201（不含 secret）', async () => {
    mocks.webhookService.createWebhook.mockResolvedValue({
      id: WH_ID,
      url: 'https://example.com/hook',
      description: 'test',
      isActive: true,
      subscribedEvents: ['backtest.completed'],
      createdAt: new Date('2026-01-01'),
    });
    const res = await fetch(`${server.url}/api/v1/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com/hook',
        secret: 'a'.repeat(32),
        subscribedEvents: ['backtest.completed'],
      }),
    });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.id).toBe(WH_ID);
    expect(body.data).not.toHaveProperty('secret');
  });

  it('非 HTTPS URL 应返回 400', async () => {
    const res = await fetch(`${server.url}/api/v1/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'http://example.com',
        secret: 'a'.repeat(32),
        subscribedEvents: ['x'],
      }),
    });
    expect(res.status).toBe(400);
  });

  it('secret 太短应返回 400', async () => {
    const res = await fetch(`${server.url}/api/v1/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com',
        secret: 'short',
        subscribedEvents: ['x'],
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe('PUT /:id', () => {
  it('应更新 webhook', async () => {
    mocks.pool.query = vi.fn().mockResolvedValue({
      rowCount: 1,
      rows: [
        {
          id: WH_ID,
          url: 'https://example.com/new',
          description: 'updated',
          is_active: true,
          subscribed_events: ['x'],
          updated_at: new Date('2026-06-01'),
        },
      ],
    });
    const res = await fetch(`${server.url}/api/v1/webhooks/${WH_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'updated' }),
    });
    expect(res.status).toBe(200);
  });

  it('不存在时应返回 404', async () => {
    mocks.pool.query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const res = await fetch(`${server.url}/api/v1/webhooks/${WH_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'x' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /:id', () => {
  it('应删除 webhook', async () => {
    mocks.pool.query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const res = await fetch(`${server.url}/api/v1/webhooks/${WH_ID}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
  });

  it('不存在时应返回 404', async () => {
    mocks.pool.query = vi.fn().mockResolvedValue({ rowCount: 0 });
    const res = await fetch(`${server.url}/api/v1/webhooks/${WH_ID}`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});

describe('GET /:id/deliveries', () => {
  it('应返回投递历史', async () => {
    mocks.pool.query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'd1',
            event_type: 'backtest.completed',
            status: 'success',
            response_code: 200,
            attempt_count: 1,
            next_retry_at: null,
            delivered_at: new Date('2026-06-01'),
            created_at: new Date('2026-06-01'),
          },
        ],
      });
    const res = await fetch(`${server.url}/api/v1/webhooks/${WH_ID}/deliveries`);
    expect(res.status).toBe(200);
  });

  it('webhook 不存在时应返回 404', async () => {
    mocks.pool.query = vi.fn().mockResolvedValue({ rows: [] });
    const res = await fetch(`${server.url}/api/v1/webhooks/${WH_ID}/deliveries`);
    expect(res.status).toBe(404);
  });
});
