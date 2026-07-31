import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

import { createLoggerMocks } from '../../helpers/mockFactories.js';

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: () => ({ query: dbMocks.query }),
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

describe('updateMemberRole', () => {
  it.each([
    [
      '成员存在且非 owner 时应更新角色返回 ok',
      [{ role: 'analyst' }],
      { rowCount: 1 },
      undefined,
      'ok',
    ],
    ['成员不存在应返回 not_found', [], undefined, undefined, 'not_found'],
    [
      'owner 降级时若为最后一个 owner 应返回 last_owner',
      [{ role: 'owner' }],
      { rows: [{ c: 1 }] },
      undefined,
      'last_owner',
    ],
    [
      'owner 降级时若存在多个 owner 应成功',
      [{ role: 'owner' }],
      { rows: [{ c: 2 }] },
      { rowCount: 1 },
      'ok',
    ],
  ])('%s', async (_n, memberRows, q2, q3, expected) => {
    dbMocks.query.mockResolvedValueOnce({ rows: memberRows });
    if (q2) dbMocks.query.mockResolvedValueOnce(q2);
    if (q3) dbMocks.query.mockResolvedValueOnce(q3);
    const r = await updateMemberRole('org-1', 'u1', 'admin');
    expect(r).toBe(expected);
    if (expected === 'ok') {
      expect(
        dbMocks.query.mock.calls.some((c) => String(c[0]).includes('UPDATE memberships SET role')),
      ).toBe(true);
    }
  });
});

describe('removeMember', () => {
  it.each([
    ['成员存在且非 owner 时应移除返回 ok', [{ role: 'analyst' }], { rowCount: 1 }, undefined, 'ok'],
    ['成员不存在应返回 not_found', [], undefined, undefined, 'not_found'],
    [
      'owner 移除时若为最后一个应返回 last_owner',
      [{ role: 'owner' }],
      { rows: [{ c: 1 }] },
      undefined,
      'last_owner',
    ],
    [
      'owner 移除时若存在多个 owner 应成功',
      [{ role: 'owner' }],
      { rows: [{ c: 2 }] },
      { rowCount: 1 },
      'ok',
    ],
  ])('%s', async (_n, memberRows, q2, q3, expected) => {
    dbMocks.query.mockResolvedValueOnce({ rows: memberRows });
    if (q2) dbMocks.query.mockResolvedValueOnce(q2);
    if (q3) dbMocks.query.mockResolvedValueOnce(q3);
    const r = await removeMember('org-1', 'u1');
    expect(r).toBe(expected);
    if (expected === 'ok') {
      expect(
        dbMocks.query.mock.calls.some((c) => String(c[0]).includes('DELETE FROM memberships')),
      ).toBe(true);
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
