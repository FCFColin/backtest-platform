import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignJWT, importJWK, generateKeyPair, exportPKCS8, exportSPKI } from 'jose';
import type { Request, Response } from 'express';
import { createLoggerMocks, createRedisModuleMock, createJwtAuthConfigMocks, type JwtAuthConfigMocks } from '../../helpers/mockFactories.js';
import { createJwtAuthUserRepoMock, setupJwtAuthTestMocks, base64urlEncode, signTestToken } from '../../helpers/authFixtures.js';
import { RedisUnavailableError } from '../../../packages/backend/src/utils/errors.js';
import type { JwtPayload } from '../../../packages/backend/src/middleware/authTypes.js';

const mocks = vi.hoisted(() => ({ config: {} as JwtAuthConfigMocks }));
const redisMocks = vi.hoisted(() => ({}) as Record<string, unknown>);
const fsMocks = vi.hoisted(() => ({ readFileSync: vi.fn() }));
const apiKeyMocks = vi.hoisted(() => ({ verifyApiKey: vi.fn(async () => null) }));

vi.mock('../../../packages/backend/src/config/index.js', () => ({ config: Object.assign(mocks.config, createJwtAuthConfigMocks()), validateConfig: vi.fn() }));
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));
vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => createRedisModuleMock({ withStore: true, withSets: true, withHandlers: true, withMemoryHelpers: true }, redisMocks));
vi.mock('../../../packages/backend/src/repositories/userRepo.js', () => ({ getUserById: createJwtAuthUserRepoMock() }));
vi.mock('../../../packages/backend/src/infrastructure/apiKeyVerifier.js', () => ({ verifyApiKey: apiKeyMocks.verifyApiKey }));
vi.mock('fs', () => ({ default: { readFileSync: fsMocks.readFileSync }, readFileSync: fsMocks.readFileSync }));
redisMocks.useRedisSuccess();

import { generateToken, verifyToken, generateRefreshToken, refreshAccessToken, revokeRefreshToken, revokeAllUserSessions, jwtAuth, optionalJwtAuth, assignGuestReadonly } from '../../../packages/backend/src/middleware/jwtAuth.js';
import { getUserById } from '../../../packages/backend/src/repositories/userRepo.js';
import { createJwtAuthMockRequest, createJwtAuthMockResponse, createJwtAuthMockNext, awaitMiddleware } from '../../helpers/expressMocks.js';

function mockReqRes(reqInit: Record<string, unknown> = {}) {
  return { req: createJwtAuthMockRequest(reqInit), res: createJwtAuthMockResponse(), next: createJwtAuthMockNext() };
}
async function runJwtAuth(headers: Record<string, unknown>) {
  const { req, res, next } = mockReqRes({ headers });
  await new Promise<void>((resolve) => {
    const originalJson = res.json.bind(res);
    res.json = vi.fn((...args: unknown[]) => { originalJson(...args); resolve(); return res; }) as typeof res.json;
    jwtAuth(req, res, next);
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
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: expect.objectContaining({ code }) }));
}
async function signHS256(payload: Record<string, unknown>): Promise<string> {
  const key = await importJWK({ kty: 'oct', k: base64urlEncode(mocks.config.JWT_SECRET) }, 'HS256');
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(key);
}
function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> { return { sub: 'user-1', role: 'admin', ...overrides }; }
function mockActiveUser() {
  vi.mocked(getUserById).mockImplementation(async (id: string) => ({ id, username: 'test-user', role: 'admin' as const, createdAt: new Date(), isActive: true }));
}
function mockDisabledUser(id = 'disabled-user') {
  vi.mocked(getUserById).mockResolvedValue({ id, username: 'disabled', role: 'readonly', createdAt: new Date(), isActive: false });
}
function setupAuthEnv() { setupJwtAuthTestMocks(mocks, redisMocks); }
function setupProdEnv(activeUser = true) {
  mocks.config.NODE_ENV = 'production';
  mocks.config.JWT_SECRET = 'test-jwt-secret-for-unit-tests';
  mocks.config.JWT_ALGORITHM = 'HS256';
  if (activeUser) mockActiveUser();
}
function b64url(obj: unknown): string { return Buffer.from(JSON.stringify(obj)).toString('base64url'); }
const HACKER = { sub: 'hacker', role: 'admin', iat: 0, exp: 9999999999 };

describe('JWT Token 生成与验证', () => {
  const roles = ['admin', 'analyst', 'readonly'] as const;
  it.each(roles)('应为 %s 角色生成有效 token', async (role) => { const token = await generateToken('user-1', role); expect(token).toBeTruthy(); expect(token.split('.').length).toBe(3); });
  it.each(roles)('验证 %s 角色 token 应返回正确 payload', async (role) => { const payload = await verifyToken(await generateToken('user-1', role)); expect(payload).not.toBeNull(); expect(payload!.sub).toBe('user-1'); expect(payload!.role).toBe(role); });
  it.each([
    ['篡改 token 尾部', async () => (await generateToken('user-1', 'admin')).slice(0, -5) + 'XXXXX'],
    ['alg=none 攻击', async () => `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(HACKER)}.`],
    ['签名不匹配（payload 篡改）', async () => { const parts = (await generateToken('user-1', 'admin')).split('.'); return `${parts[0]}.${b64url(HACKER)}.${parts[2]}`; }],
    ['空 token', async () => ''],
    ['非 JWT 格式', async () => 'not-a-jwt'],
  ])('%s 应验证失败', async (_n, factory) => { expect(await verifyToken(await factory())).toBeNull(); });
});

describe('Refresh Token 生命周期与 Redis', () => {
  beforeEach(() => { vi.clearAllMocks(); redisMocks.useRedisSuccess(); });
  it('生成 refresh token 后应可刷新', async () => { const r = await refreshAccessToken(await generateRefreshToken('user-1', 'admin')); expect(r).not.toBeNull(); expect(r!.accessToken).toBeTruthy(); expect(r!.refreshToken).toBeTruthy(); });
  it('刷新后旧 token 应失效（轮换机制）', async () => { const t = await generateRefreshToken('user-1', 'admin'); expect(await refreshAccessToken(t)).not.toBeNull(); expect(await refreshAccessToken(t)).toBeNull(); });
  it('新 refresh token 应可继续刷新', async () => { const r1 = await refreshAccessToken(await generateRefreshToken('user-1', 'analyst')); expect(r1).not.toBeNull(); expect(await refreshAccessToken(r1!.refreshToken)).not.toBeNull(); });
  it('吊销后 refresh token 应失效', async () => { const t = await generateRefreshToken('user-1', 'admin'); await revokeRefreshToken(t); expect(await refreshAccessToken(t)).toBeNull(); });
  it('不存在的 refresh token 应返回 null', async () => { expect(await refreshAccessToken('nonexistent-token')).toBeNull(); });
  it('刷新返回的 access token 应可验证', async () => { const r = await refreshAccessToken(await generateRefreshToken('user-1', 'analyst')); const p = await verifyToken(r!.accessToken); expect(p!.sub).toBe('user-1'); expect(p!.role).toBe('analyst'); });
  it('Token Family 复用检测：旧 token 被复用时应撤销整个家族', async () => { const t = await generateRefreshToken('user-1', 'admin'); const r1 = await refreshAccessToken(t); expect(r1).not.toBeNull(); expect(await refreshAccessToken(t)).toBeNull(); expect(await refreshAccessToken(r1!.refreshToken)).toBeNull(); });
  it('generateRefreshToken 应写入 Redis 并返回 token', async () => { const t = await generateRefreshToken('user-redis', 'admin'); expect(t).toBeTruthy(); expect(redisMocks.set).toHaveBeenCalled(); expect(redisMocks.store.has(`refresh_token:${t}`)).toBe(true); });
  it('refreshAccessToken 应通过 Redis 轮换 token', async () => { const t = await generateRefreshToken('user-redis', 'analyst'); const r = await refreshAccessToken(t); expect(r!.refreshToken).not.toBe(t); expect(redisMocks.store.has(`refresh_token:${t}`)).toBe(false); expect(redisMocks.store.has(`refresh_token:used:${t}`)).toBe(true); });
  it('revokeRefreshToken 应撤销 Redis 中的 family', async () => {
    const t = await generateRefreshToken('user-redis', 'readonly');
    const entry = JSON.parse(redisMocks.store.get(`refresh_token:${t}`)!);
    await revokeRefreshToken(t);
    const familyRaw = redisMocks.store.get(`token_family:${entry.familyId}`);
    expect(JSON.parse(familyRaw!).revoked).toBe(true);
    expect(redisMocks.store.has(`refresh_token:${t}`)).toBe(false);
  });
  it('revokeAllUserSessions 应撤销 Redis 中用户的全部 family', async () => {
    const t = await generateRefreshToken('user-redis', 'admin');
    const entry = JSON.parse(redisMocks.store.get(`refresh_token:${t}`)!);
    await revokeAllUserSessions('user-redis');
    const familyRaw = redisMocks.store.get(`token_family:${entry.familyId}`);
    expect(JSON.parse(familyRaw!).revoked).toBe(true);
    expect(redisMocks.store.has(`refresh_token:${t}`)).toBe(false);
    expect(redisMocks.store.has(`user_revoked:user-redis`)).toBe(true);
  });
  it('Redis set 失败时应抛出 RedisUnavailableError（ADR-045）', async () => { redisMocks.set.mockRejectedValueOnce(new Error('Redis write failed')); await expect(generateRefreshToken('user-fallback', 'admin')).rejects.toThrow(RedisUnavailableError); });
});
describe('jwtAuth 中间件 — 有效与无效认证', () => {
  beforeEach(() => setupAuthEnv());
  it('Bearer Token 认证成功应调用 next', async () => {
    const token = await generateToken('user-1', 'admin');
    const { req, res, next } = mockReqRes({ headers: { authorization: `Bearer ${token}` } });
    await awaitMiddleware(jwtAuth, req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user!.sub).toBe('user-1');
  });
  it('无效 Bearer Token 应返回 401', async () => { const { res, next } = await runJwtAuth({ authorization: 'Bearer invalid-token' }); expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(401); });
  it.each([
    ['无效 x-api-key', 'wrong-key'],
    ['超长 x-api-key（防缓冲区攻击）', 'a'.repeat(129)],
  ])('%s 应返回 401', async (_n, key) => {
    apiKeyMocks.verifyApiKey.mockResolvedValueOnce(null);
    const { req, res, next } = mockReqRes({ headers: { 'x-api-key': key } });
    jwtAuth(req, res, next);
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
  it('无认证凭证应返回 401', () => { const { req, res, next } = mockReqRes(); jwtAuth(req, res, next); expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(401); });
  it.each([
    ['Bearer 后无 token', 'Bearer '],
    ['Bearer 仅空白', 'Bearer    '],
    ['Basic 认证头（缺少凭证）', 'Basic dXNlcjpwYXNz'],
    ['无空格的 Bearer 前缀', 'Bearertoken-without-space'],
  ])('%s 应返回 401', async (_n, authHeader) => { await expectJwtAuth401(authHeader); });
  it('并发 jwtAuth 调用应各自独立验证', async () => {
    const token = await generateToken('concurrent-user', 'analyst');
    const results = await Promise.all(Array.from({ length: 5 }, async () => {
      const { req, res, next } = mockReqRes({ headers: { authorization: `Bearer ${token}` } });
      await awaitMiddleware(jwtAuth, req, res, next);
      return { req, next };
    }));
    for (const { req, next } of results) { expect(next).toHaveBeenCalled(); expect(req.user?.sub).toBe('concurrent-user'); }
  });
});

describe('optionalJwtAuth 中间件', () => {
  beforeEach(() => { vi.clearAllMocks(); redisMocks.useRedisSuccess(); mocks.config.NODE_ENV = 'production'; mocks.config.JWT_ALGORITHM = 'HS256'; mockActiveUser(); });
  it('有效 Bearer Token 应设置 req.user 并放行', async () => {
    const token = await generateToken('user-1', 'analyst');
    const { req, res, next } = mockReqRes({ headers: { authorization: `Bearer ${token}` } });
    await awaitMiddleware(optionalJwtAuth, req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user?.sub).toBe('user-1');
  });
  it('应注入脱敏日志上下文', async () => {
    const token = await generateToken('user-1', 'readonly');
    const childFn = vi.fn(() => ({ info: vi.fn(), warn: vi.fn() }));
    const { req, res, next } = mockReqRes({ headers: { authorization: `Bearer ${token}` }, log: { child: childFn } });
    await awaitMiddleware(optionalJwtAuth, req, res, next);
    expect(childFn).toHaveBeenCalled();
  });
  it.each([
    ['无效 Bearer Token', 'Bearer invalid'],
    ['非 JWT 格式', 'Bearer not.valid.jwt'],
  ])('%s 应置空 req.user 并放行', async (_n, auth) => {
    const { req, res, next } = mockReqRes({ headers: { authorization: auth } });
    await awaitMiddleware(optionalJwtAuth, req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeNull();
  });
  it('无 Bearer Token 应匿名放行', () => { const { req, res, next } = mockReqRes(); optionalJwtAuth(req, res, next); expect(next).toHaveBeenCalled(); expect(req.user).toBeNull(); });
});

describe('安全攻击用例', () => {
  beforeEach(() => setupAuthEnv());
  it('过期的 token（exp 设为 1 小时前）应被拒绝（401）', async () => {
    const key = await importJWK({ kty: 'oct', k: base64urlEncode(mocks.config.JWT_SECRET) }, 'HS256');
    const expiredToken = await new SignJWT({ sub: 'user-1', role: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt(Math.floor(Date.now() / 1000) - 7200).setExpirationTime(Math.floor(Date.now() / 1000) - 3600).sign(key);
    expect(await verifyToken(expiredToken)).toBeNull();
    await expectJwtAuth401(`Bearer ${expiredToken}`);
  });
  it.each([
    ['缺少 sub 声明（身份不可识别）', { role: 'admin' }],
    ['空字符串 sub', { sub: '', role: 'admin' }],
    ['缺少 role 声明（RBAC 不可判定）', { sub: 'user-1' }],
    ['伪造的非法 role（越权防护）', { sub: 'user-1', role: 'superadmin' }],
  ])('%s 应被拒绝', async (_n, payload) => { expect(await verifyToken(await signTestToken(payload))).toBeNull(); });
  it('缺少 exp 声明的 token 应被拒绝（永不过期 = 安全风险）', async () => { expect(await verifyToken(await signTestToken({ sub: 'user-1', role: 'admin' }, { omitExp: true }))).toBeNull(); });
  it('算法混淆攻击：RS256 签名的 token 不应通过 HS256 验证', async () => {
    const { privateKey } = await generateKeyPair('RS256', { modulusLength: 2048 });
    const rs256Token = await new SignJWT({ sub: 'attacker', role: 'admin' }).setProtectedHeader({ alg: 'RS256' }).setIssuedAt().setExpirationTime('1h').sign(privateKey);
    expect(await verifyToken(rs256Token)).toBeNull();
  });
  it('JWT 炸弹：1MB payload 应在合理时间内完成验证且不崩溃', async () => {
    const start = Date.now();
    const payload = await verifyToken(await signTestToken({ sub: 'user-1', role: 'admin', data: 'A'.repeat(1024 * 1024) }));
    expect(payload!.sub).toBe('user-1');
    expect(Date.now() - start).toBeLessThan(2000);
  });
  it('Null 字节注入：sub 中的 \0 应原样保留，不被截断或注入', async () => {
    const payload = await verifyToken(await signTestToken({ sub: 'user\0admin', role: 'admin' }));
    expect(payload!.sub).toBe('user\0admin');
    expect(payload!.sub.length).toBe('user\0admin'.length);
  });
});
describe('jwtAuth 中间件 — API Key 与 DEV 模式', () => {
  beforeEach(() => { setupAuthEnv(); apiKeyMocks.verifyApiKey.mockReset(); apiKeyMocks.verifyApiKey.mockImplementation(async () => null); });
  it('按组织 DB API Key 认证成功应注入 analyst 角色与 tenant_id（ADR-033）', async () => {
    apiKeyMocks.verifyApiKey.mockResolvedValueOnce({ orgId: '11111111-1111-1111-1111-111111111111', keyId: '22222222-2222-2222-2222-222222222222' } as Record<string, unknown>);
    const { req, res, next } = mockReqRes({ headers: { 'x-api-key': 'bpk_live_someplaintextkey' } });
    await awaitMiddleware(jwtAuth, req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({ role: 'analyst', tenant_id: '11111111-1111-1111-1111-111111111111', org_role: 'analyst', sub: 'apikey:22222222-2222-2222-2222-222222222222' });
  });
  it('平台 break-glass 密钥应注入 platform_admin（P0-04）', async () => {
    apiKeyMocks.verifyApiKey.mockResolvedValueOnce({ orgId: null, keyId: '22222222-2222-2222-2222-222222222222', isPlatformAdmin: true });
    const { req, res, next } = mockReqRes({ headers: { 'x-api-key': 'bpk_live_breakglass' } });
    await awaitMiddleware(jwtAuth, req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({ role: 'admin', platform_admin: true });
  });
  it.each([
    ['DEV_SKIP_AUTH=true 注入 readonly 用户（T-32）', true, true],
    ['DEV_SKIP_AUTH=false 开发环境不跳过认证', false, false],
  ])('%s', async (_n, skip, shouldCallNext) => {
    mocks.config.NODE_ENV = 'development';
    mocks.config.DEV_SKIP_AUTH = skip;
    mocks.config.JWT_SECRET = 'dev-only-jwt-secret-change-in-production';
    const { req, res, next } = mockReqRes();
    jwtAuth(req, res, next);
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    if (shouldCallNext) { expect(next).toHaveBeenCalled(); expect(req.user).toMatchObject({ role: 'readonly', sub: 'dev-user' }); }
    else { expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(401); }
  });
  it('Bearer Token 优先于 x-api-key', async () => {
    const token = await generateToken('user-1', 'readonly');
    const { req, res, next } = mockReqRes({ headers: { authorization: `Bearer ${token}`, 'x-api-key': 'test-api-key-12345' } });
    await awaitMiddleware(jwtAuth, req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({ role: 'readonly', sub: 'user-1' });
  });
});

describe('会话撤销与账户停用', () => {
  beforeEach(() => { vi.clearAllMocks(); mockActiveUser(); });
  it.each([
    ['撤销后 refresh 应失败', async () => { redisMocks.useRedisSuccess(); const t = await generateRefreshToken('user-revoke', 'admin'); await revokeAllUserSessions('user-revoke'); expect(await refreshAccessToken(t)).toBeNull(); }],
    ['撤销后 access token 应验证失败', async () => { redisMocks.useRedisSuccess(); const t = await generateToken('user-revoke', 'admin'); await revokeAllUserSessions('user-revoke'); expect(await verifyToken(t)).toBeNull(); }],
    ['Redis 模式应撤销用户全部 family', async () => { redisMocks.useRedisSuccess(); const t = await generateRefreshToken('user-redis-revoke', 'analyst'); await revokeAllUserSessions('user-redis-revoke'); expect(await refreshAccessToken(t)).toBeNull(); expect(redisMocks.store.has(`user_revoked:user-redis-revoke`)).toBe(true); }],
  ])('%s', async (_n, fn) => { await fn(); });
  it('已停用用户 jwtAuth 应返回 401', async () => {
    redisMocks.useRedisSuccess(); mocks.config.NODE_ENV = 'production'; mockDisabledUser('disabled-user');
    const token = await generateToken('disabled-user', 'readonly');
    const { res, next } = await runJwtAuth({ authorization: `Bearer ${token}` });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.header).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
  });
  it('已停用用户 refresh 应被拒绝', async () => { redisMocks.useRedisSuccess(); mockDisabledUser('disabled-user'); const t = await generateRefreshToken('disabled-user', 'readonly'); expect(await refreshAccessToken(t)).toBeNull(); });
  it('Redis 过期 refresh token 应返回 null', async () => {
    redisMocks.useRedisSuccess();
    const t = await generateRefreshToken('expired-user', 'admin');
    const key = `refresh_token:${t}`;
    const entry = JSON.parse(redisMocks.store.get(key)!);
    entry.expiresAt = Math.floor(Date.now() / 1000) - 10;
    redisMocks.store.set(key, JSON.stringify(entry));
    expect(await refreshAccessToken(t)).toBeNull();
    expect(redisMocks.store.has(key)).toBe(false);
  });
  it('getUserById 异常时应拒绝 refresh', async () => {
    redisMocks.useRedisSuccess();
    const t = await generateRefreshToken('user-db-fail', 'admin');
    vi.mocked(getUserById).mockRejectedValueOnce(new Error('database unavailable'));
    expect(await refreshAccessToken(t)).toBeNull();
  });
  it('Redis 撤销异常应抛出 RedisUnavailableError（ADR-045）', async () => {
    redisMocks.useRedisSuccess();
    const t = await generateRefreshToken('user-revoke-err', 'admin');
    redisMocks.get.mockRejectedValueOnce(new Error('redis read failed'));
    await expect(revokeRefreshToken(t)).rejects.toThrow(RedisUnavailableError);
  });
  it('全局会话撤销后 jwtAuth 应拒绝访问（INVALID_TOKEN）', async () => { setupAuthEnv(); const t = await generateToken('user-revoked-jwt', 'admin'); await revokeAllUserSessions('user-revoked-jwt'); await expectJwtAuth401WithCode(`Bearer ${t}`, 'INVALID_TOKEN'); });
  it('已停用用户 jwtAuth 应返回 ACCOUNT_DISABLED', async () => { setupAuthEnv(); mockDisabledUser('disabled-jwt-user'); const t = await generateToken('disabled-jwt-user', 'readonly'); await expectJwtAuth401WithCode(`Bearer ${t}`, 'ACCOUNT_DISABLED'); });
});
describe('jwtAuth Redis 边界与 PEM 路径', () => {
  beforeEach(() => { vi.clearAllMocks(); setupProdEnv(); });
  it('Redis 可用性应通过 getRedisHealth 动态反映 ping 状态', async () => {
    redisMocks.useRedisSuccess();
    expect(await generateRefreshToken('redis-ready-user', 'admin')).toBeTruthy();
    redisMocks.useMemoryFallback();
    await expect(generateRefreshToken('redis-error-user', 'analyst')).rejects.toThrow(RedisUnavailableError);
  });
  it('Redis refresh 读取异常应抛出 RedisUnavailableError（ADR-045）', async () => {
    redisMocks.useRedisSuccess();
    const t = await generateRefreshToken('redis-refresh-fallback', 'admin');
    redisMocks.get.mockRejectedValueOnce(new Error('Redis read failed during refresh'));
    await expect(refreshAccessToken(t)).rejects.toThrow(RedisUnavailableError);
  });
  it('refresh token 过期后应返回 null', async () => {
    vi.useFakeTimers();
    redisMocks.useRedisSuccess();
    const t = await generateRefreshToken('expired-memory-user', 'admin');
    vi.advanceTimersByTime((mocks.config.JWT_REFRESH_TTL + 60) * 1000);
    expect(await refreshAccessToken(t)).toBeNull();
    vi.useRealTimers();
  });
  it('Bearer 认证成功应注入脱敏日志上下文', async () => {
    redisMocks.useRedisSuccess();
    const token = await generateToken('log-context-user', 'admin');
    const childFn = vi.fn(() => ({ info: vi.fn(), warn: vi.fn() }));
    const { req, res, next } = mockReqRes({ headers: { authorization: `Bearer ${token}` }, log: { child: childFn } });
    await awaitMiddleware(jwtAuth, req, res, next);
    expect(next).toHaveBeenCalled();
    expect(childFn).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin' }));
  });
  it('family 被撤销后 refresh 应拒绝', async () => {
    redisMocks.useRedisSuccess();
    const t = await generateRefreshToken('family-revoked-user', 'admin');
    const first = await refreshAccessToken(t);
    expect(first).not.toBeNull();
    await refreshAccessToken(t);
    expect(await refreshAccessToken(first!.refreshToken)).toBeNull();
  });
  it('Redis 模式下停用用户 refresh 应删除 token 并返回 null', async () => {
    redisMocks.useRedisSuccess();
    const t = await generateRefreshToken('disabled-redis-refresh', 'admin');
    mockDisabledUser('disabled-redis-refresh');
    expect(await refreshAccessToken(t)).toBeNull();
    expect(redisMocks.del).toHaveBeenCalled();
  });
  it('revokeRefreshToken 应撤销 Redis 中已使用的 token 家族', async () => {
    redisMocks.useRedisSuccess();
    const t = await generateRefreshToken('revoke-used-user', 'admin');
    await refreshAccessToken(t);
    await revokeRefreshToken(t);
    const usedKey = `refresh_token:used:${t}`;
    const familyRaw = [...redisMocks.store.entries()].find(([k]) => k.startsWith('token_family:'));
    expect(redisMocks.store.has(usedKey)).toBe(false);
    if (familyRaw) { expect(JSON.parse(familyRaw[1]).revoked).toBe(true); }
  });
  it('revokeAllUserSessions Redis 异常应抛出 RedisUnavailableError（ADR-045）', async () => {
    redisMocks.useRedisSuccess();
    await generateRefreshToken('revoke-fallback-user', 'admin');
    redisMocks.smembers.mockRejectedValueOnce(new Error('smembers failed'));
    await expect(revokeAllUserSessions('revoke-fallback-user')).rejects.toThrow(RedisUnavailableError);
  });
});

describe('assignGuestReadonly 中间件', () => {
  beforeEach(() => { vi.clearAllMocks(); redisMocks.useRedisSuccess(); mocks.config.NODE_ENV = 'production'; mocks.config.JWT_ALGORITHM = 'HS256'; });
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
    const existingUser: JwtPayload = { sub: 'real-user', role: 'admin', iat: 123, exp: 456 };
    const { req, res, next } = mockReqRes({ user: existingUser });
    assignGuestReadonly(req, res, next);
    expect(req.user).toBe(existingUser);
    expect(next).toHaveBeenCalledTimes(1);
  });
  it('无论 req.user 是否存在都应调用 next', () => { const { req, res, next } = mockReqRes(); assignGuestReadonly(req, res, next); expect(next).toHaveBeenCalledTimes(1); });
});

describe('verifyToken 边界（exp 与 RS256）', () => {
  beforeEach(() => { vi.clearAllMocks(); redisMocks.useRedisSuccess(); mocks.config.NODE_ENV = 'production'; mocks.config.JWT_ALGORITHM = 'HS256'; });
  it('exp 为 Infinity 的 token 应被拒绝（JSON 序列化后为 null）', async () => {
    const key = await importJWK({ kty: 'oct', k: base64urlEncode(mocks.config.JWT_SECRET) }, 'HS256');
    const token = await new SignJWT(validPayload({ exp: Infinity })).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().sign(key);
    expect(await verifyToken(token)).toBeNull();
  });
});

describe('verifyToken RS256 算法边界', () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks(); redisMocks.useMemoryFallback();
    mocks.config.NODE_ENV = 'production'; mocks.config.JWT_ALGORITHM = 'RS256';
    mocks.config.JWT_PRIVATE_KEY = ''; mocks.config.JWT_PRIVATE_KEY_FILE = '';
    mocks.config.JWT_PUBLIC_KEY = ''; mocks.config.JWT_PUBLIC_KEY_FILE = '';
  });
  async function setupRS256Config() {
    const { publicKey, privateKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
    mocks.config.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
    mocks.config.JWT_PUBLIC_KEY = await exportSPKI(publicKey);
    return { privateKey, publicKey };
  }
  it('RS256 模式应拒绝 HS256 签发的 token（禁止算法回退）', async () => { await setupRS256Config(); const mod = await import('../../../packages/backend/src/middleware/jwtAuth.js'); expect(await mod.verifyToken(await signHS256(validPayload()))).toBeNull(); });
  it('应拒绝使用不同 RSA 密钥对签发的 token（kid 不匹配）', async () => {
    await setupRS256Config();
    const mod = await import('../../../packages/backend/src/middleware/jwtAuth.js');
    const foreignKeys = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
    const foreignToken = await new SignJWT(validPayload()).setProtectedHeader({ alg: 'RS256', kid: 'foreign-key-id' }).setIssuedAt().setExpirationTime('1h').sign(foreignKeys.privateKey);
    expect(await mod.verifyToken(foreignToken)).toBeNull();
  });
  it('应拒绝缺失签名段的 RS256 token', async () => {
    const { privateKey } = await setupRS256Config();
    const mod = await import('../../../packages/backend/src/middleware/jwtAuth.js');
    const token = await new SignJWT(validPayload()).setProtectedHeader({ alg: 'RS256' }).setIssuedAt().setExpirationTime('1h').sign(privateKey);
    const parts = token.split('.');
    expect(await mod.verifyToken(`${parts[0]}.${parts[1]}.`)).toBeNull();
  });
});
describe('jwtAuth RS256 路径（PEM 加载与签发）', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.config.NODE_ENV = 'development';
    mocks.config.JWT_ALGORITHM = 'RS256';
  });

  it('RS256 模式应签发并验证 access token', async () => {
    const mod = await import('../../../packages/backend/src/middleware/jwtAuth.js');
    redisMocks.useRedisSuccess();
    const token = await mod.generateToken('rs256-user', 'admin');
    const payload = await mod.verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('rs256-user');
    expect(payload!.role).toBe('admin');
  });

  it('RS256 refresh token 生命周期应完整', async () => {
    const mod = await import('../../../packages/backend/src/middleware/jwtAuth.js');
    redisMocks.useRedisSuccess();
    const refresh = await mod.generateRefreshToken('rs256-refresh', 'analyst');
    const rotated = await mod.refreshAccessToken(refresh);
    expect(rotated).not.toBeNull();
    expect(rotated!.accessToken).toBeTruthy();
  });

  it('jwtAuth verify 异常时应返回 INVALID_TOKEN', async () => {
    const mod = await import('../../../packages/backend/src/middleware/jwtAuth.js');
    const req = { method: 'GET', path: '/api/test', headers: { authorization: 'Bearer not-a-valid-jwt' }, ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } } as unknown as Request;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), header: vi.fn().mockReturnThis() } as unknown as Response;
    const next = vi.fn();
    await new Promise<void>((resolve) => {
      const originalJson = res.json.bind(res);
      res.json = vi.fn((...args: unknown[]) => { originalJson(...args); resolve(); return res; }) as typeof res.json;
      mod.jwtAuth(req, res, next);
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('生产环境缺少 RSA 密钥应拒绝签发 token', async () => {
    mocks.config.NODE_ENV = 'production';
    mocks.config.JWT_PRIVATE_KEY = '';
    mocks.config.JWT_PRIVATE_KEY_FILE = '';
    vi.resetModules();
    const mod = await import('../../../packages/backend/src/middleware/jwtAuth.js');
    await expect(mod.generateToken('prod-user', 'admin')).rejects.toThrow(/JWT_PRIVATE_KEY/);
  });

  it('getUserById 失败时 jwtAuth 应拒绝访问', async () => {
    const mod = await import('../../../packages/backend/src/middleware/jwtAuth.js');
    const { getUserById } = await import('../../../packages/backend/src/repositories/userRepo.js');
    redisMocks.useRedisSuccess();
    vi.mocked(getUserById).mockRejectedValueOnce(new Error('db error'));
    const token = await mod.generateToken('user-db-error', 'admin');
    const req = { method: 'GET', path: '/secure', headers: { authorization: `Bearer ${token}` }, ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } } as unknown as Request;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), header: vi.fn().mockReturnThis() } as unknown as Response;
    const next = vi.fn();
    await new Promise<void>((resolve) => {
      res.json = vi.fn(() => { resolve(); return res; }) as typeof res.json;
      mod.jwtAuth(req, res, next);
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('RS256 环境变量内联 PEM 应能签发并验证', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
    mocks.config.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
    mocks.config.JWT_PUBLIC_KEY = await exportSPKI(publicKey);
    mocks.config.NODE_ENV = 'production';
    vi.resetModules();
    const mod = await import('../../../packages/backend/src/middleware/jwtAuth.js');
    const token = await mod.generateToken('inline-pem-user', 'analyst');
    const payload = await mod.verifyToken(token);
    expect(payload?.sub).toBe('inline-pem-user');
    expect(payload?.role).toBe('analyst');
  });

  it('RS256 PEM 文件路径应能读取并签发', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
    const privatePem = await exportPKCS8(privateKey);
    const publicPem = await exportSPKI(publicKey);
    fsMocks.readFileSync.mockImplementation((filePath: string) => {
      if (String(filePath).includes('private')) return privatePem;
      if (String(filePath).includes('public')) return publicPem;
      throw new Error('ENOENT');
    });
    mocks.config.JWT_PRIVATE_KEY = '';
    mocks.config.JWT_PUBLIC_KEY = '';
    mocks.config.JWT_PRIVATE_KEY_FILE = '/secrets/private.pem';
    mocks.config.JWT_PUBLIC_KEY_FILE = '/secrets/public.pem';
    mocks.config.NODE_ENV = 'production';
    vi.resetModules();
    const mod = await import('../../../packages/backend/src/middleware/jwtAuth.js');
    const token = await mod.generateToken('file-pem-user', 'readonly');
    expect(token.split('.')).toHaveLength(3);
    expect(fsMocks.readFileSync).toHaveBeenCalled();
  });

  it('readPemFile 读取失败应抛出明确错误', async () => {
    fsMocks.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
    mocks.config.JWT_PRIVATE_KEY = '';
    mocks.config.JWT_PRIVATE_KEY_FILE = '/missing/private.pem';
    mocks.config.JWT_PUBLIC_KEY = '';
    mocks.config.JWT_PUBLIC_KEY_FILE = '';
    mocks.config.NODE_ENV = 'production';
    vi.resetModules();
    const mod = await import('../../../packages/backend/src/middleware/jwtAuth.js');
    await expect(mod.generateToken('missing-pem', 'admin')).rejects.toThrow(/无法读取 PEM 文件/);
  });

  it('生产环境缺少 RSA 公钥应拒绝验证 RS256 token', async () => {
    mocks.config.NODE_ENV = 'production';
    mocks.config.JWT_PRIVATE_KEY = '';
    mocks.config.JWT_PRIVATE_KEY_FILE = '';
    mocks.config.JWT_PUBLIC_KEY = '';
    mocks.config.JWT_PUBLIC_KEY_FILE = '';
    vi.resetModules();
    const mod = await import('../../../packages/backend/src/middleware/jwtAuth.js');
    await expect(mod.generateToken('prod-user', 'admin')).rejects.toThrow(/JWT_PRIVATE_KEY/);
  });
});