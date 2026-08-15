import '../helpers/loggerMock.js';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../packages/backend/src/infrastructure/mailService.js', () => ({
  sendInvitationEmail: vi.fn().mockResolvedValue(undefined),
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendMail: vi.fn().mockResolvedValue(undefined),
}));

import orgRoutes from '../../packages/backend/src/routes/orgRoutes.js';
import { saasIntegrationServer } from '../helpers/testcontainersPg.js';
import { getPool } from '../../packages/backend/src/db/pool.js';

const saas = saasIntegrationServer(orgRoutes, '/api/v1/orgs');

describe.skipIf(!saas.dockerAvailable)('组织与成员管理集成测试', () => {
  it('GET /members 返回成员列表', async () => {
    const res = await fetch(`${saas.url}/api/v1/orgs/members`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.length).toBeGreaterThanOrEqual(1);
    expect(json.data[0].userId).toBe(saas.seed!.userId);
    expect(json.data[0].role).toBe('owner');
  });

  it('POST /invitations 创建邀请', async () => {
    const res = await fetch(`${saas.url}/api/v1/orgs/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'invitee@example.com', role: 'analyst' }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.email).toBe('invitee@example.com');
    expect(json.data.role).toBe('analyst');
    expect(json.data.expiresAt).toBeDefined();
  });

  it('GET /invitations 返回邀请列表', async () => {
    const res = await fetch(`${saas.url}/api/v1/orgs/invitations`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.length).toBeGreaterThanOrEqual(1);
    expect(json.data[0].email).toBe('invitee@example.com');
  });

  it('PATCH /members/:userId 修改成员角色为 admin', async () => {
    const res = await fetch(`${saas.url}/api/v1/orgs/members/${saas.seed!.userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.updated).toBe(true);
  });

  it('PATCH /members/:userId 拒绝降级最后一个 owner（409）', async () => {
    const pool = getPool();
    await pool.query('DELETE FROM memberships WHERE org_id = $1 AND user_id = $2', [
      saas.seed!.orgId,
      saas.seed!.secondUserId,
    ]);
    await pool.query('UPDATE memberships SET role = $1 WHERE org_id = $2 AND user_id = $3', [
      'owner',
      saas.seed!.orgId,
      saas.seed!.userId,
    ]);

    const res = await fetch(`${saas.url}/api/v1/orgs/members/${saas.seed!.userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'analyst' }),
    });
    expect(res.status).toBe(409);
  });

  it('DELETE /members/:userId 拒绝移除最后一个 owner（409）', async () => {
    const res = await fetch(`${saas.url}/api/v1/orgs/members/${saas.seed!.userId}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(409);
  });

  it('DELETE /invitations/:id 撤销邀请', async () => {
    const createRes = await fetch(`${saas.url}/api/v1/orgs/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'revoke@example.com', role: 'readonly' }),
    });
    const created = await createRes.json();

    const res = await fetch(`${saas.url}/api/v1/orgs/invitations/${created.data.id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.revoked).toBe(true);
  });

  it('GET /members/:userId 非法 UUID 返回 400', async () => {
    const res = await fetch(`${saas.url}/api/v1/orgs/members/not-a-uuid`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'analyst' }),
    });
    expect(res.status).toBe(400);
  });
});
