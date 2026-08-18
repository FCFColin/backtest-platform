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
// userRepo 的 vi.mock 在 jwtAuth.shared.ts 中注册（提升执行）；本文件的
// getUserById 静态 import 必须位于 shared import 之后，才能命中同一 mock 实例
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

beforeEach(() => {
  vi.clearAllMocks();
  redisMocks.useRedisSuccess();
  mockMembershipActive();
});

async function expiredTokenByFakeTimers(ttlSeconds: number) {
  vi.useFakeTimers();
  const t = await generateRefreshToken('expired-user', 'admin');
  vi.advanceTimersByTime(ttlSeconds * 1000);
  return t;
}
async function expireStoredToken(user: string) {
  const t = await generateRefreshToken(user, 'admin');
  const key = `refresh_token:${sha256Hex(t)}`;
  const entry = JSON.parse(redisMocks.store.get(key)!);
  entry.expiresAt = Math.floor(Date.now() / 1000) - 10;
  redisMocks.store.set(key, JSON.stringify(entry));
  return t;
}

describe('Refresh Token 生命周期与 Redis', () => {
  beforeEach(() => mockUser());
  it('生成：64 位 hex、各角色、显式 familyId 与租户上下文；写入 Redis（TTL=EX + family + 集合）', async () => {
    const t = await generateRefreshToken('user-1', 'admin');
    expect(t).toMatch(/^[0-9a-f]{64}$/);
    expect(t).not.toBe(await generateRefreshToken('user-1', 'admin'));
    for (const role of ['admin', 'analyst', 'readonly'] as const)
      expect(await generateRefreshToken('user-role', role)).toBeTruthy();
    expect(await generateRefreshToken('user-1', 'admin', 'existing-family-id')).toBeTruthy();
    expect(
      await generateRefreshToken('tenant-user', 'admin', undefined, {
        tenantId: 'org-1',
        orgRole: 'owner',
        platformAdmin: true,
      }),
    ).toBeTruthy();
    const setCall = vi
      .mocked(redisMocks.set)
      .mock.calls.find(([k]) => String(k).startsWith('refresh_token:'));
    expect(setCall![2]).toBe('EX');
    expect(setCall![3]).toBe(mocks.config.JWT_REFRESH_TTL);
    const family = JSON.parse(
      [...redisMocks.store.entries()].find(([k]) => k.startsWith('token_family:'))![1],
    );
    expect(family).toMatchObject({ lastToken: sha256Hex(t), revoked: false });
    expect(redisMocks.sadd).toHaveBeenCalledWith(
      expect.stringContaining('user_families:user-1'),
      expect.any(String),
    );
  });
  it('轮换：新对+租户透传+旧 token 失效标记、链式刷新、复用撤销家族、revokeRefreshToken/revokeAllUserSessions', async () => {
    const t = await generateRefreshToken('tenant-refresh', 'analyst', undefined, {
      tenantId: 'org-42',
      orgRole: 'owner',
      platformAdmin: true,
    });
    const r = await refreshAccessToken(t);
    expect(r).not.toBeNull();
    expect(r!.accessToken).toBeTruthy();
    expect(r!.refreshToken).not.toBe(t);
    expect(decodeJwt(r!.accessToken)).toMatchObject({
      sub: 'tenant-refresh',
      role: 'admin',
      tenant_id: 'org-42',
      org_role: 'owner',
      platform_admin: true,
    });
    expect(redisMocks.store.has(`refresh_token:${sha256Hex(t)}`)).toBe(false);
    expect(redisMocks.store.has(`refresh_token:used:${sha256Hex(t)}`)).toBe(true);
    let chain = r!.refreshToken;
    for (let i = 0; i < 3; i++) {
      const next = await refreshAccessToken(chain);
      expect(next).not.toBeNull();
      chain = next!.refreshToken;
    }
    expect(await refreshAccessToken(t)).toBeNull();
    expect(await refreshAccessToken(r!.refreshToken)).toBeNull();
    const t2 = await generateRefreshToken('revoke-user', 'admin');
    const entry = JSON.parse(redisMocks.store.get(`refresh_token:${sha256Hex(t2)}`)!);
    await revokeRefreshToken(t2);
    expect(JSON.parse(redisMocks.store.get(`token_family:${entry.familyId}`)!).revoked).toBe(true);
    expect(redisMocks.store.has(`refresh_token:${sha256Hex(t2)}`)).toBe(false);
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
    const familiesKey = [...redisMocks.sets.keys()].find((k) => k.includes('revoke-all-user'));
    if (familiesKey) expect(redisMocks.store.has(familiesKey)).toBe(false);
  });
  it.each([
    ['不存在的 token', async () => 'nonexistent-token', undefined],
    [
      'TTL 过期（fake timers）',
      () => expiredTokenByFakeTimers(mocks.config.JWT_REFRESH_TTL + 60),
      undefined,
    ],
    [
      'Redis entry 已过期',
      async () => expireStoredToken('redis-expired'),
      (t: string) => expect(redisMocks.store.has(`refresh_token:${sha256Hex(t)}`)).toBe(false),
    ],
  ])('%s 应返回 null 并清理', async (_n, build, extra) => {
    const t = await build();
    expect(await refreshAccessToken(t)).toBeNull();
    extra?.(t);
    vi.useRealTimers();
  });
  it('DB 异常应传播 RedisUnavailableError（503，而非 401 假报账号停用）', async () => {
    const t = await generateRefreshToken('db-fail-user', 'admin');
    vi.mocked(getUserById).mockRejectedValueOnce(new Error('database unavailable'));
    await expect(refreshAccessToken(t)).rejects.toThrow(RedisUnavailableError);
  });
  it('成员资格已移除时应拒绝刷新并撤销 refresh family（P1#1）', async () => {
    const t = await generateRefreshToken('removed-member', 'admin', undefined, {
      tenantId: 'org-removed',
      orgRole: 'admin',
    });
    const entry = JSON.parse(redisMocks.store.get(`refresh_token:${sha256Hex(t)}`)!);
    mockMembershipActive();
    vi.mocked(membershipMocks.getMembership).mockResolvedValueOnce(null);
    expect(await refreshAccessToken(t)).toBeNull();
    expect(JSON.parse(redisMocks.store.get(`token_family:${entry.familyId}`)!).revoked).toBe(true);
  });
  it('成员角色降级应在刷新时即时生效（P1#1）', async () => {
    const t = await generateRefreshToken('demoted-user', 'admin', undefined, {
      tenantId: 'org-demote',
      orgRole: 'admin',
    });
    mockMembershipActive('readonly');
    const r = await refreshAccessToken(t);
    expect(r).not.toBeNull();
    expect(decodeJwt(r!.accessToken)).toMatchObject({ role: 'readonly', org_role: 'readonly' });
  });
  it('Redis 可用性应通过 getRedisHealth 动态反映 ping 状态（fail-closed）', async () => {
    redisMocks.useRedisSuccess();
    expect(await generateRefreshToken('redis-ready-user', 'admin')).toBeTruthy();
    redisMocks.useMemoryFallback();
    await expect(generateRefreshToken('redis-error-user', 'analyst')).rejects.toThrow(
      RedisUnavailableError,
    );
  });
  it.each([
    [
      'generateRefreshToken set 失败',
      async () => {
        redisMocks.set.mockRejectedValueOnce(new Error('Redis write failed'));
        return generateRefreshToken('user-fallback', 'admin');
      },
    ],
    [
      'refreshAccessToken get 失败',
      async () => {
        const t = await generateRefreshToken('redis-refresh-fallback', 'admin');
        redisMocks.get.mockRejectedValueOnce(new Error('Redis read failed'));
        return refreshAccessToken(t);
      },
    ],
    [
      'revokeRefreshToken get 失败',
      async () => {
        const t = await generateRefreshToken('user-revoke-err', 'admin');
        redisMocks.get.mockRejectedValueOnce(new Error('redis read failed'));
        return revokeRefreshToken(t);
      },
    ],
    [
      'revokeAllUserSessions smembers 失败',
      async () => {
        await generateRefreshToken('revoke-fallback-user', 'admin');
        redisMocks.smembers.mockRejectedValueOnce(new Error('smembers failed'));
        return revokeAllUserSessions('revoke-fallback-user');
      },
    ],
    [
      'isAccessTokenRevokedForUser get 失败',
      async () => {
        await revokeAllUserSessions('redis-fallback-check-user');
        redisMocks.get.mockRejectedValueOnce(new Error('get failed'));
        return isAccessTokenRevokedForUser('redis-fallback-check-user', 1);
      },
    ],
  ])('%s 应抛出 RedisUnavailableError', async (_n, fn) => {
    await expect(fn()).rejects.toThrow(RedisUnavailableError);
  });
});

describe('isUserSessionValid 与 isAccessTokenRevokedForUser', () => {
  it('系统用户 ID（dev-user）应视为有效且不查 DB', async () => {
    expect(await isUserSessionValid('dev-user')).toBe(true);
    expect(getUserById).not.toHaveBeenCalled();
  });
  it('活跃用户有效；停用/不存在无效；DB 异常应传播（fail-closed）', async () => {
    mockUser();
    expect(await isUserSessionValid('active-user')).toBe(true);
    mockUser(false, 'readonly');
    expect(await isUserSessionValid('inactive-user')).toBe(false);
    vi.mocked(getUserById).mockResolvedValueOnce(null);
    expect(await isUserSessionValid('nonexistent-user')).toBe(false);
    vi.mocked(getUserById).mockRejectedValueOnce(new Error('DB error'));
    await expect(isUserSessionValid('error-user')).rejects.toThrow('DB error');
    vi.mocked(getUserById).mockRejectedValueOnce(new Error('empty id'));
    await expect(isUserSessionValid('')).rejects.toThrow('empty id');
  });
  it('未记录撤销或 iat 晚于撤销时间应返回 false，早于则 true，且撤销检查走 Redis get', async () => {
    expect(await isAccessTokenRevokedForUser('unrevoked-user', 1000)).toBe(false);
    expect(await isAccessTokenRevokedForUser('unknown-user', 100)).toBe(false);
    await revokeAllUserSessions('revoked-check-user');
    expect(await isAccessTokenRevokedForUser('revoked-check-user', 1)).toBe(true);
    expect(
      await isAccessTokenRevokedForUser('revoked-check-user', Math.floor(Date.now() / 1000) + 3600),
    ).toBe(false);
    expect(redisMocks.get).toHaveBeenCalled();
  });
});

describe('getOrCache* 密钥加载（jwtSigner）', () => {
  beforeEach(() => {
    resetRsaConfig();
    mocks.config.NODE_ENV = 'test';
    mocks.config.JWT_ALGORITHM = 'RS256';
  });
  it('生产环境应从环境变量加载私钥与公钥', async () => {
    await setupRsaKeys('production');
    const mod = await reloadJwtAuthModule();
    expect(await mod.getOrCachePrivateKey()).toBeTruthy();
    expect(await mod.getOrCachePublicKey()).toBeTruthy();
  });
  it('密钥加载应缓存（重复调用返回同一密钥）', async () => {
    mocks.config.NODE_ENV = 'development';
    const mod = await reloadJwtAuthModule();
    expect(await mod.getOrCachePrivateKey()).toBe(await mod.getOrCachePrivateKey());
    expect(await mod.getOrCachePublicKey()).toBe(await mod.getOrCachePublicKey());
    expect(await mod.getOrCacheHS256Key()).toBe(await mod.getOrCacheHS256Key());
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
    ['PEM 内容非法', () => 'not-a-valid-pem-key', '/secrets/private.pem', null],
    [
      '文件不存在（ENOENT）',
      () => {
        throw new Error('ENOENT');
      },
      '/missing/private.pem',
      /无法读取 PEM 文件/,
    ],
  ])('readPemFile %s 应抛出错误', async (_n, impl, filePath, pattern) => {
    fsMocks.readFileSync.mockImplementation(impl);
    mocks.config.JWT_PRIVATE_KEY = '';
    mocks.config.JWT_PRIVATE_KEY_FILE = filePath;
    mocks.config.NODE_ENV = 'production';
    const mod = await reloadJwtAuthModule();
    const p = mod.getOrCachePrivateKey();
    if (pattern) await expect(p).rejects.toThrow(pattern);
    else await expect(p).rejects.toThrow();
  });
  it('HS256 密钥应从 JWT_SECRET 派生并完成签发验证', async () => {
    mocks.config.JWT_ALGORITHM = 'HS256';
    const mod = await reloadJwtAuthModule();
    const key = await mod.getOrCacheHS256Key();
    expect(key).toBeTruthy();
    const { payload } = await jwtVerify(await mod.generateToken('hs256-test', 'analyst'), key, {
      algorithms: ['HS256'],
    });
    expect(payload.sub).toBe('hs256-test');
  });
});

describe('idempotencyKey 中间件', () => {
  async function passOnce(
    r: ReturnType<typeof createIdempotencyReqRes>,
    body: unknown,
    statusCode = 200,
  ) {
    idempotencyKey(r.req, r.res, r.next);
    await vi.waitFor(() => expect(r.next).toHaveBeenCalledTimes(1));
    r.res.statusCode = statusCode;
    r.res.json(body);
  }
  it.each([
    ['Redis 正常', false],
    ['Redis 不可用', true],
  ])('%s 时非 POST/无 Key 请求应直接放行', (_n, redisDown) => {
    if (redisDown) redisMocks.useMemoryFallback();
    for (const method of ['GET', 'POST']) {
      const { req, res, next } = createIdempotencyReqRes(undefined, method, '/api/test', true);
      idempotencyKey(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    }
  });
  it('超长 Key（>128 字符）应返回 400', () => {
    const { req, res, next } = createIdempotencyReqRes(mockLongIdempotencyKey());
    idempotencyKey(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
  it.each([
    ['首次请求放行，重复 Key 返回缓存结果', 'dup-key-basic', false],
    ['首次 POST 写入 Redis，二次请求从 Redis 返回缓存', 'redis-dup-key', true],
    ['SQL 注入 Key 应被安全存储并命中缓存', SQL_INJECTION_KEY, false],
    ['XSS 载荷 Key 应被安全存储并命中缓存', XSS_KEY, false],
    ['换行符注入 Key 应被安全存储并命中缓存', NEWLINE_INJECTION_KEY, false],
  ])('%s', async (_n, key, assertRedis) => {
    const cachedBody = { success: true, data: 'cached' };
    const r1 = createIdempotencyReqRes(key);
    await passOnce(r1, cachedBody);
    if (assertRedis)
      await vi.waitFor(() =>
        expect(redisMocks.store.has(`idempotency:127.0.0.1:${key}`)).toBe(true),
      );
    const r2 = createIdempotencyReqRes(key);
    idempotencyKey(r2.req, r2.res, r2.next);
    await vi.waitFor(() => expect(r2.res.status).toHaveBeenCalledWith(200));
    expect(r2.next).not.toHaveBeenCalled();
    expect(r2.res.json).toHaveBeenCalledWith(cachedBody);
    if (assertRedis) expect(redisMocks.get).toHaveBeenCalledWith(`idempotency:127.0.0.1:${key}`);
  });
  it('5xx 响应不应被缓存，重试应再次放行', async () => {
    const key = 'server-error-key';
    const r1 = createIdempotencyReqRes(key);
    await passOnce(r1, { success: false }, 503);
    expect(redisMocks.store.has(`idempotency:${key}`)).toBe(false);
    const r2 = createIdempotencyReqRes(key);
    idempotencyKey(r2.req, r2.res, r2.next);
    await vi.waitFor(() => expect(r2.next).toHaveBeenCalledTimes(1));
    expect(r2.res.status).not.toHaveBeenCalled();
  });
  it('并发相同 Key：仅一个执行 handler，其余返回缓存', async () => {
    const key = 'race-condition-key-12345';
    const cachedBody = { success: true, data: 'first-response' };
    const r1 = createIdempotencyReqRes(key);
    await passOnce(r1, cachedBody);
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
  it('幂等结果写入失败应记录 warn 且不阻塞响应', async () => {
    redisMocks.set.mockResolvedValueOnce('OK');
    redisMocks.set.mockRejectedValueOnce(new Error('redis set failed'));
    const { req, res, next } = createIdempotencyReqRes('redis-write-fail');
    idempotencyKey(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    res.statusCode = 200;
    expect(() => res.json({ success: true })).not.toThrow();
    await vi.waitFor(() => expect(redisMocks.set).toHaveBeenCalledTimes(2));
  });
  it.each([
    ['Redis ping 失败', () => redisMocks.useMemoryFallback()],
    [
      'Redis 占位读取抛错',
      () => {
        redisMocks.ping.mockResolvedValue('PONG');
        redisMocks.set.mockResolvedValueOnce(null); // claim 失败（key 已存在）
        redisMocks.get.mockRejectedValueOnce(new Error('redis read failed'));
      },
    ],
  ])('%s 时应 fail-closed 返回 503（DADR-045）', async (_n, arrange) => {
    arrange();
    const { req, res, next } = createIdempotencyReqRes('redis-down-key');
    idempotencyKey(req, res, next);
    await vi.waitFor(() => expect(res.status).toHaveBeenCalledWith(503));
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
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
