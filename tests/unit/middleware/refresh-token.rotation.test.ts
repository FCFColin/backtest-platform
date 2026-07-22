/**
 * Refresh Token 单元测试 - Rotation 职责
 *
 * 覆盖：token 签发、Redis 存储、TTL、family 绑定、租户上下文、内存降级、
 * Redis 模式轮换、复用检测、过期、family 吊销。
 * 企业理由：refresh token 签发是会话安全起点，须保证 token 唯一、可审计、
 * 在 Redis 故障时降级到内存模式；Redis 模式须保证轮换原子性、复用检测可靠。
 *
 * 合并自 refresh-token.rotation.part1/2/3.test.ts（Task 2.5 机械切分合并）。
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

// =====================
// generateRefreshToken
// =====================

describe('refreshToken rotation - generateRefreshToken', () => {
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

// =====================
// refreshAccessToken (memory mode)
// =====================

describe('refreshToken rotation - refreshAccessToken (memory mode)', () => {
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

// =====================
// refreshAccessToken (Redis mode)
// =====================

describe('refreshToken rotation - refreshAccessToken (Redis mode)', () => {
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
