import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer, type TestRequest } from '../../helpers/expressApp.js';
import { createLoggerMocks } from '../../helpers/mockFactories.js';

const mocks = vi.hoisted(() => ({
  repo: {
    listPortfolios: vi.fn(),
    getPortfolio: vi.fn(),
    createPortfolio: vi.fn(),
    updatePortfolio: vi.fn(),
    deletePortfolio: vi.fn(),
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

vi.mock('../../../api/services/portfolioRepo.js', () => mocks.repo);

vi.mock('../../../api/schemas/persistence.js', () => ({
  portfolioBodySchema: {},
  PortfolioBody: Object,
}));

import portfolioRoutes from '../../../api/routes/portfolioRoutes.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const ITEM_ID = '22222222-2222-2222-2222-222222222222';
const MOCK_ITEM = { id: ITEM_ID, name: 'Test Portfolio', createdAt: '2024-01-01T00:00:00.000Z' };

describe('portfolioRoutes', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startExpressApp((app) => {
      app.use((req: TestRequest, _res, next) => {
        req.tenantId = TENANT;
        req.user = { sub: 'user-1' };
        next();
      });
      app.use('/api/v1/portfolios', portfolioRoutes);
    });
  });

  afterEach(async () => {
    await server.close();
  });

  describe('GET /', () => {
    it('success should return portfolio list', async () => {
      mocks.repo.listPortfolios.mockResolvedValueOnce([MOCK_ITEM]);
      const res = await fetch(`${server.url}/api/v1/portfolios`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual([MOCK_ITEM]);
      expect(mocks.repo.listPortfolios).toHaveBeenCalledWith(TENANT);
    });

    it('should return empty list when no portfolios', async () => {
      mocks.repo.listPortfolios.mockResolvedValueOnce([]);
      const res = await fetch(`${server.url}/api/v1/portfolios`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data).toEqual([]);
    });

    it('should return 500 on service error', async () => {
      mocks.repo.listPortfolios.mockRejectedValueOnce(new Error('db fail'));
      const res = await fetch(`${server.url}/api/v1/portfolios`);
      expect(res.status).toBe(500);
    });
  });

  describe('GET /:id', () => {
    it('success should return portfolio', async () => {
      mocks.repo.getPortfolio.mockResolvedValueOnce(MOCK_ITEM);
      const res = await fetch(`${server.url}/api/v1/portfolios/${ITEM_ID}`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data).toEqual(MOCK_ITEM);
      expect(mocks.repo.getPortfolio).toHaveBeenCalledWith(TENANT, ITEM_ID);
    });

    it('should return 404 when not found', async () => {
      mocks.repo.getPortfolio.mockResolvedValueOnce(null);
      const res = await fetch(`${server.url}/api/v1/portfolios/${ITEM_ID}`);
      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid UUID', async () => {
      const res = await fetch(`${server.url}/api/v1/portfolios/not-a-uuid`);
      expect(res.status).toBe(400);
      expect(mocks.repo.getPortfolio).not.toHaveBeenCalled();
    });

    it('should return 500 on service error', async () => {
      mocks.repo.getPortfolio.mockRejectedValueOnce(new Error('db fail'));
      const res = await fetch(`${server.url}/api/v1/portfolios/${ITEM_ID}`);
      expect(res.status).toBe(500);
    });
  });

  describe('POST /', () => {
    it('success should return 201', async () => {
      const created = { id: ITEM_ID, name: 'New Portfolio' };
      mocks.repo.createPortfolio.mockResolvedValueOnce(created);
      const res = await fetch(`${server.url}/api/v1/portfolios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Portfolio' }),
      });
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body.data).toEqual(created);
      expect(mocks.repo.createPortfolio).toHaveBeenCalledWith(TENANT, 'user-1', {
        name: 'New Portfolio',
      });
    });

    it('should return 500 on service error', async () => {
      mocks.repo.createPortfolio.mockRejectedValueOnce(new Error('db fail'));
      const res = await fetch(`${server.url}/api/v1/portfolios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Fail' }),
      });
      expect(res.status).toBe(500);
    });
  });

  describe('PUT /:id', () => {
    it('success should return updated portfolio', async () => {
      const updated = { id: ITEM_ID, name: 'Updated' };
      mocks.repo.updatePortfolio.mockResolvedValueOnce(updated);
      const res = await fetch(`${server.url}/api/v1/portfolios/${ITEM_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data).toEqual(updated);
      expect(mocks.repo.updatePortfolio).toHaveBeenCalledWith(TENANT, ITEM_ID, { name: 'Updated' });
    });

    it('should return 404 when not found', async () => {
      mocks.repo.updatePortfolio.mockResolvedValueOnce(null);
      const res = await fetch(`${server.url}/api/v1/portfolios/${ITEM_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      });
      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid UUID', async () => {
      const res = await fetch(`${server.url}/api/v1/portfolios/not-a-uuid`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      });
      expect(res.status).toBe(400);
      expect(mocks.repo.updatePortfolio).not.toHaveBeenCalled();
    });

    it('should return 500 on service error', async () => {
      mocks.repo.updatePortfolio.mockRejectedValueOnce(new Error('db fail'));
      const res = await fetch(`${server.url}/api/v1/portfolios/${ITEM_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      });
      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /:id', () => {
    it('success should return deleted confirmation', async () => {
      mocks.repo.deletePortfolio.mockResolvedValueOnce(true);
      const res = await fetch(`${server.url}/api/v1/portfolios/${ITEM_ID}`, { method: 'DELETE' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data).toEqual({ id: ITEM_ID, deleted: true });
      expect(mocks.repo.deletePortfolio).toHaveBeenCalledWith(TENANT, ITEM_ID);
    });

    it('should return 404 when not found', async () => {
      mocks.repo.deletePortfolio.mockResolvedValueOnce(false);
      const res = await fetch(`${server.url}/api/v1/portfolios/${ITEM_ID}`, { method: 'DELETE' });
      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid UUID', async () => {
      const res = await fetch(`${server.url}/api/v1/portfolios/not-a-uuid`, { method: 'DELETE' });
      expect(res.status).toBe(400);
      expect(mocks.repo.deletePortfolio).not.toHaveBeenCalled();
    });

    it('should return 500 on service error', async () => {
      mocks.repo.deletePortfolio.mockRejectedValueOnce(new Error('db fail'));
      const res = await fetch(`${server.url}/api/v1/portfolios/${ITEM_ID}`, { method: 'DELETE' });
      expect(res.status).toBe(500);
    });
  });
});
