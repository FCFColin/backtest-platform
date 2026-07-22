/**
 * 数据路由单元测试
 *
 * 路由层仅负责 HTTP 适配：请求解析 → 调用 dataService → 响应格式化。
 * Go 服务降级逻辑在 dataService 内部处理，路由测试只验证 HTTP 行为。
 */

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

vi.mock('../../../packages/backend/src/infrastructure/cpiLoader.js', () => ({
  fetchCpiForRoute: cpiServiceMocks.fetchCpiForRoute,
}));

import { createLoggerMocks } from '../../helpers/mockFactories.js';
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

import dataRoutes from '../../../packages/backend/src/routes/dataRoutes.js';

describe('dataRoutes - GET /api/data/history', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      data: { SPY: { '2020-01-01': 300.0, '2020-01-02': 301.0 } },
      degraded: false,
    });
    server = await startExpressApp((app) => app.use('/api/data', dataRoutes));
  });

  afterEach(async () => {
    await server.close();
  });

  it('正常返回历史数据', async () => {
    const res = await fetch(
      `${server.url}/api/data/history?tickers=SPY&startDate=2020-01-01&endDate=2020-01-02`,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.SPY['2020-01-01']).toBe(300);
    expect(body.degraded).toBeUndefined();
  });

  it('降级时返回 degraded 标记', async () => {
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      data: { SPY: { '2020-01-01': 300.0 } },
      degraded: true,
      degradedWarning: '数据库不可用',
    });

    const res = await fetch(
      `${server.url}/api/data/history?tickers=SPY&startDate=2020-01-01&endDate=2020-01-02`,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.degraded).toBe(true);
    expect(body.degradedWarning).toBe('数据库不可用');
  });

  it('缺少 tickers 参数应返回 422', async () => {
    const res = await fetch(
      `${server.url}/api/data/history?startDate=2020-01-01&endDate=2020-01-02`,
    );
    expect(res.status).toBe(422);
  });

  it('缺少 startDate 参数应返回 422', async () => {
    const res = await fetch(`${server.url}/api/data/history?tickers=SPY&endDate=2020-01-02`);
    expect(res.status).toBe(422);
  });

  it('fetchHistoryData 抛错时应返回 500', async () => {
    dataServiceMocks.fetchHistoryData.mockRejectedValue(new Error('db error'));

    const res = await fetch(
      `${server.url}/api/data/history?tickers=SPY&startDate=2020-01-01&endDate=2020-01-02`,
    );
    expect(res.status).toBe(500);
  });
});

describe('dataRoutes - GET /api/data/search', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    dataServiceMocks.searchTickers.mockResolvedValue([
      { ticker: 'AAPL', name: 'Apple', market: 'US' },
    ]);
    server = await startExpressApp((app) => app.use('/api/data', dataRoutes));
  });

  afterEach(async () => {
    await server.close();
  });

  it('正常返回搜索结果', async () => {
    const res = await fetch(`${server.url}/api/data/search?query=aapl`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data[0].ticker).toBe('AAPL');
  });

  it('缺少 query 参数应返回 422', async () => {
    const res = await fetch(`${server.url}/api/data/search`);
    expect(res.status).toBe(422);
  });
});

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
