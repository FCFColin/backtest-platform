/**
 * 可配置 RBAC 仓储单元测试（P2-01）
 *
 * 企业理由：rbacRepo 承载角色 CRUD、权限分配、用户角色绑定等安全核心数据操作，
 * 必须验证：
 * 1. 角色 CRUD 正确映射 DB 行 ↔ 记录
 * 2. 系统角色保护（is_system=TRUE 拒绝修改/删除）
 * 3. 权限替换的原子性（先删后插）
 * 4. 用户角色绑定/解绑
 * 5. 权限聚合（UNION 去重）
 *
 * Mock 策略：mock db/pool（getPool + withTenant），隔离 DB，
 * 专注验证 SQL 逻辑与映射。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  getPool: () => ({
    query: dbMocks.poolQuery,
    connect: async () => dbMocks.mockClient,
  }),
  withTenant: (tenantId: string, fn: (client: typeof dbMocks.mockClient) => Promise<unknown>) => {
    dbMocks.withTenant(tenantId);
    return fn(dbMocks.mockClient);
  },
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  },
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getRolesByOrg', () => {
  it('应使用 withTenant 并返回租户角色 + 系统角色', async () => {
    dbMocks.clientQuery.mockResolvedValue({ rows: [systemRoleRow, roleRow] });
    const result = await getRolesByOrg(ORG);

    expect(dbMocks.withTenant).toHaveBeenCalledWith(ORG);
    expect(result).toHaveLength(2);
    expect(result[0].isSystem).toBe(true);
    expect(result[0].orgId).toBeNull();
    expect(result[1].isSystem).toBe(false);
    expect(result[1].orgId).toBe(ORG);
    expect(result[1].name).toBe('custom-role');
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

    expect(dbMocks.withTenant).toHaveBeenCalledWith(ORG);
    expect(result.id).toBe(ROLE_ID);
    expect(result.isSystem).toBe(false);
    expect(result.name).toBe('custom-role');

    // 验证 SQL 参数：org_id, name, description
    const sql = dbMocks.clientQuery.mock.calls[0][0];
    const params = dbMocks.clientQuery.mock.calls[0][1];
    expect(sql).toContain('INSERT INTO roles');
    expect(params).toEqual([ORG, 'custom-role', '测试角色']);
  });

  it('description 为 null 时应正确传入', async () => {
    dbMocks.clientQuery.mockResolvedValue({ rows: [{ ...roleRow, description: null }] });
    await createRole(ORG, 'no-desc', null);
    const params = dbMocks.clientQuery.mock.calls[0][1];
    expect(params[2]).toBeNull();
  });
});

describe('updateRole', () => {
  it('应更新非系统角色并返回记录', async () => {
    // 模拟事务：BEGIN → SELECT is_system → UPDATE → COMMIT
    dbMocks.clientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ is_system: false }] }) // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [{ ...roleRow, name: 'updated' }] }) // UPDATE RETURNING
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await updateRole(ROLE_ID, 'updated', '新描述');
    expect(result).not.toBe('not_found');
    expect(result).not.toBe('system_role');
    if (typeof result === 'object') {
      expect(result.name).toBe('updated');
    }
    expect(dbMocks.clientRelease).toHaveBeenCalled();
  });

  it('角色不存在时应返回 not_found', async () => {
    dbMocks.clientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // SELECT FOR UPDATE (empty)

    const result = await updateRole(ROLE_ID, 'x', null);
    expect(result).toBe('not_found');
    expect(dbMocks.clientRelease).toHaveBeenCalled();
  });

  it('系统角色应返回 system_role 拒绝修改', async () => {
    dbMocks.clientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ is_system: true }] }); // SELECT FOR UPDATE

    const result = await updateRole(ROLE_ID, 'x', null);
    expect(result).toBe('system_role');
    expect(dbMocks.clientRelease).toHaveBeenCalled();
  });
});

describe('deleteRole', () => {
  it('应删除非系统角色', async () => {
    dbMocks.clientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ is_system: false }] }) // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [] }) // DELETE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await deleteRole(ROLE_ID);
    expect(result).toBe(true);
    expect(dbMocks.clientRelease).toHaveBeenCalled();
  });

  it('角色不存在时应返回 not_found', async () => {
    dbMocks.clientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // SELECT FOR UPDATE (empty)

    const result = await deleteRole(ROLE_ID);
    expect(result).toBe('not_found');
  });

  it('系统角色应返回 system_role 拒绝删除', async () => {
    dbMocks.clientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ is_system: true }] }); // SELECT FOR UPDATE

    const result = await deleteRole(ROLE_ID);
    expect(result).toBe('system_role');
  });
});

describe('getRolePermissions', () => {
  it('应返回权限字符串数组', async () => {
    dbMocks.poolQuery.mockResolvedValue({
      rows: [{ permission: 'backtest:run' }, { permission: 'data:read' }],
    });
    const result = await getRolePermissions(ROLE_ID);
    expect(result).toEqual(['backtest:run', 'data:read']);
    expect(dbMocks.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT permission FROM role_permissions'),
      [ROLE_ID],
    );
  });

  it('无权限时应返回空数组', async () => {
    dbMocks.poolQuery.mockResolvedValue({ rows: [] });
    const result = await getRolePermissions(ROLE_ID);
    expect(result).toEqual([]);
  });
});

describe('setRolePermissions', () => {
  it('应替换权限（先删后插）', async () => {
    dbMocks.clientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: ROLE_ID }] }) // SELECT id FROM roles
      .mockResolvedValueOnce({ rows: [] }) // DELETE
      .mockResolvedValueOnce({ rows: [] }) // INSERT (unnest)
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await setRolePermissions(ROLE_ID, ['backtest:run', 'data:read']);
    expect(result).toBe('ok');
    expect(dbMocks.clientRelease).toHaveBeenCalled();
  });

  it('角色不存在时应返回 not_found', async () => {
    dbMocks.clientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // SELECT id FROM roles (empty)

    const result = await setRolePermissions(ROLE_ID, []);
    expect(result).toBe('not_found');
  });

  it('空权限数组时不应执行 INSERT', async () => {
    dbMocks.clientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: ROLE_ID }] }) // SELECT
      .mockResolvedValueOnce({ rows: [] }) // DELETE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT (no INSERT)

    const result = await setRolePermissions(ROLE_ID, []);
    expect(result).toBe('ok');
    // 验证只有 4 次 query（BEGIN + SELECT + DELETE + COMMIT），无 INSERT
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
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe(USER_ID);
    expect(result[0].roleId).toBe(ROLE_ID);
    expect(result[0].orgId).toBe(ORG);
    expect(result[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('assignUserRole', () => {
  it('应使用 ON CONFLICT DO NOTHING 幂等插入', async () => {
    dbMocks.poolQuery.mockResolvedValue({ rowCount: 1 });
    await assignUserRole(USER_ID, ROLE_ID, ORG);

    const sql = dbMocks.poolQuery.mock.calls[0][0];
    const params = dbMocks.poolQuery.mock.calls[0][1];
    expect(sql).toContain('ON CONFLICT (user_id, role_id) DO NOTHING');
    expect(params).toEqual([USER_ID, ROLE_ID, ORG]);
  });

  it('orgId 为 null 时应正确传入', async () => {
    dbMocks.poolQuery.mockResolvedValue({ rowCount: 1 });
    await assignUserRole(USER_ID, ROLE_ID, null);
    const params = dbMocks.poolQuery.mock.calls[0][1];
    expect(params[2]).toBeNull();
  });
});

describe('removeUserRole', () => {
  it('移除成功应返回 true', async () => {
    dbMocks.poolQuery.mockResolvedValue({ rowCount: 1 });
    const result = await removeUserRole(USER_ID, ROLE_ID);
    expect(result).toBe(true);
  });

  it('不存在时应返回 false', async () => {
    dbMocks.poolQuery.mockResolvedValue({ rowCount: 0 });
    const result = await removeUserRole(USER_ID, ROLE_ID);
    expect(result).toBe(false);
  });

  it('rowCount 为 undefined 时应返回 false', async () => {
    dbMocks.poolQuery.mockResolvedValue({ rowCount: undefined });
    const result = await removeUserRole(USER_ID, ROLE_ID);
    expect(result).toBe(false);
  });
});

describe('getUserPermissions', () => {
  it('应返回去重后的权限集合（UNION）', async () => {
    dbMocks.poolQuery.mockResolvedValue({
      rows: [{ permission: 'backtest:run' }, { permission: 'data:read' }],
    });
    const result = await getUserPermissions(USER_ID);
    expect(result).toEqual(['backtest:run', 'data:read']);
    expect(dbMocks.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT DISTINCT rp.permission'),
      [USER_ID],
    );
  });

  it('无角色绑定时应返回空数组', async () => {
    dbMocks.poolQuery.mockResolvedValue({ rows: [] });
    const result = await getUserPermissions(USER_ID);
    expect(result).toEqual([]);
  });
});

describe('getUserIdsByRole', () => {
  it('应返回绑定该角色的用户 ID 数组', async () => {
    dbMocks.poolQuery.mockResolvedValue({
      rows: [{ user_id: 'u1' }, { user_id: 'u2' }],
    });
    const result = await getUserIdsByRole(ROLE_ID);
    expect(result).toEqual(['u1', 'u2']);
    expect(dbMocks.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT user_id FROM user_roles WHERE role_id'),
      [ROLE_ID],
    );
  });

  it('无用户绑定时应返回空数组', async () => {
    dbMocks.poolQuery.mockResolvedValue({ rows: [] });
    const result = await getUserIdsByRole(ROLE_ID);
    expect(result).toEqual([]);
  });
});
