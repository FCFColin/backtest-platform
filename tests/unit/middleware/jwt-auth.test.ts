import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SignJWT,
  importJWK,
  generateKeyPair,
  exportPKCS8,
  exportSPKI,
  decodeJwt,
  jwtVerify,
} from 'jose';
import type { Response } from 'express';
import {
  createLoggerMocks,
  createRedisModuleMock,
  createJwtAuthConfigMocks,
  type JwtAuthConfigMocks,
} from '../../helpers/mockFactories.js';
import {
  createJwtAuthUserRepoMock,
  setupJwtAuthTestMocks,
  base64urlEncode,
  signTestToken,
  createIdempotencyReqRes,
  mockLongIdempotencyKey,
  SQL_INJECTION_KEY,
  XSS_KEY,
  NEWLINE_INJECTION_KEY,
} from '../../helpers/authFixtures.js';
import {
  createMockRequest,
  createMockResponse,
  createJwtAuthMockRequest,
  createJwtAuthMockResponse,
  createJwtAuthMockNext,
  awaitMiddleware,
} from '../../helpers/expressMocks.js';
import { RedisUnavailableError } from '../../../packages/backend/src/utils/errors.js';
import type { JwtPayload } from '../../../packages/backend/src/middleware/authTypes.js';

const mocks = vi.hoisted(() => ({ config: {} as JwtAuthConfigMocks }));
const redisMocks = vi.hoisted(() => ({}) as Record<string, unknown>);
const fsMocks = vi.hoisted(() => ({ readFileSync: vi.fn() }));
const apiKeyMocks = vi.hoisted(() => ({ verifyApiKey: vi.fn(async () => null) }));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: Object.assign(mocks.config, createJwtAuthConfigMocks()),
  validateConfig: vi.fn(),
}));
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));
vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () =>
  createRedisModuleMock(
    { withStore: true, withSets: true, withHandlers: true, withMemoryHelpers: true },
    redisMocks,
  ),
);
vi.mock('../../../packages/backend/src/repositories/userRepo.js', () => ({
  getUserById: createJwtAuthUserRepoMock(),
}));
vi.mock('../../../packages/backend/src/infrastructure/apiKeyVerifier.js', () => ({
  verifyApiKey: apiKeyMocks.verifyApiKey,
}));
vi.mock('fs', () => ({
  default: { readFileSync: fsMocks.readFileSync },
  readFileSync: fsMocks.readFileSync,
}));

import {
  generateToken,
  verifyToken,
  generateRefreshToken,
  refreshAccessToken,
  revokeRefreshToken,
  revokeAllUserSessions,
  jwtAuth,
  optionalJwtAuth,
  assignGuestReadonly,
  idempotencyKey,
  isUserSessionValid,
  isAccessTokenRevokedForUser,
} from '../../../packages/backend/src/middleware/jwtAuth.js';
import { getUserById } from '../../../packages/backend/src/repositories/userRepo.js';
redisMocks.useRedisSuccess();

function mockReqRes(reqInit: Record<string, unknown> = {}) {
  return {
    req: createJwtAuthMockRequest(reqInit),
    res: createJwtAuthMockResponse(),
    next: createJwtAuthMockNext(),
  };
}
async function runJwtAuth(headers: Record<string, unknown>, mw = jwtAuth) {
  const { req, res, next } = mockReqRes({ headers });
  await new Promise<void>((resolve) => {
    const originalJson = res.json.bind(res);
    res.json = vi.fn((...args: unknown[]) => {
      originalJson(...args);
      resolve();
      return res;
    }) as typeof res.json;
    mw(req, res, next);
  });
  return { req, res, next };
}
async function expectJwtAuth401(authHeader: string): Promise<void> {
  const { res, next } = await runJwtAuth({ authorization: authHeader });
  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(401);
  expect(res.header).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
}
async function expectJwtAuth401WithCode(authHeader: string, code: string): Promise<void> {
  const { res, next } = await runJwtAuth({ authorization: authHeader });
  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(401);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ success: false, error: expect.objectContaining({ code }) }),
  );
}
async function signHS256(payload: Record<string, unknown>): Promise<string> {
  const key = await importJWK({ kty: 'oct', k: base64urlEncode(mocks.config.JWT_SECRET) }, 'HS256');
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
}
function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { sub: 'user-1', role: 'admin', ...overrides };
}
function mockActiveUser() {
  vi.mocked(getUserById).mockImplementation(async (id: string) => ({
    id,
    username: 'test-user',
    role: 'admin' as const,
    createdAt: new Date(),
    isActive: true,
  }));
}
function mockDisabledUser(id = 'disabled-user') {
  vi.mocked(getUserById).mockResolvedValue({
    id,
    username: 'disabled',
    role: 'readonly',
    createdAt: new Date(),
    isActive: false,
  });
}
function setupAuthEnv() {
  setupJwtAuthTestMocks(mocks, redisMocks);
}
function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function decodePayload(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}
const HACKER = { sub: 'hacker', role: 'admin', iat: 0, exp: 9999999999 };
async function reloadModule() {
  vi.resetModules();
  return import('../../../packages/backend/src/middleware/jwtAuth.js');
}
async function setupRsaKeys(env = 'production') {
  const { publicKey, privateKey } = await generateKeyPair('RS256', {
    modulusLength: 2048,
    extractable: true,
  });
  const privatePem = await exportPKCS8(privateKey);
  const publicPem = await exportSPKI(publicKey);
  mocks.config.JWT_PRIVATE_KEY = privatePem;
  mocks.config.JWT_PUBLIC_KEY = publicPem;
  mocks.config.NODE_ENV = env;
  mocks.config.JWT_ALGORITHM = 'RS256';
  return { publicKey, privateKey, privatePem, publicPem };
}
function resetRsaConfig() {
  mocks.config.JWT_PRIVATE_KEY = '';
  mocks.config.JWT_PRIVATE_KEY_FILE = '';
  mocks.config.JWT_PUBLIC_KEY = '';
  mocks.config.JWT_PUBLIC_KEY_FILE = '';
}

describe('JWT 生成与验证', () => {
  beforeEach(() => setupAuthEnv());
  const roles = ['admin', 'analyst', 'readonly'] as const;
  it.each(roles)('%s 角色应生成并验证 token', async (role) => {
    const t = await generateToken('user-1', role);
    const p = await verifyToken(t);
    expect(t.split('.')).toHaveLength(3);
    expect(p!.sub).toBe('user-1');
    expect(p!.role).toBe(role);
  });
  it('payload 应包含正确 sub/role/iat/exp', async () => {
    const before = Math.floor(Date.now() / 1000);
    const p = decodePayload(await generateToken('user-42', 'admin'));
    const after = Math.floor(Date.now() / 1000);
    expect(p.sub).toBe('user-42');
    expect(p.role).toBe('admin');
    expect(p.iat).toBeGreaterThanOrEqual(before);
    expect(p.iat).toBeLessThanOrEqual(after);
    expect(p.exp).toBe(p.iat! + mocks.config.JWT_ACCESS_TTL);
  });
  it('长 userId（200 字符）应被完整保留', async () => {
    const id = 'a'.repeat(200);
    expect(decodePayload(await generateToken(id, 'readonly')).sub).toBe(id);
  });
  it.each([
    [
      '完整租户上下文',
      { tenantId: 'org-123', orgRole: 'owner', platformAdmin: true },
      { tenant_id: 'org-123', org_role: 'owner', platform_admin: true },
    ],
    ['无租户上下文', undefined, {}],
    ['仅 tenantId', { tenantId: 'org-456' }, { tenant_id: 'org-456' }],
  ])('%s 应正确嵌入租户字段', async (_n, ctx, expected) => {
    const p = decodePayload(
      await generateToken(
        'user-1',
        'admin',
        ctx as { tenantId: string; orgRole: string; platformAdmin: boolean } | undefined,
      ),
    );
    expect(p.tenant_id).toBe(expected.tenant_id);
    expect(p.org_role).toBe(expected.org_role);
    expect(p.platform_admin).toBe(expected.platform_admin);
  });
  it.each([
    [
      '篡改 token 尾部',
      async () => (await generateToken('user-1', 'admin')).slice(0, -5) + 'XXXXX',
    ],
    ['alg=none 攻击', async () => `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(HACKER)}.`],
    [
      'payload 篡改',
      async () => {
        const parts = (await generateToken('user-1', 'admin')).split('.');
        return `${parts[0]}.${b64url(HACKER)}.${parts[2]}`;
      },
    ],
    ['空 token', async () => ''],
    ['非 JWT 格式', async () => 'not-a-jwt'],
    ['缺少 sub', { sub: undefined, role: 'admin' }],
    ['空 sub', { sub: '', role: 'admin' }],
    ['缺少 role', { sub: 'user-1' }],
    ['非法 role', { sub: 'user-1', role: 'superadmin' }],
  ])('%s 应验证失败', async (_n, payload) => {
    expect(
      await verifyToken(
        typeof payload === 'function' ? await payload() : await signTestToken(payload),
      ),
    ).toBeNull();
  });
  it('缺少 exp 的 token 应被拒绝（永不过期 = 安全风险）', async () => {
    expect(
      await verifyToken(await signTestToken({ sub: 'user-1', role: 'admin' }, { omitExp: true })),
    ).toBeNull();
  });
  it('exp 为 Infinity 的 token 应被拒绝', async () => {
    const key = await importJWK(
      { kty: 'oct', k: base64urlEncode(mocks.config.JWT_SECRET) },
      'HS256',
    );
    const t = await new SignJWT(validPayload({ exp: Infinity }))
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .sign(key);
    expect(await verifyToken(t)).toBeNull();
  });
  it('Null 字节注入：sub 含 \\0 应原样保留', async () => {
    const p = await verifyToken(await signTestToken({ sub: 'user\0admin', role: 'admin' }));
    expect(p!.sub).toBe('user\0admin');
    expect(p!.sub.length).toBe('user\0admin'.length);
  });
  it('JWT 炸弹：1MB payload 应在 2s 内完成验证且不崩溃', async () => {
    const start = Date.now();
    const p = await verifyToken(
      await signTestToken({ sub: 'user-1', role: 'admin', data: 'A'.repeat(1024 * 1024) }),
    );
    expect(p!.sub).toBe('user-1');
    expect(Date.now() - start).toBeLessThan(2000);
  });
  it('算法混淆攻击：RS256 签名的 token 不应通过 HS256 验证', async () => {
    const { privateKey } = await generateKeyPair('RS256', { modulusLength: 2048 });
    const t = await new SignJWT({ sub: 'attacker', role: 'admin' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    expect(await verifyToken(t)).toBeNull();
  });
});

describe('Refresh Token 生命周期与 Redis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useRedisSuccess();
    mockActiveUser();
  });
  it('生成 token 应为 64 位 hex 且每次调用产生新 familyId', async () => {
    const t = await generateRefreshToken('user-1', 'admin');
    expect(t).toMatch(/^[0-9a-f]{64}$/);
    expect(t).not.toBe(await generateRefreshToken('user-1', 'admin'));
  });
  it.each(['admin', 'analyst', 'readonly'] as const)(
    '%s 角色应可生成 refresh token',
    async (role) => {
      expect(await generateRefreshToken('user-role', role)).toBeTruthy();
    },
  );
  it('应接受显式 familyId 与租户上下文', async () => {
    expect(await generateRefreshToken('user-1', 'admin', 'existing-family-id')).toBeTruthy();
    expect(
      await generateRefreshToken('tenant-user', 'admin', undefined, {
        tenantId: 'org-1',
        orgRole: 'owner',
        platformAdmin: true,
      }),
    ).toBeTruthy();
  });
  it('应写入 Redis（TTL=EX + family 元数据 + user_families 集合）', async () => {
    const t = await generateRefreshToken('redis-user', 'admin');
    const setCall = vi
      .mocked(redisMocks.set)
      .mock.calls.find(([k]) => String(k).startsWith('refresh_token:'));
    expect(setCall![2]).toBe('EX');
    expect(setCall![3]).toBe(mocks.config.JWT_REFRESH_TTL);
    const family = JSON.parse(
      [...redisMocks.store.entries()].find(([k]) => k.startsWith('token_family:'))![1],
    );
    expect(family.lastToken).toBe(t);
    expect(family.revoked).toBe(false);
    expect(redisMocks.sadd).toHaveBeenCalledWith(
      expect.stringContaining('user_families:redis-user'),
      expect.any(String),
    );
  });
  it('租户上下文应透传到轮换后的 access token', async () => {
    const r = await refreshAccessToken(
      await generateRefreshToken('tenant-refresh', 'analyst', undefined, {
        tenantId: 'org-42',
        orgRole: 'owner',
        platformAdmin: true,
      }),
    );
    const p = decodeJwt(r!.accessToken);
    expect(p.sub).toBe('tenant-refresh');
    expect(p.role).toBe('analyst');
    expect(p.tenant_id).toBe('org-42');
    expect(p.org_role).toBe('owner');
    expect(p.platform_admin).toBe(true);
  });
  it('刷新应返回新 token 对（access + 轮换后的 refresh）', async () => {
    const t = await generateRefreshToken('user-1', 'admin');
    const r = await refreshAccessToken(t);
    expect(r!.accessToken).toBeTruthy();
    expect(r!.refreshToken).not.toBe(t);
  });
  it('刷新后旧 token 应失效（轮换机制）', async () => {
    const t = await generateRefreshToken('user-1', 'admin');
    expect(await refreshAccessToken(t)).not.toBeNull();
    expect(await refreshAccessToken(t)).toBeNull();
  });
  it('轮换后可链式刷新 3 层', async () => {
    let t = await generateRefreshToken('chain-user', 'analyst');
    for (let i = 0; i < 3; i++) {
      const r = await refreshAccessToken(t);
      expect(r).not.toBeNull();
      t = r!.refreshToken;
    }
  });
  it('Token Family 复用检测：旧 token 复用应撤销整个家族', async () => {
    const t = await generateRefreshToken('reuse-user', 'admin');
    const r1 = await refreshAccessToken(t);
    expect(r1).not.toBeNull();
    expect(await refreshAccessToken(t)).toBeNull();
    expect(await refreshAccessToken(r1!.refreshToken)).toBeNull();
  });
  it('轮换应标记旧 token 为 used 并从 store 删除', async () => {
    const t = await generateRefreshToken('used-user', 'admin');
    await refreshAccessToken(t);
    expect(redisMocks.store.has(`refresh_token:${t}`)).toBe(false);
    expect(redisMocks.store.has(`refresh_token:used:${t}`)).toBe(true);
  });
  it('不存在的 token 应返回 null', async () => {
    expect(await refreshAccessToken('nonexistent-token')).toBeNull();
  });
  it('过期 token 应返回 null（fake timers）', async () => {
    vi.useFakeTimers();
    const t = await generateRefreshToken('expired-user', 'admin');
    vi.advanceTimersByTime((mocks.config.JWT_REFRESH_TTL + 60) * 1000);
    expect(await refreshAccessToken(t)).toBeNull();
    vi.useRealTimers();
  });
  it('Redis 中过期 entry 应返回 null 并删除', async () => {
    const t = await generateRefreshToken('redis-expired', 'admin');
    const key = `refresh_token:${t}`;
    const entry = JSON.parse(redisMocks.store.get(key)!);
    entry.expiresAt = Math.floor(Date.now() / 1000) - 10;
    redisMocks.store.set(key, JSON.stringify(entry));
    expect(await refreshAccessToken(t)).toBeNull();
    expect(redisMocks.store.has(key)).toBe(false);
  });
  it('已停用用户与 DB 异常应拒绝刷新', async () => {
    mockDisabledUser('disabled-refresh');
    const t1 = await generateRefreshToken('disabled-refresh', 'readonly');
    expect(await refreshAccessToken(t1)).toBeNull();
    const t2 = await generateRefreshToken('db-fail-user', 'admin');
    vi.mocked(getUserById).mockRejectedValueOnce(new Error('database unavailable'));
    expect(await refreshAccessToken(t2)).toBeNull();
  });
  it('Redis set/get 失败应抛出 RedisUnavailableError（ADR-045）', async () => {
    redisMocks.set.mockRejectedValueOnce(new Error('Redis write failed'));
    await expect(generateRefreshToken('user-fallback', 'admin')).rejects.toThrow(
      RedisUnavailableError,
    );
    const t = await generateRefreshToken('redis-refresh-fallback', 'admin');
    redisMocks.get.mockRejectedValueOnce(new Error('Redis read failed'));
    await expect(refreshAccessToken(t)).rejects.toThrow(RedisUnavailableError);
  });
  it('Redis 可用性应通过 getRedisHealth 动态反映 ping 状态（fail-closed）', async () => {
    redisMocks.useRedisSuccess();
    expect(await generateRefreshToken('redis-ready-user', 'admin')).toBeTruthy();
    redisMocks.useMemoryFallback();
    await expect(generateRefreshToken('redis-error-user', 'analyst')).rejects.toThrow(
      RedisUnavailableError,
    );
  });
  it('revokeRefreshToken 应撤销 token、family 与 used 标记', async () => {
    const t = await generateRefreshToken('revoke-user', 'admin');
    const entry = JSON.parse(redisMocks.store.get(`refresh_token:${t}`)!);
    await revokeRefreshToken(t);
    expect(await refreshAccessToken(t)).toBeNull();
    expect(JSON.parse(redisMocks.store.get(`token_family:${entry.familyId}`)!).revoked).toBe(true);
    expect(redisMocks.store.has(`refresh_token:${t}`)).toBe(false);
    const t2 = await generateRefreshToken('revoke-used', 'admin');
    await refreshAccessToken(t2);
    await revokeRefreshToken(t2);
    expect(redisMocks.store.has(`refresh_token:used:${t2}`)).toBe(false);
  });
  it('revokeRefreshToken Redis 异常应抛 RedisUnavailableError', async () => {
    const t = await generateRefreshToken('user-revoke-err', 'admin');
    redisMocks.get.mockRejectedValueOnce(new Error('redis read failed'));
    await expect(revokeRefreshToken(t)).rejects.toThrow(RedisUnavailableError);
  });
  it('revokeAllUserSessions 应撤销全部 family、标记 revoked_at 并清理集合', async () => {
    const t1 = await generateRefreshToken('revoke-all-user', 'admin');
    const t2 = await generateRefreshToken('revoke-all-user', 'analyst');
    const before = Math.floor(Date.now() / 1000);
    await revokeAllUserSessions('revoke-all-user');
    expect(await refreshAccessToken(t1)).toBeNull();
    expect(await refreshAccessToken(t2)).toBeNull();
    expect(redisMocks.store.has('user_revoked:revoke-all-user')).toBe(true);
    expect(await isAccessTokenRevokedForUser('revoke-all-user', before - 10)).toBe(true);
    expect(
      await isAccessTokenRevokedForUser('revoke-all-user', Math.floor(Date.now() / 1000) + 10),
    ).toBe(false);
    const familiesKey = [...redisMocks.sets.keys()].find((k) => k.includes('revoke-all-user'));
    if (familiesKey) expect(redisMocks.store.has(familiesKey)).toBe(false);
  });
  it('revokeAllUserSessions Redis 异常应抛 RedisUnavailableError', async () => {
    await generateRefreshToken('revoke-fallback-user', 'admin');
    redisMocks.smembers.mockRejectedValueOnce(new Error('smembers failed'));
    await expect(revokeAllUserSessions('revoke-fallback-user')).rejects.toThrow(
      RedisUnavailableError,
    );
  });
});

describe('jwtAuth 中间件 — 认证与放行', () => {
  beforeEach(() => setupAuthEnv());
  it('Bearer Token 认证成功应注入 req.user 并放行', async () => {
    const token = await generateToken('user-1', 'admin');
    const { req, res, next } = mockReqRes({ headers: { authorization: `Bearer ${token}` } });
    await awaitMiddleware(jwtAuth, req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user!.sub).toBe('user-1');
  });
  it('认证成功应注入脱敏日志上下文', async () => {
    const token = await generateToken('log-context-user', 'admin');
    const childFn = vi.fn(() => ({ info: vi.fn(), warn: vi.fn() }));
    const { req, res, next } = mockReqRes({
      headers: { authorization: `Bearer ${token}` },
      log: { child: childFn },
    });
    await awaitMiddleware(jwtAuth, req, res, next);
    expect(next).toHaveBeenCalled();
    expect(childFn).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin' }));
  });
  it.each([
    ['无效 Bearer', 'Bearer invalid-token'],
    ['Bearer 后无 token', 'Bearer '],
    ['Bearer 仅空白', 'Bearer    '],
    ['Basic 认证缺凭证', 'Basic dXNlcjpwYXNz'],
    ['无空格 Bearer 前缀', 'Bearertoken-without-space'],
  ])('%s 应返回 401', async (_n, auth) => {
    await expectJwtAuth401(auth);
  });
  it('无认证凭证应返回 401', () => {
    const { req, res, next } = mockReqRes();
    jwtAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
  it.each([
    ['无效 x-api-key', 'wrong-key'],
    ['超长 x-api-key（防缓冲区攻击）', 'a'.repeat(129)],
  ])('%s 应返回 401', async (_n, key) => {
    apiKeyMocks.verifyApiKey.mockResolvedValueOnce(null);
    const { req, res, next } = mockReqRes({ headers: { 'x-api-key': key } });
    jwtAuth(req, res, next);
    await new Promise<void>((r) => setTimeout(r, 10));
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
  it('并发 jwtAuth 调用应各自独立验证', async () => {
    const token = await generateToken('concurrent-user', 'analyst');
    const results = await Promise.all(
      Array.from({ length: 5 }, async () => {
        const { req, res, next } = mockReqRes({ headers: { authorization: `Bearer ${token}` } });
        await awaitMiddleware(jwtAuth, req, res, next);
        return { req, next };
      }),
    );
    for (const { req, next } of results) {
      expect(next).toHaveBeenCalled();
      expect(req.user?.sub).toBe('concurrent-user');
    }
  });
});

describe('jwtAuth 中间件 — API Key 与 DEV 模式', () => {
  beforeEach(() => {
    setupAuthEnv();
    apiKeyMocks.verifyApiKey.mockReset();
    apiKeyMocks.verifyApiKey.mockImplementation(async () => null);
  });
  it('DB API Key 认证成功应注入 analyst 与 tenant_id（ADR-033）', async () => {
    apiKeyMocks.verifyApiKey.mockResolvedValueOnce({
      orgId: '11111111-1111-1111-1111-111111111111',
      keyId: '22222222-2222-2222-2222-222222222222',
    } as Record<string, unknown>);
    const { req, res, next } = mockReqRes({
      headers: { 'x-api-key': 'bpk_live_someplaintextkey' },
    });
    await awaitMiddleware(jwtAuth, req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({
      role: 'analyst',
      tenant_id: '11111111-1111-1111-1111-111111111111',
      org_role: 'analyst',
      sub: 'apikey:22222222-2222-2222-2222-222222222222',
    });
  });
  it('平台 break-glass 密钥应注入 platform_admin（P0-04）', async () => {
    apiKeyMocks.verifyApiKey.mockResolvedValueOnce({
      orgId: null,
      keyId: '22222222-2222-2222-2222-222222222222',
      isPlatformAdmin: true,
    });
    const { req, res, next } = mockReqRes({ headers: { 'x-api-key': 'bpk_live_breakglass' } });
    await awaitMiddleware(jwtAuth, req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({ role: 'admin', platform_admin: true });
  });
  it.each([true, false])('DEV_SKIP_AUTH=%s 应%s', async (skip) => {
    mocks.config.NODE_ENV = 'development';
    mocks.config.DEV_SKIP_AUTH = skip;
    mocks.config.JWT_SECRET = 'dev-only-jwt-secret-change-in-production';
    const { req, res, next } = mockReqRes();
    jwtAuth(req, res, next);
    await new Promise<void>((r) => setTimeout(r, 10));
    if (skip) {
      expect(next).toHaveBeenCalled();
      expect(req.user).toMatchObject({ role: 'readonly', sub: 'dev-user' });
    } else {
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    }
  });
  it('Bearer Token 优先于 x-api-key', async () => {
    const token = await generateToken('user-1', 'readonly');
    const { req, res, next } = mockReqRes({
      headers: { authorization: `Bearer ${token}`, 'x-api-key': 'test-api-key-12345' },
    });
    await awaitMiddleware(jwtAuth, req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({ role: 'readonly', sub: 'user-1' });
  });
});

describe('optionalJwtAuth 中间件', () => {
  beforeEach(() => setupAuthEnv());
  it('有效 Bearer 应设置 req.user 并放行', async () => {
    const token = await generateToken('user-1', 'analyst');
    const { req, res, next } = mockReqRes({ headers: { authorization: `Bearer ${token}` } });
    await awaitMiddleware(optionalJwtAuth, req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user?.sub).toBe('user-1');
  });
  it('应注入脱敏日志上下文', async () => {
    const token = await generateToken('user-1', 'readonly');
    const childFn = vi.fn(() => ({ info: vi.fn(), warn: vi.fn() }));
    const { req, res, next } = mockReqRes({
      headers: { authorization: `Bearer ${token}` },
      log: { child: childFn },
    });
    await awaitMiddleware(optionalJwtAuth, req, res, next);
    expect(childFn).toHaveBeenCalled();
  });
  it.each([
    ['无效 Bearer', 'Bearer invalid'],
    ['非 JWT 格式', 'Bearer not.valid.jwt'],
  ])('%s 应置空 req.user 并放行', async (_n, auth) => {
    const { req, res, next } = mockReqRes({ headers: { authorization: auth } });
    await awaitMiddleware(optionalJwtAuth, req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeNull();
  });
  it('无 Bearer 应匿名放行', () => {
    const { req, res, next } = mockReqRes();
    optionalJwtAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeNull();
  });
});

describe('会话撤销与账户停用', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveUser();
  });
  it('撤销后 refresh 与 access token 均应失效', async () => {
    redisMocks.useRedisSuccess();
    const rt = await generateRefreshToken('user-revoke', 'admin');
    const at = await generateToken('user-revoke', 'admin');
    await revokeAllUserSessions('user-revoke');
    expect(await refreshAccessToken(rt)).toBeNull();
    expect(await verifyToken(at)).toBeNull();
    expect(redisMocks.store.has('user_revoked:user-revoke')).toBe(true);
  });
  it('已停用用户 jwtAuth 应返回 401 ACCOUNT_DISABLED', async () => {
    mockDisabledUser('disabled-jwt-user');
    const t = await generateToken('disabled-jwt-user', 'readonly');
    await expectJwtAuth401WithCode(`Bearer ${t}`, 'ACCOUNT_DISABLED');
  });
  it('全局会话撤销后 jwtAuth 应返回 401 INVALID_TOKEN', async () => {
    setupAuthEnv();
    const t = await generateToken('user-revoked-jwt', 'admin');
    await revokeAllUserSessions('user-revoked-jwt');
    await expectJwtAuth401WithCode(`Bearer ${t}`, 'INVALID_TOKEN');
  });
  it('已停用用户 refresh 应被拒绝并删除 token', async () => {
    redisMocks.useRedisSuccess();
    const t = await generateRefreshToken('disabled-redis-refresh', 'admin');
    mockDisabledUser('disabled-redis-refresh');
    expect(await refreshAccessToken(t)).toBeNull();
    expect(redisMocks.del).toHaveBeenCalled();
  });
  it('revokeRefreshToken Redis 读取异常应抛 RedisUnavailableError（ADR-045）', async () => {
    redisMocks.useRedisSuccess();
    const t = await generateRefreshToken('user-revoke-err', 'admin');
    redisMocks.get.mockRejectedValueOnce(new Error('redis read failed'));
    await expect(revokeRefreshToken(t)).rejects.toThrow(RedisUnavailableError);
  });
});

describe('assignGuestReadonly 中间件', () => {
  beforeEach(() => setupAuthEnv());
  it.each([
    ['undefined', undefined],
    ['null', null],
  ])('req.user 为 %s 时应注入 guest readonly 用户', (_n, user) => {
    const { req, res, next } = mockReqRes(user === undefined ? {} : { user });
    assignGuestReadonly(req, res, next);
    expect(req.user).toMatchObject({ sub: 'guest', role: 'readonly' });
    expect(next).toHaveBeenCalledTimes(1);
  });
  it('req.user 已存在时应保留原用户不覆盖', () => {
    const existing: JwtPayload = { sub: 'real-user', role: 'admin', iat: 123, exp: 456 };
    const { req, res, next } = mockReqRes({ user: existing });
    assignGuestReadonly(req, res, next);
    expect(req.user).toBe(existing);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('verifyToken RS256 算法边界', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    redisMocks.useMemoryFallback();
    resetRsaConfig();
    mocks.config.NODE_ENV = 'production';
    mocks.config.JWT_ALGORITHM = 'RS256';
  });
  it('RS256 模式应拒绝 HS256 签发的 token（禁止算法回退）', async () => {
    await setupRsaKeys();
    const mod = await reloadModule();
    expect(await mod.verifyToken(await signHS256(validPayload()))).toBeNull();
  });
  it('应拒绝不同 RSA 密钥对签发的 token（kid 不匹配）', async () => {
    await setupRsaKeys();
    const mod = await reloadModule();
    const foreign = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
    const t = await new SignJWT(validPayload())
      .setProtectedHeader({ alg: 'RS256', kid: 'foreign-key-id' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(foreign.privateKey);
    expect(await mod.verifyToken(t)).toBeNull();
  });
  it('应拒绝缺失签名段的 RS256 token', async () => {
    const { privateKey } = await setupRsaKeys();
    const mod = await reloadModule();
    const t = await new SignJWT(validPayload())
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    const parts = t.split('.');
    expect(await mod.verifyToken(`${parts[0]}.${parts[1]}.`)).toBeNull();
  });
});

describe('jwtAuth RS256 路径（PEM 加载与签发）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useRedisSuccess();
    resetRsaConfig();
    mocks.config.NODE_ENV = 'development';
    mocks.config.JWT_ALGORITHM = 'RS256';
  });
  it('开发模式无密钥配置时应自动生成密钥对并完成签发验证', async () => {
    const mod = await reloadModule();
    const t = await mod.generateToken('dev-user-rs', 'admin');
    const p = await mod.verifyToken(t);
    expect(p!.sub).toBe('dev-user-rs');
    expect(await mod.getOrCachePrivateKey()).toBeTruthy();
    expect(await mod.getOrCachePublicKey()).toBeTruthy();
  });
  it('生产环境内联 PEM 应签发并验证 access token（含公钥 jwtVerify）', async () => {
    await setupRsaKeys('production');
    const mod = await reloadModule();
    const t = await mod.generateToken('rs256-user', 'admin');
    const p = await mod.verifyToken(t);
    expect(p!.sub).toBe('rs256-user');
    expect(p!.role).toBe('admin');
    const { payload } = await jwtVerify(t, await mod.getOrCachePublicKey(), {
      algorithms: ['RS256'],
    });
    expect(payload.sub).toBe('rs256-user');
  });
  it('PEM 文件路径应能读取并签发', async () => {
    const { privatePem, publicPem } = await setupRsaKeys();
    mocks.config.NODE_ENV = 'production';
    mocks.config.JWT_PRIVATE_KEY = '';
    mocks.config.JWT_PRIVATE_KEY_FILE = '/secrets/private.pem';
    mocks.config.JWT_PUBLIC_KEY = '';
    mocks.config.JWT_PUBLIC_KEY_FILE = '/secrets/public.pem';
    fsMocks.readFileSync.mockImplementation((fp: string) => {
      if (String(fp).includes('private')) return privatePem;
      if (String(fp).includes('public')) return publicPem;
      throw new Error('ENOENT');
    });
    const mod = await reloadModule();
    const t = await mod.generateToken('file-pem-user', 'readonly');
    expect(t.split('.')).toHaveLength(3);
    expect(fsMocks.readFileSync).toHaveBeenCalledWith('/secrets/private.pem', 'utf-8');
    await mod.getOrCachePublicKey();
    expect(fsMocks.readFileSync).toHaveBeenCalledWith('/secrets/public.pem', 'utf-8');
  });
  it('生产环境缺少 RSA 密钥应拒绝签发与验证', async () => {
    resetRsaConfig();
    mocks.config.NODE_ENV = 'production';
    const mod = await reloadModule();
    await expect(mod.generateToken('prod-user', 'admin')).rejects.toThrow(/JWT_PRIVATE_KEY/);
    await expect(mod.getOrCachePublicKey()).rejects.toThrow(/JWT_PUBLIC_KEY/);
  });
  it('readPemFile 读取失败应抛出明确错误', async () => {
    fsMocks.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    mocks.config.JWT_PRIVATE_KEY = '';
    mocks.config.JWT_PRIVATE_KEY_FILE = '/missing/private.pem';
    mocks.config.JWT_PUBLIC_KEY = '';
    mocks.config.JWT_PUBLIC_KEY_FILE = '';
    mocks.config.NODE_ENV = 'production';
    const mod = await reloadModule();
    await expect(mod.generateToken('missing-pem', 'admin')).rejects.toThrow(/无法读取 PEM 文件/);
  });
  it('RS256 refresh token 生命周期应完整', async () => {
    const mod = await reloadModule();
    const rt = await mod.generateRefreshToken('rs256-refresh', 'analyst');
    const r = await mod.refreshAccessToken(rt);
    expect(r).not.toBeNull();
    expect(r!.accessToken).toBeTruthy();
  });
  it('getUserById 失败时 jwtAuth 应拒绝访问', async () => {
    const mod = await reloadModule();
    const { getUserById: g } =
      await import('../../../packages/backend/src/repositories/userRepo.js');
    redisMocks.useRedisSuccess();
    vi.mocked(g).mockRejectedValueOnce(new Error('db error'));
    const t = await mod.generateToken('user-db-error', 'admin');
    const { res, next } = await runJwtAuth({ authorization: `Bearer ${t}` }, mod.jwtAuth);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('getOrCache* 密钥加载（jwtSigner）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRsaConfig();
    mocks.config.NODE_ENV = 'test';
    mocks.config.JWT_ALGORITHM = 'RS256';
  });
  it('生产环境应从环境变量加载私钥与公钥', async () => {
    await setupRsaKeys('production');
    const mod = await reloadModule();
    expect(await mod.getOrCachePrivateKey()).toBeTruthy();
    expect(await mod.getOrCachePublicKey()).toBeTruthy();
  });
  it('密钥加载应缓存（重复调用返回同一密钥）', async () => {
    mocks.config.NODE_ENV = 'development';
    const mod = await reloadModule();
    expect(await mod.getOrCachePrivateKey()).toBe(await mod.getOrCachePrivateKey());
    expect(await mod.getOrCachePublicKey()).toBe(await mod.getOrCachePublicKey());
    expect(await mod.getOrCacheHS256Key()).toBe(await mod.getOrCacheHS256Key());
  });
  it('PEM 文件内容非法应抛出错误', async () => {
    fsMocks.readFileSync.mockReturnValue('not-a-valid-pem-key');
    mocks.config.JWT_PRIVATE_KEY = '';
    mocks.config.JWT_PRIVATE_KEY_FILE = '/secrets/private.pem';
    mocks.config.NODE_ENV = 'production';
    const mod = await reloadModule();
    await expect(mod.getOrCachePrivateKey()).rejects.toThrow();
  });
  it.each([
    [
      'fs 读取错误',
      () => {
        throw new Error('EACCES: permission denied');
      },
      '/etc/secrets/key.pem',
      /无法读取 PEM 文件.*\/etc\/secrets\/key\.pem/,
    ],
    [
      '非 Error 异常',
      () => {
        throw 'string error';
      },
      '/secrets/key.pem',
      /无法读取 PEM 文件/,
    ],
  ])('readPemFile %s 应抛出中文错误消息', async (_n, impl, filePath, pattern) => {
    fsMocks.readFileSync.mockImplementation(impl);
    mocks.config.JWT_PRIVATE_KEY = '';
    mocks.config.JWT_PRIVATE_KEY_FILE = filePath;
    mocks.config.NODE_ENV = 'production';
    const mod = await reloadModule();
    await expect(mod.getOrCachePrivateKey()).rejects.toThrow(pattern);
  });
  it('HS256 密钥应从 JWT_SECRET 派生并完成签发验证', async () => {
    mocks.config.JWT_ALGORITHM = 'HS256';
    const mod = await reloadModule();
    const key = await mod.getOrCacheHS256Key();
    expect(key).toBeTruthy();
    const { payload } = await jwtVerify(await mod.generateToken('hs256-test', 'analyst'), key, {
      algorithms: ['HS256'],
    });
    expect(payload.sub).toBe('hs256-test');
  });
});

describe('isUserSessionValid 与 isAccessTokenRevokedForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useRedisSuccess();
  });
  it('系统用户 ID（dev-user/api-key-user）应视为有效且不查 DB', async () => {
    for (const sysUser of ['dev-user', 'api-key-user'])
      expect(await isUserSessionValid(sysUser)).toBe(true);
    expect(getUserById).not.toHaveBeenCalled();
  });
  it('活跃用户有效；停用/不存在/异常用户无效', async () => {
    mockActiveUser();
    expect(await isUserSessionValid('active-user')).toBe(true);
    mockDisabledUser('inactive-user');
    expect(await isUserSessionValid('inactive-user')).toBe(false);
    vi.mocked(getUserById).mockResolvedValueOnce(null);
    expect(await isUserSessionValid('nonexistent-user')).toBe(false);
    vi.mocked(getUserById).mockRejectedValueOnce(new Error('DB error'));
    expect(await isUserSessionValid('error-user')).toBe(false);
    vi.mocked(getUserById).mockRejectedValueOnce(new Error('empty id'));
    expect(await isUserSessionValid('')).toBe(false);
  });
  it('未记录撤销或 iat 晚于撤销时间应返回 false，早于则 true', async () => {
    expect(await isAccessTokenRevokedForUser('unrevoked-user', 1000)).toBe(false);
    expect(await isAccessTokenRevokedForUser('unknown-user', 100)).toBe(false);
    await revokeAllUserSessions('revoked-check-user');
    expect(await isAccessTokenRevokedForUser('revoked-check-user', 1)).toBe(true);
    expect(
      await isAccessTokenRevokedForUser('revoked-check-user', Math.floor(Date.now() / 1000) + 3600),
    ).toBe(false);
  });
  it('撤销检查应调用 Redis get', async () => {
    await revokeAllUserSessions('redis-revoked-user');
    expect(await isAccessTokenRevokedForUser('redis-revoked-user', 1)).toBe(true);
    expect(redisMocks.get).toHaveBeenCalled();
  });
  it('Redis get 失败应抛 RedisUnavailableError', async () => {
    await revokeAllUserSessions('redis-fallback-check-user');
    redisMocks.get.mockRejectedValueOnce(new Error('get failed'));
    await expect(isAccessTokenRevokedForUser('redis-fallback-check-user', 1)).rejects.toThrow(
      RedisUnavailableError,
    );
  });
});

describe('idempotencyKey 中间件', () => {
  function reqResNoKey(method = 'POST') {
    const req = createMockRequest({
      method,
      headers: {},
      path: '/api/test',
      url: '/api/test',
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    });
    const res = { ...createMockResponse(), on: vi.fn() } as unknown as Response;
    return { req, res, next: vi.fn() };
  }
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useRedisSuccess();
  });
  it('非 POST 请求或无 Key 应直接放行', () => {
    for (const method of ['GET', 'POST']) {
      const { req, res, next } = reqResNoKey(method);
      idempotencyKey(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.json).not.toHaveBeenCalled();
    }
  });
  it('超长 Key（>128 字符）应返回 400', () => {
    const { req, res, next } = createIdempotencyReqRes(mockLongIdempotencyKey());
    idempotencyKey(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
  it('首次请求放行，相同 Key 第二次应返回缓存结果', async () => {
    const key = 'test-key-duplicate';
    const cachedBody = { success: true, data: 'cached' };
    const r1 = createIdempotencyReqRes(key);
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.next).toHaveBeenCalledTimes(1));
    r1.res.statusCode = 200;
    r1.res.json(cachedBody);
    const r2 = createIdempotencyReqRes(key);
    idempotencyKey(r2.req, r2.res, r2.next);
    await vi.waitFor(() => expect(r2.res.status).toHaveBeenCalledWith(200));
    expect(r2.next).not.toHaveBeenCalled();
    expect(r2.res.json).toHaveBeenCalledWith(cachedBody);
  });
  it('5xx 响应不应被缓存，重试应再次放行', async () => {
    const key = 'server-error-key';
    const r1 = createIdempotencyReqRes(key);
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.next).toHaveBeenCalledTimes(1));
    r1.res.statusCode = 503;
    r1.res.json({ success: false });
    expect(redisMocks.store.has(`idempotency:${key}`)).toBe(false);
    const r2 = createIdempotencyReqRes(key);
    idempotencyKey(r2.req, r2.res, r2.next);
    await vi.waitFor(() => expect(r2.next).toHaveBeenCalledTimes(1));
    expect(r2.res.status).not.toHaveBeenCalled();
  });
  it('不同 Key 应独立处理', async () => {
    for (const key of ['test-key-a', 'test-key-b']) {
      const r = createIdempotencyReqRes(key);
      idempotencyKey(r.req, r.res, r.next);
      await vi.waitFor(() => expect(r.next).toHaveBeenCalledTimes(1));
      r.res.statusCode = 200;
      r.res.json({ success: true });
    }
  });
  it('首次 POST 应写入 Redis，二次请求应从 Redis 返回缓存', async () => {
    const key = 'redis-dup-key';
    const cachedBody = { success: true, data: 'from-redis' };
    const r1 = createIdempotencyReqRes(key);
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.next).toHaveBeenCalledTimes(1));
    r1.res.statusCode = 200;
    r1.res.json(cachedBody);
    await vi.waitFor(() => expect(redisMocks.store.has(`idempotency:${key}`)).toBe(true));
    const r2 = createIdempotencyReqRes(key);
    idempotencyKey(r2.req, r2.res, r2.next);
    await vi.waitFor(() => expect(r2.res.status).toHaveBeenCalledWith(200));
    expect(r2.next).not.toHaveBeenCalled();
    expect(r2.res.json).toHaveBeenCalledWith(cachedBody);
    expect(redisMocks.get).toHaveBeenCalledWith(`idempotency:${key}`);
  });
  it('并发相同 Key：仅一个执行 handler，其余返回缓存', async () => {
    const key = 'race-condition-key-12345';
    const cachedBody = { success: true, data: 'first-response' };
    const r1 = createIdempotencyReqRes(key);
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.next).toHaveBeenCalledTimes(1));
    r1.res.statusCode = 200;
    r1.res.json(cachedBody);
    const concurrent = Array.from({ length: 4 }, () => createIdempotencyReqRes(key));
    await Promise.all(
      concurrent.map(
        ({ req, res, next }) =>
          new Promise<void>((resolve) => {
            idempotencyKey(req, res, next);
            vi.waitFor(() => expect(res.status).toHaveBeenCalledWith(200)).then(resolve);
          }),
      ),
    );
    for (const { res, next } of concurrent) {
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(cachedBody);
    }
  });
  it.each([
    ['SQL 注入', SQL_INJECTION_KEY],
    ['XSS 载荷', XSS_KEY],
    ['换行符注入', NEWLINE_INJECTION_KEY],
  ])('%s Key 应被安全存储并命中缓存', async (_n, key) => {
    const body = { success: true };
    const r1 = createIdempotencyReqRes(key);
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.next).toHaveBeenCalledTimes(1));
    r1.res.statusCode = 200;
    r1.res.json(body);
    const r2 = createIdempotencyReqRes(key);
    idempotencyKey(r2.req, r2.res, r2.next);
    await vi.waitFor(() => expect(r2.res.status).toHaveBeenCalledWith(200));
    expect(r2.next).not.toHaveBeenCalled();
    expect(r2.res.json).toHaveBeenCalledWith(body);
  });
  it('Redis 缓存写入失败应记录 warn 且不阻塞响应', async () => {
    redisMocks.set.mockRejectedValueOnce(new Error('redis set failed'));
    const { req, res, next } = createIdempotencyReqRes('redis-write-fail');
    idempotencyKey(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    res.statusCode = 200;
    expect(() => res.json({ success: true })).not.toThrow();
    await vi.waitFor(() => expect(redisMocks.set).toHaveBeenCalled());
  });
  it.each([
    ['Redis ping 失败', () => redisMocks.useMemoryFallback()],
    [
      'Redis get 抛错',
      () => {
        redisMocks.ping.mockResolvedValue('PONG');
        redisMocks.get.mockRejectedValueOnce(new Error('redis read failed'));
      },
    ],
  ])('%s 时应 fail-closed 返回 503（ADR-045）', async (_n, arrange) => {
    arrange();
    const { req, res, next } = createIdempotencyReqRes('redis-down-key');
    idempotencyKey(req, res, next);
    await vi.waitFor(() => expect(res.status).toHaveBeenCalledWith(503));
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
  it('Redis 不可用时非 POST/无 Key 请求仍应放行', () => {
    redisMocks.useMemoryFallback();
    for (const { req, res, next } of [reqResNoKey('GET'), reqResNoKey('POST')]) {
      idempotencyKey(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    }
  });
  it('Redis ready/error 事件应更新可用性状态', async () => {
    redisMocks.useMemoryFallback();
    const r1 = createIdempotencyReqRes('redis-state-key');
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.res.status).toHaveBeenCalledWith(503));
    redisMocks.useRedisSuccess();
    const r2 = createIdempotencyReqRes('redis-state-key-2');
    idempotencyKey(r2.req, r2.res, r2.next);
    await vi.waitFor(() => expect(r2.next).toHaveBeenCalledTimes(1));
  });
});
