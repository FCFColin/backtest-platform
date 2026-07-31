import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';
import { createLoggerMocks } from '../../helpers/mockFactories.js';
import {
  validPasswordLoginPayload,
  createAuthRoutesConfig,
  createAuthConfigMock,
  createAuthJwtAuthMocks,
  createAuthUserServiceMocks,
  createLoginLockoutMocks,
  createMembershipServiceMocks,
} from '../../helpers/authFixtures.js';

const mocks = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  jwtAuth: {} as Record<string, unknown>,
  userService: {} as Record<string, unknown>,
  loginLockout: {
    isLockedOut: vi.fn().mockResolvedValue(0),
    recordFailure: vi.fn().mockResolvedValue(undefined),
    clearFailures: vi.fn().mockResolvedValue(undefined),
    isIpBlocked: vi.fn().mockResolvedValue(0),
    recordIpFailure: vi.fn().mockResolvedValue(undefined),
    checkLoginRestriction: vi.fn().mockResolvedValue({ allowed: true }),
  } as Record<string, unknown>,
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
  return { config: mocks.config, authConfig: createAuthConfigMock(), validateConfig: vi.fn() };
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

type VFn = ReturnType<typeof vi.fn>;
const fn = (m: Record<string, unknown>, k: string): VFn => m[k] as VFn;
const JH = { 'Content-Type': 'application/json' };
function injectUser(sub = 'user-switch', role = 'analyst', extra: Record<string, unknown> = {}) {
  fn(mocks.jwtAuth, 'jwtAuth').mockImplementation(
    (req: Request, _r: Response, next: NextFunction) => {
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
function passthroughJwtAuth() {
  fn(mocks.jwtAuth, 'jwtAuth').mockImplementation(
    (_r: Request, _res: Response, next: NextFunction) => next(),
  );
}
function parseCookies(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.cookie;
  req.cookies = h
    ? Object.fromEntries(
        h.split(';').map((c) => {
          const [k, ...v] = c.trim().split('=');
          return [k, v.join('=')];
        }),
      )
    : {};
  next();
}
async function reqJson(
  url: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const init: RequestInit = { method, headers: { ...JH, ...headers } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(url, init);
  return { res, body: await res.json().catch(() => null) };
}
const apiPost = (u: string, b?: unknown, h: Record<string, string> = {}) =>
  reqJson(u, 'POST', b, h);
const apiDelete = (u: string, h: Record<string, string> = {}) => reqJson(u, 'DELETE', undefined, h);
const apiGet = (u: string, h: Record<string, string> = {}) => reqJson(u, 'GET', undefined, h);
function mockVerifyUser(id = 'user-123', role = 'admin') {
  fn(mocks.userService, 'verifyUser').mockResolvedValueOnce({
    id,
    username: 'testuser',
    role,
    createdAt: new Date(),
    isActive: true,
  });
}

describe('authRoutes - 登录与会话端点', () => {
  let server: TestServer;
  beforeEach(async () => {
    vi.clearAllMocks();
    passthroughJwtAuth();
    mocks.config.NODE_ENV = 'production';
    fn(mocks.jwtAuth, 'generateToken').mockResolvedValue('access-token-mock');
    fn(mocks.jwtAuth, 'generateRefreshToken').mockResolvedValue('refresh-token-mock');
    server = await startExpressApp((app) => {
      app.use(parseCookies);
      app.use('/api/v1/auth', authRoutes);
    });
  });
  afterEach(async () => {
    await server.close();
  });
  const loginUrl = () => `${server.url}/api/v1/auth/login/password`;
  it('正确凭证应返回 access token 并通过 Set-Cookie 下发 refresh token', async () => {
    mockVerifyUser('user-123', 'admin');
    const { res, body } = await apiPost(loginUrl(), validPasswordLoginPayload);
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBe('access-token-mock');
    expect(body.data.userId).toBe('user-123');
    expect(body.data.role).toBe('admin');
    expect(body.data.refreshToken).toBeUndefined();
    expect(res.headers.get('set-cookie')).toContain('rt=');
  });
  it.each([
    ['错误密码', null, 'wrong-pass'],
    ['不存在用户', null, 'any-pass'],
  ])('%s 应返回 401 INVALID_CREDENTIALS（防枚举）', async (_n, vr, pwd) => {
    fn(mocks.userService, 'verifyUser').mockResolvedValueOnce(vr);
    const { res, body } = await apiPost(loginUrl(), { username: 'testuser', password: pwd });
    expect(res.status).toBe(401);
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });
  it.each([
    ['缺失用户名', { password: 'pass' }],
    ['缺失密码', { username: 'user' }],
  ])('%s 应返回 400（zod 校验失败）', async (_n, payload) => {
    const { res, body } = await apiPost(loginUrl(), payload);
    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
  it('verifyUser 应使用 argon2id 哈希验证（通过 mock 验证调用）', async () => {
    mockVerifyUser('user-123', 'analyst');
    await apiPost(loginUrl(), { username: 'testuser', password: 'pass' });
    expect(mocks.userService.verifyUser).toHaveBeenCalledWith('testuser', 'pass');
  });
  it('账户锁定时应返回 429', async () => {
    fn(mocks.loginLockout, 'isLockedOut').mockResolvedValueOnce(120);
    const { res, body } = await apiPost(loginUrl(), { username: 'locked-user', password: 'any' });
    expect(res.status).toBe(429);
    expect(body.error.code).toBe('ACCOUNT_LOCKED');
    expect(mocks.userService.verifyUser).not.toHaveBeenCalled();
  });
  it('解析到默认组织时应以组织角色签发并返回 org 摘要', async () => {
    mockVerifyUser('user-777', 'readonly');
    fn(mocks.membershipService, 'isPlatformAdmin').mockResolvedValueOnce(false);
    fn(mocks.membershipService, 'resolveDefaultOrg').mockResolvedValueOnce({
      orgId: '11111111-1111-4111-8111-111111111111',
      orgName: 'Acme',
      orgSlug: 'acme',
      orgPlan: 'pro',
      orgStatus: 'active',
      role: 'owner',
    });
    const { res, body } = await apiPost(loginUrl(), { username: 'orguser', password: 'pass' });
    expect(res.status).toBe(200);
    expect(body.data.role).toBe('admin');
    expect(body.data.org.orgId).toBe('11111111-1111-4111-8111-111111111111');
    expect(body.data.org.role).toBe('owner');
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
    mockVerifyUser('user-888', 'analyst');
    const { res, body } = await apiPost(loginUrl(), { username: 'soloer', password: 'pass' });
    expect(res.status).toBe(200);
    expect(body.data.role).toBe('analyst');
    expect(body.data.org).toBeNull();
  });
  it('有效 refresh token cookie 应返回新 access token 并轮换 RT cookie', async () => {
    fn(mocks.jwtAuth, 'refreshAccessToken').mockResolvedValueOnce({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });
    const { res, body } = await apiPost(
      `${server.url}/api/v1/auth/refresh`,
      {},
      { Cookie: 'rt=valid-refresh-token' },
    );
    expect(res.status).toBe(200);
    expect(body.data.accessToken).toBe('new-access-token');
    expect(body.data.refreshToken).toBeUndefined();
    expect(res.headers.get('set-cookie')).toContain('rt=');
    expect(mocks.jwtAuth.refreshAccessToken).toHaveBeenCalledWith('valid-refresh-token');
  });
  it.each([
    ['无效/过期', 'expired-token'],
    ['已撤销', 'revoked-token'],
  ])('%s refresh token cookie 应返回 401', async (_n, token) => {
    fn(mocks.jwtAuth, 'refreshAccessToken').mockResolvedValueOnce(null);
    const { res } = await apiPost(
      `${server.url}/api/v1/auth/refresh`,
      {},
      { Cookie: `rt=${token}` },
    );
    expect(res.status).toBe(401);
  });
  it('缺失 refresh cookie 应返回 401 REFRESH_TOKEN_MISSING', async () => {
    const { res, body } = await apiPost(`${server.url}/api/v1/auth/refresh`);
    expect(res.status).toBe(401);
    expect(body.error.code).toBe('REFRESH_TOKEN_MISSING');
  });
  it('logout 携带 refresh cookie 应调用撤销并清除 cookie', async () => {
    fn(mocks.jwtAuth, 'revokeRefreshToken').mockResolvedValueOnce(undefined);
    const { res, body } = await apiDelete(`${server.url}/api/v1/auth/logout`, {
      Cookie: 'rt=token-to-revoke',
    });
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mocks.jwtAuth.revokeRefreshToken).toHaveBeenCalledWith('token-to-revoke');
    expect(res.headers.get('set-cookie')).toContain('rt=');
  });
  it('logout 未携带 refresh cookie 也应返回成功', async () => {
    const { res, body } = await apiDelete(`${server.url}/api/v1/auth/logout`);
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mocks.jwtAuth.revokeRefreshToken).not.toHaveBeenCalled();
  });
  it('GET /me 路由直接调用应返回 401（未注入 req.user）', async () => {
    const { res, body } = await apiGet(`${server.url}/api/v1/auth/me`);
    expect(res.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
  it('GET /me jwtAuth 注入 user 时应返回用户信息', async () => {
    const exp = Math.floor(Date.now() / 1000) + 900;
    injectUser('user-me', 'admin', { exp });
    const { res, body } = await apiGet(`${server.url}/api/v1/auth/me`, {
      Authorization: 'Bearer valid-token',
    });
    expect(res.status).toBe(200);
    expect(body.data.userId).toBe('user-me');
    expect(body.data.role).toBe('admin');
    expect(body.data.exp).toBe(exp);
  });
  it('DELETE /me 已认证用户应撤销会话并匿名化账户', async () => {
    injectUser('user-delete-me', 'analyst');
    fn(mocks.userService, 'anonymizeUser').mockResolvedValueOnce(true);
    const { res, body } = await apiDelete(`${server.url}/api/v1/auth/me`, {
      Authorization: 'Bearer valid-token',
    });
    expect(res.status).toBe(200);
    expect(body.data.anonymized).toBe(true);
    expect(mocks.jwtAuth.revokeAllUserSessions).toHaveBeenCalledWith('user-delete-me');
    expect(mocks.userService.anonymizeUser).toHaveBeenCalledWith('user-delete-me');
  });
  it('switch-org 成员且组织 active 时应返回新 access token 并通过 Set-Cookie 下发新 RT', async () => {
    const orgId = '22222222-2222-4222-8222-222222222222';
    injectUser('user-switch', 'analyst');
    fn(mocks.membershipService, 'getMembership').mockResolvedValueOnce({
      orgId,
      orgName: 'Beta',
      orgSlug: 'beta',
      orgPlan: 'free',
      orgStatus: 'active',
      role: 'admin',
    });
    fn(mocks.membershipService, 'isPlatformAdmin').mockResolvedValueOnce(false);
    const { res, body } = await apiPost(
      `${server.url}/api/v1/auth/switch-org`,
      { orgId },
      { Authorization: 'Bearer t' },
    );
    expect(res.status).toBe(200);
    expect(body.data.accessToken).toBe('access-token-mock');
    expect(body.data.org.orgId).toBe(orgId);
    expect(body.data.refreshToken).toBeUndefined();
    expect(res.headers.get('set-cookie')).toContain('rt=');
    expect(mocks.jwtAuth.generateToken).toHaveBeenCalledWith(
      'user-switch',
      'admin',
      expect.objectContaining({ tenantId: orgId, orgRole: 'admin' }),
    );
  });
  it('switch-org 非该组织成员应返回 403 NOT_A_MEMBER', async () => {
    injectUser();
    fn(mocks.membershipService, 'getMembership').mockResolvedValueOnce(null);
    const { res, body } = await apiPost(
      `${server.url}/api/v1/auth/switch-org`,
      { orgId: '33333333-3333-4333-8333-333333333333' },
      { Authorization: 'Bearer t' },
    );
    expect(res.status).toBe(403);
    expect(body.error.code).toBe('NOT_A_MEMBER');
  });
  it('switch-org 组织非 active 应返回 403 ORG_INACTIVE', async () => {
    injectUser();
    fn(mocks.membershipService, 'getMembership').mockResolvedValueOnce({
      orgId: '44444444-4444-4444-8444-444444444444',
      orgName: 'Gamma',
      orgSlug: 'gamma',
      orgPlan: 'free',
      orgStatus: 'suspended',
      role: 'owner',
    });
    const { res, body } = await apiPost(
      `${server.url}/api/v1/auth/switch-org`,
      { orgId: '44444444-4444-4444-8444-444444444444' },
      { Authorization: 'Bearer t' },
    );
    expect(res.status).toBe(403);
    expect(body.error.code).toBe('ORG_INACTIVE');
  });
  it('switch-org 缺少 orgId 应返回 400', async () => {
    injectUser();
    const { res, body } = await apiPost(
      `${server.url}/api/v1/auth/switch-org`,
      {},
      { Authorization: 'Bearer t' },
    );
    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
  it('switch-org 未认证应返回 401', async () => {
    passthroughJwtAuth();
    const { res } = await apiPost(`${server.url}/api/v1/auth/switch-org`, {
      orgId: '55555555-5555-4555-8555-555555555555',
    });
    expect(res.status).toBe(401);
  });
  it('GET /orgs 应返回成员组织列表与活跃组织', async () => {
    injectUser('user-orgs', 'analyst', { tenant_id: '66666666-6666-4666-8666-666666666666' });
    fn(mocks.membershipService, 'getUserMemberships').mockResolvedValueOnce([
      {
        orgId: '66666666-6666-4666-8666-666666666666',
        orgName: 'Delta',
        orgSlug: 'delta',
        orgPlan: 'pro',
        orgStatus: 'active',
        role: 'analyst',
      },
    ]);
    const { res, body } = await apiGet(`${server.url}/api/v1/auth/orgs`, {
      Authorization: 'Bearer t',
    });
    expect(res.status).toBe(200);
    expect(body.data.activeOrgId).toBe('66666666-6666-4666-8666-666666666666');
    expect(body.data.orgs).toHaveLength(1);
    expect(body.data.orgs[0].slug).toBe('delta');
  });
});

describe('authRegistrationRoutes', () => {
  let server: TestServer;
  function makeClient(overrides: Record<string, unknown> = {}) {
    const query = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'org-uuid-123' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    return { query, release: vi.fn(), ...overrides };
  }
  const validRegisterBody = {
    username: 'newuser',
    email: 'new@example.com',
    password: 'secret123',
    orgName: 'Acme Inc',
  };
  beforeEach(async () => {
    vi.clearAllMocks();
    fn(mocks.registration, 'getUserByEmail').mockResolvedValue(null);
    fn(mocks.registration, 'createUserTx').mockResolvedValue({
      id: 'user-uuid-123',
      username: 'newuser',
      role: 'admin',
      createdAt: new Date(),
      isActive: true,
    });
    fn(mocks.registration, 'getClient').mockResolvedValue(makeClient());
    fn(mocks.registration, 'issueEmailVerificationToken').mockResolvedValue('token-abc');
    fn(mocks.registration, 'verifyEmailToken').mockResolvedValue('user-uuid-123');
    fn(mocks.registration, 'sendVerificationEmail').mockResolvedValue(undefined);
    injectUser('user-123', 'admin', { iat: 1, exp: 9999999999 });
    server = await startExpressApp((app) => app.use('/api/v1/auth', authRegistrationRoutes));
  });
  afterEach(async () => {
    await server.close();
  });
  const regUrl = (p: string) => `${server.url}/api/v1/auth/${p}`;

  it('注册成功应返回 201 + userId，事务正确提交且发送验证邮件', async () => {
    const { res, body } = await apiPost(regUrl('register'), validRegisterBody);
    expect(res.status).toBe(201);
    expect(body.data.userId).toBe('user-uuid-123');
    const client = await fn(mocks.registration, 'getClient').mock.results[0].value;
    const calls = client.query.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls).toContain('BEGIN');
    expect(calls).toContain('COMMIT');
    expect(calls.some((s: string) => String(s).includes('INSERT INTO organizations'))).toBe(true);
    expect(calls.some((s: string) => String(s).includes('INSERT INTO memberships'))).toBe(true);
    expect(mocks.registration.issueEmailVerificationToken).toHaveBeenCalledWith('user-uuid-123');
    expect(mocks.registration.sendVerificationEmail).toHaveBeenCalledWith(
      'new@example.com',
      'token-abc',
    );
    expect(client.release).toHaveBeenCalled();
  });
  it('邮箱已被注册应返回 409 EMAIL_TAKEN，不进入事务', async () => {
    fn(mocks.registration, 'getUserByEmail').mockResolvedValueOnce({
      id: 'existing-user',
      username: 'existing',
      role: 'analyst',
      createdAt: new Date(),
      isActive: true,
    });
    const { res, body } = await apiPost(regUrl('register'), validRegisterBody);
    expect(res.status).toBe(409);
    expect(body.error.code).toBe('EMAIL_TAKEN');
    expect(mocks.registration.getClient).not.toHaveBeenCalled();
  });
  it.each([
    [
      '唯一约束冲突',
      Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' }),
      409,
      'ACCOUNT_CONFLICT',
    ],
    ['其他异常', new Error('connection lost'), 500, 'REGISTER_FAILED'],
  ])('事务中%s 应返回 %i %s 并 ROLLBACK', async (_n, err, status, code) => {
    const client = makeClient();
    client.query.mockReset().mockResolvedValueOnce({}).mockRejectedValueOnce(err);
    fn(mocks.registration, 'getClient').mockResolvedValueOnce(client);
    const { res, body } = await apiPost(regUrl('register'), validRegisterBody);
    expect(res.status).toBe(status);
    expect(body.error.code).toBe(code);
    expect(client.query.mock.calls.map((c: unknown[]) => c[0])).toContain('ROLLBACK');
    expect(mocks.registration.sendVerificationEmail).not.toHaveBeenCalled();
    if (status === 500) expect(mocks.logger.error).toHaveBeenCalled();
  });
  it('验证邮件发送失败不应阻塞注册成功', async () => {
    fn(mocks.registration, 'sendVerificationEmail').mockRejectedValueOnce(new Error('smtp down'));
    const { res } = await apiPost(regUrl('register'), validRegisterBody);
    expect(res.status).toBe(201);
    expect(mocks.logger.warn).toHaveBeenCalled();
  });
  it('verify-email 缺 token 应返回 400 VALIDATION_ERROR', async () => {
    const { res, body } = await apiPost(regUrl('verify-email'), {});
    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(mocks.registration.verifyEmailToken).not.toHaveBeenCalled();
  });
  it.each([
    ['无效 token', null, 400, 'INVALID_OR_EXPIRED_TOKEN', false],
    ['有效 token', 'user-uuid-456', 200, null, true],
  ])('%s 应返回预期结果', async (_n, vr, status, code, verifyCalled) => {
    fn(mocks.registration, 'verifyEmailToken').mockResolvedValueOnce(vr);
    const { res, body } = await apiPost(regUrl('verify-email'), { token: 'a-token' });
    expect(res.status).toBe(status);
    if (code) expect(body.error.code).toBe(code);
    else expect(body.data).toEqual({ userId: 'user-uuid-456', verified: true });
    if (verifyCalled) expect(mocks.registration.verifyEmailToken).toHaveBeenCalledWith('a-token');
  });
  it('resend-verification 缺 email 应返回 400 VALIDATION_ERROR（jwtAuth 已通过）', async () => {
    const { res, body } = await apiPost(regUrl('resend-verification'), {});
    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(mocks.jwtAuth.jwtAuth).toHaveBeenCalled();
    expect(mocks.registration.issueEmailVerificationToken).not.toHaveBeenCalled();
  });
  it('resend-verification 有 email 应签发 token 并发送验证邮件，返回成功', async () => {
    const { res, body } = await apiPost(regUrl('resend-verification'), { email: 'me@example.com' });
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mocks.registration.issueEmailVerificationToken).toHaveBeenCalledWith('user-123');
    expect(mocks.registration.sendVerificationEmail).toHaveBeenCalledWith(
      'me@example.com',
      'token-abc',
    );
  });
});
