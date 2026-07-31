/**
 * 可配置 RBAC 中间件单元测试（P2-01）
 *
 * 企业理由：requirePermissionFromDb 是安全核心中间件，必须验证：
 * 1. 缓存命中时零 DB 往返
 * 2. 缓存未命中时查 DB 并回写缓存
 * 3. 权限检查正确（有权限放行 / 无权限 403）
 * 4. 向后兼容：无 DB 角色绑定时回退到 legacy ROLE_PERMISSIONS
 * 5. platform_admin 绕过全部检查
 * 6. DB 故障时回退到 legacy 检查保证可用性
 *
 * Mock 策略：mock rbacRepo（getUserPermissions）与 rbacCache（缓存函数），
 * 隔离 DB 与 Redis，专注验证中间件逻辑。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
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
  user: {
    sub: string;
    role: string;
    org_role?: string;
    platform_admin?: boolean;
  } | null,
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

describe('requirePermissionFromDb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('缓存命中时应使用缓存权限且不查 DB', async () => {
    mocks.getCachedUserPermissions.mockResolvedValue(['backtest:run', 'data:read']);
    const req = createMockRequest({ sub: 'u1', role: 'analyst' });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requirePermissionFromDb(Permission.BACKTEST_RUN);
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(mocks.getUserPermissions).not.toHaveBeenCalled();
    expect(mocks.setCachedUserPermissions).not.toHaveBeenCalled();
  });

  it('缓存命中但无所需权限时应返回 403', async () => {
    mocks.getCachedUserPermissions.mockResolvedValue(['data:read']);
    const req = createMockRequest({ sub: 'u1', role: 'custom' });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requirePermissionFromDb(Permission.BACKTEST_RUN);
    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.getUserPermissions).not.toHaveBeenCalled();
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

  it('缓存未命中且 DB 返回空集时应回退到 legacy ROLE_PERMISSIONS', async () => {
    // DB 无角色绑定 → 回退到 legacy
    mocks.getCachedUserPermissions.mockResolvedValue(null);
    mocks.getUserPermissions.mockResolvedValue([]);

    const req = createMockRequest({ sub: 'u1', role: 'analyst' });
    const res = createMockResponse();
    const next = createMockNext();

    // analyst 在 legacy 映射中有 BACKTEST_RUN 权限
    const middleware = requirePermissionFromDb(Permission.BACKTEST_RUN);
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    // 缓存回写的是空集（DB 结果）
    expect(mocks.setCachedUserPermissions).toHaveBeenCalledWith('u1', []);
  });

  it('legacy 回退时无权限应返回 403（readonly 访问 admin 端点）', async () => {
    mocks.getCachedUserPermissions.mockResolvedValue(null);
    mocks.getUserPermissions.mockResolvedValue([]);

    const req = createMockRequest({ sub: 'u1', role: 'readonly' });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requirePermissionFromDb(Permission.ADMIN_ACCESS);
    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('org_role 应优先于 legacy role 用于回退', async () => {
    mocks.getCachedUserPermissions.mockResolvedValue(null);
    mocks.getUserPermissions.mockResolvedValue([]);

    // legacy role=readonly 但 org_role=analyst → 回退到 analyst 权限
    const req = createMockRequest({ sub: 'u1', role: 'readonly', org_role: 'analyst' });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requirePermissionFromDb(Permission.BACKTEST_RUN);
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
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

  it('DB 查询异常时应回退到 legacy 检查保证可用性', async () => {
    mocks.getCachedUserPermissions.mockResolvedValue(null);
    mocks.getUserPermissions.mockRejectedValue(new Error('DB connection lost'));

    const req = createMockRequest({ sub: 'u1', role: 'admin' });
    const res = createMockResponse();
    const next = createMockNext();

    // admin 在 legacy 中有全部权限
    const middleware = requirePermissionFromDb(Permission.ADMIN_ACCESS);
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('DB 异常且 legacy 也无权限时应返回 403', async () => {
    mocks.getCachedUserPermissions.mockResolvedValue(null);
    mocks.getUserPermissions.mockRejectedValue(new Error('DB connection lost'));

    const req = createMockRequest({ sub: 'u1', role: 'readonly' });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requirePermissionFromDb(Permission.ADMIN_ACCESS);
    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('403 响应应包含 INSUFFICIENT_PERMISSION 错误码', async () => {
    mocks.getCachedUserPermissions.mockResolvedValue(['data:read']);

    const req = createMockRequest({ sub: 'u1', role: 'custom' });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requirePermissionFromDb(Permission.ADMIN_ACCESS);
    await middleware(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'INSUFFICIENT_PERMISSION' }),
      }),
    );
  });

  it('401 响应应包含 MISSING_AUTH 错误码', async () => {
    const req = createMockRequest(null);
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requirePermissionFromDb(Permission.DATA_READ);
    await middleware(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'MISSING_AUTH' }),
      }),
    );
  });
});
