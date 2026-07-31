import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { mockLogger } from '../../helpers/mockFactories.js';

// vi.hoisted 保证 loggerMocks 在 vi.mock 工厂执行前已绑定
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

// RedisStore 可在"成功/抛错"间切换：成功时捕获 rateLimit 调用参数，
// 抛错时模拟 Redis 不可用（P0-05 fail-closed）
const redisStoreMocks = vi.hoisted(() => ({
  throwOnConstruct: false,
}));

// 捕获 rateLimit 调用参数，使 keyGenerator 等纯函数可在测试中直接调用
vi.mock('express-rate-limit', () => ({
  default: vi.fn((opts: Record<string, unknown>) => ({ __options: opts })),
}));

// RedisStore 成功/失败双路径
vi.mock('rate-limit-redis', () => ({
  RedisStore: vi.fn(() => {
    if (redisStoreMocks.throwOnConstruct) {
      throw new Error('Redis connection refused');
    }
    return { sendCommand: vi.fn() };
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

// Mock prom-client 避免 Prometheus 注册冲突
vi.mock('prom-client', () => ({
  default: {
    Counter: vi.fn().mockImplementation(() => ({
      inc: vi.fn(),
      labels: vi.fn().mockReturnThis(),
    })),
    Gauge: vi.fn().mockImplementation(() => ({
      set: vi.fn(),
      inc: vi.fn(),
    })),
    Histogram: vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
    })),
  },
}));

// 默认（Redis 可用）路径：模块静态加载一次，捕获 __options
import {
  apiLimiter,
  computeLimiter,
  adminLimiter,
  loginLimiter,
} from '../../../packages/backend/src/utils/rateLimiter.js';

interface LimiterOptions {
  keyGenerator?: (req: Request) => string;
  max?: number;
  windowMs?: number;
}

type LimiterHandler = (req: Request, res: Response, next: NextFunction) => void;

const computeOpts = (computeLimiter as unknown as { __options: LimiterOptions }).__options;
const loginOpts = (loginLimiter as unknown as { __options: LimiterOptions }).__options;
const apiOpts = (apiLimiter as unknown as { __options: LimiterOptions }).__options;
const adminOpts = (adminLimiter as unknown as { __options: LimiterOptions }).__options;

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

function callMiddleware(middleware: (req: Request, res: Response, next: NextFunction) => void): {
  res: ReturnType<typeof makeResponse>;
  next: ReturnType<typeof vi.fn>;
} {
  const req = makeRequest();
  const res = makeResponse();
  const next = vi.fn();
  middleware(req, res, next);
  return { res, next };
}

function encodeJwtPayload(payload: object): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

const hashKey = (prefix: string, value: string): string =>
  `${prefix}:${crypto.createHash('sha256').update(value).digest('hex').slice(0, 16)}`;

describe('rateLimiter — keyGenerator（Redis 可用路径）', () => {
  // P0-XX：JWT 感知键生成器——已认证用户按 userId:ip 组合键限流，
  // 避免 NAT/企业代理后多用户共享同一 IP 限流桶。
  it.each([
    {
      name: 'computeRateLimitKey: req.user 优先于 tenantId/JWT/API Key',
      opts: computeOpts,
      overrides: {
        user: { sub: 'user-xyz' },
        tenantId: 'org-123',
        headers: { 'x-api-key': 'bpk_live_test123' },
      },
      expected: 'user-xyz:127.0.0.1',
    },
    {
      name: 'computeRateLimitKey: tenantId 优先于 JWT/API Key/IP',
      opts: computeOpts,
      overrides: { tenantId: 'org-123' },
      expected: 'tenant:org-123',
    },
    {
      name: 'computeRateLimitKey: Bearer JWT tenant_id 优先于 IP',
      opts: computeOpts,
      overrides: {
        headers: {
          authorization: `Bearer header.${encodeJwtPayload({ tenant_id: 'tenant-from-jwt' })}.sig`,
        },
      },
      expected: 'tenant:tenant-from-jwt',
    },
    {
      name: 'computeRateLimitKey: Bearer JWT sub 作为 fallback',
      opts: computeOpts,
      overrides: {
        headers: { authorization: `Bearer header.${encodeJwtPayload({ sub: 'user-abc' })}.sig` },
      },
      expected: 'user:user-abc',
    },
    {
      name: 'computeRateLimitKey: x-api-key 哈希后作为 key',
      opts: computeOpts,
      overrides: { headers: { 'x-api-key': 'bpk_live_test123' } },
      expected: hashKey('apikey', 'bpk_live_test123'),
    },
    {
      name: 'computeRateLimitKey: 无任何标识时 fallback 到 IP',
      opts: computeOpts,
      overrides: {},
      expected: '127.0.0.1',
    },
    {
      name: 'authRateLimitKey: body.username 优先',
      opts: loginOpts,
      overrides: { body: { username: 'alice' } },
      expected: 'user:alice',
    },
    {
      name: 'authRateLimitKey: apiKey 哈希后作为 key',
      opts: loginOpts,
      overrides: { body: { apiKey: 'bpk_live_key' } },
      expected: hashKey('apikey', 'bpk_live_key'),
    },
    {
      name: 'authRateLimitKey: refreshToken 哈希后作为 key',
      opts: loginOpts,
      overrides: { body: { refreshToken: 'rt-abc-123' } },
      expected: hashKey('refresh', 'rt-abc-123'),
    },
    {
      name: 'authRateLimitKey: 无 body 标识时 fallback 到 IP',
      opts: loginOpts,
      overrides: {},
      expected: '127.0.0.1',
    },
    {
      name: 'jwtAwareKeyGenerator (apiLimiter): 已认证用户按 userId:ip 组合键',
      opts: apiOpts,
      overrides: { user: { sub: 'user-abc' } },
      expected: 'user-abc:127.0.0.1',
    },
    {
      name: 'jwtAwareKeyGenerator (apiLimiter): 未认证回退到 ip: 前缀',
      opts: apiOpts,
      overrides: {},
      expected: 'ip:127.0.0.1',
    },
    {
      name: 'jwtAwareKeyGenerator (adminLimiter): 已认证用户按 userId:ip 组合键',
      opts: adminOpts,
      overrides: { user: { sub: 'admin-1' } },
      expected: 'admin-1:127.0.0.1',
    },
    {
      name: 'jwtAwareKeyGenerator (adminLimiter): 未认证回退到 ip: 前缀',
      opts: adminOpts,
      overrides: {},
      expected: 'ip:127.0.0.1',
    },
  ])('$name', ({ opts, overrides, expected }) => {
    expect(opts.keyGenerator!(makeRequest(overrides))).toBe(expected);
  });
});

// P0-05 单元测试：Redis 不可用时限流 fail-closed
// 企业理由：生产环境多实例部署时，内存存储会导致每实例独立计数，
// 实际限流上限 = 配置值 × 实例数，等同无限流。必须 fail-closed (503)。
// 测试策略：mock RedisStore 构造抛错（模拟 Redis 不可用），验证非 admin 限流器
// 返回 503 + RFC 7807 错误格式；admin 限流器仍降级到 rateLimit（passOnStoreError=true）。
// 因 redisAvailable 在模块加载期判定，此组通过 vi.resetModules() + 动态 import 重新加载模块。
describe('P0-05: Redis 不可用 → 限流 fail-closed (503)', () => {
  let mod: typeof import('../../../packages/backend/src/utils/rateLimiter.js');

  beforeAll(async () => {
    redisStoreMocks.throwOnConstruct = true;
    vi.resetModules();
    mod = await import('../../../packages/backend/src/utils/rateLimiter.js');
  });

  afterAll(() => {
    redisStoreMocks.throwOnConstruct = false;
  });

  it.each([
    {
      name: 'apiLimiter 应返回 503 + RFC 7807 错误格式',
      limiter: 'apiLimiter',
      problemJson: true,
      instance: true,
    },
    {
      name: 'computeLimiter 应返回 503',
      limiter: 'computeLimiter',
      problemJson: false,
      instance: false,
    },
  ])('$name', ({ limiter, problemJson, instance }) => {
    const { res, next } = callMiddleware(mod[limiter] as unknown as LimiterHandler);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();

    if (problemJson) {
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
    }

    if (instance) {
      const body = res.body as { error: { instance: string } };
      expect(body.error.instance).toBe('/api/test');
    }
  });

  it('adminLimiter 应降级到 rateLimit（passOnStoreError=true）', () => {
    const opts = (mod.adminLimiter as unknown as { __options?: Record<string, unknown> }).__options;
    expect(opts).toBeDefined();
    expect(opts?.passOnStoreError).toBe(true);
  });
});
