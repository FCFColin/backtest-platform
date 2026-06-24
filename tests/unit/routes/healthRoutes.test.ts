/**
 * 健康检查路由单元测试（T-P1-5.1）
 *
 * 企业理由：健康检查端点是 K8s 探针的基础，故障会导致 Pod 被误杀。
 * 测试覆盖：Rust 引擎可用/不可用场景、metrics 端点返回格式。
 *
 * 实现：使用 Express app.listen + 真实 fetch（不依赖 supertest），
 * 在随机端口启动真实 HTTP 服务。mock fetch 时仅拦截 Rust 引擎 URL，
 * 放行测试服务器自身的请求。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';

const originalFetch = globalThis.fetch;

vi.mock('../../../api/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn() })),
  },
}));

vi.mock('../../../api/config/index.js', () => ({
  config: {
    NODE_ENV: 'test',
    RUST_ENGINE_URL: 'http://127.0.0.1:5002',
  },
  validateConfig: vi.fn(),
}));

import healthRoutes from '../../../api/routes/healthRoutes.js';

/** 在随机端口启动 Express 应用，返回 { url, close } */
async function startApp(): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  app.use('/api', healthRoutes);
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

/**
 * 创建只拦截 Rust 引擎 URL 的 fetch mock，
 * 其他请求（如测试服务器自身）走真实 fetch。
 */
function createFetchMock(rustEngineResponse: { ok: boolean; status: number } | Error) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    // 仅拦截 Rust 引擎健康检查请求
    if (url.includes('127.0.0.1:5002') || url.includes('rust-engine')) {
      if (rustEngineResponse instanceof Error) {
        throw rustEngineResponse;
      }
      return {
        ok: rustEngineResponse.ok,
        status: rustEngineResponse.status,
        json: async () => ({}),
        text: async () => '',
      } as any;
    }
    // 其他请求走真实 fetch
    return originalFetch(input as any, init);
  });
}

describe('healthRoutes', () => {
  let server: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startApp();
  });

  afterEach(async () => {
    await server.close();
    globalThis.fetch = originalFetch;
  });

  describe('GET /api/health', () => {
    it('Rust 引擎可用时应返回 status=ok', async () => {
      globalThis.fetch = createFetchMock({ ok: true, status: 200 }) as any;

      const res = await fetch(`${server.url}/api/health`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('ok');
      expect(body.data.timestamp).toBeDefined();
    });

    it('Rust 引擎不可用时应返回 status=degraded', async () => {
      globalThis.fetch = createFetchMock(new Error('ECONNREFUSED')) as any;

      const res = await fetch(`${server.url}/api/health`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('degraded');
    });

    it('Rust 引擎返回非 2xx 时应返回 status=degraded', async () => {
      globalThis.fetch = createFetchMock({ ok: false, status: 503 }) as any;

      const res = await fetch(`${server.url}/api/health`);
      const body = await res.json();

      expect(body.data.status).toBe('degraded');
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
  });
});
