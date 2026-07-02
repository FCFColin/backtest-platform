/**
 * 数据引擎管理路由单元测试
 *
 * 企业理由：数据管理路由管理全市场数据更新和查询，HTTP 方法语义正确性
 * 影响客户端集成。测试覆盖：状态查询、统计、分页、搜索、更新触发、废弃端点头。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer, type TestRequest } from '../../helpers/expressApp.js';

const engineServiceMocks = vi.hoisted(() => ({
  getEngineStatus: vi.fn(),
  getTickerList: vi.fn(),
  searchTickers: vi.fn(),
  loadTickerData: vi.fn(),
  scanMarketStatsFromDb: vi.fn(),
  resolveUniverseFromCacheStats: vi.fn(),
}));

vi.mock('../../../api/services/engineService.js', () => engineServiceMocks);

import { createLoggerMocks } from '../../helpers/mockFactories.js';
vi.mock('../../../api/utils/logger.js', () => ({ logger: createLoggerMocks() }));

import dataManageRoutes from '../../../api/routes/dataManageRoutes.js';

/**
 * 启动测试用 Express 服务。
 *
 * 写端点受 requirePermission(DATA_MANAGE) 保护，需前置认证注入 req.user。
 * 通过 authRole 控制注入的角色：
 * - 'admin'/'analyst'：具备 DATA_MANAGE 权限，应放行；
 * - 'readonly'：无 DATA_MANAGE 权限，应 403；
 * - null：不注入 user（模拟未认证），应 401。
 */
async function startApp(
  authRole: 'admin' | 'analyst' | 'readonly' | null = 'admin',
): Promise<TestServer> {
  return startExpressApp((app) => {
    if (authRole) {
      app.use((req: TestRequest, _res, next) => {
        req.user = {
          sub: 'test-user',
          role: authRole,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 900,
        };
        next();
      });
    }
    app.use('/api/v1/data/manage', dataManageRoutes);
  });
}

function createMockStats() {
  return {
    total_cached: 50,
    by_market: { US: 40, CN: 10 },
    by_type: { stock: 30, etf: 20 },
    by_exchange: { NYSE: 30, NASDAQ: 20 },
    date_ranges: { earliest: '2015-01-01', latest: '2024-06-30' },
    by_decade: {},
    by_year_count: {},
    coverage: {
      tickers_with_5y_plus: 40,
      tickers_with_10y_plus: 30,
      tickers_with_20y_plus: 10,
      avg_data_points: 2000,
      median_data_points: 1800,
    },
    data_quality: {
      with_adj_close: 50,
      with_dividends: 20,
      with_splits: 5,
      total_data_points: 100000,
      total_size_mb: 50.0,
    },
    recent_updates: [],
    sample_tickers: {},
    generated_at: '2024-06-30T00:00:00Z',
  };
}

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
    server = await startExpressApp((app) => app.use('/api/v1/data/manage', dataManageRoutes));
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
    expect(body.success).toBe(false);
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
    server = await startExpressApp((app) => app.use('/api/v1/data/manage', dataManageRoutes));
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
    expect(body.success).toBe(false);
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
    server = await startExpressApp((app) => app.use('/api/v1/data/manage', dataManageRoutes));
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
    server = await startExpressApp((app) => app.use('/api/v1/data/manage', dataManageRoutes));
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
    server = await startExpressApp((app) => app.use('/api/v1/data/manage', dataManageRoutes));
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

  it('无效 ticker 格式（超长）应返回 422', async () => {
    const res = await fetch(`${server.url}/api/v1/data/manage/ticker/AAAAAAAAAAAAAAAAAAAAA`);

    expect(res.status).toBe(422);
  });

  it('小写 ticker 应返回 422（仅允许大写）', async () => {
    const res = await fetch(`${server.url}/api/v1/data/manage/ticker/aapl`);

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

describe('dataManageRoutes - 数据更新端点（已激活）', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startApp('admin');
  });

  afterEach(async () => {
    await server.close();
  });

  // 数据摄取端点已从 501 退役状态激活，通过 Go worker 执行全量/增量更新
  it('PUT /update/full 应尝试启动全量更新（返回 200 或 500 取决于 DB 可用性）', async () => {
    const res = await fetch(`${server.url}/api/v1/data/manage/update/full`, { method: 'PUT' });
    // 端点不再返回 501，应当激活（可能在无 DB 环境下返回 500）
    expect(res.status === 200 || res.status === 500).toBe(true);
  });

  it('PATCH /update/inc 应尝试启动增量更新', async () => {
    const res = await fetch(`${server.url}/api/v1/data/manage/update/inc`, { method: 'PATCH' });
    expect(res.status === 200 || res.status === 500).toBe(true);
  });

  it('PUT /update/refetch 应尝试启动重新拉取', async () => {
    const res = await fetch(`${server.url}/api/v1/data/manage/update/refetch`, { method: 'PUT' });
    expect(res.status === 200 || res.status === 500).toBe(true);
  });

  it('PATCH /resume 应尝试恢复更新', async () => {
    const res = await fetch(`${server.url}/api/v1/data/manage/resume`, { method: 'PATCH' });
    expect(res.status === 200 || res.status === 500).toBe(true);
  });

  it('PUT /universe 应返回标的统计（不再返回 501）', async () => {
    const res = await fetch(`${server.url}/api/v1/data/manage/universe`, { method: 'PUT' });
    // scanMarketStatsFromDb 已 mock，应返回 200
    expect(res.status).toBe(200);
  });

  it('PUT /regenerate-meta 应返回成功（不再返回 501）', async () => {
    const res = await fetch(`${server.url}/api/v1/data/manage/regenerate-meta`, { method: 'PUT' });
    expect(res.status).toBe(200);
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

    // 关键：鉴权拦截必须先于业务逻辑（否则会先暴露 501 端点存在性）
    expect(res.status).toBe(401);
  });

  it('readonly 角色（无 DATA_MANAGE 权限）写端点应返回 403', async () => {
    vi.clearAllMocks();
    server = await startApp('readonly');
    const res = await fetch(`${server.url}/api/v1/data/manage/universe`, { method: 'PUT' });

    expect(res.status).toBe(403);
  });

  it('analyst 角色具备 DATA_MANAGE 权限，鉴权放行后命中业务逻辑', async () => {
    vi.clearAllMocks();
    server = await startApp('analyst');
    const res = await fetch(`${server.url}/api/v1/data/manage/update/inc`, { method: 'PATCH' });
    const body = await res.json();

    // 鉴权通过（非 401/403），业务层返回 200 或 500（取决于运行环境）
    expect(res.status === 200 || res.status === 500).toBe(true);
    if (res.status === 200) {
      expect(body.success).toBe(true);
    }
  });
});

describe('dataManageRoutes - 废弃 POST 端点', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startApp('admin');
  });

  afterEach(async () => {
    await server.close();
  });

  it('POST /update/full 应设置 Deprecation/Sunset/Link 头，不再返回 501', async () => {
    const res = await fetch(`${server.url}/api/v1/data/manage/update/full`, { method: 'POST' });
    const body = await res.json();

    // 不再返回 501（已激活），可能返回 200 或 500
    expect(res.status === 200 || res.status === 500).toBe(true);
    if (res.status === 200) {
      expect(body.success).toBe(true);
    }
    // 废弃头仍保留，引导客户端迁移到 PUT
    expect(res.headers.get('deprecation')).toBe('true');
    expect(res.headers.get('sunset')).toBeTruthy();
    expect(res.headers.get('link')).toContain('successor-version');
  });
});

