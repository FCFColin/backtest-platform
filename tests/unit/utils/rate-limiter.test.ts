/**
 * rateLimiter.ts 单元测试
 *
 * 企业理由：限流器 keyGenerator 决定多租户/多用户场景下的限流粒度，
 * 错误的 key 会导致租户间相互影响或绕过限流。测试覆盖：
 * - createRateLimiterStore：Redis Store 创建失败时降级到内存存储（catch 路径）
 * - computeRateLimitKey：tenantId / Bearer JWT(tenant_id) / x-api-key 三条分支
 * - authRateLimitKey：body.username 优先于 apiKey / refreshToken
 *
 * 权衡：mock express-rate-limit 捕获 keyGenerator 选项以直接测试纯函数逻辑，
 * mock RedisStore 抛错以覆盖降级路径；不测试 rateLimit 中间件本身（属于集成测试）。
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

// RedisStore 构造抛错 — 覆盖 createRateLimiterStore 的 catch 降级路径
vi.mock('rate-limit-redis', () => ({
  RedisStore: vi.fn(() => {
    throw new Error('Redis not available in test');
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

describe('rateLimiter', () => {
  it('RedisStore 创建失败时应降级到内存存储并记录警告', () => {
    // 模块加载时 6 个 limiter 均尝试创建 RedisStore 并全部抛错
    expect(loggerMocks.warn).toHaveBeenCalledTimes(6);
    expect(loggerMocks.warn.mock.calls[0][0]).toContain('rl:api:');
    expect(loggerMocks.warn.mock.calls[0][0]).toContain('降级到内存存储');
  });

  it('computeRateLimitKey - 请求对象携带 tenantId 时应按租户限流', () => {
    const req = makeRequest({ tenantId: 'tenant-xyz' });
    expect(computeOpts.keyGenerator!(req)).toBe('tenant:tenant-xyz');
  });

  it('computeRateLimitKey - Bearer JWT 含 tenant_id 时应按租户限流', () => {
    const token = `h.${encodeJwtPayload({ tenant_id: 'jwt-t1' })}.s`;
    const req = makeRequest({ headers: { authorization: `Bearer ${token}` } });
    expect(computeOpts.keyGenerator!(req)).toBe('tenant:jwt-t1');
  });

  it('computeRateLimitKey - x-api-key 应使用 sha256 前 16 位', () => {
    const req = makeRequest({ headers: { 'x-api-key': 'sk-123' } });
    const expected = `apikey:${crypto.createHash('sha256').update('sk-123').digest('hex').slice(0, 16)}`;
    expect(computeOpts.keyGenerator!(req)).toBe(expected);
  });

  it('authRateLimitKey - body.username 应优先于 apiKey/refreshToken', () => {
    const req = makeRequest({
      body: { username: 'alice', apiKey: 'k', refreshToken: 'r' },
    });
    expect(loginOpts.keyGenerator!(req)).toBe('user:alice');
  });
});
