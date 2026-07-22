/**
 * 认证路由单元测试 - 登录端点（T-P3-7）
 *
 * 企业理由：登录入口是安全第一道关卡，用户名密码登录的正确性直接影响会话安全。
 * 本文件覆盖：
 * - POST /login/password：用户名密码登录（成功/失败/缺失凭证/argon2 验证）
 * - 账户锁定：锁定状态返回 429
 * - 多租户上下文：解析默认组织并以组织角色签发 token
 *
 * Mock 策略：mock jwtAuth（token 生成/刷新/撤销）、userService（用户验证）、
 * config（环境配置）、loginLockout（锁定计数）、membershipService（组织关系）、logger。
 * 使用真实 Express app.listen + fetch。
 *
 * codebase-slim-followups Task 2 已删除 deprecated POST /login（API Key 模式），
 * 相关测试一并移除。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';
import { validPasswordLoginPayload } from '../../helpers/authFixtures.js';
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

describe('authRoutes - 登录端点', () => {
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
        body: JSON.stringify(validPasswordLoginPayload),
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
});
