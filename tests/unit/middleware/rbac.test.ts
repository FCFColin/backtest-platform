import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  requirePermission,
  requirePermissionFromDb,
  Permission,
} from '../../../packages/backend/src/middleware/rbac.js';
import {
  createMockRequest as createMockRequestBase,
  createMockResponse,
  createMockNext,
} from '../../helpers/expressMocks.js';

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

const mocks = vi.hoisted(() => ({
  getUserPermissions: vi.fn(),
  getCachedUserPermissions: vi.fn(),
  setCachedUserPermissions: vi.fn(),
}));

vi.mock('../../../packages/backend/src/repositories/rbacRepo.js', () => ({
  getUserPermissions: mocks.getUserPermissions,
}));

vi.mock('../../../packages/backend/src/infrastructure/rbacCache.js', () => ({
  getCachedUserPermissions: mocks.getCachedUserPermissions,
  setCachedUserPermissions: mocks.setCachedUserPermissions,
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: loggerMocks }));

function createMockRequest(
  user: { sub: string; role: string; org_role?: string; platform_admin?: boolean } | null,
) {
  return createMockRequestBase({
    user: user
      ? {
          sub: user.sub,
          role: user.role,
          org_role: user.org_role,
          platform_admin: user.platform_admin,
          iat: 0,
          exp: 0,
        }
      : undefined,
    path: '/test',
    method: 'GET',
  });
}

describe('RBAC requirePermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 权限矩阵测试：三角色 × 七权限
  // 企业理由：矩阵式测试确保每个角色-权限组合都被验证，
  // 避免遗漏导致权限绕过。
  const permissionMatrix = [
    // admin 拥有全部权限
    { role: 'admin', permission: Permission.BACKTEST_RUN, allowed: true },
    { role: 'admin', permission: Permission.DATA_MANAGE, allowed: true },
    { role: 'admin', permission: Permission.DATA_READ, allowed: true },
    { role: 'admin', permission: Permission.ADMIN_ACCESS, allowed: true },
    { role: 'admin', permission: Permission.OPTIMIZER_RUN, allowed: true },
    { role: 'admin', permission: Permission.SIGNAL_READ, allowed: true },
    { role: 'admin', permission: Permission.STRATEGY_MANAGE, allowed: true },
    // analyst 拥有计算和数据读取权限（无 ADMIN_ACCESS）
    { role: 'analyst', permission: Permission.BACKTEST_RUN, allowed: true },
    { role: 'analyst', permission: Permission.DATA_MANAGE, allowed: true },
    { role: 'analyst', permission: Permission.DATA_READ, allowed: true },
    { role: 'analyst', permission: Permission.ADMIN_ACCESS, allowed: false },
    { role: 'analyst', permission: Permission.OPTIMIZER_RUN, allowed: true },
    { role: 'analyst', permission: Permission.SIGNAL_READ, allowed: true },
    { role: 'analyst', permission: Permission.STRATEGY_MANAGE, allowed: true },
    // readonly 仅有读取权限
    { role: 'readonly', permission: Permission.BACKTEST_RUN, allowed: false },
    { role: 'readonly', permission: Permission.DATA_MANAGE, allowed: false },
    { role: 'readonly', permission: Permission.DATA_READ, allowed: true },
    { role: 'readonly', permission: Permission.ADMIN_ACCESS, allowed: false },
    { role: 'readonly', permission: Permission.OPTIMIZER_RUN, allowed: false },
    { role: 'readonly', permission: Permission.SIGNAL_READ, allowed: true },
    { role: 'readonly', permission: Permission.STRATEGY_MANAGE, allowed: false },
  ] as const;

  it.each(permissionMatrix)(
    '$role 应该对 $permission $allowed',
    ({ role, permission, allowed }) => {
      const req = createMockRequest({ sub: 'test-user', role });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = requirePermission(permission);
      middleware(req, res, next);

      if (allowed) {
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      } else {
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
      }
    },
  );

  it.each([
    {
      name: '无用户信息应返回 401',
      user: null,
      permission: Permission.DATA_READ,
      status: 401,
      code: 'MISSING_AUTH',
    },
    {
      name: '未知角色应被拒绝访问',
      user: { sub: 'test-user', role: 'superadmin' },
      permission: Permission.DATA_READ,
      status: 403,
      code: 'INSUFFICIENT_PERMISSION',
    },
    {
      name: '403 响应应包含 INSUFFICIENT_PERMISSION 错误码',
      user: { sub: 'test-user', role: 'readonly' },
      permission: Permission.DATA_MANAGE,
      status: 403,
      code: 'INSUFFICIENT_PERMISSION',
    },
  ])('$name', ({ user, permission, status, code }) => {
    const req = createMockRequest(user);
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requirePermission(permission);
    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code }),
      }),
    );
  });
});

describe('RBAC org_role 优先 + platform_admin 放行', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('org_role 应优先于 legacy role：legacy readonly + org_role analyst 可运行回测', () => {
    const req = createMockRequest({ sub: 'u1', role: 'readonly', org_role: 'analyst' });
    const res = createMockResponse();
    const next = createMockNext();

    requirePermission(Permission.BACKTEST_RUN)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('org_role 应优先于 legacy role：legacy admin + org_role readonly 不能运行回测', () => {
    const req = createMockRequest({ sub: 'u2', role: 'admin', org_role: 'readonly' });
    const res = createMockResponse();
    const next = createMockNext();

    requirePermission(Permission.BACKTEST_RUN)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('org_role owner 归并为 admin，拥有 ADMIN_ACCESS', () => {
    const req = createMockRequest({ sub: 'u3', role: 'readonly', org_role: 'owner' });
    const res = createMockResponse();
    const next = createMockNext();

    requirePermission(Permission.ADMIN_ACCESS)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('platform_admin=true 应放行任意权限（即使 role/org_role 为只读）', () => {
    const req = createMockRequest({
      sub: 'platform-op',
      role: 'readonly',
      org_role: 'readonly',
      platform_admin: true,
    });
    const res = createMockResponse();
    const next = createMockNext();

    requirePermission(Permission.ADMIN_ACCESS)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('platform_admin 优先于缺失用户检查之后执行（无 user 仍 401）', () => {
    const req = createMockRequest(null);
    const res = createMockResponse();
    const next = createMockNext();

    requirePermission(Permission.ADMIN_ACCESS)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('安全攻击用例', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      name: '大小写绕过：角色 "Admin"（大写 A）不应匹配 "admin"',
      role: 'Admin',
      permission: Permission.DATA_READ,
    },
    {
      name: '空白字符绕过：角色 " admin "（含空格）应被拒绝',
      role: ' admin ',
      permission: Permission.DATA_READ,
    },
    { name: '空角色字符串应被拒绝', role: '', permission: Permission.DATA_READ },
    {
      name: '权限提升：role="user" 访问 admin 端点应被拒绝（403）',
      role: 'user',
      permission: Permission.ADMIN_ACCESS,
    },
    { name: 'SQL 注入作为角色名应被拒绝', role: "' OR '1'='1", permission: Permission.DATA_READ },
  ])('$name', ({ role, permission }) => {
    const req = createMockRequest({ sub: 'attacker', role });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requirePermission(permission);
    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    // 恶意输入被当作普通字符串处理（走正常权限拒绝路径），
    // 返回 INSUFFICIENT_PERMISSION 错误码
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'INSUFFICIENT_PERMISSION' }),
      }),
    );
  });
});

// 可配置 RBAC 中间件单元测试（P2-01）
// 企业理由：requirePermissionFromDb 是安全核心中间件，必须验证缓存命中零 DB 往返、
// 缓存未命中查 DB 并回写、权限检查、legacy 回退、platform_admin 绕过与 DB 故障回退。
// Mock 策略：mock rbacRepo（getUserPermissions）与 rbacCache（缓存函数），隔离 DB 与 Redis。
describe('requirePermissionFromDb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      name: '应使用缓存权限且不查 DB',
      cached: ['backtest:run', 'data:read'],
      role: 'analyst',
      permission: Permission.BACKTEST_RUN,
      allowed: true,
    },
    {
      name: '缓存命中但无所需权限',
      cached: ['data:read'],
      role: 'custom',
      permission: Permission.BACKTEST_RUN,
      allowed: false,
    },
  ])('缓存命中：$name', async ({ cached, role, permission, allowed }) => {
    mocks.getCachedUserPermissions.mockResolvedValue(cached);
    const req = createMockRequest({ sub: 'u1', role });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requirePermissionFromDb(permission);
    await middleware(req, res, next);

    if (allowed) {
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    } else {
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    }
    expect(mocks.getUserPermissions).not.toHaveBeenCalled();
    expect(mocks.setCachedUserPermissions).not.toHaveBeenCalled();
  });

  it('缓存未命中时应查 DB 并回写缓存', async () => {
    mocks.getCachedUserPermissions.mockResolvedValue(null);
    mocks.getUserPermissions.mockResolvedValue(['backtest:run', 'data:read']);

    const req = createMockRequest({ sub: 'u1', role: 'analyst' });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requirePermissionFromDb(Permission.BACKTEST_RUN);
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mocks.getUserPermissions).toHaveBeenCalledWith('u1');
    expect(mocks.setCachedUserPermissions).toHaveBeenCalledWith('u1', [
      'backtest:run',
      'data:read',
    ]);
  });

  it.each([
    {
      name: 'DB 返回空集时回退到 legacy（analyst 有 BACKTEST_RUN）',
      role: 'analyst',
      permission: Permission.BACKTEST_RUN,
      allowed: true,
    },
    {
      name: 'legacy 回退时无权限应返回 403（readonly 访问 admin 端点）',
      role: 'readonly',
      permission: Permission.ADMIN_ACCESS,
      allowed: false,
    },
    {
      name: 'org_role 应优先于 legacy role 用于回退',
      role: 'readonly',
      org_role: 'analyst',
      permission: Permission.BACKTEST_RUN,
      allowed: true,
    },
  ])('缓存未命中且 DB 返回空集：$name', async ({ role, org_role, permission, allowed }) => {
    mocks.getCachedUserPermissions.mockResolvedValue(null);
    mocks.getUserPermissions.mockResolvedValue([]);

    const req = createMockRequest({ sub: 'u1', role, org_role });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requirePermissionFromDb(permission);
    await middleware(req, res, next);

    if (allowed) {
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    } else {
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    }
    // 缓存回写的是空集（DB 结果）
    expect(mocks.setCachedUserPermissions).toHaveBeenCalledWith('u1', []);
  });

  it('platform_admin 应绕过全部检查', async () => {
    const req = createMockRequest({
      sub: 'platform-op',
      role: 'readonly',
      org_role: 'readonly',
      platform_admin: true,
    });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requirePermissionFromDb(Permission.ADMIN_ACCESS);
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mocks.getCachedUserPermissions).not.toHaveBeenCalled();
  });

  it('无用户信息时应返回 401', async () => {
    const req = createMockRequest(null);
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requirePermissionFromDb(Permission.DATA_READ);
    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it.each([
    {
      name: 'DB 异常时回退到 legacy 检查保证可用性（admin 有全部权限）',
      role: 'admin',
      permission: Permission.ADMIN_ACCESS,
      allowed: true,
    },
    {
      name: 'DB 异常且 legacy 也无权限时应返回 403',
      role: 'readonly',
      permission: Permission.ADMIN_ACCESS,
      allowed: false,
    },
  ])('$name', async ({ role, permission, allowed }) => {
    mocks.getCachedUserPermissions.mockResolvedValue(null);
    mocks.getUserPermissions.mockRejectedValue(new Error('DB connection lost'));

    const req = createMockRequest({ sub: 'u1', role });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requirePermissionFromDb(permission);
    await middleware(req, res, next);

    if (allowed) {
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    } else {
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    }
  });

  it.each([
    {
      name: '403 响应应包含 INSUFFICIENT_PERMISSION 错误码',
      cached: ['data:read'],
      role: 'custom',
      permission: Permission.ADMIN_ACCESS,
      code: 'INSUFFICIENT_PERMISSION',
    },
    {
      name: '401 响应应包含 MISSING_AUTH 错误码',
      cached: null,
      role: null,
      permission: Permission.DATA_READ,
      code: 'MISSING_AUTH',
    },
  ])('$name', async ({ cached, role, permission, code }) => {
    mocks.getCachedUserPermissions.mockResolvedValue(cached);
    const req = createMockRequest(role ? { sub: 'u1', role } : null);
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requirePermissionFromDb(permission);
    await middleware(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code }),
      }),
    );
  });
});
