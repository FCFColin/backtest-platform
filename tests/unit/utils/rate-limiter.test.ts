import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { redisModuleMock } from '../../helpers/redisFixture.js';
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
vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => redisModuleMock);
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
  const path = (overrides.path as string | undefined) ?? '/api/test';
  return {
    headers: {},
    ip: '127.0.0.1',
    path,
    originalUrl: path,
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
  const computeGroup = (p: string, inner: string): string => `${p}:${inner}`;
  it.each([
    [
      'computeRateLimitKey: 忽略可伪造的 req.user，按原始凭证哈希分桶',
      computeOpts,
      {
        path: '/api/v1/backtest',
        user: { sub: 'user-xyz' },
        headers: { 'x-api-key': 'bpk_live_test123' },
      },
      computeGroup('/api/v1/backtest', hashKey('apikey', 'bpk_live_test123')),
    ],
    [
      'computeRateLimitKey: Bearer token 按原始 token 哈希分桶（不信任可伪造的 JWT payload）',
      computeOpts,
      {
        path: '/api/v1/backtest',
        headers: {
          authorization: `Bearer header.${encodeJwtPayload({ tenant_id: 'tenant-from-jwt' })}.sig`,
        },
      },
      computeGroup(
        '/api/v1/backtest',
        hashKey('token', `header.${encodeJwtPayload({ tenant_id: 'tenant-from-jwt' })}.sig`),
      ),
    ],
    [
      'computeRateLimitKey: 不同 token 永不落入同一桶（伪造 token 无法污染目标配额）',
      computeOpts,
      {
        path: '/api/v1/backtest',
        headers: { authorization: `Bearer header.${encodeJwtPayload({ sub: 'user-abc' })}.sig` },
      },
      computeGroup(
        '/api/v1/backtest',
        hashKey('token', `header.${encodeJwtPayload({ sub: 'user-abc' })}.sig`),
      ),
    ],
    [
      'computeRateLimitKey: x-api-key 哈希后作为 key',
      computeOpts,
      { path: '/api/v1/backtest', headers: { 'x-api-key': 'bpk_live_test123' } },
      computeGroup('/api/v1/backtest', hashKey('apikey', 'bpk_live_test123')),
    ],
    [
      'computeRateLimitKey: 无任何标识时 fallback 到 IP',
      computeOpts,
      { path: '/api/v1/backtest' },
      computeGroup('/api/v1/backtest', '127.0.0.1'),
    ],
    [
      'computeRateLimitKey: 长前缀子路径独立分组，不被 /backtest 前缀吞并',
      computeOpts,
      { path: '/api/v1/backtest-optimizer' },
      computeGroup('/api/v1/backtest-optimizer', '127.0.0.1'),
    ],
    [
      'computeRateLimitKey: 非计算路径归入 other 组',
      computeOpts,
      { path: '/api/v1/users' },
      computeGroup('other', '127.0.0.1'),
    ],
    [
      'authRateLimitKey: body.username 优先',
      loginOpts,
      { body: { username: 'alice' } },
      'user:alice',
    ],
    [
      'authRateLimitKey: username 归一化（大小写+空白变体共享同一桶）',
      loginOpts,
      { body: { username: '  Alice ' } },
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
      'computeRateLimitKey (apiLimiter): 不信任 JWT payload 的 user，按原始凭证哈希分桶',
      apiOpts,
      { user: { sub: 'user-abc' }, headers: { authorization: 'Bearer abc.def.ghi' } },
      hashKey('token', 'abc.def.ghi'),
    ],
    ['computeRateLimitKey (apiLimiter): 无凭证时按 IP 分桶', apiOpts, {}, '127.0.0.1'],
    [
      'computeRateLimitKey (adminLimiter): 不信任 JWT payload 的 user，按原始凭证哈希分桶',
      adminOpts,
      { user: { sub: 'admin-1' }, headers: { authorization: 'Bearer abc.def.ghi' } },
      hashKey('token', 'abc.def.ghi'),
    ],
    ['computeRateLimitKey (adminLimiter): 无凭证时按 IP 分桶', adminOpts, {}, '127.0.0.1'],
  ])('$name', (_n, opts, overrides, expected) => {
    expect(opts.keyGenerator!(makeRequest(overrides))).toBe(expected);
  });
});

// P0-05 单元测试：Redis 不可用时限流 fail-closed
// 企业理由：生产环境多实例部署时，内存存储会导致每实例独立计数，
// 实际限流上限 = 配置值 × 实例数，等同无限流。必须 fail-closed (503)。
// 策略：mock RedisStore 构造抛错（模拟 Redis 不可用），验证限流器统一
// 返回 503 + RFC 7807 错误格式；admin 限流器不再例外 fail-open（fail-closed 全局一致）。
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
    ['adminLimiter 应返回 503（fail-closed，不再例外 fail-open）', 'adminLimiter', true, true],
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
});
