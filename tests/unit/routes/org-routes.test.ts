import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mocks, ORG, USER, MEMBER, startApp, jsonFetch } from './org-routes.shared.js';
import type { TestServer } from '../../helpers/expressApp.js';
import orgRoutes from '../../../packages/backend/src/routes/orgRoutes.js';

describe('orgRoutes', () => {
  let server: TestServer;
  beforeEach(() => vi.clearAllMocks());
  afterEach(async () => {
    if (server) await server.close();
  });

  it('GET /members 返回成员列表', async () => {
    mocks.membership.listOrgMembers.mockResolvedValueOnce([
      { userId: USER, username: 'alice', email: null, role: 'owner', createdAt: 'x' },
    ]);
    server = await startApp('/api/v1/orgs', orgRoutes);
    const { res, json } = await jsonFetch(`${server.url}/api/v1/orgs/members`);
    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(mocks.membership.listOrgMembers).toHaveBeenCalledWith(ORG);
  });

  it('PATCH /members/:id 降级最后一个 owner 返回 409', async () => {
    mocks.membership.updateMemberRole.mockResolvedValueOnce('last_owner');
    server = await startApp('/api/v1/orgs', orgRoutes);
    const { res } = await jsonFetch(`${server.url}/api/v1/orgs/members/${MEMBER}`, 'PATCH', {
      role: 'analyst',
    });
    expect(res.status).toBe(409);
  });

  it('DELETE /members/:id 不存在返回 404', async () => {
    mocks.membership.removeMember.mockResolvedValueOnce('not_found');
    server = await startApp('/api/v1/orgs', orgRoutes);
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
    server = await startApp('/api/v1/orgs', orgRoutes);
    const { res } = await jsonFetch(`${server.url}/api/v1/orgs/invitations`, 'POST', {
      email: 'x@y.com',
      role: 'analyst',
    });
    expect(res.status).toBe(201);
    expect(mocks.invitation.createInvitation).toHaveBeenCalledWith(ORG, 'x@y.com', 'analyst', USER);
    expect(mocks.mail.sendInvitationEmail).toHaveBeenCalledWith('x@y.com', 'Acme', 'tok');
  });

  it('POST /invitations 邀请 owner 角色应被校验拒绝 400', async () => {
    server = await startApp('/api/v1/orgs', orgRoutes);
    const { res } = await jsonFetch(`${server.url}/api/v1/orgs/invitations`, 'POST', {
      email: 'x@y.com',
      role: 'owner',
    });
    expect(res.status).toBe(400);
    expect(mocks.invitation.createInvitation).not.toHaveBeenCalled();
  });

  it('DELETE /invitations/:id 不存在返回 404', async () => {
    mocks.invitation.revokeInvitation.mockResolvedValueOnce(false);
    server = await startApp('/api/v1/orgs', orgRoutes);
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
    server = await startApp('/api/v1/orgs', orgRoutes, { tenant: null });
    const { res, json } = await jsonFetch(`${server.url}/api/v1/orgs/invitations/accept`, 'POST', {
      token: 'sometoken',
    });
    expect(res.status).toBe(200);
    expect(json.data.orgId).toBe(ORG);
    expect(mocks.invitation.acceptInvitation).toHaveBeenCalledWith('sometoken', USER);
  });

  it('POST /invitations/accept 过期返回 400', async () => {
    mocks.invitation.acceptInvitation.mockResolvedValueOnce({ ok: false, reason: 'expired' });
    server = await startApp('/api/v1/orgs', orgRoutes, { tenant: null });
    const { res } = await jsonFetch(`${server.url}/api/v1/orgs/invitations/accept`, 'POST', {
      token: 'sometoken',
    });
    expect(res.status).toBe(400);
  });
});
