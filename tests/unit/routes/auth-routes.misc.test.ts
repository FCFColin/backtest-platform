/**
 * 认证路由单元测试 - 会话与组织端点（T-P3-7）
 *
 * 企业理由：刷新/登出/当前用户/组织切换是会话生命周期与多租户隔离的关键
 * 路径，正确性直接影响会话安全与租户边界。本文件覆盖：
 * - POST /refresh：刷新令牌（有效/无效/已撤销/缺失）
 * - DELETE /logout：登出（撤销令牌）
 * - GET /me：获取当前用户（未认证 401 / 已认证返回用户信息）
 * - DELETE /me：自助匿名化（撤销会话 + 匿名化账户）
 * - POST /switch-org：切换活跃组织（成员/非成员/组织非 active/缺 orgId/未认证）
 * - GET /orgs：列出用户组织与活跃组织
 *
 * Mock 策略：mock jwtAuth（token 生成/刷新/撤销）、userService（用户验证/匿名化）、
 * config（环境配置）、loginLockout、membershipService（组织关系）、logger。
 * 使用真实 Express app.listen + fetch。
 *
 * codebase-slim-followups Task 2 已删除 deprecated POST /logout，相关 Deprecation/Sunset
 * 头测试一并移除。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';
import { validRefreshPayload } from '../../helpers/authFixtures.js';
import type { Request, Response, NextFunction } from 'express';

const mocks = vi.hoisted(() => ({
  config: {
    NODE_ENV: 'production' as string,
    ADMIN_API_KEY: 'test-secret-key-123' as string,
    JWT_SECRET: 'test-jwt-secret',
    JWT_ALGORITHM: 'HS256',
    JWT_ACCESS_TTL: 900,
    JWT_REFRESH_TTL: 604800,
    JWT_PRIVATE_KEY: '',
    JWT_PRIVATE_KEY_FILE: '',
    JWT_PUBLIC_KEY: '',
    JWT_PUBLIC_KEY_FILE: '',
  },
  jwtAuth: {
    generateToken: vi.fn(),
    generateRefreshToken: vi.fn(),
    refreshAccessToken: vi.fn(),
    revokeRefreshToken: vi.fn(),
    revokeAllUserSessions: vi.fn(),
    // /me 与 /switch-org /orgs 挂 jwtAuth。测试中以 passthrough 模拟（不注入 req.user），
    // 使处理器走 401 分支（验证未认证返回 401）。
    jwtAuth: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  },
  userService: {
    verifyUser: vi.fn(),
    anonymizeUser: vi.fn(),
  },
  loginLockout: {
    isLockedOut: vi.fn().mockResolvedValue(0),
    recordFailure: vi.fn().mockResolvedValue(undefined),
    clearFailures: vi.fn().mockResolvedValue(undefined),
  },
  membershipService: {
    resolveDefaultOrg: vi.fn().mockResolvedValue(null),
    getMembership: vi.fn().mockResolvedValue(null),
    getUserMemberships: vi.fn().mockResolvedValue([]),
    isPlatformAdmin: vi.fn().mockResolvedValue(false),
    orgRoleToGlobalRole: (r: string) => (r === 'owner' ? 'admin' : r),
  },
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: mocks.config,
  validateConfig: vi.fn(),
}));

vi.mock('../../../packages/backend/src/middleware/jwtAuth.js', () => mocks.jwtAuth);

vi.mock('../../../packages/backend/src/application/auth/userService.js', () => mocks.userService);

vi.mock('../../../packages/backend/src/repositories/userRepo.js', () => mocks.userService);

vi.mock('../../../packages/backend/src/application/auth/loginLockout.js', () => mocks.loginLockout);

vi.mock(
  '../../../packages/backend/src/application/org/membershipService.js',
  () => mocks.membershipService,
);

vi.mock('../../../packages/backend/src/middleware/rbac.js', () => ({
  Role: { ADMIN: 'admin', ANALYST: 'analyst', READONLY: 'readonly' },
}));

vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  appRedis: {
    ping: vi.fn().mockResolvedValue('PONG'),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    on: vi.fn(),
  },
}));

import { createLoggerMocks } from '../../helpers/mockFactories.js';
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

import authRoutes from '../../../packages/backend/src/routes/authRoutes.js';

describe('authRoutes - 会话与组织端点', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.config.NODE_ENV = 'production';
    mocks.config.ADMIN_API_KEY = 'test-secret-key-123';
    mocks.jwtAuth.generateToken.mockResolvedValue('access-token-mock');
    mocks.jwtAuth.generateRefreshToken.mockResolvedValue('refresh-token-mock');
    server = await startExpressApp((app) => app.use('/api/v1/auth', authRoutes));
  });

  afterEach(async () => {
    await server.close();
  });

  describe('POST /refresh - 刷新令牌', () => {
    it('有效 refresh token 应返回新 token 对', async () => {
      mocks.jwtAuth.refreshAccessToken.mockResolvedValueOnce({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      const res = await fetch(`${server.url}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRefreshPayload),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.accessToken).toBe('new-access-token');
      expect(body.data.refreshToken).toBe('new-refresh-token');
    });

    it('无效/过期 refresh token 应返回 401', async () => {
      mocks.jwtAuth.refreshAccessToken.mockResolvedValueOnce(null);

      const res = await fetch(`${server.url}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: 'expired-token' }),
      });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('已撤销的 refresh token 应返回 401', async () => {
      mocks.jwtAuth.refreshAccessToken.mockResolvedValueOnce(null);

      const res = await fetch(`${server.url}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: 'revoked-token' }),
      });
      expect(res.status).toBe(401);
    });

    it('缺失 refreshToken 应返回 400', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(422);
      expect(body.error.code).toBe('MISSING_REFRESH_TOKEN');
    });
  });

  describe('DELETE /logout - 登出', () => {
    it('携带 refreshToken 应调用撤销', async () => {
      mocks.jwtAuth.revokeRefreshToken.mockResolvedValueOnce(undefined);

      const res = await fetch(`${server.url}/api/v1/auth/logout`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: 'token-to-revoke' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(mocks.jwtAuth.revokeRefreshToken).toHaveBeenCalledWith('token-to-revoke');
    });

    it('未携带 refreshToken 也应返回成功', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/logout`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(mocks.jwtAuth.revokeRefreshToken).not.toHaveBeenCalled();
    });
  });

  describe('GET /me - 获取当前用户', () => {
    it('路由直接调用应返回 401（未注入 req.user）', async () => {
      // /me 路由需要 jwtAuth 中间件注入 req.user，但 authRoutes 未挂载 jwtAuth
      // 直接访问应返回 401
      const res = await fetch(`${server.url}/api/v1/auth/me`);
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('DELETE /me - 自助匿名化', () => {
    it('已认证用户应撤销会话并匿名化账户', async () => {
      mocks.jwtAuth.jwtAuth.mockImplementation(
        (req: Request, _res: Response, next: NextFunction) => {
          (req as Request & { user?: { sub: string; role: string; exp: number } }).user = {
            sub: 'user-delete-me',
            role: 'analyst',
            exp: Math.floor(Date.now() / 1000) + 3600,
          };
          next();
        },
      );
      mocks.userService.anonymizeUser.mockResolvedValueOnce(true);

      const res = await fetch(`${server.url}/api/v1/auth/me`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer valid-token' },
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.anonymized).toBe(true);
      expect(mocks.jwtAuth.revokeAllUserSessions).toHaveBeenCalledWith('user-delete-me');
      expect(mocks.userService.anonymizeUser).toHaveBeenCalledWith('user-delete-me');
    });
  });

  describe('GET /me - 已认证', () => {
    it('jwtAuth 注入 user 时应返回用户信息', async () => {
      const exp = Math.floor(Date.now() / 1000) + 900;
      mocks.jwtAuth.jwtAuth.mockImplementation(
        (req: Request, _res: Response, next: NextFunction) => {
          (req as Request & { user?: { sub: string; role: string; exp: number } }).user = {
            sub: 'user-me',
            role: 'admin',
            exp,
          };
          next();
        },
      );

      const res = await fetch(`${server.url}/api/v1/auth/me`, {
        headers: { Authorization: 'Bearer valid-token' },
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.userId).toBe('user-me');
      expect(body.data.role).toBe('admin');
      expect(body.data.exp).toBe(exp);
    });
  });

  describe('POST /switch-org - 切换活跃组织', () => {
    function injectUser(sub = 'user-switch') {
      mocks.jwtAuth.jwtAuth.mockImplementation(
        (req: Request, _res: Response, next: NextFunction) => {
          (req as Request & { user?: { sub: string; role: string; exp: number } }).user = {
            sub,
            role: 'analyst',
            exp: Math.floor(Date.now() / 1000) + 900,
          };
          next();
        },
      );
    }

    it('成员且组织 active 时应返回新 token 对', async () => {
      injectUser();
      mocks.membershipService.getMembership.mockResolvedValueOnce({
        orgId: '22222222-2222-4222-8222-222222222222',
        orgName: 'Beta',
        orgSlug: 'beta',
        orgPlan: 'free',
        orgStatus: 'active',
        role: 'admin',
      });
      mocks.membershipService.isPlatformAdmin.mockResolvedValueOnce(false);

      const res = await fetch(`${server.url}/api/v1/auth/switch-org`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
        body: JSON.stringify({ orgId: '22222222-2222-4222-8222-222222222222' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.accessToken).toBe('access-token-mock');
      expect(body.data.org.orgId).toBe('22222222-2222-4222-8222-222222222222');
      expect(mocks.jwtAuth.generateToken).toHaveBeenCalledWith(
        'user-switch',
        'admin',
        expect.objectContaining({
          tenantId: '22222222-2222-4222-8222-222222222222',
          orgRole: 'admin',
        }),
      );
    });

    it('非该组织成员应返回 403 NOT_A_MEMBER', async () => {
      injectUser();
      mocks.membershipService.getMembership.mockResolvedValueOnce(null);

      const res = await fetch(`${server.url}/api/v1/auth/switch-org`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
        body: JSON.stringify({ orgId: '33333333-3333-4333-8333-333333333333' }),
      });
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.error.code).toBe('NOT_A_MEMBER');
    });

    it('组织非 active 应返回 403 ORG_INACTIVE', async () => {
      injectUser();
      mocks.membershipService.getMembership.mockResolvedValueOnce({
        orgId: '44444444-4444-4444-8444-444444444444',
        orgName: 'Gamma',
        orgSlug: 'gamma',
        orgPlan: 'free',
        orgStatus: 'suspended',
        role: 'owner',
      });

      const res = await fetch(`${server.url}/api/v1/auth/switch-org`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
        body: JSON.stringify({ orgId: '44444444-4444-4444-8444-444444444444' }),
      });
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.error.code).toBe('ORG_INACTIVE');
    });

    it('缺少 orgId 应返回 422', async () => {
      injectUser();
      const res = await fetch(`${server.url}/api/v1/auth/switch-org`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(422);
      expect(body.error.code).toBe('MISSING_ORG_ID');
    });

    it('未认证应返回 401', async () => {
      // 显式恢复 passthrough（前序测试用 mockImplementation 注入了 user）
      mocks.jwtAuth.jwtAuth.mockImplementation(
        (_req: Request, _res: Response, next: NextFunction) => next(),
      );
      const res = await fetch(`${server.url}/api/v1/auth/switch-org`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: '55555555-5555-4555-8555-555555555555' }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /orgs - 列出用户组织', () => {
    it('应返回成员组织列表与活跃组织', async () => {
      mocks.jwtAuth.jwtAuth.mockImplementation(
        (req: Request, _res: Response, next: NextFunction) => {
          (
            req as Request & {
              user?: { sub: string; role: string; tenant_id?: string; exp: number };
            }
          ).user = {
            sub: 'user-orgs',
            role: 'analyst',
            tenant_id: '66666666-6666-4666-8666-666666666666',
            exp: Math.floor(Date.now() / 1000) + 900,
          };
          next();
        },
      );
      mocks.membershipService.getUserMemberships.mockResolvedValueOnce([
        {
          orgId: '66666666-6666-4666-8666-666666666666',
          orgName: 'Delta',
          orgSlug: 'delta',
          orgPlan: 'pro',
          orgStatus: 'active',
          role: 'analyst',
        },
      ]);

      const res = await fetch(`${server.url}/api/v1/auth/orgs`, {
        headers: { Authorization: 'Bearer t' },
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.activeOrgId).toBe('66666666-6666-4666-8666-666666666666');
      expect(body.data.orgs).toHaveLength(1);
      expect(body.data.orgs[0].slug).toBe('delta');
    });
  });
});
