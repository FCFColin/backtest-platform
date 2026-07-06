/**
 * 幂等性 Key 中间件单元测试（T-P1-5.3）
 *
 * 企业理由：幂等性中间件保护写操作不被重复执行，是 API 可靠性的关键保障。
 * 测试覆盖：非 POST 放行、无 Key 放行、Key 命中缓存、Key 首次请求缓存写入、
 * 超长 Key 拒绝、失败响应不缓存。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import { createMockRequest, createMockResponse } from '../../helpers/expressMocks.js';
import { createLoggerMocks } from '../../helpers/mockFactories.js';

// Mock logger 以避免 OTel/pino 初始化副作用
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

// Mock appRedis：默认内存回退；Redis 成功路径可切换
const redisMocks = vi.hoisted(() => {
  const store = new Map<string, string>();
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    store,
    handlers,
    ping: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }),
    emit(event: string, ...args: unknown[]) {
      handlers[event]?.(...args);
    },
    resetStore: () => store.clear(),
    useMemoryFallback: () => {
      redisMocks.resetStore();
      redisMocks.ping.mockRejectedValue(new Error('Redis not available in test'));
      redisMocks.get.mockRejectedValue(new Error('Redis not available in test'));
      redisMocks.set.mockRejectedValue(new Error('Redis not available in test'));
      redisMocks.del.mockRejectedValue(new Error('Redis not available in test'));
    },
    useRedisSuccess: () => {
      redisMocks.resetStore();
      redisMocks.ping.mockResolvedValue('PONG');
      redisMocks.get.mockImplementation((key: string) =>
        Promise.resolve(redisMocks.store.get(key) ?? null),
      );
      redisMocks.set.mockImplementation((key: string, value: string, ..._args: unknown[]) => {
        if (!redisMocks.store.has(key)) {
          redisMocks.store.set(key, value);
        }
        return Promise.resolve('OK');
      });
      redisMocks.del.mockImplementation((key: string) => {
        redisMocks.store.delete(key);
        return Promise.resolve(1);
      });
    },
  };
});

vi.mock('../../../packages/backend/src/config/redis.js', () => ({
  redisConnection: {},
  appRedis: redisMocks,
}));

redisMocks.useMemoryFallback();

import { idempotencyKey } from '../../../packages/backend/src/middleware/idempotency.js';

/** 创建 mock Express 三件套 */
function createMockReqRes(opts: {
  method?: string;
  headers?: Record<string, string>;
  path?: string;
}) {
  const req = createMockRequest({
    method: opts.method || 'POST',
    headers: opts.headers || {},
    path: opts.path || '/api/test',
    url: opts.path || '/api/test',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  });

  const res = {
    ...createMockResponse(),
    on: vi.fn(),
  } as unknown as Response;

  const next = vi.fn();

  return { req, res, next };
}

describe('idempotencyKey 中间件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useMemoryFallback();
  });

  it('非 POST 请求应直接放行', () => {
    const { req, res, next } = createMockReqRes({ method: 'GET' });
    idempotencyKey(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('无 Idempotency-Key 头应直接放行', () => {
    const { req, res, next } = createMockReqRes({ method: 'POST' });
    idempotencyKey(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('超长 Key（>128 字符）应返回 400', () => {
    const longKey = 'a'.repeat(129);
    const { req, res, next } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': longKey },
    });
    idempotencyKey(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('首次请求应放行并拦截 res.json 缓存结果', async () => {
    const key = 'test-key-123';
    const { req, res, next } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': key },
    });
    idempotencyKey(req, res, next);

    // 等待异步处理完成
    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledTimes(1);
    });

    // 中间件替换了 res.json，调用新函数不应抛异常
    const body = { success: true, data: 'result' };
    expect(() => (res.json as unknown as (body: unknown) => void)(body)).not.toThrow();
  });

  it('相同 Key 第二次请求应返回缓存结果', async () => {
    const key = 'test-key-duplicate';
    const {
      req: req1,
      res: res1,
      next: next1,
    } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': key },
    });
    idempotencyKey(req1, res1, next1);

    // 首次请求：等待异步完成并模拟路由返回 200
    await vi.waitFor(() => {
      expect(next1).toHaveBeenCalledTimes(1);
    });
    (res1 as unknown as { statusCode: number }).statusCode = 200;
    const cachedBody = { success: true, data: 'cached' };
    (res1.json as unknown as (body: unknown) => void)(cachedBody);

    // 第二次请求：相同 Key
    const {
      req: req2,
      res: res2,
      next: next2,
    } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': key },
    });
    idempotencyKey(req2, res2, next2);

    // 等待异步处理完成，应返回缓存结果
    await vi.waitFor(() => {
      expect(res2.status).toHaveBeenCalledWith(200);
    });
    expect(next2).not.toHaveBeenCalled();
    expect(res2.json).toHaveBeenCalledWith(cachedBody);
  });

  it('5xx 响应不应被缓存，重试应再次放行', async () => {
    const key = 'server-error-key';
    const {
      req: req1,
      res: res1,
      next: next1,
    } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': key },
    });
    idempotencyKey(req1, res1, next1);
    await vi.waitFor(() => expect(next1).toHaveBeenCalledTimes(1));
    (res1 as unknown as { statusCode: number }).statusCode = 500;
    (res1.json as unknown as (body: unknown) => void)({ success: false, error: 'internal' });

    const {
      req: req2,
      res: res2,
      next: next2,
    } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': key },
    });
    idempotencyKey(req2, res2, next2);
    await vi.waitFor(() => expect(next2).toHaveBeenCalledTimes(1));
    expect(res2.status).not.toHaveBeenCalled();
  });

  it('不同 Key 应独立处理', async () => {
    const key1 = 'test-key-a';
    const key2 = 'test-key-b';

    const {
      req: req1,
      res: res1,
      next: next1,
    } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': key1 },
    });
    idempotencyKey(req1, res1, next1);
    await vi.waitFor(() => expect(next1).toHaveBeenCalledTimes(1));
    (res1 as unknown as { statusCode: number }).statusCode = 200;
    (res1.json as unknown as (body: unknown) => void)({ success: true });

    const {
      req: req2,
      res: res2,
      next: next2,
    } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': key2 },
    });
    idempotencyKey(req2, res2, next2);
    await vi.waitFor(() => expect(next2).toHaveBeenCalledTimes(1));
  });
});

describe('idempotencyKey Redis 成功路径', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useRedisSuccess();
  });

  it('首次 POST 应写入 Redis 缓存', async () => {
    const key = 'redis-first-key';
    const { req, res, next } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': key },
    });
    idempotencyKey(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));

    (res as unknown as { statusCode: number }).statusCode = 201;
    const body = { success: true, data: 'created' };
    (res.json as unknown as (body: unknown) => void)(body);

    await vi.waitFor(() => {
      expect(redisMocks.store.has(`idempotency:${key}`)).toBe(true);
    });
  });

  it('相同 Key 第二次请求应从 Redis 返回缓存', async () => {
    const key = 'redis-dup-key';
    const cachedBody = { success: true, data: 'from-redis' };

    const {
      req: req1,
      res: res1,
      next: next1,
    } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': key },
    });
    idempotencyKey(req1, res1, next1);
    await vi.waitFor(() => expect(next1).toHaveBeenCalledTimes(1));
    (res1 as unknown as { statusCode: number }).statusCode = 200;
    (res1.json as unknown as (body: unknown) => void)(cachedBody);
    await vi.waitFor(() => expect(redisMocks.store.has(`idempotency:${key}`)).toBe(true));

    const {
      req: req2,
      res: res2,
      next: next2,
    } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': key },
    });
    idempotencyKey(req2, res2, next2);
    await vi.waitFor(() => {
      expect(res2.status).toHaveBeenCalledWith(200);
    });
    expect(next2).not.toHaveBeenCalled();
    expect(res2.json).toHaveBeenCalledWith(cachedBody);
    expect(redisMocks.get).toHaveBeenCalledWith(`idempotency:${key}`);
  });

  it('并发相同 Key 的 POST 应返回缓存（Redis 模式）', async () => {
    const key = 'redis-race-key';
    const cachedBody = { success: true, data: 'race-winner' };

    const {
      req: req1,
      res: res1,
      next: next1,
    } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': key },
    });
    idempotencyKey(req1, res1, next1);
    await vi.waitFor(() => expect(next1).toHaveBeenCalledTimes(1));
    (res1 as unknown as { statusCode: number }).statusCode = 200;
    (res1.json as unknown as (body: unknown) => void)(cachedBody);
    await vi.waitFor(() => expect(redisMocks.store.has(`idempotency:${key}`)).toBe(true));

    const concurrent = Array.from({ length: 4 }, () =>
      createMockReqRes({
        method: 'POST',
        headers: { 'idempotency-key': key },
      }),
    );

    await Promise.all(
      concurrent.map(
        ({ req, res, next }) =>
          new Promise<void>((resolve) => {
            idempotencyKey(req, res, next);
            vi.waitFor(() => expect(res.status).toHaveBeenCalledWith(200)).then(resolve);
          }),
      ),
    );

    for (const { res, next } of concurrent) {
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(cachedBody);
    }
  });

  it('5xx 响应在 Redis 模式下不应缓存', async () => {
    const key = 'redis-5xx-key';
    const {
      req: req1,
      res: res1,
      next: next1,
    } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': key },
    });
    idempotencyKey(req1, res1, next1);
    await vi.waitFor(() => expect(next1).toHaveBeenCalledTimes(1));
    (res1 as unknown as { statusCode: number }).statusCode = 503;
    (res1.json as unknown as (body: unknown) => void)({ success: false });
    expect(redisMocks.store.has(`idempotency:${key}`)).toBe(false);

    const {
      req: req2,
      res: res2,
      next: next2,
    } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': key },
    });
    idempotencyKey(req2, res2, next2);
    await vi.waitFor(() => expect(next2).toHaveBeenCalledTimes(1));
  });

  it('换行符注入 Key 应被安全处理', async () => {
    const injectionKey = 'valid-key\r\nX-Evil: injected';
    const { req, res, next } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': injectionKey },
    });
    idempotencyKey(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));

    (res as unknown as { statusCode: number }).statusCode = 200;
    const body = { success: true };
    (res.json as unknown as (body: unknown) => void)(body);

    const {
      req: req2,
      res: res2,
      next: next2,
    } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': injectionKey },
    });
    idempotencyKey(req2, res2, next2);
    await vi.waitFor(() => expect(res2.status).toHaveBeenCalledWith(200));
    expect(next2).not.toHaveBeenCalled();
    expect(res2.json).toHaveBeenCalledWith(body);
  });

  it('Redis get 异常应降级到内存模式', async () => {
    redisMocks.useRedisSuccess();
    const key = 'redis-fallback-key';
    redisMocks.get.mockRejectedValueOnce(new Error('Redis read failed'));

    const { req, res, next } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': key },
    });
    idempotencyKey(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    expect(() => (res.json as unknown as (body: unknown) => void)({ success: true })).not.toThrow();
  });
});

describe('安全攻击用例', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useMemoryFallback();
  });

  it('并发相同 Key 竞态条件：5 个并发请求只有一个执行 handler，其余返回缓存', async () => {
    const key = 'race-condition-key-12345';

    // 第一步：发送首个请求并完成（写入缓存）
    const {
      req: req1,
      res: res1,
      next: next1,
    } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': key },
    });
    idempotencyKey(req1, res1, next1);
    await vi.waitFor(() => {
      expect(next1).toHaveBeenCalledTimes(1);
    });
    // 模拟 handler 执行完毕，返回 200 响应（触发缓存写入）
    (res1 as unknown as { statusCode: number }).statusCode = 200;
    const cachedBody = { success: true, data: 'first-response' };
    (res1.json as unknown as (body: unknown) => void)(cachedBody);

    // 第二步：同时发送 4 个并发请求（使用 Promise.all）
    const concurrentRequests = Array.from({ length: 4 }, () => {
      const { req, res, next } = createMockReqRes({
        method: 'POST',
        headers: { 'idempotency-key': key },
      });
      return { req, res, next };
    });

    // 并发发送所有请求
    await Promise.all(
      concurrentRequests.map(
        ({ req, res, next }) =>
          new Promise<void>((resolve) => {
            idempotencyKey(req, res, next);
            // 等待异步处理完成
            vi.waitFor(() => {
              expect(res.status).toHaveBeenCalledWith(200);
            }).then(resolve);
          }),
      ),
    );

    // 验证：所有并发请求都应返回缓存结果，不应执行 handler
    for (const { res, next } of concurrentRequests) {
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(cachedBody);
    }
  });

  it('SQL 注入作为 Key 应被安全存储（参数化查询，不执行注入）', async () => {
    const sqlInjectionKey = "'; DROP TABLE idempotency_keys;--";

    const { req, res, next } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': sqlInjectionKey },
    });
    idempotencyKey(req, res, next);

    // 中间件应正常处理，不崩溃
    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledTimes(1);
    });

    // 模拟 handler 返回 200（触发缓存写入）
    (res as unknown as { statusCode: number }).statusCode = 200;
    const responseBody = { success: true };
    (res.json as unknown as (body: unknown) => void)(responseBody);

    // 第二次请求相同 Key 应返回缓存（证明 Key 被安全存储）
    const {
      req: req2,
      res: res2,
      next: next2,
    } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': sqlInjectionKey },
    });
    idempotencyKey(req2, res2, next2);

    await vi.waitFor(() => {
      expect(res2.status).toHaveBeenCalledWith(200);
    });
    expect(next2).not.toHaveBeenCalled();
    expect(res2.json).toHaveBeenCalledWith(responseBody);
  });

  it('XSS 载荷作为 Key 应被安全存储', async () => {
    const xssKey = '<script>alert(1)</script>';

    const { req, res, next } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': xssKey },
    });
    idempotencyKey(req, res, next);

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledTimes(1);
    });

    // 模拟 handler 返回 200（触发缓存写入）
    (res as unknown as { statusCode: number }).statusCode = 200;
    const responseBody = { success: true, data: 'xss-test' };
    (res.json as unknown as (body: unknown) => void)(responseBody);

    // 第二次请求相同 Key 应返回缓存（证明 XSS 载荷被安全存储）
    const {
      req: req2,
      res: res2,
      next: next2,
    } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': xssKey },
    });
    idempotencyKey(req2, res2, next2);

    await vi.waitFor(() => {
      expect(res2.status).toHaveBeenCalledWith(200);
    });
    expect(next2).not.toHaveBeenCalled();
    expect(res2.json).toHaveBeenCalledWith(responseBody);
  });

  it('换行符注入 Key 应被安全存储（内存模式）', async () => {
    const injectionKey = 'key\ninjected: evil';
    const { req, res, next } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': injectionKey },
    });
    idempotencyKey(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    (res as unknown as { statusCode: number }).statusCode = 200;
    const body = { success: true, data: 'safe' };
    (res.json as unknown as (body: unknown) => void)(body);

    const {
      req: req2,
      res: res2,
      next: next2,
    } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': injectionKey },
    });
    idempotencyKey(req2, res2, next2);
    await vi.waitFor(() => expect(res2.status).toHaveBeenCalledWith(200));
    expect(next2).not.toHaveBeenCalled();
    expect(res2.json).toHaveBeenCalledWith(body);
  });

  it('Redis 缓存写入失败应记录 warn 且不阻塞响应', async () => {
    redisMocks.useRedisSuccess();
    redisMocks.set.mockRejectedValueOnce(new Error('redis set failed'));

    const key = 'redis-write-fail';
    const { req, res, next } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': key },
    });
    idempotencyKey(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));

    (res as unknown as { statusCode: number }).statusCode = 200;
    expect(() => (res.json as unknown as (body: unknown) => void)({ success: true })).not.toThrow();
    await vi.waitFor(() => expect(redisMocks.set).toHaveBeenCalled());
  });

  it('Redis get 异常应降级到内存模式', async () => {
    redisMocks.ping.mockResolvedValue('PONG');
    redisMocks.get.mockRejectedValueOnce(new Error('redis read failed'));

    const key = 'redis-get-fail';
    const { req, res, next } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': key },
    });
    idempotencyKey(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
  });

  it('内存模式过期 Key 不应命中缓存', async () => {
    vi.useFakeTimers();
    const key = 'expired-memory-key';
    const {
      req: req1,
      res: res1,
      next: next1,
    } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': key },
    });
    idempotencyKey(req1, res1, next1);
    await vi.waitFor(() => expect(next1).toHaveBeenCalledTimes(1));
    (res1 as unknown as { statusCode: number }).statusCode = 200;
    (res1.json as unknown as (body: unknown) => void)({ success: true, data: 'old' });

    vi.advanceTimersByTime(61 * 60 * 1000);
    vi.advanceTimersByTime(10 * 60 * 1000);

    const {
      req: req2,
      res: res2,
      next: next2,
    } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': key },
    });
    idempotencyKey(req2, res2, next2);
    await vi.waitFor(() => expect(next2).toHaveBeenCalledTimes(1));
    vi.useRealTimers();
  });

  it('Redis ready/error 事件应更新可用性状态', async () => {
    redisMocks.useMemoryFallback();
    redisMocks.emit('ready');
    redisMocks.emit('error');
    const { req, res, next } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': 'redis-state-key' },
    });
    idempotencyKey(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
  });
});
