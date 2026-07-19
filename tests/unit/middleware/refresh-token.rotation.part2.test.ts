/**
 * Refresh Token 单元测试 - Rotation 职责（拆分 part2：refreshAccessToken memory mode）
 *
 * 覆盖：内存模式下的轮换、复用检测、过期、禁用用户、租户传递。
 * 企业理由：内存模式是 Redis 故障时的降级路径，须保证安全语义一致。
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
