import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer, type TestRequest } from '../../helpers/expressApp.js';

const mocks = vi.hoisted(() => ({
  rbacRepo: {
    getRolesByOrg: vi.fn(),
    createRole: vi.fn(),
    updateRole: vi.fn(),
    deleteRole: vi.fn(),
    getRolePermissions: vi.fn(),
    setRolePermissions: vi.fn(),
    getUserRoles: vi.fn(),
    assignUserRole: vi.fn(),
    removeUserRole: vi.fn(),
    getUserIdsByRole: vi.fn(),
  },
  rbacCache: {
    invalidateUserPermissions: vi.fn(),
    invalidateOrgRolePermissions: vi.fn(),
  },
}));

vi.mock('../../../packages/backend/src/repositories/rbacRepo.js', () => mocks.rbacRepo);
vi.mock('../../../packages/backend/src/infrastructure/rbacCache.js', () => mocks.rbacCache);
import { createLoggerMocks } from '../../helpers/mockFactories.js';
import '../../helpers/middlewareMocks.js';
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

import rbacRoutes from '../../../packages/backend/src/routes/rbacRoutes.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const ROLE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = '22222222-2222-2222-2222-222222222222';

const roleRecord = {
  id: ROLE_ID,
  orgId: ORG,
  name: 'custom-role',
  description: 'test',
  isSystem: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

let server: TestServer;

beforeEach(async () => {
  vi.clearAllMocks();
  server = await startExpressApp((app) => {
    app.use((req: TestRequest, _res, next) => {
      req.tenantId = ORG;
      req.user = { sub: USER_ID, role: 'admin', org_role: 'admin' };
      next();
    });
    app.use('/api/v1/admin', rbacRoutes);
  });
});

afterEach(async () => {
  await server.close();
});

describe('GET /roles', () => {
  it('应返回租户角色列表', async () => {
    mocks.rbacRepo.getRolesByOrg.mockResolvedValue([roleRecord]);
    const res = await fetch(`${server.url}/api/v1/admin/roles`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(mocks.rbacRepo.getRolesByOrg).toHaveBeenCalledWith(ORG);
  });
});

describe('POST /roles', () => {
  it('应创建角色并返回 201', async () => {
    mocks.rbacRepo.createRole.mockResolvedValue(roleRecord);
    const res = await fetch(`${server.url}/api/v1/admin/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'custom-role', description: 'test' }),
    });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.id).toBe(ROLE_ID);
    expect(mocks.rbacRepo.createRole).toHaveBeenCalledWith(ORG, 'custom-role', 'test');
  });

  it('唯一约束冲突应返回 409', async () => {
    mocks.rbacRepo.createRole.mockRejectedValue(new Error('uq_roles_org_name'));
    const res = await fetch(`${server.url}/api/v1/admin/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'dup' }),
    });
    expect(res.status).toBe(409);
  });

  it('其他错误应返回 500', async () => {
    mocks.rbacRepo.createRole.mockRejectedValue(new Error('db down'));
    const res = await fetch(`${server.url}/api/v1/admin/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    });
    expect(res.status).toBe(500);
  });
});

describe('PUT /roles/:id', () => {
  it('应更新角色', async () => {
    mocks.rbacRepo.getRolesByOrg.mockResolvedValue([roleRecord]);
    mocks.rbacRepo.updateRole.mockResolvedValue({ ...roleRecord, name: 'updated' });
    const res = await fetch(`${server.url}/api/v1/admin/roles/${ROLE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'updated', description: 'new' }),
    });
    expect(res.status).toBe(200);
    expect(mocks.rbacRepo.updateRole).toHaveBeenCalledWith(ROLE_ID, 'updated', 'new');
  });

  it('角色不属于租户应返回 404', async () => {
    mocks.rbacRepo.getRolesByOrg.mockResolvedValue([]);
    const res = await fetch(`${server.url}/api/v1/admin/roles/${ROLE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    });
    expect(res.status).toBe(404);
  });

  it('系统角色应返回 403', async () => {
    mocks.rbacRepo.getRolesByOrg.mockResolvedValue([roleRecord]);
    mocks.rbacRepo.updateRole.mockResolvedValue('system_role');
    const res = await fetch(`${server.url}/api/v1/admin/roles/${ROLE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /roles/:id', () => {
  it('应删除角色', async () => {
    mocks.rbacRepo.getRolesByOrg.mockResolvedValue([roleRecord]);
    mocks.rbacRepo.deleteRole.mockResolvedValue(true);
    const res = await fetch(`${server.url}/api/v1/admin/roles/${ROLE_ID}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(mocks.rbacRepo.deleteRole).toHaveBeenCalledWith(ROLE_ID);
  });

  it('系统角色应返回 403', async () => {
    mocks.rbacRepo.getRolesByOrg.mockResolvedValue([roleRecord]);
    mocks.rbacRepo.deleteRole.mockResolvedValue('system_role');
    const res = await fetch(`${server.url}/api/v1/admin/roles/${ROLE_ID}`, { method: 'DELETE' });
    expect(res.status).toBe(403);
  });
});

describe('GET /roles/:id/permissions', () => {
  it('应返回权限列表', async () => {
    mocks.rbacRepo.getRolesByOrg.mockResolvedValue([roleRecord]);
    mocks.rbacRepo.getRolePermissions.mockResolvedValue(['backtest:run', 'data:read']);
    const res = await fetch(`${server.url}/api/v1/admin/roles/${ROLE_ID}/permissions`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual(['backtest:run', 'data:read']);
  });
});

describe('PUT /roles/:id/permissions', () => {
  it('应替换权限并失效缓存', async () => {
    mocks.rbacRepo.getRolesByOrg.mockResolvedValue([roleRecord]);
    mocks.rbacRepo.setRolePermissions.mockResolvedValue('ok');
    mocks.rbacRepo.getUserIdsByRole.mockResolvedValue([USER_ID]);
    const res = await fetch(`${server.url}/api/v1/admin/roles/${ROLE_ID}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: ['backtest:run'] }),
    });
    expect(res.status).toBe(200);
    expect(mocks.rbacCache.invalidateUserPermissions).toHaveBeenCalledWith(USER_ID);
    expect(mocks.rbacCache.invalidateOrgRolePermissions).toHaveBeenCalledWith(ORG);
  });

  it('角色不存在应返回 404', async () => {
    mocks.rbacRepo.getRolesByOrg.mockResolvedValue([roleRecord]);
    mocks.rbacRepo.setRolePermissions.mockResolvedValue('not_found');
    const res = await fetch(`${server.url}/api/v1/admin/roles/${ROLE_ID}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: ['backtest:run'] }),
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /users/:userId/roles', () => {
  it('应返回用户角色绑定', async () => {
    mocks.rbacRepo.getUserRoles.mockResolvedValue([
      { userId: USER_ID, roleId: ROLE_ID, orgId: ORG, createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    const res = await fetch(`${server.url}/api/v1/admin/users/${USER_ID}/roles`);
    expect(res.status).toBe(200);
  });
});

describe('POST /users/:userId/roles', () => {
  it('应分配角色并失效缓存', async () => {
    mocks.rbacRepo.getRolesByOrg.mockResolvedValue([roleRecord]);
    mocks.rbacRepo.assignUserRole.mockResolvedValue(undefined);
    const res = await fetch(`${server.url}/api/v1/admin/users/${USER_ID}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleId: ROLE_ID }),
    });
    expect(res.status).toBe(201);
    expect(mocks.rbacRepo.assignUserRole).toHaveBeenCalledWith(USER_ID, ROLE_ID, ORG);
    expect(mocks.rbacCache.invalidateUserPermissions).toHaveBeenCalledWith(USER_ID);
  });
});

describe('DELETE /users/:userId/roles/:roleId', () => {
  it('应移除角色绑定', async () => {
    mocks.rbacRepo.removeUserRole.mockResolvedValue(true);
    const res = await fetch(`${server.url}/api/v1/admin/users/${USER_ID}/roles/${ROLE_ID}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    expect(mocks.rbacCache.invalidateUserPermissions).toHaveBeenCalledWith(USER_ID);
  });

  it('绑定不存在应返回 404', async () => {
    mocks.rbacRepo.removeUserRole.mockResolvedValue(false);
    const res = await fetch(`${server.url}/api/v1/admin/users/${USER_ID}/roles/${ROLE_ID}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(404);
  });
});
