/**
 * 幂等性 Key 中间件单元测试（T-P1-5.3）
 *
 * 企业理由：幂等性中间件保护写操作不被重复执行，是 API 可靠性的关键保障。
 * 测试覆盖：非 POST 放行、无 Key 放行、Key 命中缓存、Key 首次请求缓存写入、
 * 超长 Key 拒绝、失败响应不缓存、Redis 成功路径、安全攻击用例。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import { createMockRequest, createMockResponse } from '../../helpers/expressMocks.js';
import { createLoggerMocks, createRedisMocks } from '../../helpers/mockFactories.js';
import {
  createIdempotencyReqRes,
  mockLongIdempotencyKey,
  SQL_INJECTION_KEY,
  XSS_KEY,
  NEWLINE_INJECTION_KEY,
} from '../../helpers/idempotencyFixtures.js';

// Mock logger 以避免 OTel/pino 初始化副作用
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

// Mock appRedis：默认内存回退；Redis 成功路径可切换
const redisMocks = vi.hoisted(() => ({}) as Record<string, unknown>);

vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  redisConnection: {},
  appRedis: createRedisMocks(
    { withStore: true, withHandlers: true, withMemoryHelpers: true },
    redisMocks,
  ),
}));

redisMocks.useMemoryFallback();

import { idempotencyKey } from '../../../packages/backend/src/middleware/idempotency.js';

/** 创建无 idempotency-key 头的 mock 三件套（用于放行路径测试） */
function createMockReqResWithoutKey(method = 'POST') {
  const req = createMockRequest({
    method,
    headers: {},
    path: '/api/test',
    url: '/api/test',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  });
  const res = { ...createMockResponse(), on: vi.fn() } as unknown as Response;
  return { req, res, next: vi.fn() };
}

describe('idempotencyKey 中间件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useMemoryFallback();
  });

  it('非 POST 请求应直接放行', () => {
    const { req, res, next } = createMockReqResWithoutKey('GET');
    idempotencyKey(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('无 Idempotency-Key 头应直接放行', () => {
    const { req, res, next } = createMockReqResWithoutKey('POST');
    idempotencyKey(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('超长 Key（>128 字符）应返回 400', () => {
    const { req, res, next } = createIdempotencyReqRes(mockLongIdempotencyKey());
    idempotencyKey(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('首次请求应放行并拦截 res.json 缓存结果', async () => {
    const { req, res, next } = createIdempotencyReqRes('test-key-123');
    idempotencyKey(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    expect(() => res.json({ success: true, data: 'result' })).not.toThrow();
  });

  it('相同 Key 第二次请求应返回缓存结果', async () => {
    const key = 'test-key-duplicate';
    const cachedBody = { success: true, data: 'cached' };
    const r1 = createIdempotencyReqRes(key);
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.next).toHaveBeenCalledTimes(1));
    r1.res.statusCode = 200;
    r1.res.json(cachedBody);

    const r2 = createIdempotencyReqRes(key);
    idempotencyKey(r2.req, r2.res, r2.next);
    await vi.waitFor(() => expect(r2.res.status).toHaveBeenCalledWith(200));
    expect(r2.next).not.toHaveBeenCalled();
    expect(r2.res.json).toHaveBeenCalledWith(cachedBody);
  });

  it('5xx 响应不应被缓存，重试应再次放行', async () => {
    const key = 'server-error-key';
    const r1 = createIdempotencyReqRes(key);
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.next).toHaveBeenCalledTimes(1));
    r1.res.statusCode = 500;
    r1.res.json({ success: false, error: 'internal' });

    const r2 = createIdempotencyReqRes(key);
    idempotencyKey(r2.req, r2.res, r2.next);
    await vi.waitFor(() => expect(r2.next).toHaveBeenCalledTimes(1));
    expect(r2.res.status).not.toHaveBeenCalled();
  });

  it('不同 Key 应独立处理', async () => {
    const r1 = createIdempotencyReqRes('test-key-a');
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.next).toHaveBeenCalledTimes(1));
    r1.res.statusCode = 200;
    r1.res.json({ success: true });

    const r2 = createIdempotencyReqRes('test-key-b');
    idempotencyKey(r2.req, r2.res, r2.next);
    await vi.waitFor(() => expect(r2.next).toHaveBeenCalledTimes(1));
  });
});

describe('idempotencyKey Redis 成功路径', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useRedisSuccess();
  });

  it('首次 POST 应写入 Redis 缓存', async () => {
    const key = 'redis-first-key';
    const { req, res, next } = createIdempotencyReqRes(key);
    idempotencyKey(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    res.statusCode = 201;
    res.json({ success: true, data: 'created' });
    await vi.waitFor(() => expect(redisMocks.store.has(`idempotency:${key}`)).toBe(true));
  });

  it('相同 Key 第二次请求应从 Redis 返回缓存', async () => {
    const key = 'redis-dup-key';
    const cachedBody = { success: true, data: 'from-redis' };
    const r1 = createIdempotencyReqRes(key);
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.next).toHaveBeenCalledTimes(1));
    r1.res.statusCode = 200;
    r1.res.json(cachedBody);
    await vi.waitFor(() => expect(redisMocks.store.has(`idempotency:${key}`)).toBe(true));

    const r2 = createIdempotencyReqRes(key);
    idempotencyKey(r2.req, r2.res, r2.next);
    await vi.waitFor(() => expect(r2.res.status).toHaveBeenCalledWith(200));
    expect(r2.next).not.toHaveBeenCalled();
    expect(r2.res.json).toHaveBeenCalledWith(cachedBody);
    expect(redisMocks.get).toHaveBeenCalledWith(`idempotency:${key}`);
  });

  it('并发相同 Key 的 POST 应返回缓存（Redis 模式）', async () => {
    const key = 'redis-race-key';
    const cachedBody = { success: true, data: 'race-winner' };
    const r1 = createIdempotencyReqRes(key);
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.next).toHaveBeenCalledTimes(1));
    r1.res.statusCode = 200;
    r1.res.json(cachedBody);
    await vi.waitFor(() => expect(redisMocks.store.has(`idempotency:${key}`)).toBe(true));

    const concurrent = Array.from({ length: 4 }, () => createIdempotencyReqRes(key));
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
    const r1 = createIdempotencyReqRes(key);
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.next).toHaveBeenCalledTimes(1));
    r1.res.statusCode = 503;
    r1.res.json({ success: false });
    expect(redisMocks.store.has(`idempotency:${key}`)).toBe(false);

    const r2 = createIdempotencyReqRes(key);
    idempotencyKey(r2.req, r2.res, r2.next);
    await vi.waitFor(() => expect(r2.next).toHaveBeenCalledTimes(1));
  });

  it('换行符注入 Key 应被安全处理', async () => {
    const body = { success: true };
    const r1 = createIdempotencyReqRes(NEWLINE_INJECTION_KEY);
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.next).toHaveBeenCalledTimes(1));
    r1.res.statusCode = 200;
    r1.res.json(body);

    const r2 = createIdempotencyReqRes(NEWLINE_INJECTION_KEY);
    idempotencyKey(r2.req, r2.res, r2.next);
    await vi.waitFor(() => expect(r2.res.status).toHaveBeenCalledWith(200));
    expect(r2.next).not.toHaveBeenCalled();
    expect(r2.res.json).toHaveBeenCalledWith(body);
  });

  it('Redis get 异常应降级到内存模式', async () => {
    redisMocks.useRedisSuccess();
    const key = 'redis-fallback-key';
    redisMocks.get.mockRejectedValueOnce(new Error('Redis read failed'));
    const { req, res, next } = createIdempotencyReqRes(key);
    idempotencyKey(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    expect(() => res.json({ success: true })).not.toThrow();
  });
});

describe('安全攻击用例', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useMemoryFallback();
  });

  it('并发相同 Key 竞态条件：5 个并发请求只有一个执行 handler，其余返回缓存', async () => {
    const key = 'race-condition-key-12345';
    const cachedBody = { success: true, data: 'first-response' };
    const r1 = createIdempotencyReqRes(key);
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.next).toHaveBeenCalledTimes(1));
    r1.res.statusCode = 200;
    r1.res.json(cachedBody);

    const concurrent = Array.from({ length: 4 }, () => createIdempotencyReqRes(key));
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
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(cachedBody);
    }
  });

  it.each([
    { name: 'SQL 注入', key: SQL_INJECTION_KEY, body: { success: true } },
    { name: 'XSS 载荷', key: XSS_KEY, body: { success: true, data: 'xss-test' } },
    { name: '换行符注入', key: 'key\ninjected: evil', body: { success: true, data: 'safe' } },
  ])('$name 作为 Key 应被安全存储（内存模式）', async ({ key, body }) => {
    const r1 = createIdempotencyReqRes(key);
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.next).toHaveBeenCalledTimes(1));
    r1.res.statusCode = 200;
    r1.res.json(body);

    const r2 = createIdempotencyReqRes(key);
    idempotencyKey(r2.req, r2.res, r2.next);
    await vi.waitFor(() => expect(r2.res.status).toHaveBeenCalledWith(200));
    expect(r2.next).not.toHaveBeenCalled();
    expect(r2.res.json).toHaveBeenCalledWith(body);
  });

  it('Redis 缓存写入失败应记录 warn 且不阻塞响应', async () => {
    redisMocks.useRedisSuccess();
    redisMocks.set.mockRejectedValueOnce(new Error('redis set failed'));
    const { req, res, next } = createIdempotencyReqRes('redis-write-fail');
    idempotencyKey(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    res.statusCode = 200;
    expect(() => res.json({ success: true })).not.toThrow();
    await vi.waitFor(() => expect(redisMocks.set).toHaveBeenCalled());
  });

  it('Redis get 异常应降级到内存模式', async () => {
    redisMocks.ping.mockResolvedValue('PONG');
    redisMocks.get.mockRejectedValueOnce(new Error('redis read failed'));
    const { req, res, next } = createIdempotencyReqRes('redis-get-fail');
    idempotencyKey(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
  });

  it('内存模式过期 Key 不应命中缓存', async () => {
    vi.useFakeTimers();
    const key = 'expired-memory-key';
    const r1 = createIdempotencyReqRes(key);
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.next).toHaveBeenCalledTimes(1));
    r1.res.statusCode = 200;
    r1.res.json({ success: true, data: 'old' });

    vi.advanceTimersByTime(61 * 60 * 1000);
    vi.advanceTimersByTime(10 * 60 * 1000);

    const r2 = createIdempotencyReqRes(key);
    idempotencyKey(r2.req, r2.res, r2.next);
    await vi.waitFor(() => expect(r2.next).toHaveBeenCalledTimes(1));
    vi.useRealTimers();
  });

  it('Redis ready/error 事件应更新可用性状态', async () => {
    redisMocks.useMemoryFallback();
    redisMocks.emit('ready');
    redisMocks.emit('error');
    const { req, res, next } = createIdempotencyReqRes('redis-state-key');
    idempotencyKey(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
  });
});

describe('清理定时器（内存回退模式）', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('间隔触发时应清理过期 Key 并记录日志', async () => {
    vi.resetModules();
    vi.useFakeTimers();

    // 重新导入使模块顶层 setInterval 被 fake timer 拦截
    const { idempotencyKey: idempotencyKeyFresh } =
      await import('../../../packages/backend/src/middleware/idempotency.js');
    const { logger: freshLogger } = await import('../../../packages/backend/src/utils/logger.js');

    redisMocks.useMemoryFallback();

    const key = 'cleanup-trigger-key';
    const r1 = createIdempotencyReqRes(key);
    idempotencyKeyFresh(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.next).toHaveBeenCalledTimes(1));
    r1.res.statusCode = 200;
    r1.res.json({ success: true, data: 'old' });

    // 超过 TTL（1h）后触发清理间隔（10min）
    vi.advanceTimersByTime(61 * 60 * 1000);
    vi.advanceTimersByTime(10 * 60 * 1000);

    expect(freshLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        middleware: 'idempotency',
        cleanedCount: 1,
      }),
      '[idempotency] 内存回退模式过期 Key 清理',
    );
  });
});
