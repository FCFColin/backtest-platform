import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../../helpers/loggerMock.js';
import { requirePermission, Permission } from '../../../packages/backend/src/middleware/rbac.js';
import {
  createMockRequest as createMockRequestBase,
  createMockResponse,
  createMockNext,
} from '../../helpers/expressMocks.js';
import { expectProblem } from '../../helpers/routeAssertions.js';
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

  const expectedRolePermissions: Record<string, Permission[]> = {
    admin: Object.values(Permission),
    analyst: [
      Permission.BACKTEST_RUN,
      Permission.DATA_MANAGE,
      Permission.DATA_READ,
      Permission.OPTIMIZER_RUN,
      Permission.SIGNAL_READ,
      Permission.STRATEGY_MANAGE,
    ],
    readonly: [Permission.DATA_READ, Permission.SIGNAL_READ],
  };
  const permissionMatrix = Object.entries(expectedRolePermissions).flatMap(([role, perms]) =>
    Object.values(Permission).map((permission) => ({
      role,
      permission,
      allowed: perms.includes(permission),
    })),
  );

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
    expectProblem(res, code, status);
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
