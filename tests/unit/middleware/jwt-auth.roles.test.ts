import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createLoggerMocks,
  createRedisMocks,
  createJwtAuthConfigMocks,
  type JwtAuthConfigMocks,
} from '../../helpers/mockFactories.js';
import { createJwtAuthUserRepoMock, setupJwtAuthTestMocks } from '../../helpers/jwtAuthSetup.js';

const mocks = vi.hoisted(() => ({ config: {} as JwtAuthConfigMocks }));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: Object.assign(mocks.config, createJwtAuthConfigMocks()),
  validateConfig: vi.fn(),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

const redisMocks = vi.hoisted(() => ({}) as Record<string, unknown>);

vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  redisConnection: {},
  appRedis: createRedisMocks(
    { withStore: true, withSets: true, withHandlers: true, withMemoryHelpers: true },
    redisMocks,
  ),
}));

vi.mock('../../../packages/backend/src/repositories/userRepo.js', () => ({
  getUserById: createJwtAuthUserRepoMock(),
}));

const apiKeyMocks = vi.hoisted(() => ({
  verifyApiKey: vi.fn(async () => null),
}));
vi.mock('../../../packages/backend/src/infrastructure/apiKeyVerifier.js', () => ({
  verifyApiKey: apiKeyMocks.verifyApiKey,
}));

redisMocks.useMemoryFallback();

import {
  generateToken,
  verifyToken,
  generateRefreshToken,
  refreshAccessToken,
  revokeRefreshToken,
  revokeAllUserSessions,
  jwtAuth,
} from '../../../packages/backend/src/middleware/jwtAuth.js';
import { getUserById } from '../../../packages/backend/src/repositories/userRepo.js';
import {
  createJwtAuthMockRequest,
  createJwtAuthMockResponse,
  createJwtAuthMockNext,
  awaitMiddleware,
} from '../../helpers/expressMocks.js';

describe('jwtAuth 中间件', () => {
  beforeEach(() => {
    setupJwtAuthTestMocks(mocks, redisMocks);
  });

  it('按组织 DB API Key 认证成功应注入 analyst 角色与 tenant_id（ADR-033）', async () => {
    apiKeyMocks.verifyApiKey.mockResolvedValueOnce({
      orgId: '11111111-1111-1111-1111-111111111111',
      keyId: '22222222-2222-2222-2222-222222222222',
    } as Record<string, unknown>);
    const req = createJwtAuthMockRequest({
      headers: { 'x-api-key': 'bpk_live_someplaintextkey' },
    } as Record<string, unknown>);
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

    await awaitMiddleware(jwtAuth, req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user!.role).toBe('analyst');
    expect(req.user!.tenant_id).toBe('11111111-1111-1111-1111-111111111111');
    expect(req.user!.org_role).toBe('analyst');
    expect(req.user!.sub).toBe('apikey:22222222-2222-2222-2222-222222222222');
  });

  it('破窗 ADMIN_API_KEY 应注入 platform_admin（ADR-033）', async () => {
    apiKeyMocks.verifyApiKey.mockResolvedValueOnce(null);
    mocks.config.ADMIN_API_KEY = 'test-api-key-12345';
    const req = createJwtAuthMockRequest({
      headers: { 'x-api-key': 'test-api-key-12345' },
    } as Record<string, unknown>);
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

    await awaitMiddleware(jwtAuth, req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user!.role).toBe('admin');
    expect(req.user!.platform_admin).toBe(true);
  });

  it('DEV_SKIP_AUTH=true 时应注入 readonly 用户（T-32）', () => {
    mocks.config.NODE_ENV = 'development';
    mocks.config.DEV_SKIP_AUTH = true;
    mocks.config.JWT_SECRET = 'dev-only-jwt-secret-change-in-production';
    const req = createJwtAuthMockRequest();
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

    jwtAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user!.role).toBe('readonly');
    expect(req.user!.sub).toBe('dev-user');
  });

  it('DEV_SKIP_AUTH=false 时开发环境不自动跳过认证', async () => {
    mocks.config.NODE_ENV = 'development';
    mocks.config.DEV_SKIP_AUTH = false;
    mocks.config.JWT_SECRET = 'dev-only-jwt-secret-change-in-production';
    const req = createJwtAuthMockRequest();
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

    jwtAuth(req, res, next);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('Bearer Token 优先于 x-api-key', async () => {
    mocks.config.ADMIN_API_KEY = 'test-api-key-12345';
    const token = await generateToken('user-1', 'readonly');
    const req = createJwtAuthMockRequest({
      headers: {
        authorization: `Bearer ${token}`,
        'x-api-key': 'test-api-key-12345',
      },
    } as Record<string, unknown>);
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

    await awaitMiddleware(jwtAuth, req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user!.role).toBe('readonly');
    expect(req.user!.sub).toBe('user-1');
  });
});

describe('revokeAllUserSessions 与停用用户', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserById).mockImplementation(async (id: string) => ({
      id,
      username: 'test-user',
      role: 'admin' as const,
      createdAt: new Date(),
      isActive: true,
    }));
  });

  it('内存模式撤销后 refresh 应失败', async () => {
    redisMocks.useMemoryFallback();
    const refreshToken = await generateRefreshToken('user-revoke', 'admin');
    await revokeAllUserSessions('user-revoke');
    const result = await refreshAccessToken(refreshToken);
    expect(result).toBeNull();
  });

  it('内存模式撤销后 access token 应验证失败', async () => {
    redisMocks.useMemoryFallback();
    const accessToken = await generateToken('user-revoke', 'admin');
    await revokeAllUserSessions('user-revoke');
    const payload = await verifyToken(accessToken);
    expect(payload).toBeNull();
  });

  it('Redis 模式应撤销用户全部 family', async () => {
    redisMocks.useRedisSuccess();
    const refreshToken = await generateRefreshToken('user-redis-revoke', 'analyst');
    await revokeAllUserSessions('user-redis-revoke');
    const result = await refreshAccessToken(refreshToken);
    expect(result).toBeNull();
    expect(redisMocks.store.has(`user_revoked:user-redis-revoke`)).toBe(true);
  });

  it('已停用用户 jwtAuth 应返回 401', async () => {
    redisMocks.useMemoryFallback();
    mocks.config.NODE_ENV = 'production';
    vi.mocked(getUserById).mockResolvedValueOnce({
      id: 'disabled-user',
      username: 'disabled',
      role: 'readonly',
      createdAt: new Date(),
      isActive: false,
    });

    const token = await generateToken('disabled-user', 'readonly');
    const req = createJwtAuthMockRequest({
      headers: { authorization: `Bearer ${token}` },
    } as Record<string, unknown>);
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

    await new Promise<void>((resolve) => {
      const originalJson = res.json.bind(res);
      res.json = vi.fn((...args: unknown[]) => {
        originalJson(...args);
        resolve();
        return res;
      }) as typeof res.json;
      jwtAuth(req, res, next);
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.header).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
  });

  it('已停用用户 refresh 应被拒绝', async () => {
    redisMocks.useMemoryFallback();
    vi.mocked(getUserById).mockResolvedValue({
      id: 'disabled-user',
      username: 'disabled',
      role: 'readonly',
      createdAt: new Date(),
      isActive: false,
    });
    const refreshToken = await generateRefreshToken('disabled-user', 'readonly');
    const result = await refreshAccessToken(refreshToken);
    expect(result).toBeNull();
  });

  it('Redis 过期 refresh token 应返回 null', async () => {
    redisMocks.useRedisSuccess();
    const refreshToken = await generateRefreshToken('expired-user', 'admin');
    const key = `refresh_token:${refreshToken}`;
    const raw = redisMocks.store.get(key)!;
    const entry = JSON.parse(raw);
    entry.expiresAt = Math.floor(Date.now() / 1000) - 10;
    redisMocks.store.set(key, JSON.stringify(entry));

    const result = await refreshAccessToken(refreshToken);
    expect(result).toBeNull();
    expect(redisMocks.store.has(key)).toBe(false);
  });

  it('getUserById 异常时应拒绝 refresh', async () => {
    redisMocks.useMemoryFallback();
    const refreshToken = await generateRefreshToken('user-db-fail', 'admin');
    vi.mocked(getUserById).mockRejectedValueOnce(new Error('database unavailable'));
    const result = await refreshAccessToken(refreshToken);
    expect(result).toBeNull();
  });

  it('Redis 撤销异常应回退到内存', async () => {
    redisMocks.useRedisSuccess();
    const token = await generateRefreshToken('user-revoke-err', 'admin');
    redisMocks.get.mockRejectedValueOnce(new Error('redis read failed'));
    await expect(revokeRefreshToken(token)).resolves.toBeUndefined();
  });
});

describe('jwtAuth 会话撤销与账户停用', () => {
  beforeEach(() => {
    setupJwtAuthTestMocks(mocks, redisMocks);
  });

  async function jwtAuthWithToken(token: string): Promise<{
    req: ReturnType<typeof createJwtAuthMockRequest>;
    res: ReturnType<typeof createJwtAuthMockResponse>;
    next: ReturnType<typeof createJwtAuthMockNext>;
  }> {
    const req = createJwtAuthMockRequest({
      headers: { authorization: `Bearer ${token}` },
    } as Record<string, unknown>);
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

    await new Promise<void>((resolve) => {
      const originalJson = res.json.bind(res);
      res.json = vi.fn((...args: unknown[]) => {
        originalJson(...args);
        resolve();
        return res;
      }) as typeof res.json;
      jwtAuth(req, res, next);
    });

    return { req, res, next };
  }

  it('全局会话撤销后 jwtAuth 应拒绝访问（verifyJwt 层返回 INVALID_TOKEN）', async () => {
    const token = await generateToken('user-revoked-jwt', 'admin');
    await revokeAllUserSessions('user-revoked-jwt');

    const { res, next } = await jwtAuthWithToken(token);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'INVALID_TOKEN' }),
      }),
    );
  });

  it('已停用用户 jwtAuth 应返回 ACCOUNT_DISABLED', async () => {
    vi.mocked(getUserById).mockResolvedValue({
      id: 'disabled-jwt-user',
      username: 'disabled',
      role: 'readonly',
      createdAt: new Date(),
      isActive: false,
    });
    const token = await generateToken('disabled-jwt-user', 'readonly');

    const { res, next } = await jwtAuthWithToken(token);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'ACCOUNT_DISABLED' }),
      }),
    );
  });
});

describe('jwtAuth Redis 边界与 PEM 路径', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config.NODE_ENV = 'production';
    mocks.config.JWT_SECRET = 'test-jwt-secret-for-unit-tests';
    mocks.config.JWT_ALGORITHM = 'HS256';
    vi.mocked(getUserById).mockImplementation(async (id: string) => ({
      id,
      username: 'test-user',
      role: 'admin' as const,
      createdAt: new Date(),
      isActive: true,
    }));
  });

  it('Redis 模式下停用用户 refresh 应删除 token 并返回 null', async () => {
    redisMocks.useRedisSuccess();
    const refreshToken = await generateRefreshToken('disabled-redis-refresh', 'admin');
    vi.mocked(getUserById).mockResolvedValueOnce({
      id: 'disabled-redis-refresh',
      username: 'disabled',
      role: 'readonly',
      createdAt: new Date(),
      isActive: false,
    });

    const result = await refreshAccessToken(refreshToken);
    expect(result).toBeNull();
    expect(redisMocks.del).toHaveBeenCalled();
  });

  it('revokeRefreshToken 应撤销 Redis 中已使用的 token 家族', async () => {
    redisMocks.useRedisSuccess();
    const refreshToken = await generateRefreshToken('revoke-used-user', 'admin');
    await refreshAccessToken(refreshToken);

    await revokeRefreshToken(refreshToken);

    const usedKey = `refresh_token:used:${refreshToken}`;
    const familyRaw = [...redisMocks.store.entries()].find(([k]) => k.startsWith('token_family:'));
    expect(redisMocks.store.has(usedKey)).toBe(false);
    if (familyRaw) {
      expect(JSON.parse(familyRaw[1]).revoked).toBe(true);
    }
  });

  it('revokeAllUserSessions Redis 异常应回退内存', async () => {
    redisMocks.useRedisSuccess();
    await generateRefreshToken('revoke-fallback-user', 'admin');
    redisMocks.smembers.mockRejectedValueOnce(new Error('smembers failed'));

    await expect(revokeAllUserSessions('revoke-fallback-user')).resolves.toBeUndefined();
  });
});
