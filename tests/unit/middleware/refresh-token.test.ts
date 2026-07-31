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

import { getUserById } from '../../../packages/backend/src/repositories/userRepo.js';
import '../../../packages/backend/src/infrastructure/redisClient.js';

redisMocks.useRedisSuccess();

const mockUser = (overrides: Record<string, unknown> = {}) => vi.mocked(getUserById).mockResolvedValue({
  id: 'test-user', username: 'test-user', role: 'analyst', isActive: true, createdAt: new Date(), ...overrides,
});
const loadRefresh = async () => {
  vi.resetModules();
  return import('../../../packages/backend/src/middleware/jwtAuth.js');
};
const setupDefaults = () => {
  vi.clearAllMocks();
  mockUser();
  redisMocks.useRedisSuccess();
};

describe('refreshToken rotation - generateRefreshToken', () => {
  beforeEach(setupDefaults);

  it('should return a hex string token', async () => {
    const token = await (await loadRefresh()).generateRefreshToken('user-1', 'admin');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should create a token for each role', async () => {
    const { generateRefreshToken } = await loadRefresh();
    for (const role of ['admin', 'analyst', 'readonly'] as const) {
      expect(await generateRefreshToken('user-role', role)).toBeTruthy();
    }
  });

  it('should accept existing familyId', async () => {
    const { generateRefreshToken } = await loadRefresh();
    expect(await generateRefreshToken('user-1', 'admin', 'existing-family-id')).toBeTruthy();
  });

  it('should store token in Redis when Redis is available', async () => {
    redisMocks.useRedisSuccess();
    const { generateRefreshToken } = await loadRefresh();
    const token = await generateRefreshToken('redis-user', 'analyst');
    expect(token).toBeTruthy();
    expect(redisMocks.set).toHaveBeenCalled();
    expect(redisMocks.store.has(`refresh_token:${token}`)).toBe(true);
  });

  it('should set Redis TTL from config', async () => {
    redisMocks.useRedisSuccess();
    const { generateRefreshToken } = await loadRefresh();
    await generateRefreshToken('ttl-user', 'admin');
    const setCall = vi.mocked(redisMocks.set).mock.calls.find(([key]) => String(key).startsWith('refresh_token:'));
    expect(setCall).toBeDefined();
    expect(setCall![2]).toBe('EX');
    expect(setCall![3]).toBe(mocks.config.JWT_REFRESH_TTL);
  });

  it('should store token family in Redis', async () => {
    redisMocks.useRedisSuccess();
    const { generateRefreshToken } = await loadRefresh();
    const token = await generateRefreshToken('family-user', 'admin');
    const familyKey = [...redisMocks.store.keys()].find((k) => k.startsWith('token_family:'));
    expect(familyKey).toBeDefined();
    const family = JSON.parse(redisMocks.store.get(familyKey!)!);
    expect(family.lastToken).toBe(token);
    expect(family.revoked).toBe(false);
  });

  it('should add family to user families set in Redis', async () => {
    redisMocks.useRedisSuccess();
    const { generateRefreshToken } = await loadRefresh();
    await generateRefreshToken('user-families', 'analyst');
    expect(redisMocks.sadd).toHaveBeenCalledWith(expect.stringContaining('user_families:user-families'), expect.any(String));
  });

  it('should throw RedisUnavailableError when Redis set fails (ADR-045)', async () => {
    redisMocks.useRedisSuccess();
    redisMocks.set.mockRejectedValueOnce(new Error('write failure'));
    const { generateRefreshToken } = await loadRefresh();
    const { RedisUnavailableError } = await import('../../../packages/backend/src/utils/errors.js');
    await expect(generateRefreshToken('fallback-user', 'admin')).rejects.toThrow(RedisUnavailableError);
  });

  it('should store tenant context in the entry', async () => {
    const { generateRefreshToken } = await loadRefresh();
    expect(await generateRefreshToken('tenant-user', 'admin', undefined, { tenantId: 'org-1', orgRole: 'owner', platformAdmin: true })).toBeTruthy();
  });

  it('should generate unique familyId each call when not provided', async () => {
    const { generateRefreshToken } = await loadRefresh();
    expect(await generateRefreshToken('user-uq', 'admin')).not.toBe(await generateRefreshToken('user-uq', 'admin'));
  });
});
describe('refreshToken rotation - refreshAccessToken (business logic)', () => {
  beforeEach(setupDefaults);

  it('should return new access and refresh tokens', async () => {
    const { generateRefreshToken, refreshAccessToken } = await loadRefresh();
    const rt = await generateRefreshToken('user-1', 'admin');
    const result = await refreshAccessToken(rt);
    expect(result).not.toBeNull();
    expect(result!.accessToken).toBeTruthy();
    expect(result!.refreshToken).not.toBe(rt);
  });

  it('should invalidate old token after refresh (rotation)', async () => {
    const { generateRefreshToken, refreshAccessToken } = await loadRefresh();
    const rt = await generateRefreshToken('user-1', 'admin');
    expect(await refreshAccessToken(rt)).not.toBeNull();
    expect(await refreshAccessToken(rt)).toBeNull();
  });

  it('should allow chained refreshes with new tokens', async () => {
    const { generateRefreshToken, refreshAccessToken } = await loadRefresh();
    const r1 = await refreshAccessToken(await generateRefreshToken('chain-user', 'analyst'));
    const r2 = await refreshAccessToken(r1!.refreshToken);
    const r3 = await refreshAccessToken(r2!.refreshToken);
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r3).not.toBeNull();
  });

  it('should return null for nonexistent token', async () => {
    const { refreshAccessToken } = await loadRefresh();
    expect(await refreshAccessToken('nonexistent')).toBeNull();
  });

  it('should return null for expired token', async () => {
    vi.useFakeTimers();
    const { generateRefreshToken, refreshAccessToken } = await loadRefresh();
    const rt = await generateRefreshToken('expired-user', 'admin');
    vi.advanceTimersByTime((mocks.config.JWT_REFRESH_TTL + 60) * 1000);
    expect(await refreshAccessToken(rt)).toBeNull();
    vi.useRealTimers();
  });

  it('should detect token family reuse and revoke entire family', async () => {
    const { generateRefreshToken, refreshAccessToken } = await loadRefresh();
    const rt = await generateRefreshToken('reuse-user', 'admin');
    const r1 = await refreshAccessToken(rt);
    expect(r1).not.toBeNull();
    expect(await refreshAccessToken(rt)).toBeNull();
    expect(await refreshAccessToken(r1!.refreshToken)).toBeNull();
  });

  it('should return null for disabled user', async () => {
    mockUser({ id: 'disabled-user', username: 'disabled', role: 'readonly', isActive: false });
    const { generateRefreshToken, refreshAccessToken } = await loadRefresh();
    const rt = await generateRefreshToken('disabled-user', 'readonly');
    expect(await refreshAccessToken(rt)).toBeNull();
  });

  it('should return null when getUserById throws', async () => {
    vi.mocked(getUserById).mockRejectedValue(new Error('DB unavailable'));
    const { generateRefreshToken, refreshAccessToken } = await loadRefresh();
    const rt = await generateRefreshToken('db-error-user', 'admin');
    expect(await refreshAccessToken(rt)).toBeNull();
  });

  it('should call generateToken with correct user, role, and tenant', async () => {
    const { generateRefreshToken, refreshAccessToken } = await loadRefresh();
    const rt = await generateRefreshToken('tenant-refresh', 'analyst', undefined, { tenantId: 'org-42', orgRole: 'owner', platformAdmin: true });
    const result = await refreshAccessToken(rt);
    expect(result).not.toBeNull();
    const { decodeJwt } = await import('jose');
    const payload = decodeJwt(result!.accessToken);
    expect(payload.sub).toBe('tenant-refresh');
    expect(payload.role).toBe('analyst');
    expect(payload.tenant_id).toBe('org-42');
    expect(payload.org_role).toBe('owner');
    expect(payload.platform_admin).toBe(true);
  });
});

describe('refreshToken rotation - refreshAccessToken (Redis mode)', () => {
  beforeEach(setupDefaults);

  it('should return new token pair via Redis', async () => {
    const { generateRefreshToken, refreshAccessToken } = await loadRefresh();
    const rt = await generateRefreshToken('redis-user', 'admin');
    const result = await refreshAccessToken(rt);
    expect(result).not.toBeNull();
    expect(result!.accessToken).toBeTruthy();
    expect(result!.refreshToken).not.toBe(rt);
  });

  it('should delete old token and mark as used in Redis', async () => {
    const { generateRefreshToken, refreshAccessToken } = await loadRefresh();
    const rt = await generateRefreshToken('used-user', 'admin');
    expect(redisMocks.store.has(`refresh_token:${rt}`)).toBe(true);
    await refreshAccessToken(rt);
    expect(redisMocks.store.has(`refresh_token:${rt}`)).toBe(false);
    expect(redisMocks.store.has(`refresh_token:used:${rt}`)).toBe(true);
  });

  it('should detect token reuse via used marker and revoke family', async () => {
    const { generateRefreshToken, refreshAccessToken } = await loadRefresh();
    const rt = await generateRefreshToken('reuse-redis', 'admin');
    const r1 = await refreshAccessToken(rt);
    expect(r1).not.toBeNull();
    expect(await refreshAccessToken(rt)).toBeNull();
    expect(await refreshAccessToken(r1!.refreshToken)).toBeNull();
  });

  it('should return null for expired token and delete it', async () => {
    const { generateRefreshToken, refreshAccessToken } = await loadRefresh();
    const rt = await generateRefreshToken('redis-expired', 'admin');
    const key = `refresh_token:${rt}`;
    const entry = JSON.parse(redisMocks.store.get(key)!);
    entry.expiresAt = Math.floor(Date.now() / 1000) - 10;
    redisMocks.store.set(key, JSON.stringify(entry));
    expect(await refreshAccessToken(rt)).toBeNull();
    expect(redisMocks.store.has(key)).toBe(false);
  });

  it('should return null for disabled user in Redis mode', async () => {
    mockUser({ id: 'redis-disabled', username: 'disabled', role: 'readonly', isActive: false });
    const { generateRefreshToken, refreshAccessToken } = await loadRefresh();
    const rt = await generateRefreshToken('redis-disabled', 'readonly');
    expect(await refreshAccessToken(rt)).toBeNull();
  });

  it('should check token family revocation status', async () => {
    const { generateRefreshToken, refreshAccessToken } = await loadRefresh();
    const rt = await generateRefreshToken('family-check', 'admin');
    const r1 = await refreshAccessToken(rt);
    expect(r1).not.toBeNull();
    await refreshAccessToken(rt);
    expect(await refreshAccessToken(r1!.refreshToken)).toBeNull();
  });

  it('should throw RedisUnavailableError when Redis fails during refresh (ADR-045)', async () => {
    const { generateRefreshToken, refreshAccessToken } = await loadRefresh();
    const { RedisUnavailableError } = await import('../../../packages/backend/src/utils/errors.js');
    const rt = await generateRefreshToken('fallback-redis', 'admin');
    redisMocks.get.mockRejectedValueOnce(new Error('Redis read failed'));
    await expect(refreshAccessToken(rt)).rejects.toThrow(RedisUnavailableError);
  });

  it('should handle non-existent token that was not previously used', async () => {
    const { refreshAccessToken } = await loadRefresh();
    expect(await refreshAccessToken('totally-unknown-token')).toBeNull();
  });
});
describe('revokeRefreshToken', () => {
  beforeEach(setupDefaults);

  it('should revoke token and its family', async () => {
    vi.resetModules();
    const { generateRefreshToken, refreshAccessToken, revokeRefreshToken } =
      await import('../../../packages/backend/src/middleware/jwtAuth.js');

    const rt = await generateRefreshToken('revoke-user', 'admin');
    await revokeRefreshToken(rt);

    const result = await refreshAccessToken(rt);
    expect(result).toBeNull();
  });

  it('should revoke used token as well', async () => {
    vi.resetModules();
    const { generateRefreshToken, refreshAccessToken, revokeRefreshToken } =
      await import('../../../packages/backend/src/middleware/jwtAuth.js');

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
      await import('../../../packages/backend/src/middleware/jwtAuth.js');

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
      await import('../../../packages/backend/src/middleware/jwtAuth.js');

    const rt = await generateRefreshToken('redis-used-revoke', 'admin');
    await refreshAccessToken(rt);

    await revokeRefreshToken(rt);

    expect(redisMocks.store.has(`refresh_token:used:${rt}`)).toBe(false);
  });

  it('should throw RedisUnavailableError when Redis get fails (ADR-045)', async () => {
    vi.resetModules();
    const { generateRefreshToken, revokeRefreshToken } =
      await import('../../../packages/backend/src/middleware/jwtAuth.js');
    const { RedisUnavailableError } =
      await import('../../../packages/backend/src/utils/errors.js');

    const rt = await generateRefreshToken('redis-err-revoke', 'admin');
    redisMocks.get.mockRejectedValueOnce(new Error('read failed'));

    await expect(revokeRefreshToken(rt)).rejects.toThrow(RedisUnavailableError);
  });
});

describe('revokeAllUserSessions', () => {
  beforeEach(setupDefaults);

  it('should revoke all refresh tokens for a user', async () => {
    vi.resetModules();
    const { generateRefreshToken, refreshAccessToken, revokeAllUserSessions } =
      await import('../../../packages/backend/src/middleware/jwtAuth.js');

    const rt1 = await generateRefreshToken('revoke-all-user', 'admin');
    const rt2 = await generateRefreshToken('revoke-all-user', 'analyst');

    await revokeAllUserSessions('revoke-all-user');

    expect(await refreshAccessToken(rt1)).toBeNull();
    expect(await refreshAccessToken(rt2)).toBeNull();
  });

  it('should mark revoked_at timestamp', async () => {
    vi.resetModules();
    const { revokeAllUserSessions, isAccessTokenRevokedForUser } =
      await import('../../../packages/backend/src/middleware/jwtAuth.js');

    const before = Math.floor(Date.now() / 1000);
    await revokeAllUserSessions('revoke-ts-user');
    const after = Math.floor(Date.now() / 1000);

    expect(await isAccessTokenRevokedForUser('revoke-ts-user', before - 10)).toBe(true);
    expect(await isAccessTokenRevokedForUser('revoke-ts-user', after + 10)).toBe(false);
  });

  it('should revoke all sessions and set revoked_at', async () => {
    vi.resetModules();
    const { generateRefreshToken, refreshAccessToken, revokeAllUserSessions } =
      await import('../../../packages/backend/src/middleware/jwtAuth.js');

    const rt = await generateRefreshToken('redis-revoke-all', 'admin');
    await revokeAllUserSessions('redis-revoke-all');

    const result = await refreshAccessToken(rt);
    expect(result).toBeNull();

    expect(redisMocks.store.has('user_revoked:redis-revoke-all')).toBe(true);
  });

  it('should throw RedisUnavailableError when Redis smembers fails (ADR-045)', async () => {
    vi.resetModules();
    const { generateRefreshToken, revokeAllUserSessions } =
      await import('../../../packages/backend/src/middleware/jwtAuth.js');
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
      await import('../../../packages/backend/src/middleware/jwtAuth.js');

    await generateRefreshToken('redis-cleanup', 'admin');
    await revokeAllUserSessions('redis-cleanup');

    const familiesKey = [...redisMocks.sets.keys()].find((k) => k.includes('redis-cleanup'));
    if (familiesKey) {
      expect(redisMocks.store.has(familiesKey)).toBe(false);
    }
  });
});
describe('isUserSessionValid', () => {
  beforeEach(setupDefaults);

  it('should return true for system user IDs', async () => {
    vi.resetModules();
    const { isUserSessionValid } =
      await import('../../../packages/backend/src/middleware/jwtAuth.js');

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
      await import('../../../packages/backend/src/middleware/jwtAuth.js');

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
      await import('../../../packages/backend/src/middleware/jwtAuth.js');

    expect(await isUserSessionValid('inactive-user')).toBe(false);
  });

  it('should return false when getUserById throws', async () => {
    vi.mocked(getUserById).mockRejectedValue(new Error('DB error'));

    vi.resetModules();
    const { isUserSessionValid } =
      await import('../../../packages/backend/src/middleware/jwtAuth.js');

    expect(await isUserSessionValid('error-user')).toBe(false);
  });

  it('should return false when getUserById returns null', async () => {
    vi.mocked(getUserById).mockResolvedValue(null);

    vi.resetModules();
    const { isUserSessionValid } =
      await import('../../../packages/backend/src/middleware/jwtAuth.js');

    expect(await isUserSessionValid('nonexistent-user')).toBe(false);
  });
});

describe('isAccessTokenRevokedForUser', () => {
  beforeEach(setupDefaults);

  it('should return false when no revocation recorded', async () => {
    vi.resetModules();
    const { isAccessTokenRevokedForUser } =
      await import('../../../packages/backend/src/middleware/jwtAuth.js');

    expect(await isAccessTokenRevokedForUser('unrevoked-user', 1000)).toBe(false);
  });

  it('should return true when token iat is before revocation time', async () => {
    vi.resetModules();
    const { revokeAllUserSessions, isAccessTokenRevokedForUser } =
      await import('../../../packages/backend/src/middleware/jwtAuth.js');

    await revokeAllUserSessions('revoked-check-user');
    expect(await isAccessTokenRevokedForUser('revoked-check-user', 1)).toBe(true);
  });

  it('should return false when token iat is after revocation time', async () => {
    vi.resetModules();
    const { revokeAllUserSessions, isAccessTokenRevokedForUser } =
      await import('../../../packages/backend/src/middleware/jwtAuth.js');

    await revokeAllUserSessions('revoked-after-user');
    const futureIat = Math.floor(Date.now() / 1000) + 3600;
    expect(await isAccessTokenRevokedForUser('revoked-after-user', futureIat)).toBe(false);
  });

  it('should invoke Redis get when checking revocation', async () => {
    vi.resetModules();
    const { revokeAllUserSessions, isAccessTokenRevokedForUser } =
      await import('../../../packages/backend/src/middleware/jwtAuth.js');

    await revokeAllUserSessions('redis-revoked-user');
    expect(await isAccessTokenRevokedForUser('redis-revoked-user', 1)).toBe(true);
    expect(redisMocks.get).toHaveBeenCalled();
  });

  it('should throw RedisUnavailableError when Redis get fails (ADR-045)', async () => {
    vi.resetModules();
    const { revokeAllUserSessions, isAccessTokenRevokedForUser } =
      await import('../../../packages/backend/src/middleware/jwtAuth.js');
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
  beforeEach(setupDefaults);

  it.each([
    { name: 'reused token after rotation revokes entire family', userId: 'attack-user' },
    { name: 'reuse after successful refresh revokes entire family', userId: 'family-reuse-user' },
  ])('$name', async ({ userId }) => {
    vi.resetModules();
    const { generateRefreshToken, refreshAccessToken } =
      await import('../../../packages/backend/src/middleware/jwtAuth.js');

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
  beforeEach(setupDefaults);

  it('should handle empty userId in isUserSessionValid', async () => {
    vi.resetModules();
    const { isUserSessionValid } =
      await import('../../../packages/backend/src/middleware/jwtAuth.js');

    vi.mocked(getUserById).mockRejectedValue(new Error('empty id'));
    expect(await isUserSessionValid('')).toBe(false);
  });

  it('isAccessTokenRevokedForUser should handle non-finite revokedAt', async () => {
    vi.resetModules();
    const { isAccessTokenRevokedForUser } =
      await import('../../../packages/backend/src/middleware/jwtAuth.js');

    expect(await isAccessTokenRevokedForUser('unknown-user', 100)).toBe(false);
  });

  it('generateRefreshToken should handle undefined tenant gracefully', async () => {
    vi.resetModules();
    const { generateRefreshToken } =
      await import('../../../packages/backend/src/middleware/jwtAuth.js');

    const token = await generateRefreshToken('no-tenant-user', 'readonly');
    expect(token).toBeTruthy();
  });

  it('refreshAccessToken should return null for revoked family', async () => {
    vi.resetModules();
    const { generateRefreshToken, refreshAccessToken } =
      await import('../../../packages/backend/src/middleware/jwtAuth.js');

    const rt = await generateRefreshToken('revoked-family', 'admin');
    await refreshAccessToken(rt);
    const reuse = await refreshAccessToken(rt);
    expect(reuse).toBeNull();
  });
});