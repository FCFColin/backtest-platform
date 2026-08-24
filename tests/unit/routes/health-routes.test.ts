import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { startExpressApp } from '../../helpers/expressApp.js';
import { withServer } from '../../helpers/serverLifecycle.js';
import { mockConfigModule } from '../../helpers/mockFactories.js';
import { expectFetchOk } from '../../helpers/routeAssertions.js';
import { redisModuleMock } from '../../helpers/redisFixture.js';

const originalFetch = globalThis.fetch;

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock('../../../packages/backend/src/config/index.js', () =>
  mockConfigModule({
    NODE_ENV: 'test',
    GO_ENGINE_URL: 'http://127.0.0.1:15001',
    GO_DATA_SERVICE_URL: 'http://127.0.0.1:15003',
  }),
);

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: vi.fn(() => ({ query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) })),
  pool: { query: dbMocks.query },
  getReadPool: () => ({ query: dbMocks.query }),
}));

vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => redisModuleMock);

import { config } from '../../../packages/backend/src/config/index.js';
import healthRoutes from '../../../packages/backend/src/routes/healthRoutes.js';
import platformRoutes from '../../../packages/backend/src/routes/platformRoutes.js';

function createFetchMock(options: {
  goEngine?: { ok: boolean; status: number } | Error;
  goData?: { ok: boolean; status: number } | Error;
}) {
  const { goEngine = { ok: true, status: 200 }, goData = { ok: true, status: 200 } } = options;
  const respond = (resp: { ok: boolean; status: number } | Error) => {
    if (resp instanceof Error) throw resp;
    return {
      ok: resp.ok,
      status: resp.status,
      json: async () => ({}),
      text: async () => '',
    } as Response;
  };
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('127.0.0.1:15001') || url.includes('go-engine')) {
      return respond(goEngine);
    }
    if (url.includes('127.0.0.1:15003') || url.includes('go-data')) {
      return respond(goData);
    }
    return originalFetch(input as RequestInfo, init);
  });
}

describe('healthRoutes', () => {
  const getServer = withServer(() => {
    vi.clearAllMocks();
    config.METRICS_AUTH_TOKEN = '';
    return startExpressApp((app) => app.use('/api', healthRoutes));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    config.METRICS_AUTH_TOKEN = '';
  });

  describe('GET /api/health', () => {
    it('应返回轻量存活状态，不暴露依赖拓扑', async () => {
      const { body } = await expectFetchOk(`${getServer().url}/api/health`);
      expect(body.data.status).toBe('ok');
      expect(body.data.timestamp).toBeDefined();
      expect(body.data.engine).toBeUndefined();
      expect(body.data.dependencies).toBeUndefined();
    });
  });

  describe('GET /api/ready（k8s readinessProbe 无鉴权探测，见 k8s/deployments.yaml）', () => {
    it('无鉴权且 Go 引擎可用时应返回 status=ok', async () => {
      globalThis.fetch = createFetchMock({ goEngine: { ok: true, status: 200 } }) as typeof fetch;

      const { body } = await expectFetchOk(`${getServer().url}/api/ready`);
      expect(body.data.status).toBe('ok');
      expect(body.data.engine.go).toBe(true);
      expect(body.data.dependencies.database).toBe(true);
    });

    it('无鉴权且 Go 引擎不可用时应 fail-closed 返回 503 + Retry-After（ADR-008）', async () => {
      globalThis.fetch = createFetchMock({
        goEngine: new Error('ECONNREFUSED'),
      }) as typeof fetch;

      const res = await fetch(`${getServer().url}/api/ready`);
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(res.headers.get('Retry-After')).toBe('30');
      expect(body.error.code).toBe('ENGINE_UNAVAILABLE');
    });
  });

  describe('GET /api/metrics', () => {
    const fetchMetrics = async () => {
      config.METRICS_AUTH_TOKEN = 'test-metrics-token';
      const res = await fetch(`${getServer().url}/api/metrics`, {
        headers: { Authorization: 'Bearer test-metrics-token' },
      });
      const text = await res.text();
      return { res, text };
    };

    it('应返回 Prometheus text format', async () => {
      const { res, text } = await fetchMetrics();

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/plain');
      expect(text).toContain('process_');
    });

    it('应包含 saturation 指标（T-P1-1）', async () => {
      const { res, text } = await fetchMetrics();

      expect(res.status).toBe(200);
      expect(text).toContain('node_eventloop_lag_seconds');
      expect(text).toContain('circuit_breaker_state');
    });
  });

  it('配置 METRICS_AUTH_TOKEN 时未鉴权访问 /metrics 应返回 401', async () => {
    config.METRICS_AUTH_TOKEN = 'secret-metrics-token';

    const res = await fetch(`${getServer().url}/api/metrics`);
    expect(res.status).toBe(401);
  });

  it('D2-005: 未配置 METRICS_AUTH_TOKEN 时 /metrics 应返回 403', async () => {
    config.METRICS_AUTH_TOKEN = '';

    const res = await fetch(`${getServer().url}/api/metrics`);
    expect(res.status).toBe(403);
  });
});

describe('healthRoutes (debug endpoint) - GET /api/v1/debug/health', () => {
  const getServer = withServer(() => startExpressApp((app) => app.use('/api', healthRoutes)));
  const originalToken = config.DEBUG_AUTH_TOKEN;

  afterEach(() => {
    config.DEBUG_AUTH_TOKEN = originalToken;
  });

  const debugHealth = async (token: string, bearer?: string) => {
    config.DEBUG_AUTH_TOKEN = token;
    const res = await fetch(`${getServer().url}/api/v1/debug/health`, {
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : undefined,
    });
    const json = await res.json();
    return { res, json };
  };

  it('未配置 DEBUG_AUTH_TOKEN 时应返回 404', async () => {
    const { res, json } = await debugHealth('');

    expect(res.status).toBe(404);
    expect(json.error.code).toBe('NOT_FOUND');
  });

  it('Bearer token 错误时应返回 401', async () => {
    const { res, json } = await debugHealth('correct-secret-token', 'wrong-token');

    expect(res.status).toBe(401);
    expect(json.error.code).toBe('UNAUTHORIZED');
  });

  it('有效 DEBUG_AUTH_TOKEN 时应返回 200', async () => {
    const { res, json } = await debugHealth('correct-secret-token', 'correct-secret-token');

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({
      node: expect.any(String),
      pid: expect.any(Number),
      uptimeSec: expect.any(Number),
      memory: expect.any(Object),
    });
  });

  it('超长恶意 Bearer token 应返回 401', async () => {
    const { res, json } = await debugHealth('correct-secret-token', 'A'.repeat(10000));

    expect(res.status).toBe(401);
    expect(json.error.code).toBe('UNAUTHORIZED');
  });
});

describe('announcementRoutes - 权限（E4）', () => {
  const getServer = withServer(() => {
    vi.clearAllMocks();
    return startExpressApp((app) => app.use('/api/v1', platformRoutes));
  });

  it('GET / 公开可访问（无需认证）', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'a1',
          title: '公告',
          body: '正文',
          category: 'info',
          severity: 'info',
          published_at: '2026-08-01',
        },
      ],
    });
    const res = await fetch(`${getServer().url}/api/v1/announcements`);
    expect(res.status).toBe(200);
  });

  it('POST / 无认证时应返回 401（管理员发布）', async () => {
    const res = await fetch(`${getServer().url}/api/v1/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'x', body: 'y' }),
    });
    expect(res.status).toBe(401);
    expect(dbMocks.query).not.toHaveBeenCalled();
  });
});
