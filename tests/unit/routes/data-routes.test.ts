import '../../helpers/loggerMock.js';
import { describe, it, expect, vi } from 'vitest';
import { startExpressApp } from '../../helpers/expressApp.js';
import { withServer } from '../../helpers/serverLifecycle.js';

const dataServiceMocks = vi.hoisted(() => ({
  fetchHistoryData: vi.fn(),
  searchTickers: vi.fn(),
}));

const cpiServiceMocks = vi.hoisted(() => ({
  fetchCpiForRoute: vi.fn(),
}));

const httpClientMocks = vi.hoisted(() => ({
  callService: vi.fn(),
}));

vi.mock('../../../packages/backend/src/infrastructure/dataFacade.js', () => ({
  fetchHistoryData: dataServiceMocks.fetchHistoryData,
  searchTickers: dataServiceMocks.searchTickers,
}));

vi.mock('../../../packages/backend/src/infrastructure/dataServices.js', () => ({
  fetchCpiForRoute: cpiServiceMocks.fetchCpiForRoute,
  SYNTHETIC_TICKERS: [],
}));

vi.mock('../../../packages/backend/src/utils/httpClient.js', () => ({
  callService: httpClientMocks.callService,
}));

import dataRoutes from '../../../packages/backend/src/routes/dataRoutes.js';

describe('dataRoutes - GET /api/data/cpi/:country', () => {
  const getServer = withServer(() => {
    vi.clearAllMocks();
    return startExpressApp((app) => app.use('/api/data', dataRoutes));
  });

  it('Go 服务可用时应返回 Go CPI 数据', async () => {
    cpiServiceMocks.fetchCpiForRoute.mockResolvedValue({
      data: { '2024-01': 310.5 },
      degraded: false,
      notFound: false,
    });

    const res = await fetch(`${getServer().url}/api/data/cpi/us`);
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

    const res = await fetch(`${getServer().url}/api/data/cpi/us`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data[0].value).toBe(310.5);
    expect(body.degraded).toBe(true);
    expect(body.degradedWarning).toBe('Go 数据服务不可用，已降级到 PostgreSQL CPI 数据');
  });

  it('无效 country 参数应返回 422', async () => {
    const res = await fetch(`${getServer().url}/api/data/cpi/jp`);
    expect(res.status).toBe(422);
    expect(cpiServiceMocks.fetchCpiForRoute).not.toHaveBeenCalled();
  });

  it('Go 和 PostgreSQL 均无数据时应返回 404', async () => {
    cpiServiceMocks.fetchCpiForRoute.mockResolvedValue({
      data: null,
      degraded: false,
      notFound: true,
    });

    const res = await fetch(`${getServer().url}/api/data/cpi/cn`);
    expect(res.status).toBe(404);
  });
});

describe('dataRoutes - GET /api/data/health', () => {
  const getServer = withServer(() => {
    vi.clearAllMocks();
    return startExpressApp((app) => app.use('/api/data', dataRoutes));
  });

  it('Go 数据服务健康时应返回 ok', async () => {
    httpClientMocks.callService.mockResolvedValue({ status: 'ok' });

    const res = await fetch(`${getServer().url}/api/data/health`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('ok');
    expect(httpClientMocks.callService).toHaveBeenCalledWith(
      expect.any(String),
      '/api/data/health',
      undefined,
      5000,
    );
  });

  it('Go 数据服务不可达时应返回 503', async () => {
    httpClientMocks.callService.mockResolvedValue(null);

    const res = await fetch(`${getServer().url}/api/data/health`);
    expect(res.status).toBe(503);
  });
});
