/**
 * Refresh Token 单元测试 - Rotation 职责（拆分 part3：refreshAccessToken Redis mode）
 *
 * 覆盖：Redis 模式下的轮换、复用检测、过期、family 吊销、降级到内存。
 * 企业理由：Redis 是默认存储，须保证 token 轮换原子性、复用检测可靠、
 * 在 Redis 故障时降级到内存模式而不丢失安全语义。
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
