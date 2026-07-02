import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer, type TestRequest } from '../../helpers/expressApp.js';
import { createLoggerMocks } from '../../helpers/mockFactories.js';

const mocks = vi.hoisted(() => ({
  repo: {
    listRuns: vi.fn(),
    getRun: vi.fn(),
    createRun: vi.fn(),
    deleteRun: vi.fn(),
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

vi.mock('../../../api/services/backtestRunRepo.js', () => mocks.repo);

vi.mock('../../../api/schemas/persistence.js', () => ({
  backtestRunBodySchema: {},
  BacktestRunBody: Object,
}));

import runRoutes from '../../../api/routes/runRoutes.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const ITEM_ID = '22222222-2222-2222-2222-222222222222';
const MOCK_ITEM = { id: ITEM_ID, name: 'Test Run', createdAt: '2024-01-01T00:00:00.000Z' };

describe('runRoutes', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startExpressApp((app) => {
      app.use((req: TestRequest, _res, next) => {
        req.tenantId = TENANT;
        req.user = { sub: 'user-1' };
        next();
      });
      app.use('/api/v1/runs', runRoutes);
    });
  });

  afterEach(async () => {
    await server.close();
  });

  describe('GET /', () => {
    it('success should return run list with default limit', async () => {
      mocks.repo.listRuns.mockResolvedValueOnce([MOCK_ITEM]);
      const res = await fetch(`${server.url}/api/v1/runs`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual([MOCK_ITEM]);
      expect(mocks.repo.listRuns).toHaveBeenCalledWith(TENANT, 50);
    });

    it('should respect limit query parameter', async () => {
      mocks.repo.listRuns.mockResolvedValueOnce([]);
      const res = await fetch(`${server.url}/api/v1/runs?limit=10`);
      await res.json();
      expect(mocks.repo.listRuns).toHaveBeenCalledWith(TENANT, 10);
    });

    it('should fallback to default limit when limit is NaN', async () => {
      mocks.repo.listRuns.mockResolvedValueOnce([]);
      const res = await fetch(`${server.url}/api/v1/runs?limit=abc`);
      await res.json();
      expect(mocks.repo.listRuns).toHaveBeenCalledWith(TENANT, 50);
    });

    it('should return empty list when no runs', async () => {
      mocks.repo.listRuns.mockResolvedValueOnce([]);
      const res = await fetch(`${server.url}/api/v1/runs`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data).toEqual([]);
    });

    it('should return 500 on service error', async () => {
      mocks.repo.listRuns.mockRejectedValueOnce(new Error('db fail'));
      const res = await fetch(`${server.url}/api/v1/runs`);
      expect(res.status).toBe(500);
    });
  });

  describe('GET /:id', () => {
    it('success should return run', async () => {
      mocks.repo.getRun.mockResolvedValueOnce(MOCK_ITEM);
      const res = await fetch(`${server.url}/api/v1/runs/${ITEM_ID}`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data).toEqual(MOCK_ITEM);
      expect(mocks.repo.getRun).toHaveBeenCalledWith(TENANT, ITEM_ID);
    });

    it('should return 404 when not found', async () => {
      mocks.repo.getRun.mockResolvedValueOnce(null);
      const res = await fetch(`${server.url}/api/v1/runs/${ITEM_ID}`);
      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid UUID', async () => {
      const res = await fetch(`${server.url}/api/v1/runs/not-a-uuid`);
      expect(res.status).toBe(400);
      expect(mocks.repo.getRun).not.toHaveBeenCalled();
    });

    it('should return 500 on service error', async () => {
      mocks.repo.getRun.mockRejectedValueOnce(new Error('db fail'));
      const res = await fetch(`${server.url}/api/v1/runs/${ITEM_ID}`);
      expect(res.status).toBe(500);
    });
  });

  describe('POST /', () => {
    it('success should return 201', async () => {
      const created = { id: ITEM_ID, name: 'New Run' };
      mocks.repo.createRun.mockResolvedValueOnce(created);
      const res = await fetch(`${server.url}/api/v1/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Run' }),
      });
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body.data).toEqual(created);
      expect(mocks.repo.createRun).toHaveBeenCalledWith(TENANT, 'user-1', { name: 'New Run' });
    });

    it('should return 500 on service error', async () => {
      mocks.repo.createRun.mockRejectedValueOnce(new Error('db fail'));
      const res = await fetch(`${server.url}/api/v1/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Fail' }),
      });
      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /:id', () => {
    it('success should return deleted confirmation', async () => {
      mocks.repo.deleteRun.mockResolvedValueOnce(true);
      const res = await fetch(`${server.url}/api/v1/runs/${ITEM_ID}`, { method: 'DELETE' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data).toEqual({ id: ITEM_ID, deleted: true });
      expect(mocks.repo.deleteRun).toHaveBeenCalledWith(TENANT, ITEM_ID);
    });

    it('should return 404 when not found', async () => {
      mocks.repo.deleteRun.mockResolvedValueOnce(false);
      const res = await fetch(`${server.url}/api/v1/runs/${ITEM_ID}`, { method: 'DELETE' });
      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid UUID', async () => {
      const res = await fetch(`${server.url}/api/v1/runs/not-a-uuid`, { method: 'DELETE' });
      expect(res.status).toBe(400);
      expect(mocks.repo.deleteRun).not.toHaveBeenCalled();
    });

    it('should return 500 on service error', async () => {
      mocks.repo.deleteRun.mockRejectedValueOnce(new Error('db fail'));
      const res = await fetch(`${server.url}/api/v1/runs/${ITEM_ID}`, { method: 'DELETE' });
      expect(res.status).toBe(500);
    });
  });
});

