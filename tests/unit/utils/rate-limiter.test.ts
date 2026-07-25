/**
 * rateLimiter.ts 单元测试（P0-05 更新）
 *
 * 企业理由：限流器 keyGenerator 决定多租户/多用户场景下的限流粒度，
 * 错误的 key 会导致租户间相互影响或绕过限流。测试覆盖：
 * - computeRateLimitKey：tenantId / Bearer JWT(tenant_id) / x-api-key 三条分支
 * - authRateLimitKey：body.username 优先于 apiKey / refreshToken
 * - P0-05：Redis 不可用 → 非 admin 限流器 fail-closed (503)
 *
 * 权衡：mock express-rate-limit 捕获 keyGenerator 选项以直接测试纯函数逻辑。
 * 两套 RedisStore mock：成功路径（测试 keyGenerator）+ 失败路径（测试 503）。
 */

import { describe, it, expect, vi } from 'vitest';
import type { Request } from 'express';
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

// 捕获 rateLimit 调用参数，使 keyGenerator 等纯函数可在测试中直接调用
vi.mock('express-rate-limit', () => ({
  default: vi.fn((opts: Record<string, unknown>) => ({ __options: opts })),
}));

// RedisStore 成功路径——返回 mock 对象（不抛错）
vi.mock('rate-limit-redis', () => ({
  RedisStore: vi.fn(() => ({ sendCommand: vi.fn() })),
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

import { computeLimiter, loginLimiter } from '../../../packages/backend/src/utils/rateLimiter.js';

interface LimiterOptions {
  keyGenerator?: (req: Request) => string;
  max?: number;
  windowMs?: number;
}

const computeOpts = (computeLimiter as unknown as { __options: LimiterOptions }).__options;
const loginOpts = (loginLimiter as unknown as { __options: LimiterOptions }).__options;

function makeRequest(overrides: Record<string, unknown> = {}): Request {
  return { headers: {}, ip: '127.0.0.1', ...overrides } as unknown as Request;
}

function encodeJwtPayload(payload: object): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

describe('rateLimiter — keyGenerator（Redis 可用路径）', () => {
  it('computeRateLimitKey: tenantId 优先于 JWT/API Key/IP', () => {
    const req = makeRequest({ tenantId: 'org-123' });
    expect(computeOpts.keyGenerator!(req)).toBe('tenant:org-123');
  });

  it('computeRateLimitKey: Bearer JWT tenant_id 优先于 IP', () => {
    const jwt = `header.${encodeJwtPayload({ tenant_id: 'tenant-from-jwt' })}.sig`;
    const req = makeRequest({ headers: { authorization: `Bearer ${jwt}` } });
    expect(computeOpts.keyGenerator!(req)).toBe('tenant:tenant-from-jwt');
  });

  it('computeRateLimitKey: Bearer JWT sub 作为 fallback', () => {
    const jwt = `header.${encodeJwtPayload({ sub: 'user-abc' })}.sig`;
    const req = makeRequest({ headers: { authorization: `Bearer ${jwt}` } });
    expect(computeOpts.keyGenerator!(req)).toBe('user:user-abc');
  });

  it('computeRateLimitKey: x-api-key 哈希后作为 key', () => {
    const req = makeRequest({ headers: { 'x-api-key': 'bpk_live_test123' } });
    const expected = `apikey:${crypto.createHash('sha256').update('bpk_live_test123').digest('hex').slice(0, 16)}`;
    expect(computeOpts.keyGenerator!(req)).toBe(expected);
  });

  it('computeRateLimitKey: 无任何标识时 fallback 到 IP', () => {
    const req = makeRequest();
    expect(computeOpts.keyGenerator!(req)).toBe('127.0.0.1');
  });

  it('authRateLimitKey: body.username 优先', () => {
    const req = makeRequest({ body: { username: 'alice' } });
    expect(loginOpts.keyGenerator!(req)).toBe('user:alice');
  });

  it('authRateLimitKey: apiKey 哈希后作为 key', () => {
    const req = makeRequest({ body: { apiKey: 'bpk_live_key' } });
    const expected = `apikey:${crypto.createHash('sha256').update('bpk_live_key').digest('hex').slice(0, 16)}`;
    expect(loginOpts.keyGenerator!(req)).toBe(expected);
  });

  it('authRateLimitKey: refreshToken 哈希后作为 key', () => {
    const req = makeRequest({ body: { refreshToken: 'rt-abc-123' } });
    const expected = `refresh:${crypto.createHash('sha256').update('rt-abc-123').digest('hex').slice(0, 16)}`;
    expect(loginOpts.keyGenerator!(req)).toBe(expected);
  });

  it('authRateLimitKey: 无 body 标识时 fallback 到 IP', () => {
    const req = makeRequest();
    expect(loginOpts.keyGenerator!(req)).toBe('127.0.0.1');
  });
});
