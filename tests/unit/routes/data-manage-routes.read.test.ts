/**
 * 数据引擎管理路由单元测试 —— 只读查询端点
 *
 * 企业理由：数据管理路由的只读端点（状态、统计、分页、搜索、ticker 详情、
 * 更新状态查询）影响客户端数据展示。测试覆盖：正常路径、错误路径、参数校验。
 *
 * 共享 setup（app factory / 服务 mock / mock stats）抽到
 * tests/helpers/dataManageRoutesFixtures.ts，便于复用与维护。
 * 写端点测试见 data-manage-routes.write.test.ts。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  engineServiceMocks,
  dataFetchMocks,
  startAppUnauthenticated,
  createMockStats,
} from '../../helpers/dataManageRoutesFixtures.js';
import type { TestServer } from '../../helpers/expressApp.js';

describe('dataManageRoutes - GET /status', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    engineServiceMocks.getEngineStatus.mockResolvedValue({
      totalTickers: 500,
      cachedTickers: 100,
      lastUpdate: '2024-06-30',
      progress: null,
      universeAge: '1 day',
    });
    server = await startAppUnauthenticated();
  });

  afterEach(async () => {
    await server.close();
  });

  it('应返回引擎状态', async () => {
    const res = await fetch(`${server.url}/api/v1/data/manage/status`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.totalTickers).toBe(500);
    expect(body.data.cachedTickers).toBe(100);
  });

  it('getEngineStatus 抛错时应返回 500', async () => {
    engineServiceMocks.getEngineStatus.mockRejectedValue(new Error('status error'));

    const res = await fetch(`${server.url}/api/v1/data/manage/status`);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.code).toBe('STATUS_ERROR');
  });
});

describe('dataManageRoutes - GET /stats', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    engineServiceMocks.scanMarketStatsFromDb.mockResolvedValue(createMockStats());
    engineServiceMocks.resolveUniverseFromCacheStats.mockReturnValue({
      total: 500,
      updated_at: '2024-06-30',
      stats: {},
    });
    server = await startAppUnauthenticated();
  });

  afterEach(async () => {
    await server.close();
  });

  it('有统计数据时应返回统计和宇宙数据', async () => {
    const res = await fetch(`${server.url}/api/v1/data/manage/stats`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.stats.total_cached).toBe(50);
    expect(body.data.universe.total).toBe(500);
  });

  it('无统计数据时应返回 null', async () => {
    engineServiceMocks.scanMarketStatsFromDb.mockResolvedValue(null);

    const res = await fetch(`${server.url}/api/v1/data/manage/stats`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.stats).toBeNull();
  });

  it('scanMarketStatsFromDb 抛错时应返回 500', async () => {
    engineServiceMocks.scanMarketStatsFromDb.mockRejectedValue(new Error('scan error'));

    const res = await fetch(`${server.url}/api/v1/data/manage/stats`);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.code).toBe('STATS_ERROR');
  });
});

describe('dataManageRoutes - GET /tickers', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    const tickerList = Array.from({ length: 100 }, (_, i) => ({
      ticker: `TICK${i}`,
      name: `Ticker ${i}`,
      category: 'stock',
      market: 'US',
    }));
    engineServiceMocks.getTickerList.mockResolvedValue(tickerList);
    server = await startAppUnauthenticated();
  });

  afterEach(async () => {
    await server.close();
  });

  it('默认分页应返回第一页 50 条', async () => {
    const res = await fetch(`${server.url}/api/v1/data/manage/tickers`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(50);
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.limit).toBe(50);
    expect(body.pagination.total).toBe(100);
    expect(body.pagination.totalPages).toBe(2);
  });

  it('自定义分页参数应正确切片', async () => {
    const res = await fetch(`${server.url}/api/v1/data/manage/tickers?page=2&limit=30`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(30);
    expect(body.data[0].ticker).toBe('TICK30');
    expect(body.pagination.page).toBe(2);
    expect(body.pagination.limit).toBe(30);
    expect(body.pagination.totalPages).toBe(4);
  });

  it('getTickerList 抛错时应返回 500', async () => {
    engineServiceMocks.getTickerList.mockRejectedValue(new Error('list error'));

    const res = await fetch(`${server.url}/api/v1/data/manage/tickers`);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.code).toBe('TICKER_LIST_ERROR');
  });
});

describe('dataManageRoutes - GET /search', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    engineServiceMocks.searchTickers.mockResolvedValue([
      { ticker: 'AAPL', name: 'Apple', category: 'stock', market: 'US' },
    ]);
    server = await startAppUnauthenticated();
  });

  afterEach(async () => {
    await server.close();
  });

  it('有 query 参数时应返回搜索结果', async () => {
    const res = await fetch(`${server.url}/api/v1/data/manage/search?q=aapl`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].ticker).toBe('AAPL');
  });

  it('缺少 q 参数应返回 422', async () => {
    const res = await fetch(`${server.url}/api/v1/data/manage/search`);

    expect(res.status).toBe(422);
  });

  it('searchTickers 抛错时应返回 500', async () => {
    engineServiceMocks.searchTickers.mockRejectedValue(new Error('search error'));

    const res = await fetch(`${server.url}/api/v1/data/manage/search?q=test`);

    expect(res.status).toBe(500);
  });
});

describe('dataManageRoutes - GET /ticker/:id', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    engineServiceMocks.loadTickerData.mockReturnValue({ ticker: 'AAPL', data: [1, 2, 3] });
    server = await startAppUnauthenticated();
  });

  afterEach(async () => {
    await server.close();
  });

  it('有效 ticker 应返回数据', async () => {
    const res = await fetch(`${server.url}/api/v1/data/manage/ticker/AAPL`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.ticker).toBe('AAPL');
  });

  it.each([
    ['超长 ticker 格式应返回 422', 'AAAAAAAAAAAAAAAAAAAAA'],
    ['小写 ticker 应返回 422（仅允许大写）', 'aapl'],
  ])('无效 ticker（%s）', async (_label, ticker) => {
    const res = await fetch(`${server.url}/api/v1/data/manage/ticker/${ticker}`);

    expect(res.status).toBe(422);
  });

  it('ticker 不存在时应返回 404', async () => {
    engineServiceMocks.loadTickerData.mockReturnValue(null);

    const res = await fetch(`${server.url}/api/v1/data/manage/ticker/UNKNOWN`);

    expect(res.status).toBe(404);
  });

  it('loadTickerData 抛错时应返回 500', async () => {
    engineServiceMocks.loadTickerData.mockImplementation(() => {
      throw new Error('load error');
    });

    const res = await fetch(`${server.url}/api/v1/data/manage/ticker/AAPL`);

    expect(res.status).toBe(500);
  });
});

describe('dataManageRoutes - 更新状态查询', () => {
  let server: TestServer;
  const mockStatus = {
    running: false,
    workerPid: null,
    mode: null,
    startedAt: null,
    completedTickers: 10,
    totalTickers: 100,
    lastError: null,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    dataFetchMocks.getUpdateStatus.mockReturnValue(mockStatus);
    server = await startAppUnauthenticated();
  });

  afterEach(async () => {
    await server.close();
  });

  it('GET /update/status 应返回更新状态', async () => {
    const res = await fetch(`${server.url}/api/v1/data/manage/update/status`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.completedTickers).toBe(10);
    expect(body.data.totalTickers).toBe(100);
  });
});
