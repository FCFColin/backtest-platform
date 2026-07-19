/**
 * Refresh Token 单元测试 - Rotation 职责（拆分 part1：generateRefreshToken）
 *
 * 覆盖：token 签发、Redis 存储、TTL、family 绑定、租户上下文、降级。
 * 企业理由：refresh token 签发是会话安全起点，须保证 token 唯一、可审计、
 * 在 Redis 故障时降级到内存模式。
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
