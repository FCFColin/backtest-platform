/**
 * 健康检查路由单元测试（T-P1-5.1）
 *
 * 企业理由：健康检查端点是 K8s 探针的基础，故障会导致 Pod 被误杀。
 * 测试覆盖：轻量 /health、深度 /ready、metrics 端点返回格式。
 *
 * 实现：使用 Express app.listen + 真实 fetch（不依赖 supertest），
 * 在随机端口启动真实 HTTP 服务。mock fetch 时仅拦截 Go 引擎/数据服务 URL，
 * 放行测试服务器自身的请求。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';
import { createLoggerMocks, createConfigMocks } from '../../helpers/mockFactories.js';

const originalFetch = globalThis.fetch;

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: createConfigMocks({
    NODE_ENV: 'test',
    GO_ENGINE_URL: 'http://127.0.0.1:5001',
    GO_DATA_SERVICE_URL: 'http://127.0.0.1:5003',
  }),
  validateConfig: vi.fn(),
}));

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: vi.fn(() => ({ query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) })),
}));

vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  appRedis: { ping: vi.fn().mockResolvedValue('PONG') },
}));

import { config } from '../../../packages/backend/src/config/index.js';
import healthRoutes from '../../../packages/backend/src/routes/healthRoutes.js';

/**
 * 创建拦截外部引擎/数据服务 URL 的 fetch mock，
 * 其他请求（如测试服务器自身）走真实 fetch。
 */
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
    if (url.includes('127.0.0.1:5001') || url.includes('go-engine')) {
      return respond(goEngine);
    }
    if (url.includes('127.0.0.1:5003') || url.includes('go-data')) {
      return respond(goData);
    }
    return originalFetch(input as RequestInfo, init);
  });
}

describe('healthRoutes', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    config.METRICS_AUTH_TOKEN = '';
    server = await startExpressApp((app) => app.use('/api', healthRoutes));
  });

  afterEach(async () => {
    await server.close();
    globalThis.fetch = originalFetch;
    config.METRICS_AUTH_TOKEN = '';
  });

  describe('GET /api/health', () => {
    it('应返回轻量存活状态，不暴露依赖拓扑', async () => {
      const res = await fetch(`${server.url}/api/health`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('ok');
      expect(body.data.timestamp).toBeDefined();
      expect(body.data.engine).toBeUndefined();
      expect(body.data.dependencies).toBeUndefined();
    });
  });

  describe('GET /api/ready', () => {
    it('Go 引擎可用时应返回 status=ok', async () => {
      globalThis.fetch = createFetchMock({ goEngine: { ok: true, status: 200 } }) as typeof fetch;

      const res = await fetch(`${server.url}/api/ready`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('ok');
      expect(body.data.engine.go).toBe(true);
      expect(body.data.dependencies.database).toBe(true);
    });

    it('Go 引擎不可用时应 fail-closed 返回 503 + Retry-After（ADR-031）', async () => {
      globalThis.fetch = createFetchMock({
        goEngine: new Error('ECONNREFUSED'),
      }) as typeof fetch;

      const res = await fetch(`${server.url}/api/ready`);
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(res.headers.get('Retry-After')).toBe('30');
      expect(body.error.code).toBe('ENGINE_UNAVAILABLE');
    });

    it('配置 METRICS_AUTH_TOKEN 时未鉴权应返回 401', async () => {
      config.METRICS_AUTH_TOKEN = 'secret-metrics-token';

      const res = await fetch(`${server.url}/api/ready`);
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/metrics', () => {
    it('应返回 Prometheus text format', async () => {
      const res = await fetch(`${server.url}/api/metrics`);
      const text = await res.text();

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/plain');
      expect(text).toContain('process_');
    });

    it('应包含 saturation 指标（T-P1-1）', async () => {
      const res = await fetch(`${server.url}/api/metrics`);
      const text = await res.text();

      expect(text).toContain('node_eventloop_lag_seconds');
      expect(text).toContain('circuit_breaker_state');
    });

    it('配置 METRICS_AUTH_TOKEN 时未鉴权应返回 401', async () => {
      config.METRICS_AUTH_TOKEN = 'secret-metrics-token';

      const res = await fetch(`${server.url}/api/metrics`);
      expect(res.status).toBe(401);
    });
  });
});
