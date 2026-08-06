import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  engineServiceMocks,
  dataFetchMocks,
  startAppUnauthenticated,
  startApp,
  createMockStats,
} from '../../helpers/dataManageRoutesFixtures.js';
import type { TestServer } from '../../helpers/expressApp.js';
import { reqJson } from '../../helpers/expressApp.js';

describe('dataManageRoutes - GET 读端点', () => {
  let server: TestServer;
  beforeEach(async () => {
    vi.clearAllMocks();
    engineServiceMocks.getEngineStatus.mockResolvedValue({
      totalTickers: 500,
      cachedTickers: 100,
      lastUpdate: '2024-06-30',
    });
    engineServiceMocks.scanMarketStatsFromDb.mockResolvedValue(createMockStats());
    engineServiceMocks.resolveUniverseFromCacheStats.mockReturnValue({
      total: 500,
      updated_at: '2024-06-30',
      stats: {},
    });
    engineServiceMocks.getTickerList.mockResolvedValue(
      Array.from({ length: 100 }, (_, i) => ({
        ticker: `TICK${i}`,
        name: `Ticker ${i}`,
        category: 'stock',
        market: 'US',
      })),
    );
    engineServiceMocks.searchTickers.mockResolvedValue([
      { ticker: 'AAPL', name: 'Apple', category: 'stock', market: 'US' },
    ]);
    engineServiceMocks.loadTickerData.mockReturnValue({ ticker: 'AAPL', data: [1, 2, 3] });
    dataFetchMocks.getUpdateStatus.mockReturnValue({
      running: false,
      workerPid: null,
      mode: null,
      startedAt: null,
      completedTickers: 10,
      totalTickers: 100,
      lastError: null,
    });
    server = await startAppUnauthenticated();
  });
  afterEach(async () => {
    await server.close();
  });
  const get = (path: string) => reqJson(`${server.url}/api/v1/data/manage${path}`, 'GET');
  it('GET /status 应返回引擎状态', async () => {
    const { res, body } = await get('/status');
    expect(res.status).toBe(200);
    expect(body.data.totalTickers).toBe(500);
    expect(body.data.cachedTickers).toBe(100);
  });
  it('GET /stats 有统计数据时应返回统计和宇宙数据', async () => {
    const { res, body } = await get('/stats');
    expect(res.status).toBe(200);
    expect(body.data.stats.total_cached).toBe(50);
    expect(body.data.universe.total).toBe(500);
  });
  it('GET /stats 无统计数据时应返回 null', async () => {
    engineServiceMocks.scanMarketStatsFromDb.mockResolvedValue(null);
    const { res, body } = await get('/stats?force=1');
    expect(res.status).toBe(200);
    expect(body.data.stats).toBeNull();
  });
  it.each([
    ['默认分页应返回第一页 50 条', '/tickers', 1, 50, 2, null],
    ['自定义分页参数应正确切片', '/tickers?page=2&limit=30', 2, 30, 4, 'TICK30'],
  ])('GET /tickers %s', async (_n, path, page, limit, totalPages, firstTicker) => {
    const { res, body } = await get(path);
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(limit);
    if (firstTicker) expect(body.data[0].ticker).toBe(firstTicker);
    expect(body.pagination).toMatchObject({ page, limit, total: 100, totalPages });
  });
  it('GET /search 有 query 参数时应返回搜索结果', async () => {
    const { res, body } = await get('/search?q=aapl');
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].ticker).toBe('AAPL');
  });
  it.each([
    ['GET /search 缺少 q 参数应返回 422', '/search'],
    ['GET /ticker/:id 超长 ticker 格式应返回 422', '/ticker/AAAAAAAAAAAAAAAAAAAAA'],
    ['GET /ticker/:id 小写 ticker 应返回 422（仅允许大写）', '/ticker/aapl'],
  ])('%s', async (_label, path) => {
    const { res } = await get(path);
    expect(res.status).toBe(422);
  });
  it('GET /ticker/:id 有效 ticker 应返回数据', async () => {
    const { res, body } = await get('/ticker/AAPL');
    expect(res.status).toBe(200);
    expect(body.data.ticker).toBe('AAPL');
  });
  it('GET /ticker/:id ticker 不存在时应返回 404', async () => {
    engineServiceMocks.loadTickerData.mockReturnValue(null);
    const { res } = await get('/ticker/UNKNOWN');
    expect(res.status).toBe(404);
  });
  it('GET /update/status 应返回更新状态', async () => {
    const { res, body } = await get('/update/status');
    expect(res.status).toBe(200);
    expect(body.data.completedTickers).toBe(10);
    expect(body.data.totalTickers).toBe(100);
  });
});

describe('dataManageRoutes - 读端点抛错统一映射为 500', () => {
  it.each<[string, () => void, string | null]>([
    [
      '/status',
      () => engineServiceMocks.getEngineStatus.mockRejectedValue(new Error('err')),
      'STATUS_ERROR',
    ],
    [
      '/stats?force=1',
      () => engineServiceMocks.scanMarketStatsFromDb.mockRejectedValue(new Error('err')),
      'STATS_ERROR',
    ],
    [
      '/tickers',
      () => engineServiceMocks.getTickerList.mockRejectedValue(new Error('err')),
      'TICKER_LIST_ERROR',
    ],
    [
      '/search?q=test',
      () => engineServiceMocks.searchTickers.mockRejectedValue(new Error('err')),
      null,
    ],
    [
      '/ticker/AAPL',
      () =>
        engineServiceMocks.loadTickerData.mockImplementation(() => {
          throw new Error('err');
        }),
      null,
    ],
  ])('%s 抛错时应返回 500', async (path, arrange, code) => {
    vi.clearAllMocks();
    arrange();
    const server = await startAppUnauthenticated();
    try {
      const { res, body } = await reqJson(`${server.url}/api/v1/data/manage${path}`, 'GET');
      expect(res.status).toBe(500);
      if (code) expect(body.error.code).toBe(code);
    } finally {
      await server.close();
    }
  });
});

describe('dataManageRoutes - 写端点权限保护（对抗性）', () => {
  let server: TestServer;
  afterEach(async () => {
    await server.close();
  });
  it('未认证请求写端点应返回 401（鉴权先于业务逻辑）', async () => {
    vi.clearAllMocks();
    server = await startApp(null);
    const res = await fetch(`${server.url}/api/v1/data/manage/update/full`, { method: 'PUT' });
    expect(res.status).toBe(401);
  });
  it('readonly 角色（无 DATA_MANAGE 权限）写端点应返回 403', async () => {
    vi.clearAllMocks();
    server = await startApp('readonly');
    const res = await fetch(`${server.url}/api/v1/data/manage/universe`, { method: 'PUT' });
    expect(res.status).toBe(403);
  });
  it('analyst 角色具备 DATA_MANAGE 权限，鉴权放行后不返回 401/403/501', async () => {
    vi.clearAllMocks();
    server = await startApp('analyst');
    const res = await fetch(`${server.url}/api/v1/data/manage/update/inc`, { method: 'PATCH' });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(501);
  });
  it('数据摄取端点应已从 501 退役状态激活', async () => {
    vi.clearAllMocks();
    server = await startApp('admin');
    for (const [method, path] of [
      ['PUT', '/update/full'],
      ['PATCH', '/update/inc'],
      ['PUT', '/universe'],
      ['PUT', '/regenerate-meta'],
    ] as const) {
      const res = await fetch(`${server.url}/api/v1/data/manage${path}`, { method });
      expect(res.status).not.toBe(501);
    }
  });
});

describe('dataManageRoutes - 写端点（admin）', () => {
  let server: TestServer;
  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startApp('admin');
  });
  afterEach(async () => {
    await server.close();
  });
  it.each([
    ['PUT', '/update/full', 'full', false],
    ['PATCH', '/update/inc', 'incremental', false],
    ['PUT', '/update/full', 'full', true],
    ['PATCH', '/update/inc', 'incremental', true],
  ])('%s %s startUpdate %s应返回对应结果', async (method, path, mode, expectError) => {
    if (expectError) dataFetchMocks.startUpdate.mockRejectedValue(new Error('启动失败'));
    else
      dataFetchMocks.startUpdate.mockResolvedValue({
        success: true,
        message: '更新已启动',
        pid: 12345,
      });
    const { res, body } = await reqJson(`${server.url}/api/v1/data/manage${path}`, method);
    expect(dataFetchMocks.startUpdate).toHaveBeenCalledWith(mode);
    if (expectError) {
      expect(res.status).toBe(500);
      expect(body.error.code).toBe('UPDATE_ERROR');
    } else {
      expect(res.status).toBe(200);
      expect(body.data.success).toBe(true);
    }
  });
  it('POST /update/stop 停止成功时应返回成功', async () => {
    dataFetchMocks.stopUpdate.mockReturnValue({ success: true, message: '更新已停止' });
    const { res, body } = await reqJson(`${server.url}/api/v1/data/manage/update/stop`, 'POST');
    expect(res.status).toBe(200);
    expect(body.data.success).toBe(true);
  });
  it('PUT /universe 正常时应返回标的信息', async () => {
    engineServiceMocks.scanMarketStatsFromDb.mockResolvedValue(createMockStats());
    const { res, body } = await reqJson(`${server.url}/api/v1/data/manage/universe`, 'PUT');
    expect(res.status).toBe(200);
    expect(body.data.total).toBe(50);
    expect(body.data.message).toContain('PostgreSQL');
  });
  it('PUT /universe scanMarketStatsFromDb 抛错时应返回 500', async () => {
    engineServiceMocks.scanMarketStatsFromDb.mockRejectedValue(new Error('universe error'));
    const { res, body } = await reqJson(`${server.url}/api/v1/data/manage/universe`, 'PUT');
    expect(res.status).toBe(500);
    expect(body.error.code).toBe('UNIVERSE_ERROR');
  });
  it('PUT /universe stats 为 null 时 total 应为 0', async () => {
    engineServiceMocks.scanMarketStatsFromDb.mockResolvedValue(null);
    const { res, body } = await reqJson(`${server.url}/api/v1/data/manage/universe`, 'PUT');
    expect(res.status).toBe(200);
    expect(body.data.total).toBe(0);
  });
  it('PUT /regenerate-meta 应直接返回成功（数据由 PostgreSQL 实时计算）', async () => {
    const { res, body } = await reqJson(`${server.url}/api/v1/data/manage/regenerate-meta`, 'PUT');
    expect(res.status).toBe(200);
    expect(body.data.message).toContain('PostgreSQL');
  });
});
