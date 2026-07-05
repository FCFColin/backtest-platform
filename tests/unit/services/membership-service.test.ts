/**
 * 组织成员服务单元测试（ADR-032）
 *
 * 企业理由：多租户身份解析是隔离与鉴权的入口。本测试验证：
 * 1. orgRoleToGlobalRole 正确把组织角色映射为全局 RBAC 角色（owner→admin）
 * 2. resolveDefaultOrg 在多组织/多角色下挑选稳定且符合优先级的默认活跃组织
 * 3. getMembership/isPlatformAdmin 的查询与边界行为
 *
 * Mock 策略：mock db.getPool().query，避免真实数据库依赖。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

import { createLoggerMocks } from '../../helpers/mockFactories.js';

vi.mock('../../../api/db/index.js', () => ({
  getPool: () => ({ query: dbMocks.query }),
}));

vi.mock('../../../api/utils/logger.js', () => ({ logger: createLoggerMocks() }));

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
} from '../../../api/services/membershipService.js';

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
  it('owner 应映射为 admin', () => {
    expect(orgRoleToGlobalRole('owner')).toBe('admin');
  });
  it('其它角色应原样返回', () => {
    expect(orgRoleToGlobalRole('admin')).toBe('admin');
    expect(orgRoleToGlobalRole('analyst')).toBe('analyst');
    expect(orgRoleToGlobalRole('readonly')).toBe('readonly');
  });
});

describe('getUserMemberships', () => {
  beforeEach(() => vi.clearAllMocks());

  it('应映射数据库行为 Membership 对象', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [row('a', 'owner')] });
    const result = await getUserMemberships('u1');
    expect(result).toEqual([
      {
        orgId: 'a',
        orgName: 'Org a',
        orgSlug: 'org-a',
        orgPlan: 'free',
        orgStatus: 'active',
        role: 'owner',
      },
    ]);
  });

  it('无成员关系时应返回空数组', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await getUserMemberships('u1')).toEqual([]);
  });
});

describe('getMembership', () => {
  beforeEach(() => vi.clearAllMocks());

  it('属于组织时应返回成员关系', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [row('a', 'analyst')] });
    const m = await getMembership('u1', 'a');
    expect(m?.orgId).toBe('a');
    expect(m?.role).toBe('analyst');
  });

  it('不属于组织时应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await getMembership('u1', 'a')).toBeNull();
  });
});

describe('resolveDefaultOrg', () => {
  beforeEach(() => vi.clearAllMocks());

  it('应优先选择角色优先级最高的组织（owner > analyst）', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [row('a', 'analyst'), row('b', 'owner')] });
    const m = await resolveDefaultOrg('u1');
    expect(m?.orgId).toBe('b');
    expect(m?.role).toBe('owner');
  });

  it('应跳过非 active 组织优先选 active', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [row('a', 'owner', 'suspended'), row('b', 'readonly', 'active')],
    });
    const m = await resolveDefaultOrg('u1');
    expect(m?.orgId).toBe('b');
  });

  it('全部非 active 时回退到非 active 集合并按角色优先级选取', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [row('a', 'readonly', 'suspended'), row('b', 'owner', 'canceled')],
    });
    const m = await resolveDefaultOrg('u1');
    expect(m?.orgId).toBe('b');
  });

  it('无成员关系时应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await resolveDefaultOrg('u1')).toBeNull();
  });
});

describe('isPlatformAdmin', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is_platform_admin=true 时返回 true', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [{ is_platform_admin: true }] });
    expect(await isPlatformAdmin('u1')).toBe(true);
  });

  it('用户不存在时返回 false', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await isPlatformAdmin('u1')).toBe(false);
  });

  it('查询异常时保守返回 false', async () => {
    dbMocks.query.mockRejectedValueOnce(new Error('db down'));
    expect(await isPlatformAdmin('u1')).toBe(false);
  });
});

describe('listOrgMembers', () => {
  beforeEach(() => vi.clearAllMocks());

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
  beforeEach(() => vi.clearAllMocks());

  it('成员存在且非 owner 时应更新角色返回 ok', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [{ role: 'analyst' }] });
    dbMocks.query.mockResolvedValueOnce({ rowCount: 1 });
    const r = await updateMemberRole('org-1', 'u1', 'admin');
    expect(r).toBe('ok');
    expect(dbMocks.query.mock.calls[1][0]).toContain('UPDATE memberships SET role');
  });

  it('成员不存在应返回 not_found', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await updateMemberRole('org-1', 'ghost', 'admin')).toBe('not_found');
  });

  it('owner 降级时若为最后一个 owner 应返回 last_owner', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [{ role: 'owner' }] });
    dbMocks.query.mockResolvedValueOnce({ rows: [{ c: 1 }] });
    const r = await updateMemberRole('org-1', 'u1', 'analyst');
    expect(r).toBe('last_owner');
  });

  it('owner 降级时若存在多个 owner 应成功', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [{ role: 'owner' }] });
    dbMocks.query.mockResolvedValueOnce({ rows: [{ c: 2 }] });
    dbMocks.query.mockResolvedValueOnce({ rowCount: 1 });
    const r = await updateMemberRole('org-1', 'u1', 'analyst');
    expect(r).toBe('ok');
  });
});

describe('removeMember', () => {
  beforeEach(() => vi.clearAllMocks());

  it('成员存在且非 owner 时应移除返回 ok', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [{ role: 'analyst' }] });
    dbMocks.query.mockResolvedValueOnce({ rowCount: 1 });
    const r = await removeMember('org-1', 'u1');
    expect(r).toBe('ok');
    expect(dbMocks.query.mock.calls[1][0]).toContain('DELETE FROM memberships');
  });

  it('成员不存在应返回 not_found', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await removeMember('org-1', 'ghost')).toBe('not_found');
  });

  it('owner 移除时若为最后一个应返回 last_owner', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [{ role: 'owner' }] });
    dbMocks.query.mockResolvedValueOnce({ rows: [{ c: 1 }] });
    const r = await removeMember('org-1', 'u1');
    expect(r).toBe('last_owner');
  });

  it('owner 移除时若存在多个 owner 应成功', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [{ role: 'owner' }] });
    dbMocks.query.mockResolvedValueOnce({ rows: [{ c: 2 }] });
    dbMocks.query.mockResolvedValueOnce({ rowCount: 1 });
    const r = await removeMember('org-1', 'u1');
    expect(r).toBe('ok');
  });
});

describe('getOrg', () => {
  beforeEach(() => vi.clearAllMocks());

  it('应返回组织摘要', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [{ id: 'org-1', name: 'My Org', slug: 'my-org', plan: 'pro', status: 'active' }],
    });
    const org = await getOrg('org-1');
    expect(org).toMatchObject({
      orgId: 'org-1',
      name: 'My Org',
      slug: 'my-org',
      plan: 'pro',
      status: 'active',
    });
  });

  it('不存在应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await getOrg('missing')).toBeNull();
  });
});

describe('updateOrgName', () => {
  beforeEach(() => vi.clearAllMocks());

  it('成功更新应返回 true', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 1 });
    expect(await updateOrgName('org-1', 'New Name')).toBe(true);
    expect(dbMocks.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE organizations SET name'),
      ['org-1', 'New Name'],
    );
  });

  it('无匹配组织应返回 false', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 0 });
    expect(await updateOrgName('missing', 'X')).toBe(false);
  });
});
