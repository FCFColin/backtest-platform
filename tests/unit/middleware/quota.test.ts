import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redisModuleMock } from '../../helpers/redisFixture.js';

const mocks = vi.hoisted(() => ({
  getOrg: vi.fn(),
  getMonthlyUsage: vi.fn(),
  recordUsage: vi.fn(),
  quotaEnforcementFailures: { inc: vi.fn() },
}));

vi.mock('../../../packages/backend/src/application/org/membershipService.js', () => ({
  getOrg: mocks.getOrg,
}));
vi.mock('../../../packages/backend/src/application/billing/usageService.js', () => ({
  getMonthlyUsage: mocks.getMonthlyUsage,
  recordUsage: mocks.recordUsage,
}));
vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => redisModuleMock);
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
import type { Request } from 'express';
import { enforceQuota, enforceOrgActive } from '../../../packages/backend/src/middleware/quota.js';
import { createMockResponse } from '../../helpers/expressMocks.js';
import { expectProblem } from '../../helpers/routeAssertions.js';

const TENANT = '11111111-1111-1111-1111-111111111111';

async function callQuota(req: Record<string, unknown>) {
  const res = createMockResponse();
  const next = vi.fn();
  await enforceQuota('backtest')({ body: {}, ...req } as unknown as Request, res, next);
  return { res, next };
}

beforeEach(() => vi.clearAllMocks());

describe('enforceQuota', () => {
  it.each([
    ['平台管理员无租户上下文放行（break-glass）', { user: { platform_admin: true } }, true, false],
    [
      '平台管理员有租户上下文放行（break-glass）',
      { tenantId: TENANT, user: { platform_admin: true } },
      true,
      false,
    ],
  ])('%s', async (_n, req, pass, getOrgCalled) => {
    const { next } = await callQuota(req);
    if (pass) expect(next).toHaveBeenCalled();
    expect(mocks.getOrg).toHaveBeenCalledTimes(getOrgCalled ? 1 : 0);
  });

  it('普通用户无租户上下文时 fail-closed 返回 400 NO_ACTIVE_TENANT（不得绕过配额）', async () => {
    const { res, next } = await callQuota({ user: {} });
    expectProblem(res, 'NO_ACTIVE_TENANT', 400);
    expect(next).not.toHaveBeenCalled();
    expect(mocks.getOrg).not.toHaveBeenCalled();
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

  it.each<[string, () => void, number, string, string]>([
    [
      'P0-04: getOrg 抛错时 fail-closed 返回 503（不放行）',
      () => mocks.getOrg.mockRejectedValueOnce(new Error('DB error')),
      503,
      'SERVICE_TEMPORARILY_UNAVAILABLE',
      'org_query_failed',
    ],
    [
      'P0-04: 用量校验抛错时 fail-closed 返回 503（不放行）',
      () => {
        mocks.getOrg.mockResolvedValueOnce({ plan: 'free' });
        mocks.getMonthlyUsage.mockRejectedValueOnce(new Error('usage check failed'));
      },
      503,
      'SERVICE_TEMPORARILY_UNAVAILABLE',
      'usage_check_failed',
    ],
    [
      '组织停用时返回 402 ORG_SUSPENDED（不放行）并计量',
      () => mocks.getOrg.mockResolvedValueOnce({ status: 'suspended' }),
      402,
      'ORG_SUSPENDED',
      'org_suspended',
    ],
  ])('%s', async (_name, setup, status, code, reason) => {
    setup();
    const { res, next } = await callQuota({
      tenantId: TENANT,
      user: {},
      body: { tickers: ['A'] },
      path: '/x',
    });
    expectProblem(res, code, status);
    expect(next).not.toHaveBeenCalled();
    expect(mocks.quotaEnforcementFailures.inc).toHaveBeenCalledWith(
      expect.objectContaining({ quota_key: 'backtest', reason }),
    );
  });
});

describe('enforceOrgActive', () => {
  async function callOrgActive(req: Record<string, unknown>) {
    const res = createMockResponse();
    const next = vi.fn();
    enforceOrgActive()({ body: {}, ...req } as unknown as Request, res, next);
    // getOrgStatus 在内部 async 调用中执行，冲刷微任务后再断言
    await new Promise((r) => setTimeout(r, 0));
    return { res, next };
  }

  it.each([
    ['平台管理员免查组织直接放行', { user: { platform_admin: true } }, undefined, 0],
    ['无租户上下文放行（后续路由自带鉴权）', { user: {} }, undefined, 0],
    ['组织正常时放行', { tenantId: TENANT, user: {} }, { plan: 'pro' }, 1],
  ])('%s', async (_n, req, org, getOrgCalls) => {
    if (org) mocks.getOrg.mockResolvedValueOnce(org);
    const { next } = await callOrgActive(req);
    expect(next).toHaveBeenCalled();
    expect(mocks.getOrg).toHaveBeenCalledTimes(getOrgCalls);
  });

  it.each([
    ['组织停用→402', { status: 'suspended' }, 402, 'ORG_SUSPENDED', 'org_suspended'],
    ['组织查询失败→503', 'error', 503, 'SERVICE_TEMPORARILY_UNAVAILABLE', 'org_query_failed'],
  ])('%s', async (_n, org, status, code, reason) => {
    if (org === 'error') mocks.getOrg.mockRejectedValueOnce(new Error('DB error'));
    else mocks.getOrg.mockResolvedValueOnce(org);
    const { res, next } = await callOrgActive({ tenantId: TENANT, user: {} });
    expectProblem(res, code, status);
    expect(next).not.toHaveBeenCalled();
    expect(mocks.quotaEnforcementFailures.inc).toHaveBeenCalledWith(
      expect.objectContaining({ quota_key: 'org_active', reason }),
    );
  });
});
