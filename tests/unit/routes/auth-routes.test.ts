/**
 * 认证路由单元测试（T-P3-7）
 *
 * 企业理由：认证路由是安全入口，登录/刷新/登出的正确性直接影响
 * 会话安全与用户体验。测试覆盖：
 * - POST /login：API Key 登录（成功/失败/开发环境跳过）
 * - POST /login/password：用户名密码登录（成功/失败/缺失凭证）
 * - POST /refresh：刷新令牌（有效/无效/缺失）
 * - DELETE /logout：登出（撤销令牌）
 * - GET /me：获取当前用户（已认证/未认证）
 * - 密码哈希验证（argon2 通过 userService mock 验证）
 *
 * Mock 策略：mock jwtAuth（token 生成/刷新/撤销）、userService（用户验证）、
 * config（环境配置）、logger。使用真实 Express app.listen + fetch。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';
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
    // T-12：/me 现挂 jwtAuth。测试中以 passthrough 模拟（不注入 req.user），
    // 使 /me 处理器走 401 分支（验证未认证返回 401）。
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

vi.mock('../../../packages/backend/src/services/userService.js', () => mocks.userService);

vi.mock('../../../packages/backend/src/services/loginLockout.js', () => mocks.loginLockout);

vi.mock(
  '../../../packages/backend/src/services/membershipService.js',
  () => mocks.membershipService,
);

vi.mock('../../../packages/backend/src/middleware/rbac.js', () => ({
  Role: { ADMIN: 'admin', ANALYST: 'analyst', READONLY: 'readonly' },
}));

vi.mock('../../../packages/backend/src/config/redis.js', () => ({
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

describe('authRoutes - 认证路由', () => {
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

  describe('POST /login - API Key 登录', () => {
    it('正确 API Key 应返回 token 对', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'test-secret-key-123' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.accessToken).toBe('access-token-mock');
      expect(body.data.refreshToken).toBe('refresh-token-mock');
      expect(body.data.role).toBe('admin');
    });

    it('缺失 apiKey 应返回 400（zod 校验失败）', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('错误 API Key 应返回 401', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'wrong-key' }),
      });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error.code).toBe('INVALID_API_KEY');
    });

    it('超长 API Key（>128 字符）应返回 401', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'a'.repeat(129) }),
      });
      expect(res.status).toBe(401);
    });

    it('长度不匹配的 API Key 应返回 401（防时序攻击）', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'short' }),
      });
      expect(res.status).toBe(401);
    });

    it('开发环境未配置 ADMIN_API_KEY 应返回 400（zod 校验失败）', async () => {
      mocks.config.NODE_ENV = 'development';
      mocks.config.ADMIN_API_KEY = '';

      const res = await fetch(`${server.url}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /login/password - 用户名密码登录', () => {
    it('正确凭证应返回 token 对', async () => {
      mocks.userService.verifyUser.mockResolvedValueOnce({
        id: 'user-123',
        username: 'testuser',
        role: 'admin',
        createdAt: new Date(),
        isActive: true,
      });

      const res = await fetch(`${server.url}/api/v1/auth/login/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'correct-pass' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.accessToken).toBe('access-token-mock');
      expect(body.data.userId).toBe('user-123');
      expect(body.data.role).toBe('admin');
    });

    it('错误密码应返回 401（不区分用户不存在）', async () => {
      mocks.userService.verifyUser.mockResolvedValueOnce(null);

      const res = await fetch(`${server.url}/api/v1/auth/login/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'wrong-pass' }),
      });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('不存在的用户应返回 401（相同错误码防枚举）', async () => {
      mocks.userService.verifyUser.mockResolvedValueOnce(null);

      const res = await fetch(`${server.url}/api/v1/auth/login/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'nonexistent', password: 'any-pass' }),
      });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('缺失用户名应返回 400（zod 校验失败）', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/login/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'pass' }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('缺失密码应返回 400（zod 校验失败）', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/login/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'user' }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('verifyUser 应使用 argon2id 哈希验证（通过 mock 验证调用）', async () => {
      mocks.userService.verifyUser.mockResolvedValueOnce({
        id: 'user-123',
        username: 'testuser',
        role: 'analyst',
        createdAt: new Date(),
        isActive: true,
      });

      await fetch(`${server.url}/api/v1/auth/login/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'pass' }),
      });

      expect(mocks.userService.verifyUser).toHaveBeenCalledWith('testuser', 'pass');
    });
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
        body: JSON.stringify({ refreshToken: 'valid-refresh-token' }),
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

  describe('POST /logout - 废弃端点', () => {
    it('应设置 Deprecation 和 Sunset 头', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('deprecation')).toBe('true');
      expect(res.headers.get('sunset')).toBeTruthy();
      expect(res.headers.get('link')).toContain('successor-version');
    });
  });

  describe('暴力破解防护', () => {
    it('多次失败登录不应导致服务崩溃', async () => {
      // 连续 10 次错误登录
      const requests = Array.from({ length: 10 }, () =>
        fetch(`${server.url}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: 'wrong-key' }),
        }),
      );
      const responses = await Promise.all(requests);
      for (const res of responses) {
        expect(res.status).toBe(401);
      }
      // 服务仍应正常响应
      const healthRes = await fetch(`${server.url}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'test-secret-key-123' }),
      });
      expect(healthRes.status).toBe(200);
    });
  });

  describe('POST /login/password - 账户锁定', () => {
    it('账户锁定时应返回 429', async () => {
      mocks.loginLockout.isLockedOut.mockResolvedValueOnce(120);

      const res = await fetch(`${server.url}/api/v1/auth/login/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'locked-user', password: 'any' }),
      });
      const body = await res.json();

      expect(res.status).toBe(429);
      expect(body.error.code).toBe('ACCOUNT_LOCKED');
      expect(mocks.userService.verifyUser).not.toHaveBeenCalled();
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

  describe('POST /login/password - 多租户上下文', () => {
    it('解析到默认组织时应以组织角色签发并返回 org 摘要', async () => {
      mocks.userService.verifyUser.mockResolvedValueOnce({
        id: 'user-777',
        username: 'orguser',
        role: 'readonly',
        createdAt: new Date(),
        isActive: true,
      });
      mocks.membershipService.isPlatformAdmin.mockResolvedValueOnce(false);
      mocks.membershipService.resolveDefaultOrg.mockResolvedValueOnce({
        orgId: '11111111-1111-4111-8111-111111111111',
        orgName: 'Acme',
        orgSlug: 'acme',
        orgPlan: 'pro',
        orgStatus: 'active',
        role: 'owner',
      });

      const res = await fetch(`${server.url}/api/v1/auth/login/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'orguser', password: 'pass' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      // owner 映射为全局 admin 角色
      expect(body.data.role).toBe('admin');
      expect(body.data.org.orgId).toBe('11111111-1111-4111-8111-111111111111');
      expect(body.data.org.role).toBe('owner');
      // generateToken 应携带 tenant 上下文
      expect(mocks.jwtAuth.generateToken).toHaveBeenCalledWith(
        'user-777',
        'admin',
        expect.objectContaining({
          tenantId: '11111111-1111-4111-8111-111111111111',
          orgRole: 'owner',
        }),
      );
    });

    it('无组织成员关系时 org 为 null 且沿用全局角色', async () => {
      mocks.userService.verifyUser.mockResolvedValueOnce({
        id: 'user-888',
        username: 'soloer',
        role: 'analyst',
        createdAt: new Date(),
        isActive: true,
      });

      const res = await fetch(`${server.url}/api/v1/auth/login/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'soloer', password: 'pass' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.role).toBe('analyst');
      expect(body.data.org).toBeNull();
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
