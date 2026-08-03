import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';

const dataServiceMocks = vi.hoisted(() => ({
  fetchHistoryData: vi.fn(),
  searchTickers: vi.fn(),
}));

const cpiServiceMocks = vi.hoisted(() => ({
  fetchCpiForRoute: vi.fn(),
}));

vi.mock('../../../packages/backend/src/infrastructure/dataFacade.js', () => ({
  fetchHistoryData: dataServiceMocks.fetchHistoryData,
  searchTickers: dataServiceMocks.searchTickers,
}));

vi.mock('../../../packages/backend/src/infrastructure/dataServices.js', () => ({
  fetchCpiForRoute: cpiServiceMocks.fetchCpiForRoute,
  SYNTHETIC_TICKERS: [],
}));

import { createLoggerMocks } from '../../helpers/mockFactories.js';
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

import dataRoutes from '../../../packages/backend/src/routes/dataRoutes.js';

describe('dataRoutes - GET /api/data/cpi/:country', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startExpressApp((app) => app.use('/api/data', dataRoutes));
  });

  afterEach(async () => {
    await server.close();
  });

  it('Go 服务可用时应返回 Go CPI 数据', async () => {
    cpiServiceMocks.fetchCpiForRoute.mockResolvedValue({
      data: { '2024-01': 310.5 },
      degraded: false,
      notFound: false,
    });

    const res = await fetch(`${server.url}/api/data/cpi/us`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data['2024-01']).toBe(310.5);
    expect(body.degraded).toBeUndefined();
  });

  it('Go 服务不可用时应降级到 PostgreSQL', async () => {
    cpiServiceMocks.fetchCpiForRoute.mockResolvedValue({
      data: [{ date: '2024-01-02', value: 310.5 }],
      degraded: true,
      degradedWarning: 'Go 数据服务不可用，已降级到 PostgreSQL CPI 数据',
      notFound: false,
    });

    const res = await fetch(`${server.url}/api/data/cpi/us`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data[0].value).toBe(310.5);
    expect(body.degraded).toBe(true);
    expect(body.degradedWarning).toBe('Go 数据服务不可用，已降级到 PostgreSQL CPI 数据');
  });

  it('无效 country 参数应返回 422', async () => {
    const res = await fetch(`${server.url}/api/data/cpi/jp`);
    expect(res.status).toBe(422);
    expect(cpiServiceMocks.fetchCpiForRoute).not.toHaveBeenCalled();
  });

  it('Go 和 PostgreSQL 均无数据时应返回 404', async () => {
    cpiServiceMocks.fetchCpiForRoute.mockResolvedValue({
      data: null,
      degraded: false,
      notFound: true,
    });

    const res = await fetch(`${server.url}/api/data/cpi/cn`);
    expect(res.status).toBe(404);
  });
});
