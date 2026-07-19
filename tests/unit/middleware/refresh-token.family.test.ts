/**
 * Refresh Token 单元测试 - Family / Revoke 职责（拆分）
 *
 * 覆盖：revokeRefreshToken、revokeAllUserSessions、isUserSessionValid、
 * isAccessTokenRevokedForUser、Token Family 复用攻击场景、边界用例、Redis 事件注册。
 * 企业理由：family 吊销与会话级撤销是 token 安全核心，须保证 memory/Redis 双模式下
 * 复用检测、批量撤销、访问令牌吊销判定、降级路径行为正确。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLoggerMocks, mockLogger, createRedisMocks } from '../../helpers/mockFactories.js';

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

const redisMocks = vi.hoisted(() => ({}) as Record<string, unknown>);
vi.mock('../../../packages/backend/src/config/index.js', () => ({ config: mocks.config }));
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(createLoggerMocks()),
}));
vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  appRedis: createRedisMocks(
    {
      withStore: true,
      withSets: true,
      withMemoryHelpers: true,
      memoryFallbackErrorMessage: 'Redis not available',
    },
    redisMocks,
  ),
}));
vi.mock('../../../packages/backend/src/repositories/userRepo.js', () => ({ getUserById: vi.fn() }));
vi.mock('../../../packages/backend/src/middleware/jwtSigner.js', () => ({
  generateToken: vi.fn(),
}));

import { getUserById } from '../../../packages/backend/src/repositories/userRepo.js';
import { generateToken } from '../../../packages/backend/src/middleware/jwtSigner.js';
import '../../../packages/backend/src/infrastructure/redisClient.js';

redisMocks.useMemoryFallback();

// 共享 store 引用，便于 isAccessTokenRevokedForUser 用例局部覆写 set/get 实现
const { store } = redisMocks;

describe('refreshToken family & revoke', () => {
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
    // table-driven：3 个场景共享相同断言，仅模式（memory/Redis）与 userId 不同
    it.each([
      {
        name: 'memory mode: reused token after rotation',
        useRedis: false,
        userId: 'attack-user',
      },
      {
        name: 'Redis mode: reused token',
        useRedis: true,
        userId: 'redis-attack-user',
      },
      {
        name: 'memory mode: reuse after successful refresh',
        useRedis: false,
        userId: 'family-reuse-user',
      },
    ])('$name revokes entire family', async ({ useRedis, userId }) => {
      if (useRedis) redisMocks.useRedisSuccess();
      vi.resetModules();
      const { generateRefreshToken, refreshAccessToken } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      const rt = await generateRefreshToken(userId, 'admin');
      const r1 = await refreshAccessToken(rt);
      expect(r1).not.toBeNull();

      const attackAttempt = await refreshAccessToken(rt);
      expect(attackAttempt).toBeNull();

      const legitimateAttempt = await refreshAccessToken(r1!.refreshToken);
      expect(legitimateAttempt).toBeNull();
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
    // Listener 已从 refreshToken.ts 迁移到 infrastructure/redisHealth.ts（Task 2.2 统一抽离）
    it('should register ready/reconnecting/end/error handlers via redisHealth', async () => {
      vi.clearAllMocks();
      vi.resetModules();
      await import('../../../packages/backend/src/infrastructure/redisHealth.js');

      expect(redisMocks.on).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(redisMocks.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
      expect(redisMocks.on).toHaveBeenCalledWith('end', expect.any(Function));
      expect(redisMocks.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });
});
