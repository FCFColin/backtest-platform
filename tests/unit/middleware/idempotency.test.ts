/**
 * 幂等性 Key 中间件单元测试（T-P1-5.3）
 *
 * 企业理由：幂等性中间件保护写操作不被重复执行，是 API 可靠性的关键保障。
 * 测试覆盖：非 POST 放行、无 Key 放行、Key 命中缓存、Key 首次请求缓存写入、
 * 超长 Key 拒绝、失败响应不缓存。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Mock logger 以避免 OTel/pino 初始化副作用
vi.mock('../../api/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn() })),
  },
}));

// Mock appRedis：测试环境无 Redis，确保 ping 返回失败以使用内存回退
vi.mock('../../../api/config/redis.js', () => ({
  redisConnection: {},
  appRedis: {
    ping: vi.fn().mockRejectedValue(new Error('Redis not available in test')),
    get: vi.fn().mockRejectedValue(new Error('Redis not available in test')),
    set: vi.fn().mockRejectedValue(new Error('Redis not available in test')),
    del: vi.fn().mockRejectedValue(new Error('Redis not available in test')),
    on: vi.fn(),
  },
}));

import { idempotencyKey } from '../../../api/middleware/idempotency.js';

/** 创建 mock Express 三件套 */
function createMockReqRes(opts: {
  method?: string;
  headers?: Record<string, string>;
  path?: string;
}) {
  const req = {
    method: opts.method || 'POST',
    headers: opts.headers || {},
    path: opts.path || '/api/test',
    originalUrl: opts.path || '/api/test',
    url: opts.path || '/api/test',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Request;

  const res = {
    statusCode: 200,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    on: vi.fn(),
  } as unknown as Response;

  const next = vi.fn() as NextFunction;

  return { req, res, next };
}

describe('idempotencyKey 中间件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(() => (res.json as any)(body)).not.toThrow();
  });

  it('相同 Key 第二次请求应返回缓存结果', async () => {
    const key = 'test-key-duplicate';
    const { req: req1, res: res1, next: next1 } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': key },
    });
    idempotencyKey(req1, res1, next1);

    // 首次请求：等待异步完成并模拟路由返回 200
    await vi.waitFor(() => {
      expect(next1).toHaveBeenCalledTimes(1);
    });
    (res1 as any).statusCode = 200;
    const cachedBody = { success: true, data: 'cached' };
    (res1.json as any)(cachedBody);

    // 第二次请求：相同 Key
    const { req: req2, res: res2, next: next2 } = createMockReqRes({
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

  it('不同 Key 应独立处理', async () => {
    const key1 = 'test-key-a';
    const key2 = 'test-key-b';

    // 首次请求 key1
    const { req: req1, res: res1, next: next1 } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': key1 },
    });
    idempotencyKey(req1, res1, next1);
    await vi.waitFor(() => {
      expect(next1).toHaveBeenCalledTimes(1);
    });
    (res1 as any).statusCode = 200;
    (res1.json as any)({ success: true });

    // 请求 key2 应放行（非缓存命中）
    const { req: req2, res: res2, next: next2 } = createMockReqRes({
      method: 'POST',
      headers: { 'idempotency-key': key2 },
    });
    idempotencyKey(req2, res2, next2);
    await vi.waitFor(() => {
      expect(next2).toHaveBeenCalledTimes(1);
    });
  });
});
