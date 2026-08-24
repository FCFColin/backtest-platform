import { describe, it, expect, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { startExpressApp, reqJson } from '../../helpers/expressApp.js';
import { withServer } from '../../helpers/serverLifecycle.js';
import { expectError } from '../../helpers/routeAssertions.js';
import '../../helpers/loggerMock.js';
import {
  validPasswordLoginPayload,
  createAuthRoutesConfig,
  createAuthConfigMock,
  createAuthJwtAuthMocks,
  createAuthUserServiceMocks,
  createLoginLockoutMocks,
  createMembershipServiceMocks,
} from '../../helpers/authFixtures.js';

type ReqU = Request & { user?: Record<string, unknown> };

const mocks = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  jwtAuth: {} as Record<string, unknown>,
  userService: {
    issueEmailVerificationToken: vi.fn(),
    verifyEmailToken: vi.fn(),
  } as Record<string, unknown>,
  loginLockout: {
    isLockedOut: vi.fn().mockResolvedValue(0),
    recordFailure: vi.fn().mockResolvedValue(undefined),
    clearFailures: vi.fn().mockResolvedValue(undefined),
    isIpBlocked: vi.fn().mockResolvedValue(0),
    recordIpFailure: vi.fn().mockResolvedValue(undefined),
  } as Record<string, unknown>,
  membershipService: {} as Record<string, unknown>,
  registration: { getUserByEmail: vi.fn(), sendVerificationEmail: vi.fn() },
}));
vi.mock('../../../packages/backend/src/config/index.js', () => {
  Object.assign(mocks.config, createAuthRoutesConfig());
  return { config: mocks.config, authConfig: createAuthConfigMock(), validateConfig: vi.fn() };
});
vi.mock('../../../packages/backend/src/middleware/jwtAuth.js', () =>
  createAuthJwtAuthMocks(mocks.jwtAuth),
);
function userModuleMocks(overrides: Record<string, unknown> = {}) {
  if (!mocks.userService.verifyUser) createAuthUserServiceMocks(mocks.userService);
  return { ...mocks.userService, ...overrides };
}
vi.mock('../../../packages/backend/src/application/auth/userService.js', () => userModuleMocks());
vi.mock('../../../packages/backend/src/repositories/userRepo.js', () =>
  userModuleMocks({ getUserByEmail: mocks.registration.getUserByEmail }),
);
vi.mock('../../../packages/backend/src/application/auth/loginLockout.js', () =>
  createLoginLockoutMocks(mocks.loginLockout),
);
vi.mock('../../../packages/backend/src/application/org/membershipService.js', () =>
  createMembershipServiceMocks(mocks.membershipService),
);
vi.mock('../../../packages/backend/src/middleware/rbac.js', () => ({
  Role: { ADMIN: 'admin', ANALYST: 'analyst', READONLY: 'readonly' },
}));
vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => {
  const bare = () => ({ get: vi.fn(), set: vi.fn(), del: vi.fn(), on: vi.fn() });
  const mv = (v: unknown) => vi.fn().mockResolvedValue(v);
  return {
    appRedis: { ...bare(), ping: mv('PONG'), publish: mv(0) },
    isSentinelMode: false,
    bullmqConnectionOptions: {},
  };
});
vi.mock('../../../packages/backend/src/infrastructure/mailService.js', () => ({
  sendVerificationEmail: mocks.registration.sendVerificationEmail,
}));
import authRoutes from '../../../packages/backend/src/routes/authRoutes.js';

const fn = (m: Record<string, unknown>, k: string) => m[k] as ReturnType<typeof vi.fn>;
const expSoon = () => Math.floor(Date.now() / 1000) + 900;
const OID = '11111111-1111-4111-8111-111111111111';
const DUP_ERR = Object.assign(new Error('duplicate key'), { code: '23505' });
const SWITCH_ORG_ID = '55555555-5555-4555-8555-555555555555';
const injectUser = (sub = 'user-switch', role = 'analyst', extra: Record<string, unknown> = {}) =>
  fn(mocks.jwtAuth, 'jwtAuth').mockImplementation((req: ReqU, _res: Response, nx: NextFunction) => {
    req.user = { sub, role, exp: expSoon(), ...extra };
    nx();
  });
const parseCookies = (req: Request, _res: Response, nx: NextFunction) => {
  req.cookies = Object.fromEntries((req.headers.cookie ?? '').split(';').map((c) => c.split('=')));
  nx();
};
const apiPost = (u: string, b?: unknown, h: Record<string, string> = {}) =>
  reqJson(u, 'POST', b, h);
const apiDelete = (u: string, h: Record<string, string> = {}) => reqJson(u, 'DELETE', undefined, h);
const apiGet = (u: string, h: Record<string, string> = {}) => reqJson(u, 'GET', undefined, h);
const ok = async (p: Promise<Awaited<ReturnType<typeof reqJson>>>, status = 200) => {
  const r = await p;
  expect(r.res.status).toBe(status);
  return r;
};
function userRecord(id: string, role: string) {
  return { id, username: 'testuser', role, createdAt: new Date(), isActive: true };
}
function mockOrg(overrides: Record<string, unknown> = {}) {
  return {
    orgId: OID,
    orgName: 'Acme',
    orgSlug: 'acme',
    orgPlan: 'pro',
    orgStatus: 'active',
    role: 'owner',
    ...overrides,
  };
}
const inactiveOrg = mockOrg({ orgStatus: 'suspended' });
describe('authRoutes - 登录与会话端点', () => {
  const getServer = withServer(() => {
    vi.clearAllMocks();
    fn(mocks.jwtAuth, 'jwtAuth').mockImplementation((_q, _r, nx) => nx());
    fn(mocks.jwtAuth, 'generateToken').mockResolvedValue('access-token-mock');
    fn(mocks.jwtAuth, 'generateRefreshToken').mockResolvedValue('refresh-token-mock');
    return startExpressApp((app) => {
      app.use(parseCookies);
      app.use('/api/v1/auth', authRoutes);
    });
  });
  const url = (p: string) => `${getServer().url}/api/v1/auth${p}`;
  const loginUrl = () => url('/login/password');
  const switchUrl = () => url('/switch-org');
  it('正确凭证应返回 access token 并通过 Set-Cookie 下发 refresh token', async () => {
    fn(mocks.userService, 'verifyUser').mockResolvedValueOnce(userRecord('user-123', 'admin'));
    const { res, body } = await ok(apiPost(loginUrl(), validPasswordLoginPayload));
    expect(body.data.accessToken).toBe('access-token-mock');
    expect(body.data.userId).toBe('user-123');
    expect(body.data.refreshToken).toBeUndefined();
    expect(res.headers.get('set-cookie')).toContain('rt=');
  });
  it.each([
    ['错误密码', 'wrong-pass'],
    ['不存在用户', 'any-pass'],
  ])('%s 应返回 401 INVALID_CREDENTIALS', async (_n, pwd) => {
    fn(mocks.userService, 'verifyUser').mockResolvedValueOnce(null);
    const { res, body } = await apiPost(loginUrl(), { username: 'testuser', password: pwd });
    expectError(res, body, 401, 'INVALID_CREDENTIALS');
  });
  it.each([
    ['登录缺失用户名', '/login/password', { password: 'pass' }],
    ['登录缺失密码', '/login/password', { username: 'user' }],
    ['switch-org 缺少 orgId', '/switch-org', {}],
  ])('%s 应返回 400', async (_n, path, payload) => {
    injectUser();
    const { res, body } = await apiPost(url(path), payload);
    expectError(res, body, 400, 'VALIDATION_ERROR');
  });
  it('账户锁定时应返回 429', async () => {
    fn(mocks.loginLockout, 'isLockedOut').mockResolvedValueOnce(120);
    const { res, body } = await apiPost(loginUrl(), { username: 'locked-user', password: 'any' });
    expectError(res, body, 429, 'ACCOUNT_LOCKED');
  });
  it.each<[string, Record<string, unknown> | null, string, string, string]>([
    ['解析到默认组织时应以组织角色签发', mockOrg(), 'admin', 'user-777', 'readonly'],
    ['无组织成员关系时沿用全局角色', null, 'analyst', 'user-888', 'analyst'],
  ])('%s', async (_n, org, expectedRole, userId, userRole) => {
    fn(mocks.userService, 'verifyUser').mockResolvedValueOnce(userRecord(userId, userRole));
    fn(mocks.membershipService, 'isPlatformAdmin').mockResolvedValueOnce(false);
    fn(mocks.membershipService, 'resolveDefaultOrg').mockResolvedValueOnce(org);
    const { body } = await ok(apiPost(loginUrl(), { username: 'orguser', password: 'pass' }));
    expect(body.data.role).toBe(expectedRole);
    if (org) {
      expect(body.data.org.orgId).toBe(OID);
      expect(mocks.jwtAuth.generateToken).toHaveBeenCalledWith(
        userId,
        'admin',
        expect.objectContaining({ tenantId: OID, orgRole: 'owner' }),
      );
    } else {
      expect(body.data.org).toBeNull();
    }
  });
  it('有效 refresh token cookie 应返回新 access token', async () => {
    fn(mocks.jwtAuth, 'refreshAccessToken').mockResolvedValueOnce({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });
    const { res, body } = await ok(
      apiPost(url('/refresh'), {}, { Cookie: 'rt=valid-refresh-token' }),
    );
    expect(body.data.accessToken).toBe('new-access-token');
    expect(res.headers.get('set-cookie')).toContain('rt=');
  });
  it.each([
    ['无效/过期 refresh token', 'expired-token', null],
    ['已撤销 refresh token', 'revoked-token', null],
    ['缺失 refresh cookie', undefined, 'REFRESH_TOKEN_MISSING'],
  ])('%s 应返回 401', async (_n, token, code) => {
    const h: Record<string, string> = token === undefined ? {} : { Cookie: `rt=${token}` };
    if (token !== undefined) fn(mocks.jwtAuth, 'refreshAccessToken').mockResolvedValueOnce(null);
    const { res, body } = await apiPost(url('/refresh'), {}, h);
    expect(res.status).toBe(401);
    if (code) expect(body.error.code).toBe(code);
  });
  it.each([
    ['携带 refresh cookie 应撤销并清除 cookie', { Cookie: 'rt=token-to-revoke' }, true],
    ['未携带 refresh cookie 也应返回成功', undefined, false],
  ])('logout %s', async (_n, headers, expectRevoke) => {
    if (expectRevoke) fn(mocks.jwtAuth, 'revokeRefreshToken').mockResolvedValueOnce(undefined);
    const { res } = await apiDelete(url('/logout'), headers);
    expect(res.status).toBe(200);
    if (expectRevoke) {
      expect(mocks.jwtAuth.revokeRefreshToken).toHaveBeenCalledWith('token-to-revoke');
      expect(res.headers.get('set-cookie')).toContain('rt=');
    }
  });
  it.each([
    ['GET /me 未认证应返回 401', '/me', 'GET', undefined, 'UNAUTHORIZED'],
    ['switch-org 未认证应返回 401', '/switch-org', 'POST', { orgId: SWITCH_ORG_ID }, null],
  ])('%s', async (_n, path, method, payload, code) => {
    const { res, body: json } = await reqJson(url(path), method, payload);
    expect(res.status).toBe(401);
    if (code) expect(json.error.code).toBe(code);
  });
  it('GET /me jwtAuth 注入 user 时应返回用户信息', async () => {
    const exp = expSoon();
    injectUser('user-me', 'admin', { exp });
    const { body } = await ok(apiGet(url('/me'), { Authorization: 'Bearer valid-token' }));
    expect(body.data.userId).toBe('user-me');
    expect(body.data.role).toBe('admin');
    expect(body.data.exp).toBe(exp);
  });
  it('DELETE /me 已认证用户应撤销会话并匿名化账户', async () => {
    injectUser('user-delete-me', 'analyst');
    fn(mocks.userService, 'anonymizeUser').mockResolvedValueOnce(true);
    const { body } = await ok(apiDelete(url('/me'), { Authorization: 'Bearer valid-token' }));
    expect(body.data.anonymized).toBe(true);
    expect(mocks.jwtAuth.revokeAllUserSessions).toHaveBeenCalledWith('user-delete-me');
  });
  it('switch-org 成功应返回新 access token', async () => {
    const orgId = '22222222-2222-4222-8222-222222222222';
    injectUser('user-switch', 'analyst');
    fn(mocks.membershipService, 'getMembership').mockResolvedValueOnce(mockOrg({ orgId }));
    fn(mocks.membershipService, 'isPlatformAdmin').mockResolvedValueOnce(false);
    const { res, body } = await ok(apiPost(switchUrl(), { orgId }, { Authorization: 'Bearer t' }));
    expect(body.data.org.orgId).toBe(orgId);
    expect(res.headers.get('set-cookie')).toContain('rt=');
  });
  it.each([
    ['非该组织成员', null, 'NOT_A_MEMBER', '33333333-3333-4333-8333-333333333333'],
    ['组织非 active', inactiveOrg, 'ORG_INACTIVE', '44444444-4444-4444-8444-444444444444'],
  ])('switch-org %s 应返回 403 %s', async (_n, membership, code, orgId) => {
    injectUser();
    fn(mocks.membershipService, 'getMembership').mockResolvedValueOnce(membership);
    const { res, body } = await apiPost(switchUrl(), { orgId }, { Authorization: 'Bearer t' });
    expectError(res, body, 403, code);
  });
  it('GET /orgs 应返回成员组织列表', async () => {
    const orgId = '66666666-6666-4666-8666-666666666666';
    injectUser('user-orgs', 'analyst', { tenant_id: orgId });
    fn(mocks.membershipService, 'getUserMemberships').mockResolvedValueOnce([
      mockOrg({ orgId, orgName: 'Delta', orgSlug: 'delta', role: 'analyst' }),
    ]);
    const { body } = await ok(apiGet(url('/orgs'), { Authorization: 'Bearer t' }));
    expect(body.data.orgs).toHaveLength(1);
    expect(body.data.orgs[0].slug).toBe('delta');
  });
});
describe('authRegistrationRoutes', () => {
  const getServer = withServer(() => {
    vi.clearAllMocks();
    fn(mocks.registration, 'getUserByEmail').mockResolvedValue(null);
    fn(mocks.userService, 'registerUser').mockResolvedValue('user-uuid-123');
    fn(mocks.userService, 'issueEmailVerificationToken').mockResolvedValue('token-abc');
    fn(mocks.userService, 'verifyEmailToken').mockResolvedValue('user-uuid-123');
    fn(mocks.registration, 'sendVerificationEmail').mockResolvedValue(undefined);
    injectUser('user-123', 'admin', { iat: 1, exp: 9999999999 });
    return startExpressApp((app) => app.use('/api/v1/auth', authRoutes));
  });
  const regUrl = (p: string) => `${getServer().url}/api/v1/auth/${p}`;
  const EMAIL = 'new@example.com';
  const regBody = { username: 'nu', email: EMAIL, password: 'secret123456', orgName: 'Acme' };
  it('注册成功应返回 201 + userId', async () => {
    const { body } = await ok(apiPost(regUrl('register'), regBody), 201);
    expect(body.data.userId).toBe('user-uuid-123');
    expect(mocks.userService.issueEmailVerificationToken).toHaveBeenCalledWith('user-uuid-123');
    expect(mocks.registration.sendVerificationEmail).toHaveBeenCalledWith(EMAIL, 'token-abc');
  });
  it('邮箱已被注册应返回 409', async () => {
    fn(mocks.registration, 'getUserByEmail').mockResolvedValueOnce(userRecord('dup'));
    const { res, body } = await apiPost(regUrl('register'), regBody);
    expectError(res, body, 409, 'EMAIL_TAKEN');
    expect(fn(mocks.userService, 'registerUser')).not.toHaveBeenCalled();
  });
  it.each([
    ['唯一约束冲突', DUP_ERR, 409, 'ACCOUNT_CONFLICT'],
    ['其他异常', new Error('connection lost'), 500, 'REGISTER_FAILED'],
  ])('userService 抛出%s 应返回 %i %s', async (_n, err, status, code) => {
    fn(mocks.userService, 'registerUser').mockRejectedValueOnce(err);
    const { res, body } = await apiPost(regUrl('register'), regBody);
    expectError(res, body, status, code);
    expect(mocks.registration.sendVerificationEmail).not.toHaveBeenCalled();
  });
  it('验证邮件发送失败不应阻塞注册', async () => {
    fn(mocks.registration, 'sendVerificationEmail').mockRejectedValueOnce(new Error('smtp down'));
    await ok(apiPost(regUrl('register'), regBody), 201);
  });
  it('verify-email 缺 token 应返回 400', async () => {
    await ok(apiPost(regUrl('verify-email'), {}), 400);
    expect(mocks.userService.verifyEmailToken).not.toHaveBeenCalled();
  });
  it.each([
    ['无效 token', null, 400, 'INVALID_OR_EXPIRED_TOKEN'],
    ['有效 token', 'user-uuid-456', 200, null],
  ])('%s 应返回预期结果', async (_n, vr, status, code) => {
    fn(mocks.userService, 'verifyEmailToken').mockResolvedValueOnce(vr);
    const { body } = await ok(apiPost(regUrl('verify-email'), { token: 'a-token' }), status);
    if (code) expect(body.error.code).toBe(code);
    else expect(body.data).toEqual({ userId: 'user-uuid-456', verified: true });
  });
});
