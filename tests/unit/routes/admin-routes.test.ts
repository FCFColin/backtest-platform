/**
 * 管理后台路由单元测试
 *
 * 企业理由：管理后台仪表盘统计数据和系统资源信息是运维监控的基础，
 * 服务健康检查错误会导致误判。测试覆盖：服务健康/不健康、统计扫描、系统信息。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';
import { createLoggerMocks, createConfigMocks } from '../../helpers/mockFactories.js';

const callServiceMock = vi.hoisted(() => vi.fn());

const engineServiceMocks = vi.hoisted(() => ({
  scanTickersStats: vi.fn(),
  getUniverseStats: vi.fn(),
}));

vi.mock('../../../api/routes/dataRoutes.js', () => ({
  callService: callServiceMock,
}));

vi.mock('../../../api/services/engineService.js', () => ({
  scanTickersStats: engineServiceMocks.scanTickersStats,
  getUniverseStats: engineServiceMocks.getUniverseStats,
}));

vi.mock('../../../api/config/index.js', () => ({
  config: createConfigMocks({
    NODE_ENV: 'test',
    GO_ENGINE_URL: 'http://127.0.0.1:5004',
    GO_DATA_SERVICE_URL: 'http://127.0.0.1:5003',
  }),
  validateConfig: vi.fn(),
}));

vi.mock('../../../api/utils/logger.js', () => ({ logger: createLoggerMocks() }));

import adminRoutes from '../../../api/routes/adminRoutes.js';

function createMockTickerStats() {
  return {
    total_cached: 100,
    by_market: { US: 80, CN: 20 },
    by_type: { stock: 70, etf: 30 },
    by_exchange: { NYSE: 50, NASDAQ: 30, SSE: 20 },
    date_ranges: { earliest: '2010-01-01', latest: '2024-06-30' },
    by_decade: { '2010s': 80, '2020s': 100 },
    by_year_count: { '2024': 100 },
    coverage: {
      tickers_with_5y_plus: 90,
      tickers_with_10y_plus: 70,
      tickers_with_20y_plus: 30,
      avg_data_points: 2500,
      median_data_points: 2400,
    },
    data_quality: {
      with_adj_close: 100,
      with_dividends: 40,
      with_splits: 10,
      total_data_points: 250000,
      total_size_mb: 120.5,
    },
    recent_updates: [],
    sample_tickers: {},
    generated_at: '2024-06-30T00:00:00Z',
  };
}

function createMockUniverseStats() {
  return { total: 500, updated_at: '2024-06-30', stats: { US: 400, CN: 100 } };
}

describe('adminRoutes - GET /api/admin/stats', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    callServiceMock.mockResolvedValue({ status: 'ok', success: true, version: '1.0.0' });
    engineServiceMocks.scanTickersStats.mockResolvedValue(createMockTickerStats());
    engineServiceMocks.getUniverseStats.mockResolvedValue(createMockUniverseStats());
    server = await startExpressApp((app) => app.use('/api/admin', adminRoutes));
  });

  afterEach(async () => {
    await server.close();
  });

  it('服务健康时应返回完整统计数据', async () => {
    const res = await fetch(`${server.url}/api/admin/stats`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.services.go_engine.status).toBe('healthy');
    expect(body.data.services.go_data_service.status).toBe('healthy');
    expect(body.data.services.go_engine.version).toBe('1.0.0');
    expect(body.data.data_stats.total_tickers).toBe(100);
    expect(body.data.data_stats.universe_total).toBe(500);
    expect(body.data.system.memory.rss_mb).toBeGreaterThan(0);
    expect(body.data.system.uptime_seconds).toBeGreaterThanOrEqual(0);
    expect(body.data.backtest_history).toEqual([]);
  });

  it('Go 引擎不可达时应返回 unhealthy', async () => {
    callServiceMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await fetch(`${server.url}/api/admin/stats`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.services.go_engine.status).toBe('unhealthy');
    expect(body.data.services.go_data_service.status).toBe('unhealthy');
    expect(body.data.services.go_engine.error).toContain('不可达');
  });

  it('服务返回异常（非 ok/success）时应返回 unhealthy', async () => {
    callServiceMock.mockResolvedValue({ status: 'error', success: false });

    const res = await fetch(`${server.url}/api/admin/stats`);
    const body = await res.json();

    expect(body.data.services.go_engine.status).toBe('unhealthy');
    expect(body.data.services.go_engine.error).toBe('服务返回异常');
  });

  it('scanTickersStats 返回 null 时应使用兜底空对象', async () => {
    engineServiceMocks.scanTickersStats.mockResolvedValue(null);

    const res = await fetch(`${server.url}/api/admin/stats`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.data_stats.total_tickers).toBe(0);
  });

  it('scanTickersStats 抛错时应返回 500', async () => {
    engineServiceMocks.scanTickersStats.mockRejectedValue(new Error('scan failed'));

    const res = await fetch(`${server.url}/api/admin/stats`);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe('ADMIN_STATS_ERROR');
  });
});

describe('adminRoutes - GET /api/admin/system', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    engineServiceMocks.scanTickersStats.mockResolvedValue(createMockTickerStats());
    server = await startExpressApp((app) => app.use('/api/admin', adminRoutes));
  });

  afterEach(async () => {
    await server.close();
  });

  it('应返回系统资源信息', async () => {
    const res = await fetch(`${server.url}/api/admin/system`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.memory.rss).toBeGreaterThan(0);
    expect(body.data.memory.heap_total).toBeGreaterThan(0);
    expect(body.data.memory.rss_mb).toBeGreaterThan(0);
    expect(body.data.uptime.seconds).toBeGreaterThanOrEqual(0);
    expect(body.data.uptime.formatted).toBeTruthy();
    expect(body.data.data_directory.total_size_mb).toBe(120.5);
    expect(body.data.data_directory.ticker_file_count).toBe(100);
  });

  it('scanTickersStats 返回 null 时应使用兜底空对象', async () => {
    engineServiceMocks.scanTickersStats.mockResolvedValue(null);

    const res = await fetch(`${server.url}/api/admin/system`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.data_directory.total_size_mb).toBe(0);
    expect(body.data.data_directory.ticker_file_count).toBe(0);
  });

  it('scanTickersStats 抛错时应返回 500', async () => {
    engineServiceMocks.scanTickersStats.mockRejectedValue(new Error('system scan failed'));

    const res = await fetch(`${server.url}/api/admin/system`);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe('ADMIN_SYSTEM_ERROR');
  });
});
