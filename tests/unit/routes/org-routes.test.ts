/**
 * 组织/计费/运行路由单元测试（ADR-035/036/034）
 *
 * 企业理由：组织、计费与运行历史端点控制租户协作、真实收费与不可变运行记录，
 * 写操作要求 admin（owner/admin），邀请接受仅需登录。Mock 策略：mock 各 service
 * （隔离 DB/Stripe/邮件），在测试 app 内注入 req.tenantId/req.user 模拟鉴权链。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer, type TestRequest } from '../../helpers/expressApp.js';
import { createLoggerMocks, createConfigMocks } from '../../helpers/mockFactories.js';
import type { Router } from 'express';

const mocks = vi.hoisted(() => ({
  svc: {
    isBillingEnabled: vi.fn(),
    createCheckoutSession: vi.fn(),
    createPortalSession: vi.fn(),
    getSubscriptionSummary: vi.fn(),
  },
  membership: {
    getOrg: vi.fn(),
    updateOrgName: vi.fn(),
    listOrgMembers: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
  },
  invitation: {
    createInvitation: vi.fn(),
    listInvitations: vi.fn(),
    revokeInvitation: vi.fn(),
    acceptInvitation: vi.fn(),
  },
  mail: {
    sendInvitationEmail: vi.fn(),
  },
  repo: {
    listRuns: vi.fn(),
    getRun: vi.fn(),
    createRun: vi.fn(),
    deleteRun: vi.fn(),
  },
}));

vi.mock('../../../packages/backend/src/application/billing/billingService.js', () => mocks.svc);
vi.mock(
  '../../../packages/backend/src/application/org/membershipService.js',
  () => mocks.membership,
);
vi.mock(
  '../../../packages/backend/src/application/org/invitationService.js',
  () => mocks.invitation,
);
vi.mock('../../../packages/backend/src/infrastructure/mailService.js', () => mocks.mail);
vi.mock('../../../packages/backend/src/repositories/backtestRunRepo.js', () => mocks.repo);
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

// validate：runRoutes 传空 schema（{}）时透传；org/billing 传真实 zod schema 时按真实语义校验
vi.mock('../../../packages/backend/src/middleware/miscMiddleware.js', () => ({
  validate: (schema: unknown) => (req, res, next) => {
    const result = (
      schema as { safeParse?: (v: unknown) => { success: boolean; data?: unknown } }
    )?.safeParse?.(req.body);
    if (result === undefined) return next();
    if (!result.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR' } });
      return;
    }
    req.body = result.data;
    next();
  },
}));

vi.mock('../../../packages/backend/src/schemas/backtest.js', () => ({
  backtestRunBodySchema: {},
  BacktestRunBody: Object,
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: createConfigMocks({ STRIPE_PUBLISHABLE_KEY: 'pk_test_1' }),
}));

import orgRoutes from '../../../packages/backend/src/routes/orgRoutes.js';
import billingRoutes from '../../../packages/backend/src/routes/billingRoutes.js';
import runRoutes from '../../../packages/backend/src/routes/runRoutes.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '33333333-3333-3333-3333-333333333333';
const MEMBER = '44444444-4444-4444-4444-444444444444';
const ITEM_ID = '22222222-2222-2222-2222-222222222222';
const MOCK_ITEM = { id: ITEM_ID, name: 'Test Run', createdAt: '2024-01-01T00:00:00.000Z' };

async function startAuthedApp(
  mountPath: string,
  routes: Router,
  role = 'admin',
): Promise<TestServer> {
  return startExpressApp((app) => {
    app.use((req: TestRequest, _res, next) => {
      req.tenantId = ORG;
      req.user = { sub: 'user-1', role, tenant_id: ORG, org_role: role };
      next();
    });
    app.use(mountPath, routes);
  });
}

interface Opts {
  role?: string;
  orgRole?: string;
  tenant?: string | null;
}

async function startApp(opts: Opts = {}): Promise<TestServer> {
  return startExpressApp((app) => {
    app.use((req: TestRequest, _res, next) => {
      req.user = {
        sub: USER,
        role: opts.role ?? 'admin',
        tenant_id: opts.tenant ?? ORG,
        org_role: opts.orgRole ?? 'admin',
      };
      if (opts.tenant !== null) req.tenantId = opts.tenant ?? ORG;
      next();
    });
    app.use('/api/v1/orgs', orgRoutes);
  });
}

describe('orgRoutes', () => {
  let server: TestServer;

  beforeEach(() => vi.clearAllMocks());
  afterEach(async () => {
    if (server) await server.close();
  });

  it('GET /current 返回组织信息', async () => {
    mocks.membership.getOrg.mockResolvedValueOnce({
      orgId: ORG,
      name: 'Acme',
      slug: 'acme',
      plan: 'free',
      status: 'active',
    });
    server = await startApp();
    const res = await fetch(`${server.url}/api/v1/orgs/current`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.name).toBe('Acme');
  });

  it('PATCH /current 非 admin 应被拒绝 403', async () => {
    server = await startApp({ role: 'readonly', orgRole: 'readonly' });
    const res = await fetch(`${server.url}/api/v1/orgs/current`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New' }),
    });
    expect(res.status).toBe(403);
    expect(mocks.membership.updateOrgName).not.toHaveBeenCalled();
  });

  it('PATCH /current admin 更新成功', async () => {
    mocks.membership.updateOrgName.mockResolvedValueOnce(true);
    server = await startApp();
    const res = await fetch(`${server.url}/api/v1/orgs/current`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Name' }),
    });
    expect(res.status).toBe(200);
    expect(mocks.membership.updateOrgName).toHaveBeenCalledWith(ORG, 'New Name');
  });

  it('GET /members 返回成员列表', async () => {
    mocks.membership.listOrgMembers.mockResolvedValueOnce([
      { userId: USER, username: 'alice', email: null, role: 'owner', createdAt: 'x' },
    ]);
    server = await startApp();
    const res = await fetch(`${server.url}/api/v1/orgs/members`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(mocks.membership.listOrgMembers).toHaveBeenCalledWith(ORG);
  });

  it('PATCH /members/:id 降级最后一个 owner 返回 409', async () => {
    mocks.membership.updateMemberRole.mockResolvedValueOnce('last_owner');
    server = await startApp();
    const res = await fetch(`${server.url}/api/v1/orgs/members/${MEMBER}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'analyst' }),
    });
    expect(res.status).toBe(409);
  });

  it('DELETE /members/:id 不存在返回 404', async () => {
    mocks.membership.removeMember.mockResolvedValueOnce('not_found');
    server = await startApp();
    const res = await fetch(`${server.url}/api/v1/orgs/members/${MEMBER}`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('POST /invitations 创建并发送邮件返回 201', async () => {
    mocks.invitation.createInvitation.mockResolvedValueOnce({
      id: 'inv1',
      email: 'x@y.com',
      role: 'analyst',
      expiresAt: 'z',
      token: 'tok',
    });
    mocks.membership.getOrg.mockResolvedValueOnce({
      orgId: ORG,
      name: 'Acme',
      slug: 'acme',
      plan: 'free',
      status: 'active',
    });
    mocks.mail.sendInvitationEmail.mockResolvedValueOnce(undefined);
    server = await startApp();
    const res = await fetch(`${server.url}/api/v1/orgs/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'x@y.com', role: 'analyst' }),
    });
    expect(res.status).toBe(201);
    expect(mocks.invitation.createInvitation).toHaveBeenCalledWith(ORG, 'x@y.com', 'analyst', USER);
    expect(mocks.mail.sendInvitationEmail).toHaveBeenCalledWith('x@y.com', 'Acme', 'tok');
  });

  it('POST /invitations 邀请 owner 角色应被校验拒绝 400', async () => {
    server = await startApp();
    const res = await fetch(`${server.url}/api/v1/orgs/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'x@y.com', role: 'owner' }),
    });
    expect(res.status).toBe(400);
    expect(mocks.invitation.createInvitation).not.toHaveBeenCalled();
  });

  it('DELETE /invitations/:id 不存在返回 404', async () => {
    mocks.invitation.revokeInvitation.mockResolvedValueOnce(false);
    server = await startApp();
    const res = await fetch(`${server.url}/api/v1/orgs/invitations/${MEMBER}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(404);
  });

  it('POST /invitations/accept 仅需登录、成功返回组织与角色', async () => {
    mocks.invitation.acceptInvitation.mockResolvedValueOnce({
      ok: true,
      orgId: ORG,
      role: 'analyst',
    });
    server = await startApp({ tenant: null });
    const res = await fetch(`${server.url}/api/v1/orgs/invitations/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'sometoken' }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.orgId).toBe(ORG);
    expect(mocks.invitation.acceptInvitation).toHaveBeenCalledWith('sometoken', USER);
  });

  it('POST /invitations/accept 过期返回 400', async () => {
    mocks.invitation.acceptInvitation.mockResolvedValueOnce({ ok: false, reason: 'expired' });
    server = await startApp({ tenant: null });
    const res = await fetch(`${server.url}/api/v1/orgs/invitations/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'sometoken' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('billingRoutes', () => {
  let server: TestServer;
  beforeEach(() => vi.clearAllMocks());
  afterEach(async () => {
    if (server) await server.close();
  });

  it('GET /subscription 返回启用状态与摘要', async () => {
    mocks.svc.isBillingEnabled.mockReturnValue(true);
    mocks.svc.getSubscriptionSummary.mockResolvedValueOnce({
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    server = await startAuthedApp('/api/v1/billing', billingRoutes);
    const res = await fetch(`${server.url}/api/v1/billing/subscription`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.enabled).toBe(true);
    expect(body.data.publishableKey).toBe('pk_test_1');
    expect(body.data.subscription.plan).toBe('pro');
  });

  it('POST /checkout 非 admin 返回 403', async () => {
    mocks.svc.isBillingEnabled.mockReturnValue(true);
    server = await startAuthedApp('/api/v1/billing', billingRoutes, 'readonly');
    const res = await fetch(`${server.url}/api/v1/billing/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'pro' }),
    });
    expect(res.status).toBe(403);
    expect(mocks.svc.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('POST /checkout 计费未启用返回 503', async () => {
    mocks.svc.isBillingEnabled.mockReturnValue(false);
    server = await startAuthedApp('/api/v1/billing', billingRoutes);
    const res = await fetch(`${server.url}/api/v1/billing/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'pro' }),
    });
    expect(res.status).toBe(503);
  });

  it('POST /checkout 非法 plan 返回 400', async () => {
    mocks.svc.isBillingEnabled.mockReturnValue(true);
    server = await startAuthedApp('/api/v1/billing', billingRoutes);
    const res = await fetch(`${server.url}/api/v1/billing/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'gold' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /checkout 成功返回跳转 URL', async () => {
    mocks.svc.isBillingEnabled.mockReturnValue(true);
    mocks.svc.createCheckoutSession.mockResolvedValueOnce('https://checkout.stripe.com/x');
    server = await startAuthedApp('/api/v1/billing', billingRoutes);
    const res = await fetch(`${server.url}/api/v1/billing/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'pro' }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.url).toBe('https://checkout.stripe.com/x');
    expect(mocks.svc.createCheckoutSession).toHaveBeenCalled();
  });

  it('POST /portal 无客户记录返回 404', async () => {
    mocks.svc.isBillingEnabled.mockReturnValue(true);
    mocks.svc.createPortalSession.mockRejectedValueOnce(new Error('no_customer'));
    server = await startAuthedApp('/api/v1/billing', billingRoutes);
    const res = await fetch(`${server.url}/api/v1/billing/portal`, { method: 'POST' });
    expect(res.status).toBe(404);
  });
});

describe('runRoutes', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startAuthedApp('/api/v1/runs', runRoutes);
  });

  afterEach(async () => {
    await server.close();
  });

  describe('GET /', () => {
    it('success should return run list with default limit', async () => {
      mocks.repo.listRuns.mockResolvedValueOnce([MOCK_ITEM]);
      const res = await fetch(`${server.url}/api/v1/runs`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual([MOCK_ITEM]);
      expect(mocks.repo.listRuns).toHaveBeenCalledWith(ORG, 50, 0);
    });

    it('should respect limit query parameter', async () => {
      mocks.repo.listRuns.mockResolvedValueOnce([]);
      const res = await fetch(`${server.url}/api/v1/runs?limit=10`);
      await res.json();
      expect(mocks.repo.listRuns).toHaveBeenCalledWith(ORG, 10, 0);
    });

    it('should fallback to default limit when limit is NaN', async () => {
      mocks.repo.listRuns.mockResolvedValueOnce([]);
      const res = await fetch(`${server.url}/api/v1/runs?limit=abc`);
      await res.json();
      expect(mocks.repo.listRuns).toHaveBeenCalledWith(ORG, 50, 0);
    });

    it('should return empty list when no runs', async () => {
      mocks.repo.listRuns.mockResolvedValueOnce([]);
      const res = await fetch(`${server.url}/api/v1/runs`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data).toEqual([]);
    });

    it('should return 500 on service error', async () => {
      mocks.repo.listRuns.mockRejectedValueOnce(new Error('db fail'));
      const res = await fetch(`${server.url}/api/v1/runs`);
      expect(res.status).toBe(500);
    });
  });

  describe('GET /:id', () => {
    it('success should return run', async () => {
      mocks.repo.getRun.mockResolvedValueOnce(MOCK_ITEM);
      const res = await fetch(`${server.url}/api/v1/runs/${ITEM_ID}`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data).toEqual(MOCK_ITEM);
      expect(mocks.repo.getRun).toHaveBeenCalledWith(ORG, ITEM_ID);
    });

    it('should return 404 when not found', async () => {
      mocks.repo.getRun.mockResolvedValueOnce(null);
      const res = await fetch(`${server.url}/api/v1/runs/${ITEM_ID}`);
      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid UUID', async () => {
      const res = await fetch(`${server.url}/api/v1/runs/not-a-uuid`);
      expect(res.status).toBe(400);
      expect(mocks.repo.getRun).not.toHaveBeenCalled();
    });

    it('should return 500 on service error', async () => {
      mocks.repo.getRun.mockRejectedValueOnce(new Error('db fail'));
      const res = await fetch(`${server.url}/api/v1/runs/${ITEM_ID}`);
      expect(res.status).toBe(500);
    });
  });

  describe('POST /', () => {
    it('success should return 201', async () => {
      const created = { id: ITEM_ID, name: 'New Run' };
      mocks.repo.createRun.mockResolvedValueOnce(created);
      const res = await fetch(`${server.url}/api/v1/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Run' }),
      });
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body.data).toEqual(created);
      expect(mocks.repo.createRun).toHaveBeenCalledWith(ORG, 'user-1', { name: 'New Run' });
    });

    it('should return 500 on service error', async () => {
      mocks.repo.createRun.mockRejectedValueOnce(new Error('db fail'));
      const res = await fetch(`${server.url}/api/v1/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Fail' }),
      });
      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /:id', () => {
    it('success should return deleted confirmation', async () => {
      mocks.repo.deleteRun.mockResolvedValueOnce(true);
      const res = await fetch(`${server.url}/api/v1/runs/${ITEM_ID}`, { method: 'DELETE' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data).toEqual({ id: ITEM_ID, deleted: true });
      expect(mocks.repo.deleteRun).toHaveBeenCalledWith(ORG, ITEM_ID);
    });

    it('should return 404 when not found', async () => {
      mocks.repo.deleteRun.mockResolvedValueOnce(false);
      const res = await fetch(`${server.url}/api/v1/runs/${ITEM_ID}`, { method: 'DELETE' });
      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid UUID', async () => {
      const res = await fetch(`${server.url}/api/v1/runs/not-a-uuid`, { method: 'DELETE' });
      expect(res.status).toBe(400);
      expect(mocks.repo.deleteRun).not.toHaveBeenCalled();
    });

    it('should return 500 on service error', async () => {
      mocks.repo.deleteRun.mockRejectedValueOnce(new Error('db fail'));
      const res = await fetch(`${server.url}/api/v1/runs/${ITEM_ID}`, { method: 'DELETE' });
      expect(res.status).toBe(500);
    });
  });
});
