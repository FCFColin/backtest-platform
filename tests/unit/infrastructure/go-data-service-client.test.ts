import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import http, { type Server } from 'http';

vi.hoisted(() => {
  process.env.MAX_RESPONSE_BODY_SIZE = '100';
});

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: {
    get GO_DATA_SERVICE_URL() {
      return process.env.GO_DATA_SERVICE_URL;
    },
    GO_DATA_SERVICE_TIMEOUT_MS: 5000,
    DATA_SERVICE_AUTH_TOKEN: 'test-token',
  },
}));

vi.mock('../../../packages/backend/src/utils/metrics.js', () => ({
  registerSemaphoreMetrics: vi.fn(),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  },
}));

import { callGoDataService } from '../../../packages/backend/src/infrastructure/goDataServiceClient.js';

let server: Server;
let baseUrl: string;

function startServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<string> {
  return new Promise((resolve) => {
    server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve(`http://127.0.0.1:${(addr as { port: number }).port}`);
    });
  });
}

describe('callGoDataService', () => {
  beforeAll(async () => {
    baseUrl = await startServer((req, res) => {
      const url = req.url ?? '';
      if (url === '/ok') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }
      if (url === '/error') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'boom' }));
        return;
      }
      if (url === '/too-large-header') {
        res.writeHead(200, { 'Content-Length': '5000' });
        res.end('x'.repeat(5000));
        return;
      }
      if (url === '/too-large-stream') {
        res.writeHead(200, { 'Transfer-Encoding': 'chunked' });
        res.write('x'.repeat(200));
        res.end();
        return;
      }
      res.writeHead(404);
      res.end();
    });
    process.env.GO_DATA_SERVICE_URL = baseUrl;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('2xx 应返回响应体原文', async () => {
    const body = await callGoDataService('/ok');
    expect(JSON.parse(body)).toEqual({ success: true });
  });

  it('非 2xx 应拒绝并携带状态码', async () => {
    await expect(callGoDataService('/error')).rejects.toThrow(/HTTP 500/);
  });

  it('Content-Length 预检超限应拒绝', async () => {
    await expect(callGoDataService('/too-large-header')).rejects.toThrow(
      /response too large: Content-Length/,
    );
  });

  it('流式接收超限应拒绝', async () => {
    await expect(callGoDataService('/too-large-stream')).rejects.toThrow(
      /response too large: received/,
    );
  });

  it('请求失败应拒绝', async () => {
    process.env.GO_DATA_SERVICE_URL = 'http://127.0.0.1:1';
    await expect(callGoDataService('/ok')).rejects.toThrow(/request failed/);
    process.env.GO_DATA_SERVICE_URL = baseUrl;
  });
});

describe('callGoDataService - 信号量并发上限', () => {
  let slowBase: string;
  let active = 0;
  let maxActive = 0;

  beforeAll(async () => {
    slowBase = await startServer((_req, res) => {
      active++;
      maxActive = Math.max(maxActive, active);
      setTimeout(() => {
        active--;
        res.writeHead(200);
        res.end('ok');
      }, 40);
    });
    process.env.GO_DATA_SERVICE_URL = slowBase;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('15 个并发请求时同时活跃请求数不应超过 10', async () => {
    active = 0;
    maxActive = 0;
    const results = await Promise.allSettled(
      Array.from({ length: 15 }, () => callGoDataService('/slow')),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(15);
    expect(maxActive).toBeLessThanOrEqual(10);
  });
});
