/**
 * 数据路由单元测试
 *
 * 企业理由：数据路由提供历史行情、搜索、CPI 数据，Go 服务降级逻辑
 * 测试覆盖：Go 服务可用/不可用降级、参数校验、CPI PostgreSQL 降级。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';
import { createConfigMocks } from '../../helpers/mockFactories.js';

const originalFetch = globalThis.fetch;

const dataServiceMocks = vi.hoisted(() => ({
  fetchHistoryData: vi.fn(),
  searchTickers: vi.fn(),
}));

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
}));

const goFetchMock = vi.hoisted(() => vi.fn());

vi.mock('opossum', () => ({
  default: class MockCircuitBreaker {
    private fn: (...args: unknown[]) => unknown;
    constructor(fn: (...args: unknown[]) => unknown) {
      this.fn = fn;
    }
    on(): void {}
    async fire(...args: unknown[]): Promise<unknown> {
      return this.fn(...args);
    }
  },
}));

vi.mock('../../../packages/backend/src/services/dataService.js', () => ({
  fetchHistoryData: dataServiceMocks.fetchHistoryData,
  searchTickers: dataServiceMocks.searchTickers,
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: createConfigMocks({
    NODE_ENV: 'test',
    GO_DATA_SERVICE_URL: 'http://127.0.0.1:5003',
    GO_ENGINE_URL: 'http://127.0.0.1:5004',
  }),
  validateConfig: vi.fn(),
}));

import { createLoggerMocks } from '../../helpers/mockFactories.js';
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

vi.mock('../../../packages/backend/src/utils/metrics.js', () => ({
  registerCircuitBreakerMetrics: vi.fn(),
  recordFallbackToNode: vi.fn(),
}));

const macroDataMocks = vi.hoisted(() => ({
  loadCpiSeriesFromDb: vi.fn(),
}));

vi.mock('../../../packages/backend/src/db/macroData.js', () => macroDataMocks);

vi.mock('fs', () => ({
  default: {
    existsSync: fsMocks.existsSync,
    readFileSync: fsMocks.readFileSync,
  },
  existsSync: fsMocks.existsSync,
  readFileSync: fsMocks.readFileSync,
}));

import dataRoutes from '../../../packages/backend/src/routes/dataRoutes.js';

/** 创建 fetch mock：仅拦截 Go 服务 URL，其他请求走真实 fetch */
function installFetchMock() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('5003') || url.includes('go-data')) {
      return goFetchMock(input, init);
    }
    return originalFetch(input, init);
  }) as typeof fetch;
}

describe('dataRoutes - GET /api/data/history', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    goFetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      SPY: { '2020-01-01': 300.0, '2020-01-02': 301.0 },
    });
    fsMocks.existsSync.mockReturnValue(false);
    installFetchMock();
    server = await startExpressApp((app) => app.use('/api/data', dataRoutes));
  });

  afterEach(async () => {
    await server.close();
    globalThis.fetch = originalFetch;
  });

  it('Go 服务可用时应返回 Go 数据（无降级标记）', async () => {
    goFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          SPY: [{ date: '2020-01-01', open: 299, high: 301, low: 298, close: 300, volume: 1000 }],
        },
      }),
      text: async () => '',
    });

    const res = await fetch(
      `${server.url}/api/data/history?tickers=SPY&startDate=2020-01-01&endDate=2020-01-02`,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.SPY['2020-01-01']).toBe(300);
    expect(body.degraded).toBeUndefined();
  });

  it('Go 服务不可用时应降级到本地数据并标记 degraded', async () => {
    goFetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await fetch(
      `${server.url}/api/data/history?tickers=SPY&startDate=2020-01-01&endDate=2020-01-02`,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.SPY['2020-01-01']).toBe(300.0);
    expect(body.degraded).toBe(true);
    expect(body.degradedCode).toBe('GO_SERVICE_UNAVAILABLE');
    expect(dataServiceMocks.fetchHistoryData).toHaveBeenCalledTimes(1);
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

  it('ticker 数量超过上限应返回 422', async () => {
    const tickers = Array.from({ length: 51 }, (_, i) => `T${i}`).join(',');
    const res = await fetch(
      `${server.url}/api/data/history?tickers=${tickers}&startDate=2020-01-01&endDate=2020-01-02`,
    );

    expect(res.status).toBe(422);
  });

  it('fetchHistoryData 抛错时应返回 500', async () => {
    goFetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
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
    goFetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    dataServiceMocks.searchTickers.mockResolvedValue([
      { ticker: 'AAPL', name: 'Apple', market: 'US' },
    ]);
    installFetchMock();
    server = await startExpressApp((app) => app.use('/api/data', dataRoutes));
  });

  afterEach(async () => {
    await server.close();
    globalThis.fetch = originalFetch;
  });

  it('Go 服务可用时应返回 Go 搜索结果', async () => {
    goFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: [{ ticker: 'GOOG', name: 'Google' }] }),
      text: async () => '',
    });

    const res = await fetch(`${server.url}/api/data/search?query=google`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data[0].ticker).toBe('GOOG');
    expect(body.degraded).toBeUndefined();
  });

  it('Go 服务不可用时应降级到本地搜索并标记 degraded', async () => {
    goFetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await fetch(`${server.url}/api/data/search?query=aapl`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data[0].ticker).toBe('AAPL');
    expect(body.degraded).toBe(true);
    expect(dataServiceMocks.searchTickers).toHaveBeenCalledTimes(1);
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
    goFetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    fsMocks.existsSync.mockReturnValue(false);
    installFetchMock();
    server = await startExpressApp((app) => app.use('/api/data', dataRoutes));
  });

  afterEach(async () => {
    await server.close();
    globalThis.fetch = originalFetch;
  });

  it('Go 服务可用时应返回 Go CPI 数据', async () => {
    goFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { '2024-01': 310.5 } }),
      text: async () => '',
    });

    const res = await fetch(`${server.url}/api/data/cpi/us`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data['2024-01']).toBe(310.5);
    expect(body.degraded).toBeUndefined();
  });

  it('Go 服务不可用时应降级到 PostgreSQL', async () => {
    macroDataMocks.loadCpiSeriesFromDb.mockResolvedValue([{ date: '2024-01-02', value: 310.5 }]);

    const res = await fetch(`${server.url}/api/data/cpi/us`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data[0].value).toBe(310.5);
    expect(body.degraded).toBe(true);
    expect(body.degradedCode).toBe('GO_SERVICE_UNAVAILABLE');
  });

  it('Go 服务不可用且 PostgreSQL 无数据时应返回 404', async () => {
    macroDataMocks.loadCpiSeriesFromDb.mockResolvedValue([]);

    const res = await fetch(`${server.url}/api/data/cpi/cn`);

    expect(res.status).toBe(404);
  });

  it('无效 country 参数应返回 422', async () => {
    const res = await fetch(`${server.url}/api/data/cpi/jp`);

    expect(res.status).toBe(422);
  });

  it('支持 cn 国家参数', async () => {
    goFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { '2024-01': 100.5 } }),
      text: async () => '',
    });

    const res = await fetch(`${server.url}/api/data/cpi/cn`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data['2024-01']).toBe(100.5);
  });
});
