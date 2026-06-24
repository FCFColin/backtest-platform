/**
 * RBAC 中间件单元测试
 *
 * 企业理由：安全核心无测试，权限绕过风险高。
 * 三角色×七权限矩阵测试确保权限配置无遗漏。
 * Table-Driven 模式（it.each）使权限矩阵一目了然。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import { requirePermission, Permission, Role } from '../../../api/middleware/rbac.js';
import type { AuthenticatedRequest } from '../../../api/middleware/jwtAuth.js';

// vi.hoisted 确保 mock 变量在 vi.mock 提升前完成初始化
const mocks = vi.hoisted(() => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn() })),
  },
}));

vi.mock('../../../api/utils/logger.js', () => ({
  logger: mocks.logger,
}));

// Helper: create mock request with user
function createMockRequest(user: { sub: string; role: string } | null): AuthenticatedRequest {
  return {
    user: user ? { sub: user.sub, role: user.role as any, iat: 0, exp: 0 } : undefined,
    path: '/test',
    method: 'GET',
  } as AuthenticatedRequest;
}

// Helper: create mock response
function createMockResponse(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

// Helper: create mock next
function createMockNext(): NextFunction {
  return vi.fn() as NextFunction;
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
