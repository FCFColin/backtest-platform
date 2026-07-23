/**
 * 认证路由单元测试（合并自 login/misc/registration 3 文件）
 *
 * 覆盖：
 * - POST /login/password：用户名密码登录（成功/失败/缺失凭证/锁定/多租户）
 * - POST /refresh / DELETE /logout / GET /me / DELETE /me / POST /switch-org / GET /orgs
 * - POST /register / POST /verify-email / POST /resend-verification
 *
 * Mock 策略：jwtAuth/userService/loginLockout/membershipService（authRoutes）+
 * getUserByEmail/createUserTx/getClient/issueEmailVerificationToken/verifyEmailToken/
 * sendVerificationEmail（registrationRoutes）。使用真实 Express app.listen + fetch。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';
import { createLoggerMocks } from '../../helpers/mockFactories.js';
import { validPasswordLoginPayload, validRefreshPayload } from '../../helpers/authFixtures.js';
import {
  createAuthRoutesConfig,
  createAuthJwtAuthMocks,
  createAuthUserServiceMocks,
  createLoginLockoutMocks,
  createMembershipServiceMocks,
} from '../../helpers/authRoutesFixtures.js';

const mocks = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  jwtAuth: {} as Record<string, unknown>,
  userService: {} as Record<string, unknown>,
  loginLockout: {} as Record<string, unknown>,
  membershipService: {} as Record<string, unknown>,
  registration: {
    getUserByEmail: vi.fn(),
    createUserTx: vi.fn(),
    getClient: vi.fn(),
    issueEmailVerificationToken: vi.fn(),
    verifyEmailToken: vi.fn(),
    sendVerificationEmail: vi.fn(),
  } as Record<string, unknown>,
  logger: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock('../../../packages/backend/src/config/index.js', () => {
  Object.assign(mocks.config, createAuthRoutesConfig());
  return { config: mocks.config, validateConfig: vi.fn() };
});

vi.mock('../../../packages/backend/src/middleware/jwtAuth.js', () =>
  createAuthJwtAuthMocks(mocks.jwtAuth),
);

vi.mock('../../../packages/backend/src/application/auth/userService.js', () => {
  if (!mocks.userService.verifyUser) createAuthUserServiceMocks(mocks.userService);
  return {
    ...mocks.userService,
    issueEmailVerificationToken: mocks.registration.issueEmailVerificationToken,
    verifyEmailToken: mocks.registration.verifyEmailToken,
  };
});

vi.mock('../../../packages/backend/src/repositories/userRepo.js', () => {
  if (!mocks.userService.verifyUser) createAuthUserServiceMocks(mocks.userService);
  return {
    ...mocks.userService,
    getUserByEmail: mocks.registration.getUserByEmail,
    createUserTx: mocks.registration.createUserTx,
  };
});

vi.mock('../../../packages/backend/src/application/auth/loginLockout.js', () =>
  createLoginLockoutMocks(mocks.loginLockout),
);

vi.mock('../../../packages/backend/src/application/org/membershipService.js', () =>
  createMembershipServiceMocks(mocks.membershipService),
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

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getClient: mocks.registration.getClient,
}));

vi.mock('../../../packages/backend/src/infrastructure/mailService.js', () => ({
  sendVerificationEmail: mocks.registration.sendVerificationEmail,
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => {
  Object.assign(mocks.logger, createLoggerMocks());
  return { logger: mocks.logger };
});

import authRoutes from '../../../packages/backend/src/routes/authRoutes.js';
import authRegistrationRoutes from '../../../packages/backend/src/routes/authRegistrationRoutes.js';

/** 注入已认证用户到 jwtAuth 中间件 */
function injectUser(sub = 'user-switch', role = 'analyst', extra: Record<string, unknown> = {}) {
  (mocks.jwtAuth.jwtAuth as ReturnType<typeof vi.fn>).mockImplementation(
    (req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: Record<string, unknown> }).user = {
        sub,
        role,
        exp: Math.floor(Date.now() / 1000) + 900,
        ...extra,
      };
      next();
    },
  );
}

/** 恢复 jwtAuth 为 passthrough（不注入 user） */
function passthroughJwtAuth() {
  (mocks.jwtAuth.jwtAuth as ReturnType<typeof vi.fn>).mockImplementation(
    (_req: Request, _res: Response, next: NextFunction) => next(),
  );
}

// ============================================================
// authRoutes — 登录与会话端点
// ============================================================
describe('authRoutes - 登录与会话端点', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    passthroughJwtAuth();
    (mocks.config as Record<string, unknown>).NODE_ENV = 'production';
    (mocks.config as Record<string, unknown>).ADMIN_API_KEY = 'test-secret-key-123';
    (mocks.jwtAuth.generateToken as ReturnType<typeof vi.fn>).mockResolvedValue('access-token-mock');
    (mocks.jwtAuth.generateRefreshToken as ReturnType<typeof vi.fn>).mockResolvedValue('refresh-token-mock');
    server = await startExpressApp((app) => app.use('/api/v1/auth', authRoutes));
  });

  afterEach(async () => {
    await server.close();
  });

  describe('POST /login/password - 用户名密码登录', () => {
    it('正确凭证应返回 token 对', async () => {
      (mocks.userService.verifyUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'user-123', username: 'testuser', role: 'admin', createdAt: new Date(), isActive: true,
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
      (mocks.userService.verifyUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

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
      (mocks.userService.verifyUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const res = await fetch(`${server.url}/api/v1/auth/login/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'nonexistent', password: 'any-pass' }),
      });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it.each([
      ['缺失用户名', { password: 'pass' }],
      ['缺失密码', { username: 'user' }],
    ])('%s 应返回 400（zod 校验失败）', async (_n, payload) => {
      const res = await fetch(`${server.url}/api/v1/auth/login/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('verifyUser 应使用 argon2id 哈希验证（通过 mock 验证调用）', async () => {
      (mocks.userService.verifyUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'user-123', username: 'testuser', role: 'analyst', createdAt: new Date(), isActive: true,
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
      (mocks.loginLockout.isLockedOut as ReturnType<typeof vi.fn>).mockResolvedValueOnce(120);

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
      (mocks.userService.verifyUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'user-777', username: 'orguser', role: 'readonly', createdAt: new Date(), isActive: true,
      });
      (mocks.membershipService.isPlatformAdmin as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
      (mocks.membershipService.resolveDefaultOrg as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        orgId: '11111111-1111-4111-8111-111111111111', orgName: 'Acme', orgSlug: 'acme',
        orgPlan: 'pro', orgStatus: 'active', role: 'owner',
      });

      const res = await fetch(`${server.url}/api/v1/auth/login/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'orguser', password: 'pass' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.role).toBe('admin');
      expect(body.data.org.orgId).toBe('11111111-1111-4111-8111-111111111111');
      expect(body.data.org.role).toBe('owner');
      expect(mocks.jwtAuth.generateToken).toHaveBeenCalledWith(
        'user-777', 'admin',
        expect.objectContaining({
          tenantId: '11111111-1111-4111-8111-111111111111', orgRole: 'owner',
        }),
      );
    });

    it('无组织成员关系时 org 为 null 且沿用全局角色', async () => {
      (mocks.userService.verifyUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'user-888', username: 'soloer', role: 'analyst', createdAt: new Date(), isActive: true,
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

  describe('POST /refresh - 刷新令牌', () => {
    it('有效 refresh token 应返回新 token 对', async () => {
      (mocks.jwtAuth.refreshAccessToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        accessToken: 'new-access-token', refreshToken: 'new-refresh-token',
      });

      const res = await fetch(`${server.url}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRefreshPayload),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.accessToken).toBe('new-access-token');
      expect(body.data.refreshToken).toBe('new-refresh-token');
    });

    it.each([
      ['无效/过期', 'expired-token'],
      ['已撤销', 'revoked-token'],
    ])('%s refresh token 应返回 401', async (_n, token) => {
      (mocks.jwtAuth.refreshAccessToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const res = await fetch(`${server.url}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: token }),
      });
      expect(res.status).toBe(401);
    });

    it('缺失 refreshToken 应返回 422', async () => {
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
      (mocks.jwtAuth.revokeRefreshToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

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
      const res = await fetch(`${server.url}/api/v1/auth/me`);
      const body = await res.json();
      expect(res.status).toBe(401);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('jwtAuth 注入 user 时应返回用户信息', async () => {
      const exp = Math.floor(Date.now() / 1000) + 900;
      injectUser('user-me', 'admin', { exp });

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

  describe('DELETE /me - 自助匿名化', () => {
    it('已认证用户应撤销会话并匿名化账户', async () => {
      injectUser('user-delete-me', 'analyst');
      (mocks.userService.anonymizeUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

      const res = await fetch(`${server.url}/api/v1/auth/me`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer valid-token' },
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.anonymized).toBe(true);
      expect(mocks.jwtAuth.revokeAllUserSessions).toHaveBeenCalledWith('user-delete-me');
      expect(mocks.userService.anonymizeUser).toHaveBeenCalledWith('user-delete-me');
    });
  });

  describe('POST /switch-org - 切换活跃组织', () => {
    it('成员且组织 active 时应返回新 token 对', async () => {
      injectUser('user-switch', 'analyst');
      (mocks.membershipService.getMembership as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        orgId: '22222222-2222-4222-8222-222222222222', orgName: 'Beta', orgSlug: 'beta',
        orgPlan: 'free', orgStatus: 'active', role: 'admin',
      });
      (mocks.membershipService.isPlatformAdmin as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

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
        'user-switch', 'admin',
        expect.objectContaining({ tenantId: '22222222-2222-4222-8222-222222222222', orgRole: 'admin' }),
      );
    });

    it('非该组织成员应返回 403 NOT_A_MEMBER', async () => {
      injectUser();
      (mocks.membershipService.getMembership as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

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
      (mocks.membershipService.getMembership as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        orgId: '44444444-4444-4444-8444-444444444444', orgName: 'Gamma', orgSlug: 'gamma',
        orgPlan: 'free', orgStatus: 'suspended', role: 'owner',
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
      passthroughJwtAuth();
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
      injectUser('user-orgs', 'analyst', { tenant_id: '66666666-6666-4666-8666-666666666666' });
      (mocks.membershipService.getUserMemberships as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { orgId: '66666666-6666-4666-8666-666666666666', orgName: 'Delta', orgSlug: 'delta',
          orgPlan: 'pro', orgStatus: 'active', role: 'analyst' },
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

// ============================================================
// authRegistrationRoutes — 注册与邮箱验证
// ============================================================
describe('authRegistrationRoutes', () => {
  let server: TestServer;

  function makeClient(overrides: Record<string, unknown> = {}) {
    const query = vi.fn()
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'org-uuid-123' }] }) // INSERT organizations
      .mockResolvedValueOnce({}) // INSERT memberships
      .mockResolvedValueOnce({}); // COMMIT
    return { query, release: vi.fn(), ...overrides };
  }

  const validRegisterBody = {
    username: 'newuser', email: 'new@example.com', password: 'secret123', orgName: 'Acme Inc',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    (mocks.registration.getUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mocks.registration.createUserTx as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-uuid-123', username: 'newuser', role: 'admin', createdAt: new Date(), isActive: true,
    });
    (mocks.registration.getClient as ReturnType<typeof vi.fn>).mockResolvedValue(makeClient());
    (mocks.registration.issueEmailVerificationToken as ReturnType<typeof vi.fn>).mockResolvedValue('token-abc');
    (mocks.registration.verifyEmailToken as ReturnType<typeof vi.fn>).mockResolvedValue('user-uuid-123');
    (mocks.registration.sendVerificationEmail as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    injectUser('user-123', 'admin', { iat: 1, exp: 9999999999 });
    server = await startExpressApp((app) => app.use('/api/v1/auth', authRegistrationRoutes));
  });

  afterEach(async () => {
    await server.close();
  });

  describe('POST /register', () => {
    it('注册成功应返回 201 + userId，事务正确提交且发送验证邮件', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRegisterBody),
      });
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.data.userId).toBe('user-uuid-123');
      const client = await (mocks.registration.getClient as ReturnType<typeof vi.fn>).mock.results[0].value;
      const calls = client.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('BEGIN');
      expect(calls).toContain('COMMIT');
      expect(calls.some((s: string) => String(s).includes('INSERT INTO organizations'))).toBe(true);
      expect(calls.some((s: string) => String(s).includes('INSERT INTO memberships'))).toBe(true);
      expect(mocks.registration.issueEmailVerificationToken).toHaveBeenCalledWith('user-uuid-123');
      expect(mocks.registration.sendVerificationEmail).toHaveBeenCalledWith('new@example.com', 'token-abc');
      expect(client.release).toHaveBeenCalled();
    });

    it('邮箱已被注册应返回 409 EMAIL_TAKEN，不进入事务', async () => {
      (mocks.registration.getUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'existing-user', username: 'existing', role: 'analyst', createdAt: new Date(), isActive: true,
      });

      const res = await fetch(`${server.url}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRegisterBody),
      });
      const body = await res.json();

      expect(res.status).toBe(409);
      expect(body.error.code).toBe('EMAIL_TAKEN');
      expect(mocks.registration.getClient).not.toHaveBeenCalled();
    });

    it('事务中唯一约束冲突应返回 409 ACCOUNT_CONFLICT 并 ROLLBACK', async () => {
      const conflictErr = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
      const client = makeClient();
      client.query.mockReset()
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(conflictErr); // INSERT organizations 失败
      (mocks.registration.getClient as ReturnType<typeof vi.fn>).mockResolvedValueOnce(client);

      const res = await fetch(`${server.url}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRegisterBody),
      });
      const body = await res.json();

      expect(res.status).toBe(409);
      expect(body.error.code).toBe('ACCOUNT_CONFLICT');
      const calls = client.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('ROLLBACK');
      expect(mocks.registration.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('事务中其他异常应返回 500 REGISTER_FAILED 并 ROLLBACK', async () => {
      const client = makeClient();
      client.query.mockReset()
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('connection lost')); // INSERT organizations 失败
      (mocks.registration.getClient as ReturnType<typeof vi.fn>).mockResolvedValueOnce(client);

      const res = await fetch(`${server.url}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRegisterBody),
      });
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.error.code).toBe('REGISTER_FAILED');
      expect(mocks.logger.error).toHaveBeenCalled();
    });

    it('验证邮件发送失败不应阻塞注册成功', async () => {
      (mocks.registration.sendVerificationEmail as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('smtp down'));

      const res = await fetch(`${server.url}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRegisterBody),
      });

      expect(res.status).toBe(201);
      expect(mocks.logger.warn).toHaveBeenCalled();
    });
  });

  describe('POST /verify-email', () => {
    it('缺 token 应返回 422 MISSING_TOKEN', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(422);
      expect(body.error.code).toBe('MISSING_TOKEN');
      expect(mocks.registration.verifyEmailToken).not.toHaveBeenCalled();
    });

    it('无效 token 应返回 400 INVALID_OR_EXPIRED_TOKEN', async () => {
      (mocks.registration.verifyEmailToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const res = await fetch(`${server.url}/api/v1/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'invalid-token' }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error.code).toBe('INVALID_OR_EXPIRED_TOKEN');
    });

    it('有效 token 应返回 200 + verified:true', async () => {
      (mocks.registration.verifyEmailToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce('user-uuid-456');

      const res = await fetch(`${server.url}/api/v1/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'valid-token' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ userId: 'user-uuid-456', verified: true });
      expect(mocks.registration.verifyEmailToken).toHaveBeenCalledWith('valid-token');
    });
  });

  describe('POST /resend-verification', () => {
    it('缺 email 应返回 422 MISSING_EMAIL（jwtAuth 已通过）', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(422);
      expect(body.error.code).toBe('MISSING_EMAIL');
      expect(mocks.jwtAuth.jwtAuth).toHaveBeenCalled();
      expect(mocks.registration.issueEmailVerificationToken).not.toHaveBeenCalled();
    });

    it('有 email 应签发 token 并发送验证邮件，返回成功', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'me@example.com' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(mocks.registration.issueEmailVerificationToken).toHaveBeenCalledWith('user-123');
      expect(mocks.registration.sendVerificationEmail).toHaveBeenCalledWith('me@example.com', 'token-abc');
    });
  });
});
