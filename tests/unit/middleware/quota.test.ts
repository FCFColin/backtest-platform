/**
 * 配额中间件单元测试（ADR-037 / P0-04 fail-closed）
 *
 * 企业理由：配额是变现与滥用防护的执行点，必须验证：
 * 1. 无租户/平台管理员放行（本地零摩擦 + 运维豁免）
 * 2. 标的数超计划上限返回 422
 * 3. 月度用量达上限返回 402
 * 4. 正常放行并计量一次
 * 5. P0-04：Redis 不可用时 fail-closed 返回 503（不放行）
 * 6. P0-04：getOrg 失败时 fail-closed 返回 503（不放行）
 * 7. P0-04：Lua 原子脚本用于配额计数
 *
 * Mock 策略：mock membershipService.getOrg、usageService、appRedis、metrics。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger } from '../../helpers/mockFactories.js';

const mocks = vi.hoisted(() => ({
  getOrg: vi.fn(),
  getMonthlyUsage: vi.fn(),
  recordUsage: vi.fn(),
  appRedis: {
    eval: vi.fn(),
    ttl: vi.fn(),
    ping: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    incr: vi.fn(),
    decr: vi.fn(),
    expire: vi.fn(),
    info: vi.fn(),
    on: vi.fn(),
    quit: vi.fn(),
  },
  quotaEnforcementFailures: {
    inc: vi.fn(),
  },
  loggerMocks: {
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
  },
}));

vi.mock('../../../packages/backend/src/application/org/membershipService.js', () => ({
  getOrg: mocks.getOrg,
}));
vi.mock('../../../packages/backend/src/application/billing/usageService.js', () => ({
  getMonthlyUsage: mocks.getMonthlyUsage,
  recordUsage: mocks.recordUsage,
}));
vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  appRedis: mocks.appRedis,
  isSentinelMode: false,
  getRedisHealth: vi.fn().mockResolvedValue(true),
  markRedisUnhealthy: vi.fn(),
  buildRedisBaseOptions: vi.fn(() => ({ host: 'localhost', port: 6379 })),
  checkSentinelMaster: vi.fn().mockResolvedValue({ isMaster: null, connectedSlaves: null }),
}));
vi.mock('../../../packages/backend/src/utils/metrics.js', () => ({
  quotaEnforcementFailures: mocks.quotaEnforcementFailures,
  httpRequestDurationMicroseconds: { observe: vi.fn() },
  httpRequestsTotal: { inc: vi.fn() },
  recordEngineCall: vi.fn(),
  recordEngineUnavailable: vi.fn(),
  engineCallDuration: { observe: vi.fn() },
  registerCircuitBreakerMetrics: vi.fn(),
  getPrometheusRegister: vi.fn(() => ({ contentType: 'text/plain', metrics: vi.fn() })),
}));
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(mocks.loggerMocks),
}));

import type { Request } from 'express';

import { enforceQuota } from '../../../packages/backend/src/middleware/quota.js';

const TENANT = '11111111-1111-1111-1111-111111111111';

function mockRes() {
  const res = {
    statusCode: 200,
    status: vi.fn((c: number) => {
      res.statusCode = c;
      return res;
    }),
    header: vi.fn(() => res),
    json: vi.fn(() => res),
    send: vi.fn(() => res),
  };
  return res;
}

beforeEach(() => vi.clearAllMocks());

describe('enforceQuota', () => {
  it('无租户上下文放行', async () => {
    const next = vi.fn();
    const res = mockRes();
    await enforceQuota('backtest')({ body: {} } as unknown as Request, res, next);
    expect(next).toHaveBeenCalled();
    expect(mocks.getOrg).not.toHaveBeenCalled();
  });

  it('平台管理员放行', async () => {
    const next = vi.fn();
    const res = mockRes();
    await enforceQuota('backtest')(
      { tenantId: TENANT, user: { platform_admin: true }, body: {} } as unknown as Request,
      res,
      next,
    );
    expect(next).toHaveBeenCalled();
    expect(mocks.getOrg).not.toHaveBeenCalled();
  });

  it('标的数超 free 上限(10)返回 422', async () => {
    mocks.getOrg.mockResolvedValueOnce({ plan: 'free' });
    const next = vi.fn();
    const res = mockRes();
    const body = { tickers: Array.from({ length: 11 }, (_, i) => `T${i}`) };
    await enforceQuota('backtest')(
      { tenantId: TENANT, user: {}, body } as unknown as Request,
      res,
      next,
    );
    expect(res.status).toHaveBeenCalledWith(422);
    expect(next).not.toHaveBeenCalled();
  });

  it('月度用量达上限返回 402', async () => {
    mocks.getOrg.mockResolvedValueOnce({ plan: 'free' });
    mocks.appRedis.eval.mockResolvedValueOnce([1, 100]); // Redis 配额未超
    mocks.getMonthlyUsage.mockResolvedValueOnce(100); // free 上限 100
    const next = vi.fn();
    const res = mockRes();
    await enforceQuota('backtest')(
      { tenantId: TENANT, user: {}, body: { tickers: ['A'] }, path: '/x' } as unknown as Request,
      res,
      next,
    );
    expect(res.status).toHaveBeenCalledWith(402);
    expect(next).not.toHaveBeenCalled();
  });

  it('未超限放行并计量', async () => {
    mocks.getOrg.mockResolvedValueOnce({ plan: 'pro' });
    mocks.appRedis.eval.mockResolvedValueOnce([1, 100000]); // Redis 配额未超
    mocks.getMonthlyUsage.mockResolvedValueOnce(3);
    const next = vi.fn();
    const res = mockRes();
    await enforceQuota('backtest')(
      {
        tenantId: TENANT,
        user: {},
        body: { tickers: ['A', 'B'] },
        path: '/x',
      } as unknown as Request,
      res,
      next,
    );
    expect(next).toHaveBeenCalled();
    expect(mocks.recordUsage).toHaveBeenCalledWith(TENANT, 'backtest', 1, { path: '/x' });
  });

  it('enterprise 无限月度配额时不查询用量直接放行', async () => {
    mocks.getOrg.mockResolvedValueOnce({ plan: 'enterprise' });
    mocks.appRedis.eval.mockResolvedValueOnce([1, 100000]); // Redis 配额未超
    const next = vi.fn();
    const res = mockRes();
    await enforceQuota('backtest')(
      { tenantId: TENANT, user: {}, body: { tickers: ['A'] }, path: '/x' } as unknown as Request,
      res,
      next,
    );
    expect(next).toHaveBeenCalled();
    expect(mocks.getMonthlyUsage).not.toHaveBeenCalled();
  });

  it('请求体无 ticker 字段时 tickerCount=0 放行', async () => {
    mocks.getOrg.mockResolvedValueOnce({ plan: 'free' });
    mocks.appRedis.eval.mockResolvedValueOnce([1, 100000]); // Redis 配额未超
    const next = vi.fn();
    const res = mockRes();
    await enforceQuota('backtest')(
      { tenantId: TENANT, user: {}, body: { name: 'test' } } as unknown as Request,
      res,
      next,
    );
    expect(next).toHaveBeenCalled();
    expect(mocks.recordUsage).toHaveBeenCalledWith(TENANT, 'backtest', 1, { path: undefined });
  });

  it('P0-04: getOrg 抛错时 fail-closed 返回 503（不放行）', async () => {
    mocks.getOrg.mockRejectedValueOnce(new Error('DB error'));
    const next = vi.fn();
    const res = mockRes();
    await enforceQuota('backtest')(
      {
        tenantId: TENANT,
        user: {},
        body: { tickers: ['A', 'B', 'C'] },
        path: '/x',
      } as unknown as Request,
      res,
      next,
    );
    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
    expect(mocks.quotaEnforcementFailures.inc).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'org_query_failed' }),
    );
  });

  it('P0-04: Redis 不可用时 fail-closed 返回 503（不放行）', async () => {
    mocks.getOrg.mockResolvedValueOnce({ plan: 'free' });
    mocks.appRedis.eval.mockRejectedValueOnce(new Error('Redis connection refused'));
    const next = vi.fn();
    const res = mockRes();
    await enforceQuota('backtest')(
      {
        tenantId: TENANT,
        user: {},
        body: { tickers: ['A'] },
        path: '/x',
      } as unknown as Request,
      res,
      next,
    );
    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
    expect(mocks.quotaEnforcementFailures.inc).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'redis_unavailable' }),
    );
  });

  it('P0-04: Redis 超限时返回 429 + Retry-After', async () => {
    mocks.getOrg.mockResolvedValueOnce({ plan: 'free' });
    mocks.appRedis.eval.mockResolvedValueOnce([101, 100]); // current=101, limit=100
    mocks.appRedis.ttl.mockResolvedValueOnce(45);
    const next = vi.fn();
    const res = mockRes();
    await enforceQuota('backtest')(
      {
        tenantId: TENANT,
        user: {},
        body: { tickers: ['A'] },
        path: '/x',
      } as unknown as Request,
      res,
      next,
    );
    expect(res.status).toHaveBeenCalledWith(429);
    expect(next).not.toHaveBeenCalled();
  });
});
