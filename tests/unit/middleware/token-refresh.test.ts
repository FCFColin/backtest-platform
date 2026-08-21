/* eslint-disable @typescript-eslint/no-explicit-any -- test mock */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { decodeJwt, jwtVerify } from 'jose';
import {
  createIdempotencyReqRes,
  mockLongIdempotencyKey,
  SQL_INJECTION_KEY,
  XSS_KEY,
  NEWLINE_INJECTION_KEY,
} from '../../helpers/authFixtures.js';
import { RedisUnavailableError } from '../../../packages/backend/src/utils/errors.js';
import { sha256Hex } from '../../../packages/backend/src/utils/crypto.js';
import {
  mocks,
  redisMocks,
  fsMocks,
  mockUser,
  mockMembershipActive,
  setupRsaKeys,
  resetRsaConfig,
  reloadJwtAuthModule,
} from './jwtAuth.shared.js';
import { getUserById } from '../../../packages/backend/src/repositories/userRepo.js';
import { membershipMocks } from './jwtAuth.shared.js';
import {
  generateRefreshToken,
  refreshAccessToken,
  revokeRefreshToken,
  revokeAllUserSessions,
} from '../../../packages/backend/src/middleware/jwtAuth.js';
import {
  isUserSessionValid,
  isAccessTokenRevokedForUser,
} from '../../../packages/backend/src/middleware/tokenStore.js';
import { idempotencyKey } from '../../../packages/backend/src/middleware/idempotency.js';
redisMocks.useRedisSuccess();
beforeEach(() => (vi.clearAllMocks(), redisMocks.useRedisSuccess(), mockMembershipActive()));
async function expiredTokenByFakeTimers(s: number) {
  vi.useFakeTimers();
  const t = await generateRefreshToken('expired-user', 'admin');
  vi.advanceTimersByTime(s * 1000);
  return t;
}
async function expireStoredToken(u: string) {
  const t = await generateRefreshToken(u, 'admin');
  const k = `refresh_token:${sha256Hex(t)}`;
  const e = JSON.parse(redisMocks.store.get(k)!);
  e.expiresAt = Math.floor(Date.now() / 1000) - 10;
  redisMocks.store.set(k, JSON.stringify(e));
  return t;
}
const o1 = { tenantId: 'org-1', orgRole: 'owner', platformAdmin: true } as const;
const o42 = { tenantId: 'org-42', orgRole: 'owner', platformAdmin: true } as const;
const oRem = { tenantId: 'org-removed', orgRole: 'admin' } as const;
const oDem = { tenantId: 'org-demote', orgRole: 'admin' } as const;
const expTenant = {
  sub: 'tenant-refresh',
  role: 'admin',
  tenant_id: 'org-42',
  org_role: 'owner',
  platform_admin: true,
};
const failSet = async () => (
  redisMocks.set.mockRejectedValueOnce(new Error('Redis write failed')),
  generateRefreshToken('user-fallback', 'admin')
);
const failGetRefresh = async () => {
  const t = await generateRefreshToken('redis-refresh-fallback', 'admin');
  redisMocks.get.mockRejectedValueOnce(new Error('Redis read failed'));
  return refreshAccessToken(t);
};
const failGetRevoke = async () => {
  const t = await generateRefreshToken('user-revoke-err', 'admin');
  redisMocks.get.mockRejectedValueOnce(new Error('redis read failed'));
  return revokeRefreshToken(t);
};
const failSmembers = async () => (
  await generateRefreshToken('revoke-fallback-user', 'admin'),
  redisMocks.smembers.mockRejectedValueOnce(new Error('smembers failed')),
  revokeAllUserSessions('revoke-fallback-user')
);
const failIsRevoked = async () => (
  await revokeAllUserSessions('redis-fallback-check-user'),
  redisMocks.get.mockRejectedValueOnce(new Error('get failed')),
  isAccessTokenRevokedForUser('redis-fallback-check-user', 1)
);
const throwEacces = () => {
  throw new Error('EACCES: permission denied');
};
const throwEnoent = () => {
  throw new Error('ENOENT');
};
const checkRedis = (t: string) =>
  expect(redisMocks.store.has(`refresh_token:${sha256Hex(t)}`)).toBe(false);
describe('Refresh Token 生命周期与 Redis', () => {
  beforeEach(() => mockUser());
  it('生成：64 位 hex、写入 Redis（TTL + family + 集合）', async () => {
    const t = await generateRefreshToken('user-1', 'admin');
    expect(t).toMatch(/^[0-9a-f]{64}$/);
    expect(t).not.toBe(await generateRefreshToken('user-1', 'admin'));
    for (const r of ['admin', 'analyst', 'readonly'] as const)
      expect(await generateRefreshToken('user-role', r)).toBeTruthy();
    expect(await generateRefreshToken('user-1', 'admin', 'existing-family-id')).toBeTruthy();
    expect(await generateRefreshToken('tenant-user', 'admin', void 0, o1 as any)).toBeTruthy();
    const c = vi
      .mocked(redisMocks.set)
      .mock.calls.find(([k]) => String(k).startsWith('refresh_token:'));
    expect(c![2]).toBe('EX');
    expect(c![3]).toBe(mocks.config.JWT_REFRESH_TTL);
    const f = JSON.parse(
      [...redisMocks.store.entries()].find(([k]) => k.startsWith('token_family:'))![1],
    );
    expect(f).toMatchObject({ lastToken: sha256Hex(t), revoked: false });
    expect(redisMocks.sadd).toHaveBeenCalledWith(
      expect.stringContaining('user_families:user-1'),
      expect.any(String),
    );
  });
  it('轮换：新对+租户透传+旧 token 失效标记、链式刷新、复用撤销、revokeAll', async () => {
    const t = await generateRefreshToken('tenant-refresh', 'analyst', void 0, o42 as any);
    const r = await refreshAccessToken(t);
    expect(r).not.toBeNull();
    expect(r!.accessToken).toBeTruthy();
    expect(r!.refreshToken).not.toBe(t);
    expect(decodeJwt(r!.accessToken)).toMatchObject(expTenant);
    expect(redisMocks.store.has(`refresh_token:${sha256Hex(t)}`)).toBe(false);
    expect(redisMocks.store.has(`refresh_token:used:${sha256Hex(t)}`)).toBe(true);
    let ch = r!.refreshToken;
    for (let i = 0; i < 3; i++) {
      const n = await refreshAccessToken(ch);
      expect(n).not.toBeNull();
      ch = n!.refreshToken;
    }
    expect(await refreshAccessToken(t)).toBeNull();
    const t2 = await generateRefreshToken('revoke-user', 'admin');
    const e = JSON.parse(redisMocks.store.get(`refresh_token:${sha256Hex(t2)}`)!);
    await revokeRefreshToken(t2);
    expect(JSON.parse(redisMocks.store.get(`token_family:${e.familyId}`)!).revoked).toBe(true);
    const t3 = await generateRefreshToken('revoke-used', 'admin');
    await refreshAccessToken(t3);
    await revokeRefreshToken(t3);
    expect(redisMocks.store.has(`refresh_token:used:${sha256Hex(t3)}`)).toBe(false);
    const a1 = await generateRefreshToken('revoke-all-user', 'admin');
    const a2 = await generateRefreshToken('revoke-all-user', 'analyst');
    await revokeAllUserSessions('revoke-all-user');
    expect(await refreshAccessToken(a1)).toBeNull();
    expect(await refreshAccessToken(a2)).toBeNull();
    expect(redisMocks.store.has('user_revoked:revoke-all-user')).toBe(true);
  });
  it.each([
    ['不存在的 token', async () => 'nonexistent-token', undefined],
    [
      'TTL 过期（fake timers）',
      () => expiredTokenByFakeTimers(mocks.config.JWT_REFRESH_TTL + 60),
      undefined,
    ],
    ['Redis entry 已过期', async () => expireStoredToken('redis-expired'), checkRedis],
  ])('%s 应返回 null 并清理', async (_n, build, extra) => {
    const t = await build();
    expect(await refreshAccessToken(t)).toBeNull();
    extra?.(t);
    vi.useRealTimers();
  });
  it('DB 异常应传播 RedisUnavailableError（503）', async () => {
    const t = await generateRefreshToken('db-fail-user', 'admin');
    vi.mocked(getUserById).mockRejectedValueOnce(new Error('database unavailable'));
    await expect(refreshAccessToken(t)).rejects.toThrow(RedisUnavailableError);
  });
  it('成员资格已移除时应拒绝刷新并撤销 family', async () => {
    const t = await generateRefreshToken('removed-member', 'admin', void 0, oRem as any);
    const e = JSON.parse(redisMocks.store.get(`refresh_token:${sha256Hex(t)}`)!);
    mockMembershipActive();
    vi.mocked(membershipMocks.getMembership).mockResolvedValueOnce(null);
    expect(await refreshAccessToken(t)).toBeNull();
    expect(JSON.parse(redisMocks.store.get(`token_family:${e.familyId}`)!).revoked).toBe(true);
  });
  it('成员角色降级应在刷新时即时生效', async () => {
    const t = await generateRefreshToken('demoted-user', 'admin', void 0, oDem as any);
    mockMembershipActive('readonly');
    const r = await refreshAccessToken(t);
    expect(r).not.toBeNull();
    expect(decodeJwt(r!.accessToken)).toMatchObject({ role: 'readonly', org_role: 'readonly' });
  });
  it('Redis 可用性应动态反映 ping 状态', async () => {
    redisMocks.useRedisSuccess();
    expect(await generateRefreshToken('redis-ready-user', 'admin')).toBeTruthy();
    redisMocks.useMemoryFallback();
    await expect(generateRefreshToken('redis-error-user', 'analyst')).rejects.toThrow(
      RedisUnavailableError,
    );
  });
  it.each([
    ['generateRefreshToken set 失败', failSet],
    ['refreshAccessToken get 失败', failGetRefresh],
    ['revokeRefreshToken get 失败', failGetRevoke],
    ['revokeAllUserSessions smembers 失败', failSmembers],
    ['isAccessTokenRevokedForUser get 失败', failIsRevoked],
  ])('%s 应抛出 RedisUnavailableError', async (_n, fn) => {
    await expect(fn()).rejects.toThrow(RedisUnavailableError);
  });
});
describe('isUserSessionValid 与 isAccessTokenRevokedForUser', () => {
  it('系统用户 ID（dev-user）应视为有效且不查 DB', async () => {
    expect(await isUserSessionValid('dev-user')).toBe(true);
    expect(getUserById).not.toHaveBeenCalled();
  });
  it('活跃用户有效；停用/不存在无效；DB 异常传播', async () => {
    mockUser();
    expect(await isUserSessionValid('active-user')).toBe(true);
    mockUser(false, 'readonly');
    expect(await isUserSessionValid('inactive-user')).toBe(false);
    vi.mocked(getUserById).mockResolvedValueOnce(null);
    expect(await isUserSessionValid('nonexistent-user')).toBe(false);
    vi.mocked(getUserById).mockRejectedValueOnce(new Error('DB error'));
    await expect(isUserSessionValid('error-user')).rejects.toThrow('DB error');
  });
  it('撤销检查走 Redis get', async () => {
    expect(await isAccessTokenRevokedForUser('unrevoked-user', 1000)).toBe(false);
    await revokeAllUserSessions('revoked-check-user');
    expect(await isAccessTokenRevokedForUser('revoked-check-user', 1)).toBe(true);
    expect(
      await isAccessTokenRevokedForUser('revoked-check-user', Math.floor(Date.now() / 1000) + 3600),
    ).toBe(false);
    expect(redisMocks.get).toHaveBeenCalled();
  });
});
describe('getOrCache* 密钥加载（jwtSigner）', () => {
  beforeEach(
    () => (
      resetRsaConfig(),
      (mocks.config.NODE_ENV = 'test'),
      (mocks.config.JWT_ALGORITHM = 'RS256')
    ),
  );
  it('生产环境应从环境变量加载密钥', async () => {
    await setupRsaKeys('production');
    const m = await reloadJwtAuthModule();
    expect(await m.getOrCachePrivateKey()).toBeTruthy();
    expect(await m.getOrCachePublicKey()).toBeTruthy();
  });
  it('密钥加载应缓存', async () => {
    mocks.config.NODE_ENV = 'development';
    const m = await reloadJwtAuthModule();
    expect(await m.getOrCachePrivateKey()).toBe(await m.getOrCachePrivateKey());
    expect(await m.getOrCachePublicKey()).toBe(await m.getOrCachePublicKey());
    expect(await m.getOrCacheHS256Key()).toBe(await m.getOrCacheHS256Key());
  });
  it.each([
    [
      'fs 读取错误',
      throwEacces,
      '/etc/secrets/key.pem',
      /无法读取 PEM 文件.*\/etc\/secrets\/key\.pem/,
    ],
    ['PEM 内容非法', () => 'not-a-valid-pem-key', '/secrets/private.pem', null],
    ['文件不存在', throwEnoent, '/missing/private.pem', /无法读取 PEM 文件/],
  ])('readPemFile %s 应抛出错误', async (_n, impl, p, pat) => {
    fsMocks.readFileSync.mockImplementation(impl);
    mocks.config.JWT_PRIVATE_KEY = '';
    mocks.config.JWT_PRIVATE_KEY_FILE = p;
    mocks.config.NODE_ENV = 'production';
    const m = await reloadJwtAuthModule();
    const pr = m.getOrCachePrivateKey();
    if (pat) await expect(pr).rejects.toThrow(pat);
    else await expect(pr).rejects.toThrow();
  });
  it('HS256 密钥应从 JWT_SECRET 派生并完成签发验证', async () => {
    mocks.config.JWT_ALGORITHM = 'HS256';
    const m = await reloadJwtAuthModule();
    const k = await m.getOrCacheHS256Key();
    expect(k).toBeTruthy();
    const { payload } = await jwtVerify(await m.generateToken('hs256-test', 'analyst'), k, {
      algorithms: ['HS256'],
    });
    expect(payload.sub).toBe('hs256-test');
  });
});
describe('idempotencyKey 中间件', () => {
  async function passOnce(r: ReturnType<typeof createIdempotencyReqRes>, b: unknown, c = 200) {
    idempotencyKey(r.req, r.res, r.next);
    await vi.waitFor(() => expect(r.next).toHaveBeenCalledTimes(1));
    r.res.statusCode = c;
    r.res.json(b);
  }
  it.each([
    ['Redis 正常', false],
    ['Redis 不可用', true],
  ])('%s 时非 POST/无 Key 请求应直接放行', (_n, down) => {
    if (down) redisMocks.useMemoryFallback();
    for (const m of ['GET', 'POST']) {
      const { req, res, next } = createIdempotencyReqRes(void 0, m, '/api/test', true);
      idempotencyKey(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    }
  });
  it('超长 Key（>128 字符）应返回 400', () => {
    const { req, res, next } = createIdempotencyReqRes(mockLongIdempotencyKey());
    idempotencyKey(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it.each([
    ['首次放行+重复返回缓存', 'dup-key-basic', false],
    ['Redis 写入+二次读取', 'redis-dup-key', true],
    ['SQL 注入 Key', SQL_INJECTION_KEY, false],
    ['XSS 载荷 Key', XSS_KEY, false],
    ['换行符注入 Key', NEWLINE_INJECTION_KEY, false],
  ])('%s', async (_n, k, a) => {
    const c = { success: true, data: 'cached' };
    const r1 = createIdempotencyReqRes(k);
    await passOnce(r1, c);
    if (a)
      await vi.waitFor(() => expect(redisMocks.store.has(`idempotency:127.0.0.1:${k}`)).toBe(true));
    const r2 = createIdempotencyReqRes(k);
    idempotencyKey(r2.req, r2.res, r2.next);
    await vi.waitFor(() => expect(r2.res.status).toHaveBeenCalledWith(200));
    expect(r2.res.json).toHaveBeenCalledWith(c);
    if (a) expect(redisMocks.get).toHaveBeenCalledWith(`idempotency:127.0.0.1:${k}`);
  });
  it('5xx 响应不应被缓存', async () => {
    const k = 'server-error-key';
    const r1 = createIdempotencyReqRes(k);
    await passOnce(r1, { success: false }, 503);
    expect(redisMocks.store.has(`idempotency:${k}`)).toBe(false);
    const r2 = createIdempotencyReqRes(k);
    idempotencyKey(r2.req, r2.res, r2.next);
    await vi.waitFor(() => expect(r2.next).toHaveBeenCalledTimes(1));
  });
  it('并发相同 Key：仅一个执行 handler', async () => {
    const k = 'race-condition-key-12345';
    const c = { success: true, data: 'first-response' };
    const r1 = createIdempotencyReqRes(k);
    await passOnce(r1, c);
    const cs = Array.from({ length: 4 }, () => createIdempotencyReqRes(k));
    await Promise.all(
      cs.map(
        ({ req, res, next }) =>
          new Promise<void>((ok) => {
            idempotencyKey(req, res, next);
            vi.waitFor(() => expect(res.status).toHaveBeenCalledWith(200)).then(ok);
          }),
      ),
    );
    for (const { res, next } of cs) {
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(c);
    }
  });
  it('幂等结果写入失败应记录 warn 且不阻塞响应', async () => {
    redisMocks.set.mockResolvedValueOnce('OK');
    redisMocks.set.mockRejectedValueOnce(new Error('redis set failed'));
    const { req, res, next } = createIdempotencyReqRes('redis-write-fail');
    idempotencyKey(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    res.statusCode = 200;
    expect(() => res.json({ success: true })).not.toThrow();
  });
  it.each([
    ['Redis ping 失败', () => redisMocks.useMemoryFallback()],
    [
      'Redis 占位读取抛错',
      () => (
        redisMocks.ping.mockResolvedValue('PONG'),
        redisMocks.set.mockResolvedValueOnce(null),
        redisMocks.get.mockRejectedValueOnce(new Error('redis read failed'))
      ),
    ],
  ])('%s 时应 fail-closed 返回 503', async (_n, a) => {
    a();
    const { req, res, next } = createIdempotencyReqRes('redis-down-key');
    idempotencyKey(req, res, next);
    await vi.waitFor(() => expect(res.status).toHaveBeenCalledWith(503));
    expect(next).not.toHaveBeenCalled();
  });
  it('Redis ready/error 事件应更新可用性', async () => {
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
