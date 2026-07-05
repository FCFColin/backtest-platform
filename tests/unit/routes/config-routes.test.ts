import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer, type TestRequest } from '../../helpers/expressApp.js';
import { createLoggerMocks } from '../../helpers/mockFactories.js';

const mocks = vi.hoisted(() => ({
  repo: {
    listConfigs: vi.fn(),
    getConfig: vi.fn(),
    createConfig: vi.fn(),
    updateConfig: vi.fn(),
    deleteConfig: vi.fn(),
  },
}));

vi.mock('../../../api/middleware/validate.js', () => ({
  validate: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../../api/utils/errors.js', () => ({
  sendProblem: vi.fn((res, status, _code, _title, _detail) => {
    res.status(status).json({ success: false, error: {} });
  }),
}));

vi.mock('../../../api/utils/logger.js', () => ({ logger: createLoggerMocks() }));

vi.mock('../../../api/services/savedConfigRepo.js', () => mocks.repo);

vi.mock('../../../api/schemas/persistence.js', () => ({
  savedConfigBodySchema: {},
  SavedConfigBody: Object,
}));

import configRoutes from '../../../api/routes/configRoutes.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const ITEM_ID = '22222222-2222-2222-2222-222222222222';
const MOCK_ITEM = { id: ITEM_ID, name: 'Test Config', createdAt: '2024-01-01T00:00:00.000Z' };

describe('configRoutes', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startExpressApp((app) => {
      app.use((req: TestRequest, _res, next) => {
        req.tenantId = TENANT;
        req.user = { sub: 'user-1' };
        next();
      });
      app.use('/api/v1/configs', configRoutes);
    });
  });

  afterEach(async () => {
    await server.close();
  });

  describe('GET /', () => {
    it('success should return config list', async () => {
      mocks.repo.listConfigs.mockResolvedValueOnce([MOCK_ITEM]);
      const res = await fetch(`${server.url}/api/v1/configs`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual([MOCK_ITEM]);
      expect(mocks.repo.listConfigs).toHaveBeenCalledWith(TENANT);
    });

    it('should return empty list when no configs', async () => {
      mocks.repo.listConfigs.mockResolvedValueOnce([]);
      const res = await fetch(`${server.url}/api/v1/configs`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data).toEqual([]);
    });

    it('should return 500 on service error', async () => {
      mocks.repo.listConfigs.mockRejectedValueOnce(new Error('db fail'));
      const res = await fetch(`${server.url}/api/v1/configs`);
      expect(res.status).toBe(500);
    });
  });

  describe('GET /:id', () => {
    it('success should return config', async () => {
      mocks.repo.getConfig.mockResolvedValueOnce(MOCK_ITEM);
      const res = await fetch(`${server.url}/api/v1/configs/${ITEM_ID}`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data).toEqual(MOCK_ITEM);
      expect(mocks.repo.getConfig).toHaveBeenCalledWith(TENANT, ITEM_ID);
    });

    it('should return 404 when not found', async () => {
      mocks.repo.getConfig.mockResolvedValueOnce(null);
      const res = await fetch(`${server.url}/api/v1/configs/${ITEM_ID}`);
      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid UUID', async () => {
      const res = await fetch(`${server.url}/api/v1/configs/not-a-uuid`);
      expect(res.status).toBe(400);
      expect(mocks.repo.getConfig).not.toHaveBeenCalled();
    });

    it('should return 500 on service error', async () => {
      mocks.repo.getConfig.mockRejectedValueOnce(new Error('db fail'));
      const res = await fetch(`${server.url}/api/v1/configs/${ITEM_ID}`);
      expect(res.status).toBe(500);
    });
  });

  describe('POST /', () => {
    it('success should return 201', async () => {
      const created = { id: ITEM_ID, name: 'New Config' };
      mocks.repo.createConfig.mockResolvedValueOnce(created);
      const res = await fetch(`${server.url}/api/v1/configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Config' }),
      });
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body.data).toEqual(created);
      expect(mocks.repo.createConfig).toHaveBeenCalledWith(TENANT, 'user-1', {
        name: 'New Config',
      });
    });

    it('should return 500 on service error', async () => {
      mocks.repo.createConfig.mockRejectedValueOnce(new Error('db fail'));
      const res = await fetch(`${server.url}/api/v1/configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Fail' }),
      });
      expect(res.status).toBe(500);
    });
  });

  describe('PUT /:id', () => {
    it('success should return updated config', async () => {
      const updated = { id: ITEM_ID, name: 'Updated' };
      mocks.repo.updateConfig.mockResolvedValueOnce(updated);
      const res = await fetch(`${server.url}/api/v1/configs/${ITEM_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data).toEqual(updated);
      expect(mocks.repo.updateConfig).toHaveBeenCalledWith(TENANT, ITEM_ID, { name: 'Updated' });
    });

    it('should return 404 when not found', async () => {
      mocks.repo.updateConfig.mockResolvedValueOnce(null);
      const res = await fetch(`${server.url}/api/v1/configs/${ITEM_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      });
      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid UUID', async () => {
      const res = await fetch(`${server.url}/api/v1/configs/not-a-uuid`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      });
      expect(res.status).toBe(400);
      expect(mocks.repo.updateConfig).not.toHaveBeenCalled();
    });

    it('should return 500 on service error', async () => {
      mocks.repo.updateConfig.mockRejectedValueOnce(new Error('db fail'));
      const res = await fetch(`${server.url}/api/v1/configs/${ITEM_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      });
      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /:id', () => {
    it('success should return deleted confirmation', async () => {
      mocks.repo.deleteConfig.mockResolvedValueOnce(true);
      const res = await fetch(`${server.url}/api/v1/configs/${ITEM_ID}`, { method: 'DELETE' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data).toEqual({ id: ITEM_ID, deleted: true });
      expect(mocks.repo.deleteConfig).toHaveBeenCalledWith(TENANT, ITEM_ID);
    });

    it('should return 404 when not found', async () => {
      mocks.repo.deleteConfig.mockResolvedValueOnce(false);
      const res = await fetch(`${server.url}/api/v1/configs/${ITEM_ID}`, { method: 'DELETE' });
      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid UUID', async () => {
      const res = await fetch(`${server.url}/api/v1/configs/not-a-uuid`, { method: 'DELETE' });
      expect(res.status).toBe(400);
      expect(mocks.repo.deleteConfig).not.toHaveBeenCalled();
    });

    it('should return 500 on service error', async () => {
      mocks.repo.deleteConfig.mockRejectedValueOnce(new Error('db fail'));
      const res = await fetch(`${server.url}/api/v1/configs/${ITEM_ID}`, { method: 'DELETE' });
      expect(res.status).toBe(500);
    });
  });
});
