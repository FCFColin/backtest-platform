/**
 * RBAC 中间件单元测试
 *
 * 企业理由：安全核心无测试，权限绕过风险高。
 * 三角色×七权限矩阵测试确保权限配置无遗漏。
 * Table-Driven 模式（it.each）使权限矩阵一目了然。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requirePermission, Permission } from '../../../packages/backend/src/middleware/rbac.js';
import {
  createMockRequest as createMockRequestBase,
  createMockResponse,
  createMockNext,
} from '../../helpers/expressMocks.js';

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  },
}));

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

  it('无用户信息时应返回 401', () => {
    const req = createMockRequest(null);
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requirePermission(Permission.DATA_READ);
    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('未知角色应被拒绝访问', () => {
    const req = createMockRequest({ sub: 'test-user', role: 'superadmin' });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requirePermission(Permission.DATA_READ);
    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('401 响应应包含 MISSING_AUTH 错误码', () => {
    const req = createMockRequest(null);
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requirePermission(Permission.DATA_READ);
    middleware(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'MISSING_AUTH',
        }),
      }),
    );
  });

  it('403 响应应包含 INSUFFICIENT_PERMISSION 错误码', () => {
    const req = createMockRequest({ sub: 'test-user', role: 'readonly' });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requirePermission(Permission.DATA_MANAGE);
    middleware(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'INSUFFICIENT_PERMISSION',
        }),
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

  it('大小写绕过：角色 "Admin"（大写 A）不应匹配 "admin"', () => {
    // 攻击者尝试用大写 "Admin" 绕过大小写敏感的角色检查
    const req = createMockRequest({ sub: 'attacker', role: 'Admin' });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requirePermission(Permission.DATA_READ);
    middleware(req, res, next);

    // "Admin" 不等于 "admin"，应被拒绝
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('空白字符绕过：角色 " admin "（含空格）应被拒绝', () => {
    const req = createMockRequest({ sub: 'attacker', role: ' admin ' });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requirePermission(Permission.DATA_READ);
    middleware(req, res, next);

    // " admin " 不等于 "admin"，应被拒绝
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('空角色字符串应被拒绝', () => {
    const req = createMockRequest({ sub: 'attacker', role: '' });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requirePermission(Permission.DATA_READ);
    middleware(req, res, next);

    // 空字符串不是有效角色，应被拒绝
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('权限提升：role="user" 访问 admin 端点应被拒绝（403）', () => {
    // 攻击者尝试用非系统角色 "user" 访问需要 ADMIN_ACCESS 权限的端点
    const req = createMockRequest({ sub: 'attacker', role: 'user' });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requirePermission(Permission.ADMIN_ACCESS);
    middleware(req, res, next);

    // "user" 不在角色枚举中，无任何权限，应被拒绝
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    // 确保返回权限不足错误码
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'INSUFFICIENT_PERMISSION' }),
      }),
    );
  });

  it('SQL 注入作为角色名应被拒绝', () => {
    const req = createMockRequest({ sub: 'attacker', role: "' OR '1'='1" });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requirePermission(Permission.DATA_READ);
    middleware(req, res, next);

    // SQL 注入字符串不是有效角色，应被拒绝
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    // 安全断言：SQL 注入载荷被当作普通字符串处理（走正常权限拒绝路径），
    // 返回 INSUFFICIENT_PERMISSION 错误码，证明载荷未被当作 SQL 执行
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'INSUFFICIENT_PERMISSION' }),
      }),
    );
  });
});
