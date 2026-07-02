/**
 * App 安全中间件集成测试（T-E2）
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Server } from 'http';

vi.mock('../../api/config/redis.js', () => {
  const store = new Map<string, number>();
  return {
    appRedis: {
      call: vi.fn().mockImplementation((...args: string[]) => {
        const cmd = args[0]?.toUpperCase();
        if (cmd === 'SCRIPT' && args[1] === 'LOAD') {
          return Promise.resolve('mocksha');
        }
        if (cmd === 'EVALSHA' || cmd === 'EVAL') {
          const key = String(args[2] ?? 'k');
          const count = (store.get(key) ?? 0) + 1;
          store.set(key, count);
          return Promise.resolve([count, 60]);
        }
        return Promise.resolve([0, 1]);
      }),
      ping: vi.fn().mockResolvedValue('PONG'),
      on: vi.fn(),
    },
    redisConnection: {},
  };
});

vi.mock('../../api/db/index.js', () => ({
  getPool: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
    waitingCount: 0,
    totalCount: 1,
  })),
  getReadPool: vi.fn(),
  initSchema: vi.fn(),
  closeDb: vi.fn(),
}));

import app from '../../api/app.js';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 5001;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((res) => server.close(() => res()));
});

describe('App 安全中间件', () => {
  it('GET /api/health 应返回轻量存活 JSON（不暴露 engine 拓扑）', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data?.status).toBe('ok');
    expect(json.data?.engine).toBeUndefined();
  });

  it('响应应含 helmet 安全头', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.headers.get('x-content-type-options')).toBeTruthy();
  });

  it('GET /api/v1/data/history 无参数应返回 4xx', async () => {
    const res = await fetch(`${baseUrl}/api/v1/data/history`);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('未知路由应返回 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown-route-xyz`);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error?.code).toBe('NOT_FOUND');
  });

  it('GET /api/metrics 应返回 Prometheus 文本', async () => {
    const res = await fetch(`${baseUrl}/api/metrics`);
    expect(res.ok).toBe(true);
    const text = await res.text();
    expect(text.length).toBeGreaterThan(10);
  });
});
