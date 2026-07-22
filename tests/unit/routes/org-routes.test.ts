/**
 * 组织与成员管理路由单元测试（ADR-035）
 *
 * 企业理由：组织/成员/邀请端点控制租户内的协作与权限边界，必须验证：
 * 1. 读操作返回租户范围数据；写操作要求 admin（owner/admin）
 * 2. 成员降级/移除对最后一个 owner 返回 409
 * 3. 邀请创建触发邮件、撤销对不存在返回 404
 * 4. 接受邀请仅需登录、按服务结果映射成功/失败码
 *
 * Mock 策略：mock membershipService/invitationService/mailService（隔离 DB 与外发邮件），
 * 在测试 app 内注入 req.tenantId/req.user 模拟前置鉴权链。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer, type TestRequest } from '../../helpers/expressApp.js';
import { createLoggerMocks } from '../../helpers/mockFactories.js';

const mocks = vi.hoisted(() => ({
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
}));

vi.mock(
  '../../../packages/backend/src/application/org/membershipService.js',
  () => mocks.membership,
);
vi.mock(
  '../../../packages/backend/src/application/org/invitationService.js',
  () => mocks.invitation,
);
vi.mock('../../../packages/backend/src/infrastructure/mailService.js', () => mocks.mail);
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

import orgRoutes from '../../../packages/backend/src/routes/orgRoutes.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '33333333-3333-3333-3333-333333333333';
const MEMBER = '44444444-4444-4444-4444-444444444444';

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
