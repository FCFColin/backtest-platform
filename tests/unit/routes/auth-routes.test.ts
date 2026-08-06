import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { startExpressApp, reqJson } from '../../helpers/expressApp.js';
import { withServer } from '../../helpers/serverLifecycle.js';
import { expectError } from '../../helpers/routeAssertions.js';
import { loggerMocks } from '../../helpers/loggerFixture.js';
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
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: loggerMocks }));
import authRoutes from '../../../packages/backend/src/routes/authRoutes.js';
type VFn = ReturnType<typeof vi.fn>;
const fn = (m: Record<string, unknown>, k: string): VFn => m[k] as VFn;
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
const apiPost = (u: string, b?: unknown, h: Record<string, string> = {}) =>
  reqJson(u, 'POST', b, h);
const apiDelete = (u: string, h: Record<string, string> = {}) => reqJson(u, 'DELETE', undefined, h);
const apiGet = (u: string, h: Record<string, string> = {}) => reqJson(u, 'GET', undefined, h);
function userRecord(id: string, role: string) {
  return { id, username: 'testuser', role, createdAt: new Date(), isActive: true };
}
function mockVerifyUser(id = 'user-123', role = 'admin') {
  fn(mocks.userService, 'verifyUser').mockResolvedValueOnce(userRecord(id, role));
}
function mockOrg(overrides: Record<string, unknown> = {}) {
  return {
    orgId: '11111111-1111-4111-8111-111111111111',
    orgName: 'Acme',
    orgSlug: 'acme',
    orgPlan: 'pro',
    orgStatus: 'active',
    role: 'owner',
    ...overrides,
  };
}
describe('authRoutes - 登录与会话端点', () => {
  const getServer = withServer(() => {
    vi.clearAllMocks();
    passthroughJwtAuth();
    mocks.config.NODE_ENV = 'production';
    fn(mocks.jwtAuth, 'generateToken').mockResolvedValue('access-token-mock');
    fn(mocks.jwtAuth, 'generateRefreshToken').mockResolvedValue('refresh-token-mock');
    return startExpressApp((app) => {
      app.use(parseCookies);
      app.use('/api/v1/auth', authRoutes);
    });
  });
  const loginUrl = () => `${getServer().url}/api/v1/auth/login/password`;
  const switchUrl = () => `${getServer().url}/api/v1/auth/switch-org`;
  it('正确凭证应返回 access token 并通过 Set-Cookie 下发 refresh token', async () => {
    mockVerifyUser('user-123', 'admin');
    const { res, body } = await apiPost(loginUrl(), validPasswordLoginPayload);
    expect(res.status).toBe(200);
    expect(body.data.accessToken).toBe('access-token-mock');
    expect(body.data.userId).toBe('user-123');
    expect(body.data.role).toBe('admin');
    expect(body.data.refreshToken).toBeUndefined();
    expect(res.headers.get('set-cookie')).toContain('rt=');
    expect(mocks.userService.verifyUser).toHaveBeenCalledWith('testuser', 'correct-pass');
  });
  it.each([
    ['错误密码', 'wrong-pass'],
    ['不存在用户', 'any-pass'],
  ])('%s 应返回 401 INVALID_CREDENTIALS（防枚举）', async (_n, pwd) => {
    fn(mocks.userService, 'verifyUser').mockResolvedValueOnce(null);
    const { res, body } = await apiPost(loginUrl(), { username: 'testuser', password: pwd });
    expectError(res, body, 401, 'INVALID_CREDENTIALS');
  });
  it.each([
    ['登录缺失用户名', '/login/password', { password: 'pass' }],
    ['登录缺失密码', '/login/password', { username: 'user' }],
    ['switch-org 缺少 orgId', '/switch-org', {}],
  ])('%s 应返回 400（zod 校验失败）', async (_n, path, payload) => {
    injectUser();
    const { res, body } = await apiPost(`${getServer().url}/api/v1/auth${path}`, payload);
    expectError(res, body, 400, 'VALIDATION_ERROR');
  });
  it('账户锁定时应返回 429', async () => {
    fn(mocks.loginLockout, 'isLockedOut').mockResolvedValueOnce(120);
    const { res, body } = await apiPost(loginUrl(), { username: 'locked-user', password: 'any' });
    expectError(res, body, 429, 'ACCOUNT_LOCKED');
    expect(mocks.userService.verifyUser).not.toHaveBeenCalled();
  });
  it.each<[string, Record<string, unknown> | null, string, string, string]>([
    ['解析到默认组织时应以组织角色签发并返回 org 摘要', mockOrg(), 'admin', 'user-777', 'readonly'],
    ['无组织成员关系时 org 为 null 且沿用全局角色', null, 'analyst', 'user-888', 'analyst'],
  ])('%s', async (_n, org, expectedRole, userId, userRole) => {
    mockVerifyUser(userId, userRole);
    fn(mocks.membershipService, 'isPlatformAdmin').mockResolvedValueOnce(false);
    fn(mocks.membershipService, 'resolveDefaultOrg').mockResolvedValueOnce(org);
    const { res, body } = await apiPost(loginUrl(), { username: 'orguser', password: 'pass' });
    expect(res.status).toBe(200);
    expect(body.data.role).toBe(expectedRole);
    if (org) {
      expect(body.data.org.orgId).toBe('11111111-1111-4111-8111-111111111111');
      expect(body.data.org.role).toBe('owner');
      expect(mocks.jwtAuth.generateToken).toHaveBeenCalledWith(
        userId,
        'admin',
        expect.objectContaining({
          tenantId: '11111111-1111-4111-8111-111111111111',
          orgRole: 'owner',
        }),
      );
    } else {
      expect(body.data.org).toBeNull();
    }
  });
  it('有效 refresh token cookie 应返回新 access token 并轮换 RT cookie', async () => {
    fn(mocks.jwtAuth, 'refreshAccessToken').mockResolvedValueOnce({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });
    const { res, body } = await apiPost(
      `${getServer().url}/api/v1/auth/refresh`,
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
    ['无效/过期 refresh token cookie', 'expired-token', null],
    ['已撤销 refresh token cookie', 'revoked-token', null],
    ['缺失 refresh cookie', undefined, 'REFRESH_TOKEN_MISSING'],
  ])('%s 应返回 401', async (_n, token, code) => {
    if (token !== undefined) fn(mocks.jwtAuth, 'refreshAccessToken').mockResolvedValueOnce(null);
    const { res, body } = await apiPost(
      `${getServer().url}/api/v1/auth/refresh`,
      {},
      token !== undefined ? { Cookie: `rt=${token}` } : {},
    );
    expect(res.status).toBe(401);
    if (code) expect(body.error.code).toBe(code);
  });
  it.each([
    ['携带 refresh cookie 应撤销并清除 cookie', { Cookie: 'rt=token-to-revoke' }, true],
    ['未携带 refresh cookie 也应返回成功', undefined, false],
  ])('logout %s', async (_n, headers, expectRevoke) => {
    if (expectRevoke) fn(mocks.jwtAuth, 'revokeRefreshToken').mockResolvedValueOnce(undefined);
    const { res } = await apiDelete(`${getServer().url}/api/v1/auth/logout`, headers);
    expect(res.status).toBe(200);
    if (expectRevoke) {
      expect(mocks.jwtAuth.revokeRefreshToken).toHaveBeenCalledWith('token-to-revoke');
      expect(res.headers.get('set-cookie')).toContain('rt=');
    } else {
      expect(mocks.jwtAuth.revokeRefreshToken).not.toHaveBeenCalled();
    }
  });
  it.each([
    ['GET /me 未注入 req.user 应返回 401', '/me', 'GET', undefined, 'UNAUTHORIZED'],
    [
      'switch-org 未认证应返回 401',
      '/switch-org',
      'POST',
      { orgId: '55555555-5555-4555-8555-555555555555' },
      null,
    ],
  ])('%s', async (_n, path, method, body, code) => {
    const { res, body: json } = await reqJson(
      `${getServer().url}/api/v1/auth${path}`,
      method,
      body,
    );
    expect(res.status).toBe(401);
    if (code) expect(json.error.code).toBe(code);
  });
  it('GET /me jwtAuth 注入 user 时应返回用户信息', async () => {
    const exp = Math.floor(Date.now() / 1000) + 900;
    injectUser('user-me', 'admin', { exp });
    const { res, body } = await apiGet(`${getServer().url}/api/v1/auth/me`, {
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
    const { res, body } = await apiDelete(`${getServer().url}/api/v1/auth/me`, {
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
    const beta = { orgName: 'Beta', orgSlug: 'beta', orgPlan: 'free', role: 'admin' };
    fn(mocks.membershipService, 'getMembership').mockResolvedValueOnce(mockOrg({ orgId, ...beta }));
    fn(mocks.membershipService, 'isPlatformAdmin').mockResolvedValueOnce(false);
    const { res, body } = await apiPost(switchUrl(), { orgId }, { Authorization: 'Bearer t' });
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
  it.each([
    ['非该组织成员', null, 'NOT_A_MEMBER', '33333333-3333-4333-8333-333333333333'],
    [
      '组织非 active',
      mockOrg({
        orgId: '44444444-4444-4444-8444-444444444444',
        orgName: 'Gamma',
        orgSlug: 'gamma',
        orgStatus: 'suspended',
      }),
      'ORG_INACTIVE',
      '44444444-4444-4444-8444-444444444444',
    ],
  ])('switch-org %s 应返回 403 %s', async (_n, membership, code, orgId) => {
    injectUser();
    fn(mocks.membershipService, 'getMembership').mockResolvedValueOnce(membership);
    const { res, body } = await apiPost(switchUrl(), { orgId }, { Authorization: 'Bearer t' });
    expectError(res, body, 403, code);
  });
  it('GET /orgs 应返回成员组织列表与活跃组织', async () => {
    const orgId = '66666666-6666-4666-8666-666666666666';
    injectUser('user-orgs', 'analyst', { tenant_id: orgId });
    fn(mocks.membershipService, 'getUserMemberships').mockResolvedValueOnce([
      mockOrg({ orgId, orgName: 'Delta', orgSlug: 'delta', role: 'analyst' }),
    ]);
    const { res, body } = await apiGet(`${getServer().url}/api/v1/auth/orgs`, {
      Authorization: 'Bearer t',
    });
    expect(res.status).toBe(200);
    expect(body.data.activeOrgId).toBe(orgId);
    expect(body.data.orgs).toHaveLength(1);
    expect(body.data.orgs[0].slug).toBe('delta');
  });
});
describe('authRegistrationRoutes', () => {
  const getServer = withServer(() => {
    vi.clearAllMocks();
    fn(mocks.registration, 'getUserByEmail').mockResolvedValue(null);
    fn(mocks.registration, 'createUserTx').mockResolvedValue(userRecord('user-uuid-123', 'admin'));
    fn(mocks.registration, 'getClient').mockResolvedValue(makeClient());
    fn(mocks.registration, 'issueEmailVerificationToken').mockResolvedValue('token-abc');
    fn(mocks.registration, 'verifyEmailToken').mockResolvedValue('user-uuid-123');
    fn(mocks.registration, 'sendVerificationEmail').mockResolvedValue(undefined);
    injectUser('user-123', 'admin', { iat: 1, exp: 9999999999 });
    return startExpressApp((app) => app.use('/api/v1/auth', authRoutes));
  });
  const regUrl = (p: string) => `${getServer().url}/api/v1/auth/${p}`;
  function makeClient(overrides: Record<string, unknown> = {}) {
    const query = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'org-uuid-123' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    return { query, release: vi.fn(), ...overrides };
  }
  const EMAIL = 'new@example.com';
  const validRegisterBody = {
    username: 'nu',
    email: EMAIL,
    password: 'secret123',
    orgName: 'Acme',
  };
  it('注册成功应返回 201 + userId，事务正确提交且发送验证邮件', async () => {
    const { res, body } = await apiPost(regUrl('register'), validRegisterBody);
    expect(res.status).toBe(201);
    expect(body.data.userId).toBe('user-uuid-123');
    const client = await fn(mocks.registration, 'getClient').mock.results[0].value;
    const sqls = client.query.mock.calls.map((c: unknown[]) => String(c[0]));
    const has = (f: string) => sqls.some((s) => s.includes(f));
    expect(
      ['BEGIN', 'COMMIT', 'INSERT INTO organizations', 'INSERT INTO memberships'].every(has),
    ).toBe(true);
    expect(mocks.registration.issueEmailVerificationToken).toHaveBeenCalledWith('user-uuid-123');
    expect(mocks.registration.sendVerificationEmail).toHaveBeenCalledWith(EMAIL, 'token-abc');
    expect(client.release).toHaveBeenCalled();
  });
  it('邮箱已被注册应返回 409 EMAIL_TAKEN，不进入事务', async () => {
    fn(mocks.registration, 'getUserByEmail').mockResolvedValueOnce(
      userRecord('existing-user', 'analyst'),
    );
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
    if (status === 500) expect(loggerMocks.error).toHaveBeenCalled();
  });
  it('验证邮件发送失败不应阻塞注册成功', async () => {
    fn(mocks.registration, 'sendVerificationEmail').mockRejectedValueOnce(new Error('smtp down'));
    const { res } = await apiPost(regUrl('register'), validRegisterBody);
    expect(res.status).toBe(201);
    expect(loggerMocks.warn).toHaveBeenCalled();
  });
  it('verify-email 缺 token 应返回 400 VALIDATION_ERROR，不触发后续处理', async () => {
    const { res, body } = await apiPost(regUrl('verify-email'), {});
    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(mocks.registration.verifyEmailToken).not.toHaveBeenCalled();
    expect(mocks.registration.issueEmailVerificationToken).not.toHaveBeenCalled();
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
});
