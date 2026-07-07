import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLoggerMocks } from '../../helpers/mockFactories.js';

const mocks = vi.hoisted(() => ({
  config: {
    NODE_ENV: 'production' as string,
    JWT_SECRET: 'test-jwt-secret-for-unit-tests',
    JWT_ACCESS_TTL: 900,
    JWT_REFRESH_TTL: 604800,
    ADMIN_API_KEY: '',
    JWT_ALGORITHM: 'HS256' as 'RS256' | 'HS256',
    JWT_PRIVATE_KEY: '',
    JWT_PRIVATE_KEY_FILE: '',
    JWT_PUBLIC_KEY: '',
    JWT_PUBLIC_KEY_FILE: '',
    DEV_SKIP_AUTH: false,
  },
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: mocks.config,
  validateConfig: vi.fn(),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

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
    resetStore: () => {
      store.clear();
      sets.clear();
    },
    useMemoryFallback: () => {
      redisMocks.resetStore();
      redisMocks.ping.mockRejectedValue(new Error('Redis not available in test'));
      redisMocks.get.mockRejectedValue(new Error('Redis not available in test'));
      redisMocks.set.mockRejectedValue(new Error('Redis not available in test'));
      redisMocks.del.mockRejectedValue(new Error('Redis not available in test'));
      redisMocks.sadd.mockRejectedValue(new Error('Redis not available in test'));
      redisMocks.smembers.mockRejectedValue(new Error('Redis not available in test'));
      redisMocks.expire.mockRejectedValue(new Error('Redis not available in test'));
    },
    useRedisSuccess: () => {
      redisMocks.resetStore();
      redisMocks.ping.mockResolvedValue('PONG');
      redisMocks.get.mockImplementation((key: string) =>
        Promise.resolve(redisMocks.store.get(key) ?? null),
      );
      redisMocks.set.mockImplementation((key: string, value: string) => {
        redisMocks.store.set(key, value);
        return Promise.resolve('OK');
      });
      redisMocks.del.mockImplementation((key: string) => {
        redisMocks.store.delete(key);
        return Promise.resolve(1);
      });
      redisMocks.sadd.mockImplementation((key: string, member: string) => {
        const set = redisMocks.sets.get(key) ?? new Set<string>();
        set.add(member);
        redisMocks.sets.set(key, set);
        return Promise.resolve(1);
      });
      redisMocks.smembers.mockImplementation((key: string) =>
        Promise.resolve([...(redisMocks.sets.get(key) ?? [])]),
      );
      redisMocks.expire.mockResolvedValue(1);
    },
  };
});

vi.mock('../../../packages/backend/src/config/redis.js', () => ({
  redisConnection: {},
  appRedis: redisMocks,
}));

vi.mock('../../../packages/backend/src/services/userService.js', () => ({
  getUserById: vi.fn().mockImplementation(async (id: string) => ({
    id,
    username: 'test-user',
    role: 'analyst' as const,
    isActive: true,
    createdAt: new Date(),
  })),
}));

const apiKeyMocks = vi.hoisted(() => ({
  verifyApiKey: vi.fn(async () => null),
}));
vi.mock('../../../packages/backend/src/services/apiKeyService.js', () => ({
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
import { getUserById } from '../../../packages/backend/src/services/userService.js';
import { createMockRequest, createMockResponse, createMockNext } from './jwt-auth.helpers.js';

describe('jwtAuth 中间件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useMemoryFallback();
    mocks.config.NODE_ENV = 'production';
    mocks.config.JWT_SECRET = 'test-jwt-secret-for-unit-tests';
    mocks.config.ADMIN_API_KEY = '';
    mocks.config.JWT_ALGORITHM = 'HS256';
  });

  it('按组织 DB API Key 认证成功应注入 analyst 角色与 tenant_id（ADR-033）', async () => {
    apiKeyMocks.verifyApiKey.mockResolvedValueOnce({
      orgId: '11111111-1111-1111-1111-111111111111',
      keyId: '22222222-2222-2222-2222-222222222222',
    } as Record<string, unknown>);
    const req = createMockRequest({
      headers: { 'x-api-key': 'bpk_live_someplaintextkey' },
    } as Record<string, unknown>);
    const res = createMockResponse();
    const next = createMockNext();

    await new Promise<void>((resolve) => {
      jwtAuth(req, res, () => {
        next();
        resolve();
      });
    });

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
    const req = createMockRequest({
      headers: { 'x-api-key': 'test-api-key-12345' },
    } as Record<string, unknown>);
    const res = createMockResponse();
    const next = createMockNext();

    await new Promise<void>((resolve) => {
      jwtAuth(req, res, () => {
        next();
        resolve();
      });
    });

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user!.role).toBe('admin');
    expect(req.user!.platform_admin).toBe(true);
  });

  it('DEV_SKIP_AUTH=true 时应注入 readonly 用户（T-32）', () => {
    mocks.config.NODE_ENV = 'development';
    mocks.config.DEV_SKIP_AUTH = true;
    mocks.config.JWT_SECRET = 'dev-only-jwt-secret-change-in-production';
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

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
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    jwtAuth(req, res, next);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('Bearer Token 优先于 x-api-key', async () => {
    mocks.config.ADMIN_API_KEY = 'test-api-key-12345';
    const token = await generateToken('user-1', 'readonly');
    const req = createMockRequest({
      headers: {
        authorization: `Bearer ${token}`,
        'x-api-key': 'test-api-key-12345',
      },
    } as Record<string, unknown>);
    const res = createMockResponse();
    const next = createMockNext();

    await new Promise<void>((resolve) => {
      jwtAuth(req, res, () => {
        next();
        resolve();
      });
    });

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
    const req = createMockRequest({
      headers: { authorization: `Bearer ${token}` },
    } as Record<string, unknown>);
    const res = createMockResponse();
    const next = createMockNext();

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
    vi.clearAllMocks();
    redisMocks.useMemoryFallback();
    mocks.config.NODE_ENV = 'production';
    mocks.config.JWT_SECRET = 'test-jwt-secret-for-unit-tests';
    mocks.config.ADMIN_API_KEY = '';
    mocks.config.JWT_ALGORITHM = 'HS256';
  });

  async function jwtAuthWithToken(token: string): Promise<{
    req: ReturnType<typeof createMockRequest>;
    res: ReturnType<typeof createMockResponse>;
    next: ReturnType<typeof createMockNext>;
  }> {
    const req = createMockRequest({
      headers: { authorization: `Bearer ${token}` },
    } as Record<string, unknown>);
    const res = createMockResponse();
    const next = createMockNext();

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
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_TOKEN' }));
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
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'ACCOUNT_DISABLED' }));
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
