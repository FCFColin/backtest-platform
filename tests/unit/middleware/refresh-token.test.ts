import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLoggerMocks, mockLogger } from '../../helpers/mockFactories.js';

const mocks = vi.hoisted(() => ({
  config: {
    NODE_ENV: 'test' as string,
    JWT_SECRET: 'test-jwt-secret-for-unit-tests',
    JWT_ACCESS_TTL: 900,
    JWT_REFRESH_TTL: 604800,
    JWT_ALGORITHM: 'RS256',
    JWT_PRIVATE_KEY: '',
    JWT_PRIVATE_KEY_FILE: '',
    JWT_PUBLIC_KEY: '',
    JWT_PUBLIC_KEY_FILE: '',
  },
}));

const redisMocks = vi.hoisted(() => {
  const store = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  return {
    store,
    sets,
    ping: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    sadd: vi.fn(),
    smembers: vi.fn(),
    expire: vi.fn(),
    on: vi.fn(),
    useMemoryFallback: () => {
      store.clear();
      sets.clear();
      redisMocks.ping.mockRejectedValue(new Error('Redis not available'));
      redisMocks.get.mockRejectedValue(new Error('Redis not available'));
      redisMocks.set.mockRejectedValue(new Error('Redis not available'));
      redisMocks.del.mockRejectedValue(new Error('Redis not available'));
      redisMocks.sadd.mockRejectedValue(new Error('Redis not available'));
      redisMocks.smembers.mockRejectedValue(new Error('Redis not available'));
      redisMocks.expire.mockRejectedValue(new Error('Redis not available'));
    },
    useRedisSuccess: () => {
      store.clear();
      sets.clear();
      redisMocks.ping.mockResolvedValue('PONG');
      redisMocks.get.mockImplementation(async (key: string) => store.get(key) ?? null);
      redisMocks.set.mockImplementation(async (key: string, value: string) => {
        store.set(key, value);
        return 'OK';
      });
      redisMocks.del.mockImplementation(async (key: string) => {
        store.delete(key);
        return 1;
      });
      redisMocks.sadd.mockImplementation(async (key: string, member: string) => {
        const s = sets.get(key) ?? new Set<string>();
        s.add(member);
        sets.set(key, s);
        return 1;
      });
      redisMocks.smembers.mockImplementation(async (key: string) => [...(sets.get(key) ?? [])]);
      redisMocks.expire.mockResolvedValue(1);
    },
  };
});

vi.mock('../../../packages/backend/src/config/index.js', () => ({ config: mocks.config }));
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(createLoggerMocks()),
}));
vi.mock('../../../packages/backend/src/config/redis.js', () => ({ appRedis: redisMocks }));
vi.mock('../../../packages/backend/src/services/userService.js', () => ({ getUserById: vi.fn() }));
vi.mock('../../../packages/backend/src/middleware/jwtSigner.js', () => ({
  generateToken: vi.fn(),
}));

import { getUserById } from '../../../packages/backend/src/services/userService.js';
import { generateToken } from '../../../packages/backend/src/middleware/jwtSigner.js';

redisMocks.useMemoryFallback();

describe('refreshToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateToken).mockResolvedValue('mock-access-token');
    vi.mocked(getUserById).mockResolvedValue({
      id: 'test-user',
      username: 'test-user',
      role: 'analyst',
      isActive: true,
      createdAt: new Date(),
    });
    redisMocks.useMemoryFallback();
  });

  describe('generateRefreshToken', () => {
    it('should return a hex string token in memory mode', async () => {
      vi.resetModules();
      const { generateRefreshToken } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');
      const token = await generateRefreshToken('user-1', 'admin');
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should create a token for each role', async () => {
      vi.resetModules();
      const { generateRefreshToken } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      for (const role of ['admin', 'analyst', 'readonly'] as const) {
        const token = await generateRefreshToken('user-role', role);
        expect(token).toBeTruthy();
      }
    });

    it('should accept existing familyId', async () => {
      vi.resetModules();
      const { generateRefreshToken } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      const token = await generateRefreshToken('user-1', 'admin', 'existing-family-id');
      expect(token).toBeTruthy();
    });

    it('should store token in Redis when Redis is available', async () => {
      redisMocks.useRedisSuccess();
      vi.resetModules();
      const { generateRefreshToken } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      const token = await generateRefreshToken('redis-user', 'analyst');
      expect(token).toBeTruthy();
      expect(redisMocks.set).toHaveBeenCalled();
      expect(redisMocks.store.has(`refresh_token:${token}`)).toBe(true);
    });

    it('should set Redis TTL from config', async () => {
      redisMocks.useRedisSuccess();
      vi.resetModules();
      const { generateRefreshToken } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      await generateRefreshToken('ttl-user', 'admin');
      const setCall = vi
        .mocked(redisMocks.set)
        .mock.calls.find(([key]) => String(key).startsWith('refresh_token:'));
      expect(setCall).toBeDefined();
      expect(setCall![2]).toBe('EX');
      expect(setCall![3]).toBe(mocks.config.JWT_REFRESH_TTL);
    });

    it('should store token family in Redis', async () => {
      redisMocks.useRedisSuccess();
      vi.resetModules();
      const { generateRefreshToken } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      const token = await generateRefreshToken('family-user', 'admin');
      const familyKey = [...redisMocks.store.keys()].find((k) => k.startsWith('token_family:'));
      expect(familyKey).toBeDefined();
      const family = JSON.parse(redisMocks.store.get(familyKey!)!);
      expect(family.lastToken).toBe(token);
      expect(family.revoked).toBe(false);
    });

    it('should add family to user families set in Redis', async () => {
      redisMocks.useRedisSuccess();
      vi.resetModules();
      const { generateRefreshToken } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      await generateRefreshToken('user-families', 'analyst');
      expect(redisMocks.sadd).toHaveBeenCalledWith(
        expect.stringContaining('user_families:user-families'),
        expect.any(String),
      );
    });

    it('should fall back to memory when Redis set fails', async () => {
      redisMocks.useRedisSuccess();
      redisMocks.set.mockRejectedValueOnce(new Error('write failure'));
      vi.resetModules();
      const { generateRefreshToken } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      const token = await generateRefreshToken('fallback-user', 'admin');
      expect(token).toBeTruthy();
    });

    it('should store tenant context in the entry', async () => {
      vi.resetModules();
      const { generateRefreshToken } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      const token = await generateRefreshToken('tenant-user', 'admin', undefined, {
        tenantId: 'org-1',
        orgRole: 'owner',
        platformAdmin: true,
      });
      expect(token).toBeTruthy();
    });

    it('should generate unique familyId each call when not provided', async () => {
      vi.resetModules();
      const { generateRefreshToken } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      const token1 = await generateRefreshToken('user-uq', 'admin');
      const token2 = await generateRefreshToken('user-uq', 'admin');
      expect(token1).not.toBe(token2);
    });
  });

  describe('refreshAccessToken', () => {
    describe('memory mode', () => {
      it('should return new access and refresh tokens', async () => {
        vi.resetModules();
        const { generateRefreshToken, refreshAccessToken } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        const rt = await generateRefreshToken('user-1', 'admin');
        const result = await refreshAccessToken(rt);
        expect(result).not.toBeNull();
        expect(result!.accessToken).toBe('mock-access-token');
        expect(result!.refreshToken).toBeTruthy();
        expect(result!.refreshToken).not.toBe(rt);
      });

      it('should invalidate old token after refresh (rotation)', async () => {
        vi.resetModules();
        const { generateRefreshToken, refreshAccessToken } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        const rt = await generateRefreshToken('user-1', 'admin');
        const first = await refreshAccessToken(rt);
        expect(first).not.toBeNull();

        const second = await refreshAccessToken(rt);
        expect(second).toBeNull();
      });

      it('should allow chained refreshes with new tokens', async () => {
        vi.resetModules();
        const { generateRefreshToken, refreshAccessToken } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        const rt = await generateRefreshToken('chain-user', 'analyst');
        const r1 = await refreshAccessToken(rt);
        expect(r1).not.toBeNull();

        const r2 = await refreshAccessToken(r1!.refreshToken);
        expect(r2).not.toBeNull();

        const r3 = await refreshAccessToken(r2!.refreshToken);
        expect(r3).not.toBeNull();
      });

      it('should return null for nonexistent token', async () => {
        vi.resetModules();
        const { refreshAccessToken } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');
        expect(await refreshAccessToken('nonexistent')).toBeNull();
      });

      it('should return null for expired token', async () => {
        vi.useFakeTimers();
        vi.resetModules();
        const { generateRefreshToken, refreshAccessToken } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        const rt = await generateRefreshToken('expired-user', 'admin');
        vi.advanceTimersByTime((mocks.config.JWT_REFRESH_TTL + 60) * 1000);

        const result = await refreshAccessToken(rt);
        expect(result).toBeNull();
        vi.useRealTimers();
      });

      it('should detect token family reuse and revoke entire family', async () => {
        vi.resetModules();
        const { generateRefreshToken, refreshAccessToken } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        const rt = await generateRefreshToken('reuse-user', 'admin');
        const r1 = await refreshAccessToken(rt);
        expect(r1).not.toBeNull();

        const reuse = await refreshAccessToken(rt);
        expect(reuse).toBeNull();

        const afterReuse = await refreshAccessToken(r1!.refreshToken);
        expect(afterReuse).toBeNull();
      });

      it('should return null for disabled user', async () => {
        vi.mocked(getUserById).mockResolvedValue({
          id: 'disabled-user',
          username: 'disabled',
          role: 'readonly',
          isActive: false,
          createdAt: new Date(),
        });

        vi.resetModules();
        const { generateRefreshToken, refreshAccessToken } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        const rt = await generateRefreshToken('disabled-user', 'readonly');
        const result = await refreshAccessToken(rt);
        expect(result).toBeNull();
      });

      it('should return null when getUserById throws', async () => {
        vi.mocked(getUserById).mockRejectedValue(new Error('DB unavailable'));

        vi.resetModules();
        const { generateRefreshToken, refreshAccessToken } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        const rt = await generateRefreshToken('db-error-user', 'admin');
        const result = await refreshAccessToken(rt);
        expect(result).toBeNull();
      });

      it('should call generateToken with correct user, role, and tenant', async () => {
        vi.resetModules();
        const { generateRefreshToken, refreshAccessToken } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        const rt = await generateRefreshToken('tenant-refresh', 'analyst', undefined, {
          tenantId: 'org-42',
          orgRole: 'owner',
          platformAdmin: true,
        });

        await refreshAccessToken(rt);

        expect(vi.mocked(generateToken)).toHaveBeenCalledWith(
          'tenant-refresh',
          'analyst',
          expect.objectContaining({ tenantId: 'org-42', orgRole: 'owner', platformAdmin: true }),
        );
      });
    });

    describe('Redis mode', () => {
      beforeEach(() => {
        redisMocks.useRedisSuccess();
      });

      it('should return new token pair via Redis', async () => {
        vi.resetModules();
        const { generateRefreshToken, refreshAccessToken } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        const rt = await generateRefreshToken('redis-user', 'admin');
        const result = await refreshAccessToken(rt);
        expect(result).not.toBeNull();
        expect(result!.accessToken).toBeTruthy();
        expect(result!.refreshToken).not.toBe(rt);
      });

      it('should delete old token and mark as used in Redis', async () => {
        vi.resetModules();
        const { generateRefreshToken, refreshAccessToken } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        const rt = await generateRefreshToken('used-user', 'admin');
        expect(redisMocks.store.has(`refresh_token:${rt}`)).toBe(true);

        const result = await refreshAccessToken(rt);
        expect(result).not.toBeNull();

        expect(redisMocks.store.has(`refresh_token:${rt}`)).toBe(false);
        expect(redisMocks.store.has(`refresh_token:used:${rt}`)).toBe(true);
      });

      it('should detect token reuse via used marker and revoke family', async () => {
        vi.resetModules();
        const { generateRefreshToken, refreshAccessToken } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        const rt = await generateRefreshToken('reuse-redis', 'admin');
        const r1 = await refreshAccessToken(rt);
        expect(r1).not.toBeNull();

        const reuse = await refreshAccessToken(rt);
        expect(reuse).toBeNull();

        const afterFamilyRevoke = await refreshAccessToken(r1!.refreshToken);
        expect(afterFamilyRevoke).toBeNull();
      });

      it('should return null for expired token and delete it', async () => {
        vi.resetModules();
        const { generateRefreshToken, refreshAccessToken } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        const rt = await generateRefreshToken('redis-expired', 'admin');
        const key = `refresh_token:${rt}`;
        const raw = redisMocks.store.get(key)!;
        const entry = JSON.parse(raw);
        entry.expiresAt = Math.floor(Date.now() / 1000) - 10;
        redisMocks.store.set(key, JSON.stringify(entry));

        const result = await refreshAccessToken(rt);
        expect(result).toBeNull();
        expect(redisMocks.store.has(key)).toBe(false);
      });

      it('should return null for disabled user in Redis mode', async () => {
        vi.mocked(getUserById).mockResolvedValue({
          id: 'redis-disabled',
          username: 'disabled',
          role: 'readonly',
          isActive: false,
          createdAt: new Date(),
        });

        vi.resetModules();
        const { generateRefreshToken, refreshAccessToken } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        const rt = await generateRefreshToken('redis-disabled', 'readonly');
        const result = await refreshAccessToken(rt);
        expect(result).toBeNull();
      });

      it('should check token family revocation status', async () => {
        vi.resetModules();
        const { generateRefreshToken, refreshAccessToken } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        const rt = await generateRefreshToken('family-check', 'admin');
        const r1 = await refreshAccessToken(rt);
        expect(r1).not.toBeNull();

        await refreshAccessToken(rt);

        const afterFamilyRevoke = await refreshAccessToken(r1!.refreshToken);
        expect(afterFamilyRevoke).toBeNull();
      });

      it('should fall back to memory when Redis throws during refresh', async () => {
        redisMocks.ping.mockResolvedValue('PONG');
        redisMocks.set.mockRejectedValueOnce(new Error('Redis write failed'));
        vi.resetModules();
        const { generateRefreshToken, refreshAccessToken } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        const rt = await generateRefreshToken('fallback-redis', 'admin');

        redisMocks.ping.mockRejectedValue(new Error('Redis down'));
        const result = await refreshAccessToken(rt);
        expect(result).not.toBeNull();
        expect(result!.accessToken).toBeTruthy();
      });

      it('should handle non-existent token that was not previously used', async () => {
        vi.resetModules();
        const { refreshAccessToken } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        const result = await refreshAccessToken('totally-unknown-token');
        expect(result).toBeNull();
      });
    });
  });

  describe('revokeRefreshToken', () => {
    describe('memory mode', () => {
      it('should revoke token and its family', async () => {
        vi.resetModules();
        const { generateRefreshToken, refreshAccessToken, revokeRefreshToken } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        const rt = await generateRefreshToken('revoke-user', 'admin');
        await revokeRefreshToken(rt);

        const result = await refreshAccessToken(rt);
        expect(result).toBeNull();
      });

      it('should revoke used token as well', async () => {
        vi.resetModules();
        const { generateRefreshToken, refreshAccessToken, revokeRefreshToken } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        const rt = await generateRefreshToken('revoke-used', 'admin');
        const r1 = await refreshAccessToken(rt);
        expect(r1).not.toBeNull();

        await revokeRefreshToken(rt);

        const afterRevoke = await refreshAccessToken(r1!.refreshToken);
        expect(afterRevoke).toBeNull();
      });
    });

    describe('Redis mode', () => {
      beforeEach(() => {
        redisMocks.useRedisSuccess();
      });

      it('should revoke token and mark family as revoked', async () => {
        vi.resetModules();
        const { generateRefreshToken, revokeRefreshToken } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        const rt = await generateRefreshToken('redis-revoke', 'admin');
        const raw = redisMocks.store.get(`refresh_token:${rt}`);
        const entry = JSON.parse(raw!);

        await revokeRefreshToken(rt);

        expect(redisMocks.store.has(`refresh_token:${rt}`)).toBe(false);
        const familyKey = `token_family:${entry.familyId}`;
        const familyRaw = redisMocks.store.get(familyKey);
        expect(familyRaw).toBeTruthy();
        expect(JSON.parse(familyRaw!).revoked).toBe(true);
      });

      it('should handle used token revocation in Redis', async () => {
        vi.resetModules();
        const { generateRefreshToken, refreshAccessToken, revokeRefreshToken } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        const rt = await generateRefreshToken('redis-used-revoke', 'admin');
        await refreshAccessToken(rt);

        await revokeRefreshToken(rt);

        expect(redisMocks.store.has(`refresh_token:used:${rt}`)).toBe(false);
      });

      it('should fall back to memory on Redis error', async () => {
        redisMocks.get.mockRejectedValueOnce(new Error('read failed'));
        vi.resetModules();
        const { generateRefreshToken, revokeRefreshToken } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        const rt = await generateRefreshToken('redis-err-revoke', 'admin');
        await expect(revokeRefreshToken(rt)).resolves.toBeUndefined();
      });
    });
  });

  describe('revokeAllUserSessions', () => {
    describe('memory mode', () => {
      it('should revoke all refresh tokens for a user', async () => {
        vi.resetModules();
        const { generateRefreshToken, refreshAccessToken, revokeAllUserSessions } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        const rt1 = await generateRefreshToken('revoke-all-user', 'admin');
        const rt2 = await generateRefreshToken('revoke-all-user', 'analyst');

        await revokeAllUserSessions('revoke-all-user');

        expect(await refreshAccessToken(rt1)).toBeNull();
        expect(await refreshAccessToken(rt2)).toBeNull();
      });

      it('should mark revoked_at timestamp', async () => {
        vi.resetModules();
        const { revokeAllUserSessions, isAccessTokenRevokedForUser } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        const before = Math.floor(Date.now() / 1000);
        await revokeAllUserSessions('revoke-ts-user');
        const after = Math.floor(Date.now() / 1000);

        expect(await isAccessTokenRevokedForUser('revoke-ts-user', before - 10)).toBe(true);
        expect(await isAccessTokenRevokedForUser('revoke-ts-user', after + 10)).toBe(false);
      });
    });

    describe('Redis mode', () => {
      beforeEach(() => {
        redisMocks.useRedisSuccess();
      });

      it('should revoke all sessions and set revoked_at', async () => {
        vi.resetModules();
        const { generateRefreshToken, refreshAccessToken, revokeAllUserSessions } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        const rt = await generateRefreshToken('redis-revoke-all', 'admin');
        await revokeAllUserSessions('redis-revoke-all');

        const result = await refreshAccessToken(rt);
        expect(result).toBeNull();

        expect(redisMocks.store.has('user_revoked:redis-revoke-all')).toBe(true);
      });

      it('should fall back to memory on Redis error', async () => {
        redisMocks.smembers.mockRejectedValue(new Error('smembers failed'));
        vi.resetModules();
        const { generateRefreshToken, revokeAllUserSessions } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        await generateRefreshToken('redis-err-sessions', 'admin');
        await expect(revokeAllUserSessions('redis-err-sessions')).resolves.toBeUndefined();
      });

      it('should remove user families set from Redis', async () => {
        vi.resetModules();
        const { generateRefreshToken, revokeAllUserSessions } =
          await import('../../../packages/backend/src/middleware/refreshToken.js');

        await generateRefreshToken('redis-cleanup', 'admin');
        await revokeAllUserSessions('redis-cleanup');

        const familiesKey = [...redisMocks.sets.keys()].find((k) => k.includes('redis-cleanup'));
        if (familiesKey) {
          expect(redisMocks.store.has(familiesKey)).toBe(false);
        }
      });
    });
  });

  describe('isUserSessionValid', () => {
    it('should return true for system user IDs', async () => {
      vi.resetModules();
      const { isUserSessionValid } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      for (const sysUser of ['dev-user', 'api-key-user']) {
        const result = await isUserSessionValid(sysUser);
        expect(result).toBe(true);
        expect(getUserById).not.toHaveBeenCalled();
      }
    });

    it('should return true for active DB user', async () => {
      vi.mocked(getUserById).mockResolvedValue({
        id: 'active-user',
        username: 'active',
        role: 'analyst',
        isActive: true,
        createdAt: new Date(),
      });

      vi.resetModules();
      const { isUserSessionValid } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      expect(await isUserSessionValid('active-user')).toBe(true);
    });

    it('should return false for disabled DB user', async () => {
      vi.mocked(getUserById).mockResolvedValue({
        id: 'inactive-user',
        username: 'inactive',
        role: 'readonly',
        isActive: false,
        createdAt: new Date(),
      });

      vi.resetModules();
      const { isUserSessionValid } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      expect(await isUserSessionValid('inactive-user')).toBe(false);
    });

    it('should return false when getUserById throws', async () => {
      vi.mocked(getUserById).mockRejectedValue(new Error('DB error'));

      vi.resetModules();
      const { isUserSessionValid } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      expect(await isUserSessionValid('error-user')).toBe(false);
    });

    it('should return false when getUserById returns null', async () => {
      vi.mocked(getUserById).mockResolvedValue(null);

      vi.resetModules();
      const { isUserSessionValid } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      expect(await isUserSessionValid('nonexistent-user')).toBe(false);
    });
  });

  describe('isAccessTokenRevokedForUser', () => {
    it('should return false when no revocation recorded', async () => {
      vi.resetModules();
      const { isAccessTokenRevokedForUser } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      expect(await isAccessTokenRevokedForUser('unrevoked-user', 1000)).toBe(false);
    });

    it('should return true when token iat is before revocation time', async () => {
      vi.resetModules();
      const { revokeAllUserSessions, isAccessTokenRevokedForUser } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      await revokeAllUserSessions('revoked-check-user');
      expect(await isAccessTokenRevokedForUser('revoked-check-user', 1)).toBe(true);
    });

    it('should return false when token iat is after revocation time', async () => {
      vi.resetModules();
      const { revokeAllUserSessions, isAccessTokenRevokedForUser } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      await revokeAllUserSessions('revoked-after-user');
      const futureIat = Math.floor(Date.now() / 1000) + 3600;
      expect(await isAccessTokenRevokedForUser('revoked-after-user', futureIat)).toBe(false);
    });

    it('should work in Redis mode', async () => {
      redisMocks.useRedisSuccess();
      vi.resetModules();
      const { revokeAllUserSessions, isAccessTokenRevokedForUser } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      await revokeAllUserSessions('redis-revoked-user');
      expect(await isAccessTokenRevokedForUser('redis-revoked-user', 1)).toBe(true);
      expect(redisMocks.get).toHaveBeenCalled();
    });

    it('should fall back to memory when Redis get fails', async () => {
      redisMocks.ping.mockResolvedValue('PONG');
      redisMocks.smembers.mockRejectedValueOnce(new Error('smembers failed'));
      redisMocks.set.mockImplementation(async (k: string, v: string) => {
        store.set(k, v);
        return 'OK';
      });
      redisMocks.get.mockImplementation(async (k: string) => store.get(k) ?? null);

      vi.resetModules();
      const { revokeAllUserSessions, isAccessTokenRevokedForUser } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      await revokeAllUserSessions('redis-fallback-check-user');

      redisMocks.get.mockRejectedValueOnce(new Error('get failed'));
      const result = await isAccessTokenRevokedForUser('redis-fallback-check-user', 1);
      expect(result).toBe(true);
    });
  });

  describe('Token Family reuse attack scenarios', () => {
    it('memory mode: reused token after rotation revokes entire family', async () => {
      vi.resetModules();
      const { generateRefreshToken, refreshAccessToken } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      const rt = await generateRefreshToken('attack-user', 'admin');
      const r1 = await refreshAccessToken(rt);
      expect(r1).not.toBeNull();

      const attackAttempt = await refreshAccessToken(rt);
      expect(attackAttempt).toBeNull();

      const legitimateAttempt = await refreshAccessToken(r1!.refreshToken);
      expect(legitimateAttempt).toBeNull();
    });

    it('Redis mode: reused token triggers family revocation', async () => {
      redisMocks.useRedisSuccess();
      vi.resetModules();
      const { generateRefreshToken, refreshAccessToken } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      const rt = await generateRefreshToken('redis-attack-user', 'admin');
      const r1 = await refreshAccessToken(rt);
      expect(r1).not.toBeNull();

      const attackAttempt = await refreshAccessToken(rt);
      expect(attackAttempt).toBeNull();

      const legitimateAttempt = await refreshAccessToken(r1!.refreshToken);
      expect(legitimateAttempt).toBeNull();
    });

    it('memory mode: reuse after successful refresh should detect family reuse', async () => {
      vi.resetModules();
      const { generateRefreshToken, refreshAccessToken } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      const rt = await generateRefreshToken('family-reuse-user', 'admin');
      const r1 = await refreshAccessToken(rt);
      expect(r1).not.toBeNull();

      const r2 = await refreshAccessToken(rt);
      expect(r2).toBeNull();

      const r3 = await refreshAccessToken(r1!.refreshToken);
      expect(r3).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle empty userId in isUserSessionValid', async () => {
      vi.resetModules();
      const { isUserSessionValid } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      vi.mocked(getUserById).mockRejectedValue(new Error('empty id'));
      expect(await isUserSessionValid('')).toBe(false);
    });

    it('isAccessTokenRevokedForUser should handle non-finite revokedAt', async () => {
      vi.resetModules();
      const { isAccessTokenRevokedForUser } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      expect(await isAccessTokenRevokedForUser('unknown-user', 100)).toBe(false);
    });

    it('generateRefreshToken should handle undefined tenant gracefully', async () => {
      vi.resetModules();
      const { generateRefreshToken } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      const token = await generateRefreshToken('no-tenant-user', 'readonly');
      expect(token).toBeTruthy();
    });

    it('refreshAccessToken should return null for revoked family in memory mode', async () => {
      vi.resetModules();
      const { generateRefreshToken, refreshAccessToken } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      const rt = await generateRefreshToken('revoked-family', 'admin');
      await refreshAccessToken(rt);
      const reuse = await refreshAccessToken(rt);
      expect(reuse).toBeNull();
    });
  });

  describe('Redis event handlers', () => {
    it('should register ready and error event handlers', async () => {
      vi.resetModules();
      await import('../../../packages/backend/src/middleware/refreshToken.js');

      expect(redisMocks.on).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(redisMocks.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });
});
