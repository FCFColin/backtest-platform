/**
 * 组织与成员管理集成测试（RO-049）
 *
 * 跨层验证：Express 路由 → membershipService/invitationService → PostgreSQL。
 * 覆盖组织信息、成员角色、邀请生命周期与"最后一个 owner 保护"安全约束。
 * mailService 被 mock 以避免真实发信。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../../packages/backend/src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));

vi.mock('../../packages/backend/src/infrastructure/mailService.js', () => ({
  sendInvitationEmail: vi.fn().mockResolvedValue(undefined),
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendMail: vi.fn().mockResolvedValue(undefined),
}));

import orgRoutes from '../../packages/backend/src/routes/orgRoutes.js';
import {
  isDockerAvailable,
  setupTestContainer,
  seedOrgAndUser,
  startSaasTestServer,
  type TestContainerContext,
  type SeedData,
} from '../helpers/testcontainersPg.js';
import { getPool } from '../../packages/backend/src/db/pool.js';

const dockerAvailable = isDockerAvailable();

let ctx: TestContainerContext | null = null;
let seed: SeedData | null = null;
let baseUrl = '';

beforeAll(async () => {
  if (!dockerAvailable) return;
  ctx = await setupTestContainer();
  seed = await seedOrgAndUser();

  const server = await startSaasTestServer(seed.orgId, seed.userId, '/api/v1/orgs', orgRoutes);
  baseUrl = server.url;
}, 120000);

afterAll(async () => {
  if (ctx) await ctx.cleanup();
});

describe.skipIf(!dockerAvailable)('组织与成员管理集成测试', () => {
  it('GET /current 返回当前组织信息', async () => {
    const res = await fetch(`${baseUrl}/api/v1/orgs/current`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.orgId).toBe(seed!.orgId);
    expect(json.data.name).toBe('Test Org');
  });

  it('PATCH /current 更新组织名称', async () => {
    const res = await fetch(`${baseUrl}/api/v1/orgs/current`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '更新后组织名' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.updated).toBe(true);

    const getRes = await fetch(`${baseUrl}/api/v1/orgs/current`);
    const getJson = await getRes.json();
    expect(getJson.data.name).toBe('更新后组织名');
  });

  it('GET /members 返回成员列表', async () => {
    const res = await fetch(`${baseUrl}/api/v1/orgs/members`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.length).toBeGreaterThanOrEqual(1);
    expect(json.data[0].userId).toBe(seed!.userId);
    expect(json.data[0].role).toBe('owner');
  });

  it('POST /invitations 创建邀请', async () => {
    const res = await fetch(`${baseUrl}/api/v1/orgs/invitations`, {
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
    const res = await fetch(`${baseUrl}/api/v1/orgs/invitations`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.length).toBeGreaterThanOrEqual(1);
    expect(json.data[0].email).toBe('invitee@example.com');
  });

  it('PATCH /members/:userId 修改成员角色为 admin', async () => {
    const res = await fetch(`${baseUrl}/api/v1/orgs/members/${seed!.userId}`, {
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
    // 移除第二个 owner，使 seed.userId 成为最后一个 owner 以触发保护逻辑
    await pool.query('DELETE FROM memberships WHERE org_id = $1 AND user_id = $2', [
      seed!.orgId,
      seed!.secondUserId,
    ]);
    await pool.query('UPDATE memberships SET role = $1 WHERE org_id = $2 AND user_id = $3', [
      'owner',
      seed!.orgId,
      seed!.userId,
    ]);

    const res = await fetch(`${baseUrl}/api/v1/orgs/members/${seed!.userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'analyst' }),
    });
    expect(res.status).toBe(409);
  });

  it('DELETE /members/:userId 拒绝移除最后一个 owner（409）', async () => {
    const res = await fetch(`${baseUrl}/api/v1/orgs/members/${seed!.userId}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(409);
  });

  it('DELETE /invitations/:id 撤销邀请', async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/orgs/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'revoke@example.com', role: 'readonly' }),
    });
    const created = await createRes.json();

    const res = await fetch(`${baseUrl}/api/v1/orgs/invitations/${created.data.id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.revoked).toBe(true);
  });

  it('GET /members/:userId 非法 UUID 返回 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/orgs/members/not-a-uuid`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'analyst' }),
    });
    expect(res.status).toBe(400);
  });
});
