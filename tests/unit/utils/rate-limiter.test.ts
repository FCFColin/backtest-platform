import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
// RedisStore 可在"成功/抛错"间切换：抛错时模拟 Redis 不可用（P0-05 fail-closed）
const redisStoreMocks = vi.hoisted(() => ({ throwOnConstruct: false }));

vi.mock('express-rate-limit', () => ({
  default: vi.fn((opts: Record<string, unknown>) => ({ __options: opts })),
}));
vi.mock('rate-limit-redis', () => ({
  RedisStore: vi.fn(() => {
    if (redisStoreMocks.throwOnConstruct) throw new Error('Redis connection refused');
    return { sendCommand: vi.fn() };
  }),
}));
vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  appRedis: { call: vi.fn() },
}));
vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: { COMPUTE_RATE_LIMIT_MAX: 10 },
}));
vi.mock('prom-client', () => ({
  default: {
    Counter: vi.fn().mockImplementation(() => ({ inc: vi.fn(), labels: vi.fn().mockReturnThis() })),
    Gauge: vi.fn().mockImplementation(() => ({ set: vi.fn(), inc: vi.fn() })),
    Histogram: vi.fn().mockImplementation(() => ({ observe: vi.fn() })),
  },
}));

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
  return { headers: {}, ip: '127.0.0.1', path: '/api/test', ...overrides } as unknown as Request;
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
function callMiddleware(middleware: LimiterHandler): {
  res: ReturnType<typeof makeResponse>;
  next: ReturnType<typeof vi.fn>;
} {
  const res = makeResponse();
  const next = vi.fn();
  middleware(makeRequest(), res, next);
  return { res, next };
}
function encodeJwtPayload(payload: object): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}
const hashKey = (prefix: string, value: string): string =>
  `${prefix}:${crypto.createHash('sha256').update(value).digest('hex').slice(0, 16)}`;

describe('rateLimiter — keyGenerator（Redis 可用路径）', () => {
  // P0-XX：JWT 感知键生成器——已认证用户按 userId:ip 组合键限流，
  it.each([
    [
      'computeRateLimitKey: req.user 优先于 tenantId/JWT/API Key',
      computeOpts,
      {
        user: { sub: 'user-xyz' },
        tenantId: 'org-123',
        headers: { 'x-api-key': 'bpk_live_test123' },
      },
      'user-xyz:127.0.0.1',
    ],
    [
      'computeRateLimitKey: tenantId 优先于 JWT/API Key/IP',
      computeOpts,
      { tenantId: 'org-123' },
      'tenant:org-123',
    ],
    [
      'computeRateLimitKey: Bearer token 按原始 token 哈希分桶（不信任可伪造的 JWT payload）',
      computeOpts,
      {
        headers: {
          authorization: `Bearer header.${encodeJwtPayload({ tenant_id: 'tenant-from-jwt' })}.sig`,
        },
      },
      hashKey('token', `header.${encodeJwtPayload({ tenant_id: 'tenant-from-jwt' })}.sig`),
    ],
    [
      'computeRateLimitKey: 不同 token 永不落入同一桶（伪造 token 无法污染目标配额）',
      computeOpts,
      { headers: { authorization: `Bearer header.${encodeJwtPayload({ sub: 'user-abc' })}.sig` } },
      hashKey('token', `header.${encodeJwtPayload({ sub: 'user-abc' })}.sig`),
    ],
    [
      'computeRateLimitKey: x-api-key 哈希后作为 key',
      computeOpts,
      { headers: { 'x-api-key': 'bpk_live_test123' } },
      hashKey('apikey', 'bpk_live_test123'),
    ],
    ['computeRateLimitKey: 无任何标识时 fallback 到 IP', computeOpts, {}, '127.0.0.1'],
    [
      'authRateLimitKey: body.username 优先',
      loginOpts,
      { body: { username: 'alice' } },
      'user:alice',
    ],
    [
      'authRateLimitKey: apiKey 哈希后作为 key',
      loginOpts,
      { body: { apiKey: 'bpk_live_key' } },
      hashKey('apikey', 'bpk_live_key'),
    ],
    [
      'authRateLimitKey: refreshToken 哈希后作为 key',
      loginOpts,
      { body: { refreshToken: 'rt-abc-123' } },
      hashKey('refresh', 'rt-abc-123'),
    ],
    ['authRateLimitKey: 无 body 标识时 fallback 到 IP', loginOpts, {}, '127.0.0.1'],
    [
      'jwtAwareKeyGenerator (apiLimiter): 已认证用户按 userId:ip 组合键',
      apiOpts,
      { user: { sub: 'user-abc' } },
      'user-abc:127.0.0.1',
    ],
    ['jwtAwareKeyGenerator (apiLimiter): 未认证回退到 ip: 前缀', apiOpts, {}, 'ip:127.0.0.1'],
    [
      'jwtAwareKeyGenerator (adminLimiter): 已认证用户按 userId:ip 组合键',
      adminOpts,
      { user: { sub: 'admin-1' } },
      'admin-1:127.0.0.1',
    ],
    ['jwtAwareKeyGenerator (adminLimiter): 未认证回退到 ip: 前缀', adminOpts, {}, 'ip:127.0.0.1'],
  ])('$name', (_n, opts, overrides, expected) => {
    expect(opts.keyGenerator!(makeRequest(overrides))).toBe(expected);
  });
});

// P0-05 单元测试：Redis 不可用时限流 fail-closed
// 企业理由：生产环境多实例部署时，内存存储会导致每实例独立计数，
// 实际限流上限 = 配置值 × 实例数，等同无限流。必须 fail-closed (503)。
// 测试策略：mock RedisStore 构造抛错（模拟 Redis 不可用），验证非 admin 限流器
// 返回 503 + RFC 7807 错误格式；admin 限流器仍降级到 rateLimit（passOnStoreError=true）。
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
    ['apiLimiter 应返回 503 + RFC 7807 错误格式', 'apiLimiter', true, true],
    ['computeLimiter 应返回 503', 'computeLimiter', false, false],
  ])('$name', (_n, limiter, problemJson, instance) => {
    const { res, next } = callMiddleware(
      mod[limiter as keyof typeof mod] as unknown as LimiterHandler,
    );
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
