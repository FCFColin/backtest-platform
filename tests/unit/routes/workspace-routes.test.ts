import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mocks, ORG, ITEM_ID, MOCK_ITEM, startApp, jsonFetch } from './org-routes.shared.js';
import type { TestServer } from '../../helpers/expressApp.js';
import workspaceRoutes from '../../../packages/backend/src/routes/workspaceRoutes.js';

describe('runRoutes', () => {
  let server: TestServer;
  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startApp('/api/v1', workspaceRoutes, { sub: 'user-1' });
  });
  afterEach(async () => {
    await server.close();
  });

  describe('GET /', () => {
    it('success should return run list with default limit', async () => {
      mocks.repo.listRuns.mockResolvedValueOnce([MOCK_ITEM]);
      const { res, json } = await jsonFetch(`${server.url}/api/v1/runs`);
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toEqual([MOCK_ITEM]);
      expect(mocks.repo.listRuns).toHaveBeenCalledWith(ORG, 50, 0);
    });

    it('should respect limit query parameter', async () => {
      mocks.repo.listRuns.mockResolvedValueOnce([]);
      await jsonFetch(`${server.url}/api/v1/runs?limit=10`);
      expect(mocks.repo.listRuns).toHaveBeenCalledWith(ORG, 10, 0);
    });

    it('should fallback to default limit when limit is NaN', async () => {
      mocks.repo.listRuns.mockResolvedValueOnce([]);
      await jsonFetch(`${server.url}/api/v1/runs?limit=abc`);
      expect(mocks.repo.listRuns).toHaveBeenCalledWith(ORG, 50, 0);
    });

    it('should return empty list when no runs', async () => {
      mocks.repo.listRuns.mockResolvedValueOnce([]);
      const { res, json } = await jsonFetch(`${server.url}/api/v1/runs`);
      expect(res.status).toBe(200);
      expect(json.data).toEqual([]);
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
      const { res, json } = await jsonFetch(`${server.url}/api/v1/runs/${ITEM_ID}`);
      expect(res.status).toBe(200);
      expect(json.data).toEqual(MOCK_ITEM);
      expect(mocks.repo.getRun).toHaveBeenCalledWith(ORG, ITEM_ID);
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
      const { res, json } = await jsonFetch(`${server.url}/api/v1/runs`, 'POST', {
        name: 'New Run',
      });
      expect(res.status).toBe(201);
      expect(json.data).toEqual(created);
      expect(mocks.repo.createRun).toHaveBeenCalledWith(ORG, 'user-1', { name: 'New Run' });
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
      const { res, json } = await jsonFetch(`${server.url}/api/v1/runs/${ITEM_ID}`, 'DELETE');
      expect(res.status).toBe(200);
      expect(json.data).toEqual({ id: ITEM_ID, deleted: true });
      expect(mocks.repo.deleteRun).toHaveBeenCalledWith(ORG, ITEM_ID);
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
