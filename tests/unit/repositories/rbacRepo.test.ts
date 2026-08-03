import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLoggerMocks } from '../../helpers/mockFactories.js';

const dbMocks = vi.hoisted(() => {
  const mockClient = { query: vi.fn(), release: vi.fn() };
  return {
    clientQuery: mockClient.query,
    clientRelease: mockClient.release,
    poolQuery: vi.fn(),
    withTenant: vi.fn(),
    mockClient,
  };
});

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: () => ({ query: dbMocks.poolQuery, connect: async () => dbMocks.mockClient }),
  withTenant: <T>(tenantId: string, fn: (c: typeof dbMocks.mockClient) => Promise<T>) => {
    dbMocks.withTenant(tenantId);
    return fn(dbMocks.mockClient);
  },
  withTenantReadOnly: <T>(tenantId: string, fn: (c: typeof dbMocks.mockClient) => Promise<T>) => {
    dbMocks.withTenant(tenantId);
    return fn(dbMocks.mockClient);
  },
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: createLoggerMocks(),
}));

import {
  getRolesByOrg,
  createRole,
  updateRole,
  deleteRole,
  getRolePermissions,
  setRolePermissions,
  getUserRoles,
  assignUserRole,
  removeUserRole,
  getUserPermissions,
  getUserIdsByRole,
} from '../../../packages/backend/src/repositories/rbacRepo.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const ROLE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = '22222222-2222-2222-2222-222222222222';

const roleRow = {
  id: ROLE_ID,
  org_id: ORG,
  name: 'custom-role',
  description: '测试角色',
  is_system: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-06-01T00:00:00.000Z'),
};
const systemRoleRow = {
  ...roleRow,
  id: 'ssssssss-ssss-ssss-ssss-ssssssssssss',
  org_id: null,
  name: 'admin',
  is_system: true,
};

beforeEach(() => vi.clearAllMocks());

function mockTx(...stages: Array<{ rows: unknown[] }>) {
  stages.forEach((s) => dbMocks.clientQuery.mockResolvedValueOnce(s));
}

describe('getRolesByOrg', () => {
  it('应使用 withTenant 并返回租户角色 + 系统角色', async () => {
    dbMocks.clientQuery.mockResolvedValue({ rows: [systemRoleRow, roleRow] });
    const result = await getRolesByOrg(ORG);
    expect(dbMocks.withTenant).toHaveBeenCalledWith(ORG);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ isSystem: true, orgId: null });
    expect(result[1]).toMatchObject({ isSystem: false, orgId: ORG, name: 'custom-role' });
  });

  it('应正确映射 createdAt/updatedAt 为 ISO 字符串', async () => {
    dbMocks.clientQuery.mockResolvedValue({ rows: [roleRow] });
    const result = await getRolesByOrg(ORG);
    expect(result[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(result[0].updatedAt).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('createRole', () => {
  it('应创建自定义角色（is_system=FALSE）', async () => {
    dbMocks.clientQuery.mockResolvedValue({ rows: [roleRow] });
    const result = await createRole(ORG, 'custom-role', '测试角色');
    expect(result).toMatchObject({ id: ROLE_ID, isSystem: false, name: 'custom-role' });
    expect(dbMocks.withTenant).toHaveBeenCalledWith(ORG);
    const [sql, params] = dbMocks.clientQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO roles');
    expect(params).toEqual([ORG, 'custom-role', '测试角色']);
  });

  it('description 为 null 时应正确传入', async () => {
    dbMocks.clientQuery.mockResolvedValue({ rows: [{ ...roleRow, description: null }] });
    await createRole(ORG, 'no-desc', null);
    expect(dbMocks.clientQuery.mock.calls[0][1][2]).toBeNull();
  });
});

describe('updateRole', () => {
  it('应更新非系统角色并返回记录', async () => {
    mockTx(
      { rows: [] },
      { rows: [{ is_system: false }] },
      { rows: [{ ...roleRow, name: 'updated' }] },
      { rows: [] },
    );
    const result = await updateRole(ROLE_ID, 'updated', '新描述');
    expect(result).not.toBe('not_found');
    expect(result).not.toBe('system_role');
    if (typeof result === 'object') expect(result.name).toBe('updated');
    expect(dbMocks.clientRelease).toHaveBeenCalled();
  });

  it.each([
    ['不存在', [], 'not_found'],
    ['系统角色', [{ is_system: true }], 'system_role'],
  ])('角色%s 应返回 %s', async (_n, selectRows, expected) => {
    mockTx({ rows: [] }, { rows: selectRows });
    expect(await updateRole(ROLE_ID, 'x', null)).toBe(expected);
    expect(dbMocks.clientRelease).toHaveBeenCalled();
  });
});

describe('deleteRole', () => {
  it('应删除非系统角色', async () => {
    mockTx({ rows: [] }, { rows: [{ is_system: false }] }, { rows: [] }, { rows: [] });
    expect(await deleteRole(ROLE_ID)).toBe(true);
    expect(dbMocks.clientRelease).toHaveBeenCalled();
  });

  it.each([
    ['不存在', [], 'not_found'],
    ['系统角色', [{ is_system: true }], 'system_role'],
  ])('角色%s 应返回 %s', async (_n, selectRows, expected) => {
    mockTx({ rows: [] }, { rows: selectRows });
    expect(await deleteRole(ROLE_ID)).toBe(expected);
  });
});

describe('getRolePermissions', () => {
  it('应返回权限字符串数组', async () => {
    dbMocks.poolQuery.mockResolvedValue({
      rows: [{ permission: 'backtest:run' }, { permission: 'data:read' }],
    });
    expect(await getRolePermissions(ROLE_ID)).toEqual(['backtest:run', 'data:read']);
    expect(dbMocks.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT permission FROM role_permissions'),
      [ROLE_ID],
    );
  });

  it('无权限时应返回空数组', async () => {
    dbMocks.poolQuery.mockResolvedValue({ rows: [] });
    expect(await getRolePermissions(ROLE_ID)).toEqual([]);
  });
});

describe('setRolePermissions', () => {
  it('应替换权限（先删后插）', async () => {
    mockTx({ rows: [] }, { rows: [{ id: ROLE_ID }] }, { rows: [] }, { rows: [] }, { rows: [] });
    expect(await setRolePermissions(ROLE_ID, ['backtest:run', 'data:read'])).toBe('ok');
    expect(dbMocks.clientRelease).toHaveBeenCalled();
  });

  it('角色不存在时应返回 not_found', async () => {
    mockTx({ rows: [] }, { rows: [] });
    expect(await setRolePermissions(ROLE_ID, [])).toBe('not_found');
  });

  it('空权限数组时不应执行 INSERT', async () => {
    mockTx({ rows: [] }, { rows: [{ id: ROLE_ID }] }, { rows: [] }, { rows: [] });
    expect(await setRolePermissions(ROLE_ID, [])).toBe('ok');
    expect(dbMocks.clientQuery).toHaveBeenCalledTimes(4);
  });
});

describe('getUserRoles', () => {
  it('应返回用户角色绑定记录', async () => {
    dbMocks.poolQuery.mockResolvedValue({
      rows: [
        {
          user_id: USER_ID,
          role_id: ROLE_ID,
          org_id: ORG,
          created_at: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    });
    const result = await getUserRoles(USER_ID);
    expect(result[0]).toMatchObject({
      userId: USER_ID,
      roleId: ROLE_ID,
      orgId: ORG,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });
});

describe('assignUserRole', () => {
  it.each([[ORG], [null]])('orgId=%s 应使用 ON CONFLICT DO NOTHING 幂等插入', async (orgId) => {
    dbMocks.poolQuery.mockResolvedValue({ rowCount: 1 });
    await assignUserRole(USER_ID, ROLE_ID, orgId);
    const [sql, params] = dbMocks.poolQuery.mock.calls[0];
    expect(sql).toContain('ON CONFLICT (user_id, role_id) DO NOTHING');
    expect(params).toEqual([USER_ID, ROLE_ID, orgId]);
  });
});

describe('removeUserRole', () => {
  it.each([
    [1, true],
    [0, false],
    [undefined, false],
  ])('rowCount=%s 应返回 %s', async (count, expected) => {
    dbMocks.poolQuery.mockResolvedValue({ rowCount: count });
    expect(await removeUserRole(USER_ID, ROLE_ID)).toBe(expected);
  });
});

describe('getUserPermissions', () => {
  it('应返回去重后的权限集合（UNION）', async () => {
    dbMocks.poolQuery.mockResolvedValue({
      rows: [{ permission: 'backtest:run' }, { permission: 'data:read' }],
    });
    expect(await getUserPermissions(USER_ID)).toEqual(['backtest:run', 'data:read']);
    expect(dbMocks.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT DISTINCT rp.permission'),
      [USER_ID],
    );
  });

  it('无角色绑定时应返回空数组', async () => {
    dbMocks.poolQuery.mockResolvedValue({ rows: [] });
    expect(await getUserPermissions(USER_ID)).toEqual([]);
  });
});

describe('getUserIdsByRole', () => {
  it('应返回绑定该角色的用户 ID 数组', async () => {
    dbMocks.poolQuery.mockResolvedValue({ rows: [{ user_id: 'u1' }, { user_id: 'u2' }] });
    expect(await getUserIdsByRole(ROLE_ID)).toEqual(['u1', 'u2']);
    expect(dbMocks.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT user_id FROM user_roles WHERE role_id'),
      [ROLE_ID],
    );
  });

  it('无用户绑定时应返回空数组', async () => {
    dbMocks.poolQuery.mockResolvedValue({ rows: [] });
    expect(await getUserIdsByRole(ROLE_ID)).toEqual([]);
  });
});
