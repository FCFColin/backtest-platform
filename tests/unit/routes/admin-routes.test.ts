import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer, type TestRequest } from '../../helpers/expressApp.js';
import { createLoggerMocks, createConfigMocks } from '../../helpers/mockFactories.js';

const callServiceMock = vi.hoisted(() => vi.fn());

const engineServiceMocks = vi.hoisted(() => ({
  scanTickersStats: vi.fn(),
  getUniverseStats: vi.fn(),
}));

vi.mock('../../../packages/backend/src/utils/httpClient.js', () => ({
  callService: callServiceMock,
}));

vi.mock('../../../packages/backend/src/infrastructure/dataQuery.js', () => ({
  scanTickersStats: engineServiceMocks.scanTickersStats,
  getUniverseStats: engineServiceMocks.getUniverseStats,
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: createConfigMocks({
    NODE_ENV: 'test',
    GO_ENGINE_URL: 'http://127.0.0.1:15004',
    GO_DATA_SERVICE_URL: 'http://127.0.0.1:15003',
  }),
  validateConfig: vi.fn(),
}));

vi.mock('../../../packages/backend/src/middleware/jwtAuth.js', () => ({
  jwtAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  optionalJwtAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  assignGuestReadonly: (_req: unknown, _res: unknown, next: () => void) => next(),
  auditLog: (_req: unknown, _res: unknown, next: () => void) => next(),
  idempotencyKey: (_req: unknown, _res: unknown, next: () => void) => next(),
  AuthenticatedRequest: Object,
}));

vi.mock('../../../packages/backend/src/middleware/rbac.js', () => ({
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  Permission: { ADMIN_ACCESS: 'admin:access' },
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

const apiKeyServiceMocks = vi.hoisted(() => ({
  createApiKey: vi.fn(),
  listApiKeys: vi.fn(),
  revokeApiKey: vi.fn(),
  rotatePlatformAdminKey: vi.fn(),
  revokePlatformAdminKey: vi.fn(),
  listPlatformAdminKeys: vi.fn(),
}));

vi.mock('../../../packages/backend/src/repositories/apiKeyRepo.js', () => ({
  ...apiKeyServiceMocks,
  PLATFORM_ADMIN_KEY_MAX_TTL_DAYS: 90,
}));

vi.mock('../../../packages/backend/src/infrastructure/apiKeyVerifier.js', () => ({
  markApiKeyRevoked: vi.fn(),
}));

vi.mock('../../../packages/backend/src/utils/metrics.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../packages/backend/src/utils/metrics.js')>();
  return { ...actual, recordAuthFailure: vi.fn(), getRoutePattern: () => 'route' };
});

import adminRoutes from '../../../packages/backend/src/routes/adminRoutes.js';
import apiKeyRoutes from '../../../packages/backend/src/routes/apiKeyRoutes.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const KEY_ID = '22222222-2222-2222-2222-222222222222';

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
    expect(body.error.code).toBe('ADMIN_STATS_ERROR');
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
    expect(body.error.code).toBe('ADMIN_SYSTEM_ERROR');
  });
});

describe('apiKeyRoutes', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startExpressApp((app) => {
      app.use((req: TestRequest, _res, next) => {
        req.tenantId = ORG;
        req.user = { sub: 'user-1', role: 'admin', tenant_id: ORG, org_role: 'admin' };
        next();
      });
      app.use('/api/v1', apiKeyRoutes);
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it('POST / 创建成功应返回 201 与一次性明文', async () => {
    apiKeyServiceMocks.createApiKey.mockResolvedValueOnce({
      id: KEY_ID,
      orgId: ORG,
      name: 'CI key',
      keyPrefix: 'bpk_live_abcd',
      createdAt: '2026-01-01T00:00:00.000Z',
      plaintext: 'bpk_live_secretplaintext',
    });
    const res = await fetch(`${server.url}/api/v1/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'CI key' }),
    });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.apiKey).toBe('bpk_live_secretplaintext');
    expect(apiKeyServiceMocks.createApiKey).toHaveBeenCalledWith(ORG, 'CI key', 'user-1');
  });

  it('POST / 名称为空应返回 400', async () => {
    const res = await fetch(`${server.url}/api/v1/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    });
    expect(res.status).toBe(400);
    expect(apiKeyServiceMocks.createApiKey).not.toHaveBeenCalled();
  });

  it('GET / 应返回组织密钥列表', async () => {
    apiKeyServiceMocks.listApiKeys.mockResolvedValueOnce([
      { id: KEY_ID, orgId: ORG, name: 'CI key', keyPrefix: 'bpk_live_abcd', revokedAt: null },
    ]);
    const res = await fetch(`${server.url}/api/v1/keys`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(apiKeyServiceMocks.listApiKeys).toHaveBeenCalledWith(ORG);
  });

  it('DELETE /:id 非法 UUID 应返回 400', async () => {
    const res = await fetch(`${server.url}/api/v1/keys/not-a-uuid`, { method: 'DELETE' });
    expect(res.status).toBe(400);
    expect(apiKeyServiceMocks.revokeApiKey).not.toHaveBeenCalled();
  });

  it('DELETE /:id 不存在应返回 404', async () => {
    apiKeyServiceMocks.revokeApiKey.mockResolvedValueOnce(false);
    const res = await fetch(`${server.url}/api/v1/keys/${KEY_ID}`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('DELETE /:id 成功应返回 200', async () => {
    apiKeyServiceMocks.revokeApiKey.mockResolvedValueOnce(true);
    const res = await fetch(`${server.url}/api/v1/keys/${KEY_ID}`, { method: 'DELETE' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.revoked).toBe(true);
    expect(apiKeyServiceMocks.revokeApiKey).toHaveBeenCalledWith(ORG, KEY_ID);
  });

  it('POST / 服务端错误应返回 500', async () => {
    apiKeyServiceMocks.createApiKey.mockRejectedValueOnce(new Error('DB connection failed'));
    const res = await fetch(`${server.url}/api/v1/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'CI key' }),
    });
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error.code).toBe('API_KEY_CREATE_FAILED');
  });

  it('GET / 服务端错误应返回 500', async () => {
    apiKeyServiceMocks.listApiKeys.mockRejectedValueOnce(new Error('DB connection failed'));
    const res = await fetch(`${server.url}/api/v1/keys`);
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error.code).toBe('API_KEY_LIST_FAILED');
  });

  it('DELETE /:id 服务端错误应返回 500', async () => {
    apiKeyServiceMocks.revokeApiKey.mockRejectedValueOnce(new Error('DB connection failed'));
    const res = await fetch(`${server.url}/api/v1/keys/${KEY_ID}`, { method: 'DELETE' });
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error.code).toBe('API_KEY_REVOKE_FAILED');
  });
});
