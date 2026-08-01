import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
  client: {
    query: vi.fn(),
    release: vi.fn(),
  },
}));

import { createLoggerMocks } from '../../helpers/mockFactories.js';

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: () => ({ query: dbMocks.query, connect: () => Promise.resolve(dbMocks.client) }),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

import {
  orgRoleToGlobalRole,
  getUserMemberships,
  getMembership,
  resolveDefaultOrg,
  isPlatformAdmin,
  listOrgMembers,
  updateMemberRole,
  removeMember,
  getOrg,
  updateOrgName,
} from '../../../packages/backend/src/application/org/membershipService.js';
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
  acceptInvitation,
} from '../../../packages/backend/src/application/org/invitationService.js';

beforeEach(() => vi.clearAllMocks());

function row(orgId: string, role: string, status = 'active') {
  return {
    org_id: orgId,
    role,
    org_name: `Org ${orgId}`,
    org_slug: `org-${orgId}`,
    org_plan: 'free',
    org_status: status,
  };
}

const ORG = '11111111-1111-1111-1111-111111111111';
const INV_ID = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';

function invRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INV_ID,
    org_id: ORG,
    email: 'a@b.com',
    role: 'analyst',
    invited_by: USER,
    expires_at: new Date(Date.now() + 86400000),
    accepted_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('orgRoleToGlobalRole', () => {
  it.each([
    ['owner 应映射为 admin', 'owner', 'admin'],
    ['其它角色应原样返回', 'analyst', 'analyst'],
    ['readonly 应原样返回', 'readonly', 'readonly'],
  ])('%s', (_n, role, expected) => {
    expect(orgRoleToGlobalRole(role)).toBe(expected);
  });
});

describe('getUserMemberships', () => {
  it.each([
    [
      '应映射数据库行为 Membership 对象',
      [{ rows: [row('a', 'owner')] }],
      [
        {
          orgId: 'a',
          orgName: 'Org a',
          orgSlug: 'org-a',
          orgPlan: 'free',
          orgStatus: 'active',
          role: 'owner',
        },
      ],
    ],
    ['无成员关系时应返回空数组', [{ rows: [] }], []],
  ])('%s', async (_n, queryResult, expected) => {
    dbMocks.query.mockResolvedValueOnce(queryResult[0]);
    expect(await getUserMemberships('u1')).toEqual(expected);
  });
});

describe('getMembership', () => {
  it.each([
    ['属于组织时应返回成员关系', [{ rows: [row('a', 'analyst')] }], true],
    ['不属于组织时应返回 null', [{ rows: [] }], false],
  ])('%s', async (_n, queryResult, found) => {
    dbMocks.query.mockResolvedValueOnce(queryResult[0]);
    const m = await getMembership('u1', 'a');
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
    [
      '应优先选择角色优先级最高的组织（owner > analyst）',
      [row('a', 'analyst'), row('b', 'owner')],
      'b',
      'owner',
    ],
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
    const m = await resolveDefaultOrg('u1');
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
    expect(await isPlatformAdmin('u1')).toBe(expected);
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
    const result = await listOrgMembers('org-1');
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
    expect(await listOrgMembers('org-empty')).toEqual([]);
  });

  it('email 为 null 时应映射为 null', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [{ ...memberRow('u3', 'readonly'), email: null }],
    });
    const result = await listOrgMembers('org-1');
    expect(result[0].email).toBeNull();
  });
});

describe.each([
  ['updateMemberRole', updateMemberRole, 'UPDATE memberships SET role'],
  ['removeMember', removeMember, 'DELETE FROM memberships'],
] as const)('%s', (_fnName, fn, sqlFrag) => {
  it.each<[string, unknown[], unknown, unknown, string]>([
    ['成员存在且非 owner 时返回 ok', [{ role: 'analyst' }], { rowCount: 1 }, undefined, 'ok'],
    ['成员不存在应返回 not_found', [], undefined, undefined, 'not_found'],
    [
      '最后一个 owner 应返回 last_owner',
      [{ role: 'owner' }],
      { rows: [{ c: 1 }] },
      undefined,
      'last_owner',
    ],
    ['存在多个 owner 时应成功', [{ role: 'owner' }], { rows: [{ c: 2 }] }, { rowCount: 1 }, 'ok'],
  ])('%s', async (_n, memberRows, q2, q3, expected) => {
    dbMocks.query.mockResolvedValueOnce({ rows: memberRows });
    if (q2) dbMocks.query.mockResolvedValueOnce(q2);
    if (q3) dbMocks.query.mockResolvedValueOnce(q3);
    const r = await fn('org-1', 'u1', 'admin');
    expect(r).toBe(expected);
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
    const org = await getOrg('org-1');
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
    expect(await updateOrgName('org-1', 'New Name')).toBe(expected);
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
    dbMocks.query
      .mockResolvedValueOnce({ rowCount: 0 }) // DELETE 历史待处理
      .mockResolvedValueOnce({ rows: [invRow()] }); // INSERT RETURNING
    const created = await createInvitation(ORG, 'a@b.com', 'analyst', USER);

    expect(created.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(created.id).toBe(INV_ID);
    // 第一次调用是清理待处理邀请
    expect(dbMocks.query.mock.calls[0][0]).toContain('DELETE FROM invitations');
    // 写入的是哈希而非明文
    const insertParams = dbMocks.query.mock.calls[1][1] as unknown[];
    const tokenHash = insertParams[3] as string;
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(created.token);
  });
});

describe('listInvitations / revokeInvitation', () => {
  it('list 应以 org_id 过滤并映射记录', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [invRow()] });
    const list = await listInvitations(ORG);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: INV_ID, orgId: ORG, email: 'a@b.com', role: 'analyst' });
    expect(dbMocks.query.mock.calls[0][1]).toEqual([ORG]);
  });

  it('revoke 应以 org_id 收敛且仅作用于未接受邀请', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 0 });
    expect(await revokeInvitation(ORG, INV_ID)).toBe(false);
    const [sql, params] = dbMocks.query.mock.calls[0];
    expect(sql).toContain('accepted_at IS NULL');
    expect(params).toEqual([INV_ID, ORG]);
  });

  it('revoke 成功返回 true', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 1 });
    expect(await revokeInvitation(ORG, INV_ID)).toBe(true);
  });
});

describe('acceptInvitation', () => {
  it('非法/空令牌应直接拒绝', async () => {
    expect(await acceptInvitation('', USER)).toEqual({ ok: false, reason: 'invalid' });
    expect(dbMocks.client.query).not.toHaveBeenCalled();
  });

  it('令牌不存在应返回 invalid 并回滚', async () => {
    dbMocks.client.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // SELECT FOR UPDATE
    const result = await acceptInvitation('sometoken', USER);
    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(dbMocks.client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('已接受应返回 already', async () => {
    dbMocks.client.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: INV_ID,
            org_id: ORG,
            role: 'analyst',
            expires_at: new Date(Date.now() + 1000),
            accepted_at: new Date(),
          },
        ],
      });
    expect(await acceptInvitation('sometoken', USER)).toEqual({ ok: false, reason: 'already' });
  });

  it('已过期应返回 expired', async () => {
    dbMocks.client.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: INV_ID,
            org_id: ORG,
            role: 'analyst',
            expires_at: new Date(Date.now() - 1000),
            accepted_at: null,
          },
        ],
      });
    expect(await acceptInvitation('sometoken', USER)).toEqual({ ok: false, reason: 'expired' });
  });

  it('有效令牌应 upsert membership、标记已接受并提交', async () => {
    dbMocks.client.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: INV_ID,
            org_id: ORG,
            role: 'analyst',
            expires_at: new Date(Date.now() + 86400000),
            accepted_at: null,
          },
        ],
      })
      .mockResolvedValueOnce(undefined) // INSERT membership ON CONFLICT
      .mockResolvedValueOnce(undefined) // UPDATE invitations accepted_at
      .mockResolvedValueOnce(undefined); // COMMIT
    const result = await acceptInvitation('sometoken', USER);
    expect(result).toEqual({ ok: true, orgId: ORG, role: 'analyst' });
    expect(dbMocks.client.query).toHaveBeenCalledWith('COMMIT');
    const insertCall = dbMocks.client.query.mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO memberships'),
    );
    expect(insertCall?.[1]).toEqual([ORG, USER, 'analyst']);
  });
});
