import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
  client: { query: vi.fn(), release: vi.fn() },
}));

import { createWithTransactionMock } from '../../helpers/poolFixture.js';

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: () => ({ query: dbMocks.query, connect: () => Promise.resolve(dbMocks.client) }),
  withTransaction: createWithTransactionMock(() => dbMocks.client),
  withTenant: (_t: string, fn: (c: unknown) => Promise<unknown>) => fn(dbMocks.client),
  withTenantReadOnly: vi.fn((_t: string, fn: (c: unknown) => Promise<unknown>) =>
    fn(dbMocks.client),
  ),
}));
import * as poolModule from '../../../packages/backend/src/db/pool.js';

import * as svc from '../../../packages/backend/src/application/org/membershipService.js';
import * as inv from '../../../packages/backend/src/application/org/invitationService.js';

beforeEach(() => vi.clearAllMocks());

const row = (orgId: string, role: string, status = 'active') => ({
    org_id: orgId,
    role,
    org_name: `Org ${orgId}`,
    org_slug: `org-${orgId}`,
    org_plan: 'free',
    org_status: status,
  }),
  membership = (orgId: string, role: string) => ({
    orgId,
    orgName: `Org ${orgId}`,
    orgSlug: `org-${orgId}`,
    orgPlan: 'free',
    orgStatus: 'active',
    role,
  }),
  ORG = '11111111-1111-1111-1111-111111111111',
  INV_ID = '22222222-2222-2222-2222-222222222222',
  USER = '33333333-3333-3333-3333-333333333333',
  invRow = (overrides: Record<string, unknown> = {}) => ({
    id: INV_ID,
    org_id: ORG,
    email: 'a@b.com',
    role: 'analyst',
    invited_by: USER,
    expires_at: new Date(Date.now() + 86400000),
    accepted_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }),
  mockInviteLookup = (invite: Record<string, unknown> | null) =>
    dbMocks.client.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: invite ? [invite] : [] })
      .mockResolvedValueOnce({ rows: invite ? [{ email: invite.email ?? 'a@b.com' }] : [] });

describe('orgRoleToGlobalRole', () => {
  it.each([
    ['owner 应映射为 admin', 'owner', 'admin'],
    ['其它角色应原样返回', 'analyst', 'analyst'],
    ['readonly 应原样返回', 'readonly', 'readonly'],
  ] as const)('%s', (_n, role, expected) => {
    expect(svc.orgRoleToGlobalRole(role)).toBe(expected);
  });
});

describe('getUserMemberships', () => {
  it.each([
    ['映射为 Membership 对象', [{ rows: [row('a', 'owner')] }], [membership('a', 'owner')]],
    ['无成员关系时应返回空数组', [{ rows: [] }], []],
  ])('%s', async (_n, queryResult, expected) => {
    dbMocks.query.mockResolvedValueOnce(queryResult[0]);
    expect(await svc.getUserMemberships('u1')).toEqual(expected);
  });
});

describe('getMembership', () => {
  it.each([
    ['属于组织时应返回成员关系', [{ rows: [row('a', 'analyst')] }], true],
    ['不属于组织时应返回 null', [{ rows: [] }], false],
  ])('%s', async (_n, queryResult, found) => {
    dbMocks.query.mockResolvedValueOnce(queryResult[0]);
    const m = await svc.getMembership('u1', 'a');
    if (found) {
      expect(m?.orgId).toBe('a');
      expect(m?.role).toBe('analyst');
    } else {
      expect(m).toBeNull();
    }
  });
});

describe('resolveDefaultOrg', () => {
  it.each([
    ['角色优先级选最高（owner > analyst）', [row('a', 'analyst'), row('b', 'owner')], 'b', 'owner'],
    [
      '应跳过非 active 组织优先选 active',
      [row('a', 'owner', 'suspended'), row('b', 'readonly', 'active')],
      'b',
      'readonly',
    ],
    [
      '全部非 active 时回退到非 active 集合并按角色优先级选取',
      [row('a', 'readonly', 'suspended'), row('b', 'owner', 'canceled')],
      'b',
      'owner',
    ],
    ['无成员关系时应返回 null', [], null, null],
  ])('%s', async (_n, rows, orgId, role) => {
    dbMocks.query.mockResolvedValueOnce({ rows });
    const m = await svc.resolveDefaultOrg('u1');
    if (orgId === null) {
      expect(m).toBeNull();
    } else {
      expect(m?.orgId).toBe(orgId);
      expect(m?.role).toBe(role);
    }
  });
});

describe('isPlatformAdmin', () => {
  it.each([
    ['is_platform_admin=true 时返回 true', { rows: [{ is_platform_admin: true }] }, true],
    ['用户不存在时返回 false', { rows: [] }, false],
    ['查询异常时保守返回 false', new Error('db down'), false],
  ])('%s', async (_n, result, expected) => {
    if (result instanceof Error) dbMocks.query.mockRejectedValueOnce(result);
    else dbMocks.query.mockResolvedValueOnce(result);
    expect(await svc.isPlatformAdmin('u1')).toBe(expected);
  });
});

describe('listOrgMembers', () => {
  const memberRow = (userId: string, role: string) => ({
    user_id: userId,
    role,
    created_at: new Date('2026-01-15T10:00:00Z'),
    username: `user_${userId}`,
    email: `${userId}@test.com`,
  });

  it('应列出组织成员并映射字段', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [memberRow('u1', 'owner'), memberRow('u2', 'analyst')],
    });
    const result = await svc.listOrgMembers('org-1');
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      userId: 'u1',
      username: 'user_u1',
      email: 'u1@test.com',
      role: 'owner',
    });
    expect(result[0].createdAt).toBe('2026-01-15T10:00:00.000Z');
  });

  it('空组织应返回空数组', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await svc.listOrgMembers('org-empty')).toEqual([]);
  });

  it('email 为 null 时应映射为 null', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [{ ...memberRow('u3', 'readonly'), email: null }],
    });
    expect((await svc.listOrgMembers('org-1'))[0]?.email).toBeNull();
  });
});

describe.each([
  ['updateMemberRole', svc.updateMemberRole, 'UPDATE memberships m SET role'],
  ['removeMember', svc.removeMember, 'DELETE FROM memberships m'],
] as const)('%s', (_fnName, fn, sqlFrag) => {
  it.each<[string, unknown[], string]>([
    ['单语句条件更新命中应返回 ok', [{ rows: [{ id: 'm1' }] }], 'ok'],
    ['成员不存在应返回 not_found', [{ rows: [] }, { rows: [] }], 'not_found'],
    ['末位 owner 应返回 last_owner', [{ rows: [] }, { rows: [{ role: 'owner' }] }], 'last_owner'],
  ])('%s', async (_n, results, expected) => {
    for (const r of results) dbMocks.query.mockResolvedValueOnce(r);
    expect(await fn('org-1', 'u1', 'admin')).toBe(expected);
    if (expected === 'ok') {
      expect(dbMocks.query.mock.calls.some((c) => String(c[0]).includes(sqlFrag))).toBe(true);
    }
  });
});

describe('getOrg', () => {
  it.each([
    [
      '应返回组织摘要',
      { rows: [{ id: 'org-1', name: 'My Org', slug: 'my-org', plan: 'pro', status: 'active' }] },
      { orgId: 'org-1', name: 'My Org', slug: 'my-org', plan: 'pro', status: 'active' },
    ],
    ['不存在应返回 null', { rows: [] }, null],
  ])('%s', async (_n, result, expected) => {
    dbMocks.query.mockResolvedValueOnce(result);
    const org = await svc.getOrg('org-1');
    if (expected === null) expect(org).toBeNull();
    else expect(org).toMatchObject(expected as Record<string, string>);
  });
});

describe('updateOrgName', () => {
  it.each([
    ['成功更新应返回 true', { rowCount: 1 }, true],
    ['无匹配组织应返回 false', { rowCount: 0 }, false],
  ])('%s', async (_n, result, expected) => {
    dbMocks.query.mockResolvedValueOnce(result);
    expect(await svc.updateOrgName('org-1', 'New Name')).toBe(expected);
    if (expected) {
      expect(dbMocks.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE organizations SET name'),
        ['org-1', 'New Name'],
      );
    }
  });
});

describe('createInvitation', () => {
  it('应先清理同邮箱待处理邀请，再插入并返回一次性令牌', async () => {
    dbMocks.client.query
      .mockResolvedValueOnce({ rowCount: 0 }) // DELETE 历史待处理
      .mockResolvedValueOnce({ rows: [invRow()] }); // INSERT RETURNING
    const created = await inv.createInvitation(ORG, 'a@b.com', 'analyst', USER);

    expect(created.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(created.id).toBe(INV_ID);
    expect(dbMocks.client.query.mock.calls[0][0]).toContain('DELETE FROM invitations');
    const tokenHash = (dbMocks.client.query.mock.calls[1][1] as unknown[])[3] as string;
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(created.token);
  });
});

describe('listInvitations / revokeInvitation', () => {
  it('list 应经 withTenantReadOnly（RLS 隔离）并按 org_id 过滤映射记录', async () => {
    dbMocks.client.query.mockResolvedValueOnce({ rows: [invRow()] });
    const list = await inv.listInvitations(ORG);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: INV_ID, orgId: ORG, email: 'a@b.com', role: 'analyst' });
    const wtr = vi.mocked(poolModule.withTenantReadOnly);
    expect(wtr).toHaveBeenCalledTimes(1);
    expect(wtr).toHaveBeenCalledWith(ORG, expect.any(Function));
    expect(dbMocks.client.query.mock.calls[0][1]).toEqual([ORG]);
  });

  it.each([
    ['revoke 成功返回 true', { rowCount: 1 }, true],
    ['revoke 应以 org_id 收敛且仅作用于未接受邀请', { rowCount: 0 }, false],
  ])('%s', async (_n, result, ok) => {
    dbMocks.client.query.mockResolvedValueOnce(result);
    expect(await inv.revokeInvitation(ORG, INV_ID)).toBe(ok);
    const [sql, params] = dbMocks.client.query.mock.calls[0];
    expect(sql).toContain('accepted_at IS NULL');
    expect(params).toEqual([INV_ID, ORG]);
  });
});

describe('acceptInvitation', () => {
  it('非法/空令牌应直接拒绝', async () => {
    expect(await inv.acceptInvitation('', USER)).toEqual({ ok: false, reason: 'invalid' });
    expect(dbMocks.client.query).not.toHaveBeenCalled();
  });

  it.each<[string, Record<string, unknown> | null, { ok: boolean; reason: string }]>([
    ['令牌不存在应返回 invalid', null, { ok: false, reason: 'invalid' }],
    ['已接受应返回 already', { accepted_at: new Date() }, { ok: false, reason: 'already' }],
    ['已过期应返回 expired', { expires_at: new Date(0) }, { ok: false, reason: 'expired' }],
  ])('%s', async (_n, overrides, expected) => {
    mockInviteLookup(overrides && invRow(overrides));
    expect(await inv.acceptInvitation('sometoken', USER)).toEqual(expected);
    if (expected.reason === 'invalid') expect(dbMocks.client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('有效令牌应 upsert membership、标记已接受并提交', async () => {
    mockInviteLookup(invRow());
    dbMocks.client.query.mockResolvedValue(undefined);
    const result = await inv.acceptInvitation('sometoken', USER);
    expect(result).toEqual({ ok: true, orgId: ORG, role: 'analyst' });
    expect(dbMocks.client.query).toHaveBeenCalledWith('COMMIT');
    const calls = dbMocks.client.query.mock.calls;
    const insertCall = calls.find((c) => String(c[0]).includes('INSERT INTO memberships'));
    expect(insertCall?.[1]).toEqual([ORG, USER, 'analyst']);
  });

  it('接受者邮箱与邀请目标不一致应拒绝且不建成员', async () => {
    dbMocks.client.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [invRow()] })
      .mockResolvedValueOnce({ rows: [{ email: 'other@example.com' }] })
      .mockResolvedValue(undefined);
    const result = await inv.acceptInvitation('sometoken', USER);
    expect(result).toEqual({ ok: false, reason: 'invalid' });
    const calls = dbMocks.client.query.mock.calls;
    const emailCall = calls.find((c) => String(c[0]).includes('SELECT email FROM users'));
    expect(emailCall?.[1]).toEqual([USER]);
    expect(calls.some((c) => String(c[0]).includes('INSERT INTO memberships'))).toBe(false);
  });
});
