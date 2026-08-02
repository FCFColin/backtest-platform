import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loggerMocks } from '../../helpers/loggerFixture.js';
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

  const permissionMatrix = [
    { role: 'admin', permission: Permission.BACKTEST_RUN, allowed: true },
    { role: 'admin', permission: Permission.DATA_MANAGE, allowed: true },
    { role: 'admin', permission: Permission.DATA_READ, allowed: true },
    { role: 'admin', permission: Permission.ADMIN_ACCESS, allowed: true },
    { role: 'admin', permission: Permission.OPTIMIZER_RUN, allowed: true },
    { role: 'admin', permission: Permission.SIGNAL_READ, allowed: true },
    { role: 'admin', permission: Permission.STRATEGY_MANAGE, allowed: true },
    { role: 'analyst', permission: Permission.BACKTEST_RUN, allowed: true },
    { role: 'analyst', permission: Permission.DATA_MANAGE, allowed: true },
    { role: 'analyst', permission: Permission.DATA_READ, allowed: true },
    { role: 'analyst', permission: Permission.ADMIN_ACCESS, allowed: false },
    { role: 'analyst', permission: Permission.OPTIMIZER_RUN, allowed: true },
    { role: 'analyst', permission: Permission.SIGNAL_READ, allowed: true },
    { role: 'analyst', permission: Permission.STRATEGY_MANAGE, allowed: true },
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
    ['无用户信息应返回 401', null, Permission.DATA_READ, 401, 'MISSING_AUTH'],
    [
      '未知角色应被拒绝访问',
      { sub: 'test-user', role: 'superadmin' },
      Permission.DATA_READ,
      403,
      'INSUFFICIENT_PERMISSION',
    ],
    [
      'readonly 无 DATA_MANAGE 权限应返回 403',
      { sub: 'test-user', role: 'readonly' },
      Permission.DATA_MANAGE,
      403,
      'INSUFFICIENT_PERMISSION',
    ],
    [
      '大小写绕过：角色 "Admin"（大写 A）不应匹配 "admin"',
      { sub: 'attacker', role: 'Admin' },
      Permission.DATA_READ,
      403,
      'INSUFFICIENT_PERMISSION',
    ],
    [
      '空白字符绕过：角色 " admin "（含空格）应被拒绝',
      { sub: 'attacker', role: ' admin ' },
      Permission.DATA_READ,
      403,
      'INSUFFICIENT_PERMISSION',
    ],
    [
      '空角色字符串应被拒绝',
      { sub: 'attacker', role: '' },
      Permission.DATA_READ,
      403,
      'INSUFFICIENT_PERMISSION',
    ],
    [
      '权限提升：role="user" 访问 admin 端点应被拒绝（403）',
      { sub: 'attacker', role: 'user' },
      Permission.ADMIN_ACCESS,
      403,
      'INSUFFICIENT_PERMISSION',
    ],
    [
      'SQL 注入作为角色名应被拒绝',
      { sub: 'attacker', role: "' OR '1'='1" },
      Permission.DATA_READ,
      403,
      'INSUFFICIENT_PERMISSION',
    ],
  ])('%s', (_n, user, permission, status, code) => {
    const req = createMockRequest(user);
    const res = createMockResponse();
    const next = createMockNext();
    requirePermission(permission)(req, res, next);
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
  it.each([
    [
      'legacy readonly + org_role analyst 可运行回测',
      { sub: 'u1', role: 'readonly', org_role: 'analyst' },
      Permission.BACKTEST_RUN,
      'allow',
    ],
    [
      'legacy admin + org_role readonly 不能运行回测',
      { sub: 'u2', role: 'admin', org_role: 'readonly' },
      Permission.BACKTEST_RUN,
      403,
    ],
    [
      'org_role owner 归并为 admin，拥有 ADMIN_ACCESS',
      { sub: 'u3', role: 'readonly', org_role: 'owner' },
      Permission.ADMIN_ACCESS,
      'allow',
    ],
    [
      'platform_admin=true 应放行任意权限（即使 role/org_role 为只读）',
      { sub: 'platform-op', role: 'readonly', org_role: 'readonly', platform_admin: true },
      Permission.ADMIN_ACCESS,
      'allow',
    ],
    [
      'platform_admin 优先于缺失用户检查之后执行（无 user 仍 401）',
      null,
      Permission.ADMIN_ACCESS,
      401,
    ],
  ])('%s', (_n, user, permission, expected) => {
    const req = createMockRequest(user);
    const res = createMockResponse();
    const next = createMockNext();
    requirePermission(permission)(req, res, next);
    if (expected === 'allow') {
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    } else {
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(expected);
    }
  });
});

// P2-01：安全核心中间件 — 覆盖缓存命中零 DB 往返、未命中查 DB 回写、legacy 回退、
describe('requirePermissionFromDb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it.each([
    [
      '缓存命中应使用缓存权限且不查 DB',
      { sub: 'u1', role: 'analyst' },
      'hit',
      ['backtest:run', 'data:read'],
      Permission.BACKTEST_RUN,
      true,
      null,
    ],
    [
      '缓存命中但无所需权限',
      { sub: 'u1', role: 'custom' },
      'hit',
      ['data:read'],
      Permission.BACKTEST_RUN,
      false,
      'INSUFFICIENT_PERMISSION',
    ],
    [
      'DB 返回空集时回退到 legacy（analyst 有 BACKTEST_RUN）',
      { sub: 'u1', role: 'analyst' },
      'empty',
      null,
      Permission.BACKTEST_RUN,
      true,
      null,
    ],
    [
      'legacy 回退时无权限应返回 403（readonly 访问 admin 端点）',
      { sub: 'u1', role: 'readonly' },
      'empty',
      null,
      Permission.ADMIN_ACCESS,
      false,
      null,
    ],
    [
      'org_role 应优先于 legacy role 用于回退',
      { sub: 'u1', role: 'readonly', org_role: 'analyst' },
      'empty',
      null,
      Permission.BACKTEST_RUN,
      true,
      null,
    ],
    [
      'DB 异常时回退到 legacy 检查保证可用性（admin 有全部权限）',
      { sub: 'u1', role: 'admin' },
      'reject',
      null,
      Permission.ADMIN_ACCESS,
      true,
      null,
    ],
    [
      'DB 异常且 legacy 也无权限时应返回 403',
      { sub: 'u1', role: 'readonly' },
      'reject',
      null,
      Permission.ADMIN_ACCESS,
      false,
      null,
    ],
    [
      '403 响应应包含 INSUFFICIENT_PERMISSION 错误码',
      { sub: 'u1', role: 'custom' },
      'hit',
      ['data:read'],
      Permission.ADMIN_ACCESS,
      false,
      'INSUFFICIENT_PERMISSION',
    ],
    [
      '401 响应应包含 MISSING_AUTH 错误码',
      null,
      'hit',
      null,
      Permission.DATA_READ,
      false,
      'MISSING_AUTH',
    ],
  ])('%s', async (_n, user, dbMode, cached, permission, allowed, code) => {
    const req = createMockRequest(user);
    const res = createMockResponse();
    const next = createMockNext();
    if (user) {
      mocks.getCachedUserPermissions.mockResolvedValue(cached);
      if (dbMode === 'empty') mocks.getUserPermissions.mockResolvedValue([]);
      if (dbMode === 'reject')
        mocks.getUserPermissions.mockRejectedValue(new Error('DB connection lost'));
    }
    await requirePermissionFromDb(permission)(req, res, next);
    if (allowed) {
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    } else {
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(code === 'MISSING_AUTH' ? 401 : 403);
      if (code) {
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: expect.objectContaining({ code }),
          }),
        );
      }
    }
    if (!user || dbMode === 'hit') {
      expect(mocks.getUserPermissions).not.toHaveBeenCalled();
      expect(mocks.setCachedUserPermissions).not.toHaveBeenCalled();
    }
    if (dbMode === 'empty') expect(mocks.setCachedUserPermissions).toHaveBeenCalledWith('u1', []);
  });
  it('缓存未命中时应查 DB 并回写缓存', async () => {
    mocks.getCachedUserPermissions.mockResolvedValue(null);
    mocks.getUserPermissions.mockResolvedValue(['backtest:run', 'data:read']);
    const req = createMockRequest({ sub: 'u1', role: 'analyst' });
    const res = createMockResponse();
    const next = createMockNext();
    await requirePermissionFromDb(Permission.BACKTEST_RUN)(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(mocks.getUserPermissions).toHaveBeenCalledWith('u1');
    expect(mocks.setCachedUserPermissions).toHaveBeenCalledWith('u1', [
      'backtest:run',
      'data:read',
    ]);
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
    await requirePermissionFromDb(Permission.ADMIN_ACCESS)(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(mocks.getCachedUserPermissions).not.toHaveBeenCalled();
  });
});
