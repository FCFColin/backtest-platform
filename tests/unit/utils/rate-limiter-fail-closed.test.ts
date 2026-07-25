/**
 * P0-05 单元测试：Redis 不可用时限流 fail-closed
 *
 * 企业理由：生产环境多实例部署时，内存存储会导致每实例独立计数，
 * 实际限流上限 = 配置值 × 实例数，等同无限流。必须 fail-closed (503)。
 *
 * 测试策略：
 *   - mock RedisStore 构造抛错（模拟 Redis 不可用）
 *   - 验证非 admin 限流器返回 503 + RFC 7807 错误格式
 *   - 验证 admin 限流器仍降级到内存存储（passOnStoreError=true）
 */

import { describe, it, expect, vi } from 'vitest';
import { mockLogger } from '../../helpers/mockFactories.js';

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// 捕获 rateLimit 调用参数
vi.mock('express-rate-limit', () => ({
  default: vi.fn((opts: Record<string, unknown>) => ({ __options: opts })),
}));

// RedisStore 构造抛错——模拟 Redis 不可用
vi.mock('rate-limit-redis', () => ({
  RedisStore: vi.fn(() => {
    throw new Error('Redis connection refused');
  }),
}));

vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  appRedis: { call: vi.fn() },
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: { COMPUTE_RATE_LIMIT_MAX: 10 },
}));

// Mock prom-client
vi.mock('prom-client', () => ({
  default: {
    Counter: vi.fn().mockImplementation(() => ({
      inc: vi.fn(),
    })),
    Gauge: vi.fn().mockImplementation(() => ({
      set: vi.fn(),
    })),
    Histogram: vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
    })),
  },
}));

import {
  apiLimiter,
  computeLimiter,
  adminLimiter,
} from '../../../packages/backend/src/utils/rateLimiter.js';
import type { Request, Response, NextFunction } from 'express';

function makeRequest(overrides: Record<string, unknown> = {}): Request {
  return {
    headers: {},
    ip: '127.0.0.1',
    path: '/api/test',
    ...overrides,
  } as unknown as Request;
}

function makeResponse(): Response & { statusCode: number; body: unknown } {
  const res = {
    status: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    statusCode: 200,
    body: null as unknown,
  };
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  return res as unknown as Response & { statusCode: number; body: unknown };
}

function callMiddleware(
  middleware: (req: Request, res: Response, next: NextFunction) => void,
): { res: ReturnType<typeof makeResponse>; next: ReturnType<typeof vi.fn> } {
  const req = makeRequest();
  const res = makeResponse();
  const next = vi.fn();
  middleware(req, res, next);
  return { res, next };
}

describe('P0-05: Redis 不可用 → 限流 fail-closed (503)', () => {
  it('apiLimiter 应返回 503 + RFC 7807 错误格式', () => {
    const { res, next } = callMiddleware(
      apiLimiter as unknown as (req: Request, res: Response, next: NextFunction) => void,
    );

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.header).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          type: 'https://backtest.platform/errors/service-unavailable',
          status: 503,
          code: 'SERVICE_UNAVAILABLE',
        }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('computeLimiter 应返回 503', () => {
    const { res, next } = callMiddleware(
      computeLimiter as unknown as (req: Request, res: Response, next: NextFunction) => void,
    );

    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  it('adminLimiter 应降级到 rateLimit（passOnStoreError=true）', () => {
    // adminLimiter 有 passOnStoreError=true，应使用 rateLimit（__options 存在）
    const opts = (adminLimiter as unknown as { __options?: Record<string, unknown> }).__options;
    expect(opts).toBeDefined();
    expect(opts?.passOnStoreError).toBe(true);
  });

  it('503 响应应包含 instance 字段（请求路径）', () => {
    const { res } = callMiddleware(
      apiLimiter as unknown as (req: Request, res: Response, next: NextFunction) => void,
    );

    const body = res.body as { error: { instance: string } };
    expect(body.error.instance).toBe('/api/test');
  });
});
