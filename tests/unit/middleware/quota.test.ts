import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  quotaEnforcementFailures: { inc: vi.fn() },
  loggerMocks: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
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
  logger: mocks.loggerMocks,
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
async function callQuota(req: Record<string, unknown>) {
  const res = mockRes();
  const next = vi.fn();
  await enforceQuota('backtest')({ body: {}, ...req } as unknown as Request, res, next);
  return { res, next };
}

beforeEach(() => vi.clearAllMocks());

describe('enforceQuota', () => {
  it.each([
    ['无租户上下文放行', {}, true, false],
    ['平台管理员放行', { tenantId: TENANT, user: { platform_admin: true } }, true, false],
  ])('%s', async (_n, req, pass, getOrgCalled) => {
    const { next } = await callQuota(req);
    if (pass) expect(next).toHaveBeenCalled();
    expect(mocks.getOrg).toHaveBeenCalledTimes(getOrgCalled ? 1 : 0);
  });

  it.each([
    [
      '标的数超 free 上限(10)返回 422',
      { plan: 'free' },
      { tickers: Array.from({ length: 11 }, (_, i) => `T${i}`) },
      undefined,
      422,
      false,
    ],
    ['月度用量达上限返回 402', { plan: 'free' }, { tickers: ['A'] }, 100, 402, false],
    ['未超限放行并计量', { plan: 'pro' }, { tickers: ['A', 'B'] }, 3, undefined, true],
    [
      'enterprise 无限月度配额时不查询用量直接放行',
      { plan: 'enterprise' },
      { tickers: ['A'] },
      undefined,
      undefined,
      true,
    ],
    [
      '请求体无 ticker 字段时 tickerCount=0 放行',
      { plan: 'free' },
      { name: 'test' },
      undefined,
      undefined,
      true,
    ],
  ])('%s', async (_n, org, body, usage, status, pass) => {
    mocks.getOrg.mockResolvedValueOnce(org);
    if (usage !== undefined) mocks.getMonthlyUsage.mockResolvedValueOnce(usage);
    const { res, next } = await callQuota({ tenantId: TENANT, user: {}, body, path: '/x' });
    if (status) expect(res.status).toHaveBeenCalledWith(status);
    if (pass) {
      expect(next).toHaveBeenCalled();
      expect(mocks.recordUsage).toHaveBeenCalledWith(TENANT, 'backtest', 1, { path: '/x' });
    }
    if (!pass && status) expect(next).not.toHaveBeenCalled();
    if (org.plan === 'enterprise') expect(mocks.getMonthlyUsage).not.toHaveBeenCalled();
  });

  it('P0-04: getOrg 抛错时 fail-closed 返回 503（不放行）', async () => {
    mocks.getOrg.mockRejectedValueOnce(new Error('DB error'));
    const { res, next } = await callQuota({
      tenantId: TENANT,
      user: {},
      body: { tickers: ['A', 'B', 'C'] },
      path: '/x',
    });
    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
    expect(mocks.quotaEnforcementFailures.inc).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'org_query_failed' }),
    );
  });

  it('P0-04: 用量校验抛错时 fail-closed 返回 503（不放行）', async () => {
    mocks.getOrg.mockResolvedValueOnce({ plan: 'free' });
    mocks.getMonthlyUsage.mockRejectedValueOnce(new Error('usage check failed'));
    const { res, next } = await callQuota({
      tenantId: TENANT,
      user: {},
      body: { tickers: ['A'] },
      path: '/x',
    });
    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
    expect(mocks.quotaEnforcementFailures.inc).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'usage_check_failed' }),
    );
  });
});
