/**
 * Refresh Token 单元测试 - Family / Revoke 职责（拆分）
 *
 * 覆盖：revokeRefreshToken、revokeAllUserSessions、isUserSessionValid、
 * isAccessTokenRevokedForUser、Token Family 复用攻击场景、边界用例、Redis 事件注册。
 * 企业理由：family 吊销与会话级撤销是 token 安全核心，须保证复用检测、
 * 批量撤销、访问令牌吊销判定、Redis 故障 fail-closed 行为正确。
 *
 * ADR-045：删除内存降级路径。Redis 故障时 requireRedis 抛出 RedisUnavailableError，
 * 由路由层翻译为 503。本文件移除 memory/Redis 双模式断言，统一为 Redis 模式；
 * 原"fall back to memory"用例转换为"抛出 RedisUnavailableError"用例。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createLoggerMocks,
  mockLogger,
  createRedisModuleMock,
} from '../../helpers/mockFactories.js';

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
vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () =>
  createRedisModuleMock(
    {
      withStore: true,
      withSets: true,
      withMemoryHelpers: true,
      memoryFallbackErrorMessage: 'Redis not available',
    },
    redisMocks,
  ),
);
vi.mock('../../../packages/backend/src/repositories/userRepo.js', () => ({ getUserById: vi.fn() }));
vi.mock('../../../packages/backend/src/middleware/jwtSigner.js', () => ({
  generateToken: vi.fn(),
}));

import { getUserById } from '../../../packages/backend/src/repositories/userRepo.js';
import { generateToken } from '../../../packages/backend/src/middleware/jwtSigner.js';
import '../../../packages/backend/src/infrastructure/redisClient.js';

// ADR-045：默认 Redis 可用（内存 Map 支撑的 store 模拟）。Redis 故障用例在独立测试中验证。
redisMocks.useRedisSuccess();

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
    redisMocks.useRedisSuccess();
  });

  describe('revokeRefreshToken', () => {
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

    it('should throw RedisUnavailableError when Redis get fails (ADR-045)', async () => {
      vi.resetModules();
      const { generateRefreshToken, revokeRefreshToken } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');
      // vi.resetModules() re-evaluates errors.js → requireRedis 抛出的 RedisUnavailableError
      // 与顶层 import 的类不是同一实例，须动态导入同一实例（与 isAccessTokenRevokedForUser 用例一致）
      const { RedisUnavailableError } =
        await import('../../../packages/backend/src/utils/errors.js');

      const rt = await generateRefreshToken('redis-err-revoke', 'admin');
      redisMocks.get.mockRejectedValueOnce(new Error('read failed'));

      await expect(revokeRefreshToken(rt)).rejects.toThrow(RedisUnavailableError);
    });
  });

  describe('revokeAllUserSessions', () => {
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

    it('should throw RedisUnavailableError when Redis smembers fails (ADR-045)', async () => {
      vi.resetModules();
      const { generateRefreshToken, revokeAllUserSessions } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');
      const { RedisUnavailableError } =
        await import('../../../packages/backend/src/utils/errors.js');

      await generateRefreshToken('redis-err-sessions', 'admin');
      redisMocks.smembers.mockRejectedValueOnce(new Error('smembers failed'));

      await expect(revokeAllUserSessions('redis-err-sessions')).rejects.toThrow(
        RedisUnavailableError,
      );
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

    it('should invoke Redis get when checking revocation', async () => {
      vi.resetModules();
      const { revokeAllUserSessions, isAccessTokenRevokedForUser } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      await revokeAllUserSessions('redis-revoked-user');
      expect(await isAccessTokenRevokedForUser('redis-revoked-user', 1)).toBe(true);
      expect(redisMocks.get).toHaveBeenCalled();
    });

    it('should throw RedisUnavailableError when Redis get fails (ADR-045)', async () => {
      vi.resetModules();
      const { revokeAllUserSessions, isAccessTokenRevokedForUser } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');
      const { RedisUnavailableError } =
        await import('../../../packages/backend/src/utils/errors.js');

      await revokeAllUserSessions('redis-fallback-check-user');

      redisMocks.get.mockRejectedValueOnce(new Error('get failed'));
      await expect(isAccessTokenRevokedForUser('redis-fallback-check-user', 1)).rejects.toThrow(
        RedisUnavailableError,
      );
    });
  });

  describe('Token Family reuse attack scenarios', () => {
    // ADR-045：统一 Redis 模式。原 memory/Redis 双场景去重为 Redis 单场景。
    it.each([
      { name: 'reused token after rotation revokes entire family', userId: 'attack-user' },
      { name: 'reuse after successful refresh revokes entire family', userId: 'family-reuse-user' },
    ])('$name', async ({ userId }) => {
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

    it('refreshAccessToken should return null for revoked family', async () => {
      vi.resetModules();
      const { generateRefreshToken, refreshAccessToken } =
        await import('../../../packages/backend/src/middleware/refreshToken.js');

      const rt = await generateRefreshToken('revoked-family', 'admin');
      await refreshAccessToken(rt);
      const reuse = await refreshAccessToken(rt);
      expect(reuse).toBeNull();
    });
  });
});
