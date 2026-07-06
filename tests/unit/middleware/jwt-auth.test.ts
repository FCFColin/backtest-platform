/**
 * JWT 认证中间件单元测试
 *
 * 企业理由：JWT 签发/验证/刷新/吊销是认证核心，任何 bug 都会导致
 * 认证绕过或合法用户被拒。Table-Driven 测试覆盖所有边界条件。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import { SignJWT, importJWK, generateKeyPair } from 'jose';
import { createLoggerMocks } from '../../helpers/mockFactories.js';

// Helper: base64url 编码（与 jwtAuth.ts 中实现一致，用于构造 HS256 测试密钥）
function base64urlEncode(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// vi.hoisted 确保 mock 变量在 vi.mock 提升前完成初始化
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

// Mock appRedis：默认回退内存；Redis 成功路径测试可切换 ping/get/set/del
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

// apiKeyService：默认所有 DB 密钥校验失败（返回 null），具体用例可覆盖 verifyApiKey
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
  optionalJwtAuth,
  type AuthenticatedRequest,
} from '../../../packages/backend/src/middleware/jwtAuth.js';
import { getUserById } from '../../../packages/backend/src/services/userService.js';

// jwtAuth 模块加载时注册的 Redis 事件处理器（beforeEach clearAllMocks 会清空 mock.calls）
const capturedRedisHandlers = (() => {
  const ready = redisMocks.on.mock.calls.find(([ev]) => ev === 'ready')?.[1] as
    (() => void) | undefined;
  const error = redisMocks.on.mock.calls.find(([ev]) => ev === 'error')?.[1] as
    (() => void) | undefined;
  return { ready, error };
})();

// Helper: create mock request
function createMockRequest(overrides: Record<string, unknown> = {}): AuthenticatedRequest {
  return {
    headers: {},
    path: '/test',
    method: 'GET',
    ...overrides,
  } as unknown as AuthenticatedRequest;
}

// Helper: create mock response
function createMockResponse(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

// Helper: create mock next
function createMockNext(): NextFunction {
  return vi.fn() as NextFunction;
}

describe('JWT Token 生成与验证', () => {
  const roles = ['admin', 'analyst', 'readonly'] as const;

  it.each(roles)('应为 %s 角色生成有效 token', async (role) => {
    const token = await generateToken('user-1', role);
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // JWT 三段结构
  });

  it.each(roles)('验证 %s 角色 token 应返回正确 payload', async (role) => {
    const token = await generateToken('user-1', role);
    const payload = await verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('user-1');
    expect(payload!.role).toBe(role);
  });

  it('篡改 token 应验证失败', async () => {
    const token = await generateToken('user-1', 'admin');
    const tampered = token.slice(0, -5) + 'XXXXX';
    expect(await verifyToken(tampered)).toBeNull();
  });

  it('空 token 应验证失败', async () => {
    expect(await verifyToken('')).toBeNull();
  });

  it('非 JWT 格式应验证失败', async () => {
    expect(await verifyToken('not-a-jwt')).toBeNull();
  });

  it('alg=none 攻击应被拒绝', async () => {
    // 模拟 alg=none 攻击：构造 header.alg=none 的 JWT
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'hacker', role: 'admin', iat: 0, exp: 9999999999 }),
    ).toString('base64url');
    const attackToken = `${header}.${payload}.`;
    expect(await verifyToken(attackToken)).toBeNull();
  });

  it('签名不匹配应验证失败', async () => {
    const token = await generateToken('user-1', 'admin');
    const parts = token.split('.');
    // 篡改 payload 部分
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: 'hacker', role: 'admin', iat: 0, exp: 9999999999 }),
    ).toString('base64url');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    expect(await verifyToken(tamperedToken)).toBeNull();
  });
});

describe('Refresh Token 生命周期', () => {
  beforeEach(() => {
    redisMocks.useMemoryFallback();
  });

  it('生成 refresh token 后应可刷新', async () => {
    const refreshToken = await generateRefreshToken('user-1', 'admin');
    const result = await refreshAccessToken(refreshToken);
    expect(result).not.toBeNull();
    expect(result!.accessToken).toBeTruthy();
    expect(result!.refreshToken).toBeTruthy();
  });

  it('刷新后旧 token 应失效（轮换机制）', async () => {
    const refreshToken = await generateRefreshToken('user-1', 'admin');
    const result1 = await refreshAccessToken(refreshToken);
    expect(result1).not.toBeNull();
    // 旧 token 再次使用应失败
    const result2 = await refreshAccessToken(refreshToken);
    expect(result2).toBeNull();
  });

  it('新 refresh token 应可继续刷新', async () => {
    const refreshToken = await generateRefreshToken('user-1', 'analyst');
    const result1 = await refreshAccessToken(refreshToken);
    expect(result1).not.toBeNull();
    // 使用新 token 刷新
    const result2 = await refreshAccessToken(result1!.refreshToken);
    expect(result2).not.toBeNull();
  });

  it('吊销后 refresh token 应失效', async () => {
    const refreshToken = await generateRefreshToken('user-1', 'admin');
    await revokeRefreshToken(refreshToken);
    const result = await refreshAccessToken(refreshToken);
    expect(result).toBeNull();
  });

  it('不存在的 refresh token 应返回 null', async () => {
    const result = await refreshAccessToken('nonexistent-token');
    expect(result).toBeNull();
  });

  it('刷新返回的 access token 应可验证', async () => {
    const refreshToken = await generateRefreshToken('user-1', 'analyst');
    const result = await refreshAccessToken(refreshToken);
    expect(result).not.toBeNull();
    const payload = await verifyToken(result!.accessToken);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('user-1');
    expect(payload!.role).toBe('analyst');
  });

  it('Token Family 复用检测：旧 token 被复用时应撤销整个家族', async () => {
    const refreshToken = await generateRefreshToken('user-1', 'admin');
    // 正常刷新，获取新 token
    const result1 = await refreshAccessToken(refreshToken);
    expect(result1).not.toBeNull();
    // 旧 token 被复用 → 应返回 null（复用检测触发）
    const result2 = await refreshAccessToken(refreshToken);
    expect(result2).toBeNull();
    // 新 token 也应失效（整个家族被撤销）
    const result3 = await refreshAccessToken(result1!.refreshToken);
    expect(result3).toBeNull();
  });
});

describe('jwtAuth 中间件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useMemoryFallback();
    // 默认生产环境配置，避免开发环境跳过认证
    mocks.config.NODE_ENV = 'production';
    mocks.config.JWT_SECRET = 'test-jwt-secret-for-unit-tests';
    mocks.config.ADMIN_API_KEY = '';
    mocks.config.JWT_ALGORITHM = 'HS256';
  });

  it('Bearer Token 认证成功应调用 next', async () => {
    const token = await generateToken('user-1', 'admin');
    const req = createMockRequest({
      headers: { authorization: `Bearer ${token}` },
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
    expect(req.user!.sub).toBe('user-1');
  });

  it('无效 Bearer Token 应返回 401', async () => {
    const req = createMockRequest({
      headers: { authorization: 'Bearer invalid-token' },
    } as Record<string, unknown>);
    const res = createMockResponse();
    const next = createMockNext();

    // jwtAuth is async internally, wait for it to complete
    await new Promise<void>((resolve) => {
      const originalJson = res.json.bind(res);
      res.json = vi.fn((...args: unknown[]) => {
        originalJson(...args);
        resolve();
        return res;
      });
      jwtAuth(req, res, next);
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
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
    expect(req.user!.role).toBe('analyst'); // 关键：DB key 注入 analyst 而非 admin
    expect(req.user!.tenant_id).toBe('11111111-1111-1111-1111-111111111111');
    expect(req.user!.org_role).toBe('analyst');
    expect(req.user!.sub).toBe('apikey:22222222-2222-2222-2222-222222222222');
  });

  it('破窗 ADMIN_API_KEY 应注入 platform_admin（ADR-033）', async () => {
    apiKeyMocks.verifyApiKey.mockResolvedValueOnce(null as unknown as never);
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

  it('无效 x-api-key 应返回 401', async () => {
    apiKeyMocks.verifyApiKey.mockResolvedValueOnce(null as unknown as never);
    mocks.config.ADMIN_API_KEY = 'test-api-key-12345';
    const req = createMockRequest({
      headers: { 'x-api-key': 'wrong-key' },
    } as Record<string, unknown>);
    const res = createMockResponse();
    const next = createMockNext();

    jwtAuth(req, res, next);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('无认证凭证应返回 401', () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    jwtAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
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

  it('超长 x-api-key 应返回 401（防缓冲区攻击）', async () => {
    apiKeyMocks.verifyApiKey.mockResolvedValueOnce(null as unknown as never);
    mocks.config.ADMIN_API_KEY = 'test-api-key-12345';
    const req = createMockRequest({
      headers: { 'x-api-key': 'a'.repeat(129) },
    } as Record<string, unknown>);
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
    // Bearer Token 优先，角色应为 token 中的 readonly 而非 api-key 的 analyst
    expect(req.user!.role).toBe('readonly');
    expect(req.user!.sub).toBe('user-1');
  });
});

describe('Refresh Token Redis 成功路径', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useRedisSuccess();
  });

  it('generateRefreshToken 应写入 Redis 并返回 token', async () => {
    const token = await generateRefreshToken('user-redis', 'admin');
    expect(token).toBeTruthy();
    expect(redisMocks.set).toHaveBeenCalled();
    expect(redisMocks.store.has(`refresh_token:${token}`)).toBe(true);
  });

  it('refreshAccessToken 应通过 Redis 轮换 token', async () => {
    const refreshToken = await generateRefreshToken('user-redis', 'analyst');
    const result = await refreshAccessToken(refreshToken);
    expect(result).not.toBeNull();
    expect(result!.accessToken).toBeTruthy();
    expect(result!.refreshToken).not.toBe(refreshToken);
    expect(redisMocks.store.has(`refresh_token:${refreshToken}`)).toBe(false);
    expect(redisMocks.store.has(`refresh_token:used:${refreshToken}`)).toBe(true);
  });

  it('revokeRefreshToken 应撤销 Redis 中的 family', async () => {
    const refreshToken = await generateRefreshToken('user-redis', 'readonly');
    const raw = redisMocks.store.get(`refresh_token:${refreshToken}`);
    expect(raw).toBeTruthy();
    const entry = JSON.parse(raw!);

    await revokeRefreshToken(refreshToken);

    const familyRaw = redisMocks.store.get(`token_family:${entry.familyId}`);
    expect(familyRaw).toBeTruthy();
    expect(JSON.parse(familyRaw!).revoked).toBe(true);
    expect(redisMocks.store.has(`refresh_token:${refreshToken}`)).toBe(false);
  });

  it('revokeAllUserSessions 应撤销 Redis 中用户的全部 family', async () => {
    const refreshToken = await generateRefreshToken('user-redis', 'admin');
    const raw = redisMocks.store.get(`refresh_token:${refreshToken}`);
    const entry = JSON.parse(raw!);

    await revokeAllUserSessions('user-redis');

    const familyRaw = redisMocks.store.get(`token_family:${entry.familyId}`);
    expect(familyRaw).toBeTruthy();
    expect(JSON.parse(familyRaw!).revoked).toBe(true);
    expect(redisMocks.store.has(`refresh_token:${refreshToken}`)).toBe(false);
    expect(redisMocks.store.has(`user_revoked:user-redis`)).toBe(true);
  });

  it('Token Family 复用攻击：Redis 模式下旧 token 复用应撤销整个家族', async () => {
    const refreshToken = await generateRefreshToken('user-redis', 'admin');
    const result1 = await refreshAccessToken(refreshToken);
    expect(result1).not.toBeNull();

    const reuse = await refreshAccessToken(refreshToken);
    expect(reuse).toBeNull();

    const afterFamilyRevoke = await refreshAccessToken(result1!.refreshToken);
    expect(afterFamilyRevoke).toBeNull();
  });

  it('Redis set 失败时应回退到内存并仍可刷新', async () => {
    redisMocks.ping.mockResolvedValue('PONG');
    redisMocks.set.mockRejectedValueOnce(new Error('Redis write failed'));
    redisMocks.get.mockImplementation((key: string) =>
      Promise.resolve(redisMocks.store.get(key) ?? null),
    );
    redisMocks.del.mockImplementation((key: string) => {
      redisMocks.store.delete(key);
      return Promise.resolve(1);
    });

    const refreshToken = await generateRefreshToken('user-fallback', 'admin');
    redisMocks.ping.mockRejectedValue(new Error('Redis down'));
    const result = await refreshAccessToken(refreshToken);
    expect(result).not.toBeNull();
  });
});

describe('jwtAuth 畸形 Authorization 头', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useMemoryFallback();
    mocks.config.NODE_ENV = 'production';
    mocks.config.JWT_SECRET = 'test-jwt-secret-for-unit-tests';
    mocks.config.ADMIN_API_KEY = '';
    mocks.config.JWT_ALGORITHM = 'HS256';
  });

  async function expectJwtAuth401(authHeader: string): Promise<void> {
    const req = createMockRequest({
      headers: { authorization: authHeader },
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
  }

  it('Bearer 后无 token 应返回 401', async () => {
    await expectJwtAuth401('Bearer ');
  });

  it('Bearer 仅空白应返回 401', async () => {
    await expectJwtAuth401('Bearer    ');
  });

  it('Basic 认证头应返回 401（缺少凭证）', async () => {
    const req = createMockRequest({
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    } as Record<string, unknown>);
    const res = createMockResponse();
    const next = createMockNext();

    jwtAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.header).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
  });

  it('无空格的 Bearer 前缀应返回 401', async () => {
    const req = createMockRequest({
      headers: { authorization: 'Bearertoken-without-space' },
    } as Record<string, unknown>);
    const res = createMockResponse();
    const next = createMockNext();

    jwtAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('并发 jwtAuth 调用应各自独立验证', async () => {
    const token = await generateToken('concurrent-user', 'analyst');
    const results = await Promise.all(
      Array.from({ length: 5 }, async () => {
        const req = createMockRequest({
          headers: { authorization: `Bearer ${token}` },
        } as Record<string, unknown>);
        const res = createMockResponse();
        const next = createMockNext();
        await new Promise<void>((resolve) => {
          jwtAuth(req, res, () => {
            next();
            resolve();
          });
        });
        return { req, next };
      }),
    );

    for (const { req, next } of results) {
      expect(next).toHaveBeenCalled();
      expect(req.user?.sub).toBe('concurrent-user');
    }
  });
});

describe('安全攻击用例', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useMemoryFallback();
    mocks.config.NODE_ENV = 'production';
    mocks.config.JWT_SECRET = 'test-jwt-secret-for-unit-tests';
    mocks.config.ADMIN_API_KEY = '';
    mocks.config.JWT_ALGORITHM = 'HS256';
  });

  it('过期的 token（exp 设为 1 小时前）应被拒绝（401）', async () => {
    const key = await importJWK(
      { kty: 'oct', k: base64urlEncode(mocks.config.JWT_SECRET) },
      'HS256',
    );
    const expiredToken = await new SignJWT({ sub: 'user-1', role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600) // 1 小时前过期
      .sign(key);

    // verifyToken 应返回 null（过期 token 被拒绝）
    const payload = await verifyToken(expiredToken);
    expect(payload).toBeNull();

    // 通过中间件验证应返回 401
    const req = createMockRequest({
      headers: { authorization: `Bearer ${expiredToken}` },
    } as Record<string, unknown>);
    const res = createMockResponse();
    const next = createMockNext();

    await new Promise<void>((resolve) => {
      const originalJson = res.json.bind(res);
      (res as unknown as { json: ReturnType<typeof vi.fn> }).json = vi.fn((...args: unknown[]) => {
        originalJson(...args);
        resolve();
        return res;
      });
      jwtAuth(req, res, next);
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('缺少 sub 声明的 token 应被拒绝（身份不可识别）', async () => {
    const key = await importJWK(
      { kty: 'oct', k: base64urlEncode(mocks.config.JWT_SECRET) },
      'HS256',
    );
    const tokenWithoutSub = await new SignJWT({ role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);

    // 安全要求：缺少 sub 的令牌身份无法识别，必须拒绝（不得放行 sub=undefined）
    expect(await verifyToken(tokenWithoutSub)).toBeNull();
  });

  it('空字符串 sub 应被拒绝', async () => {
    const key = await importJWK(
      { kty: 'oct', k: base64urlEncode(mocks.config.JWT_SECRET) },
      'HS256',
    );
    const tokenEmptySub = await new SignJWT({ sub: '', role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);

    expect(await verifyToken(tokenEmptySub)).toBeNull();
  });

  it('缺少 role 声明的 token 应被拒绝（RBAC 不可判定）', async () => {
    const key = await importJWK(
      { kty: 'oct', k: base64urlEncode(mocks.config.JWT_SECRET) },
      'HS256',
    );
    const tokenWithoutRole = await new SignJWT({ sub: 'user-1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);

    expect(await verifyToken(tokenWithoutRole)).toBeNull();
  });

  it('伪造的非法 role 应被拒绝（越权防护）', async () => {
    const key = await importJWK(
      { kty: 'oct', k: base64urlEncode(mocks.config.JWT_SECRET) },
      'HS256',
    );
    const tokenFakeRole = await new SignJWT({ sub: 'user-1', role: 'superadmin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);

    // 攻击者构造 role=superadmin 等不在白名单的角色，必须拒绝
    expect(await verifyToken(tokenFakeRole)).toBeNull();
  });

  it('缺少 exp 声明的 token 应被拒绝（永不过期 = 安全风险）', async () => {
    const key = await importJWK(
      { kty: 'oct', k: base64urlEncode(mocks.config.JWT_SECRET) },
      'HS256',
    );
    // 不调用 setExpirationTime，token 中无 exp 声明
    const tokenWithoutExp = await new SignJWT({ sub: 'user-1', role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .sign(key);

    // 无 exp 的令牌无法通过到期吊销，必须拒绝
    expect(await verifyToken(tokenWithoutExp)).toBeNull();
  });

  it('算法混淆攻击：RS256 签名的 token 不应通过 HS256 验证', async () => {
    // 生成独立的 RS256 密钥对（模拟攻击者或不同签发方）
    const { privateKey: rs256PrivateKey } = await generateKeyPair('RS256', { modulusLength: 2048 });
    const rs256Token = await new SignJWT({ sub: 'attacker', role: 'admin' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(rs256PrivateKey);

    // verifyToken 使用 HS256 配置（测试环境无 RS256 公钥）
    // RS256 路径失败（无公钥），HS256 路径也应失败（签名算法不匹配）
    const payload = await verifyToken(rs256Token);
    expect(payload).toBeNull();
  });

  it('JWT 炸弹：1MB payload 应在合理时间内完成验证且不崩溃', async () => {
    const key = await importJWK(
      { kty: 'oct', k: base64urlEncode(mocks.config.JWT_SECRET) },
      'HS256',
    );
    const hugeData = 'A'.repeat(1024 * 1024); // 1MB 数据
    const bombToken = await new SignJWT({ sub: 'user-1', role: 'admin', data: hugeData })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);

    const start = Date.now();
    const payload = await verifyToken(bombToken);
    const elapsed = Date.now() - start;

    // 签名合法且声明齐备，应被接受且 sub 正确（证明未因体积异常退化）
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('user-1');
    // 验证不应被超大 payload 拖入病态耗时（DoS 防护下限）
    expect(elapsed).toBeLessThan(2000);
  });

  it('Null 字节注入：sub 中的 \\0 应原样保留，不被截断或注入', async () => {
    const key = await importJWK(
      { kty: 'oct', k: base64urlEncode(mocks.config.JWT_SECRET) },
      'HS256',
    );
    const nullByteToken = await new SignJWT({ sub: 'user\0admin', role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);

    const payload = await verifyToken(nullByteToken);
    // 签名合法、声明齐备，应被接受
    expect(payload).not.toBeNull();
    // 关键：null 字节未导致 C 风格截断（sub 不应变成 'user'）
    expect(payload!.sub).toBe('user\0admin');
    expect(payload!.sub.length).toBe('user\0admin'.length);
  });
});

describe('optionalJwtAuth 中间件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useMemoryFallback();
    mocks.config.NODE_ENV = 'production';
    mocks.config.JWT_ALGORITHM = 'HS256';
    vi.mocked(getUserById).mockImplementation(async (id: string) => ({
      id,
      username: 'test-user',
      role: 'admin' as const,
      createdAt: new Date(),
      isActive: true,
    }));
  });

  it('有效 Bearer Token 应设置 req.user 并放行', async () => {
    const token = await generateToken('user-1', 'analyst');
    const req = createMockRequest({
      headers: { authorization: `Bearer ${token}` },
    } as Record<string, unknown>);
    const res = createMockResponse();
    const next = createMockNext();

    await new Promise<void>((resolve) => {
      optionalJwtAuth(req, res, () => {
        next();
        resolve();
      });
    });

    expect(next).toHaveBeenCalled();
    expect(req.user?.sub).toBe('user-1');
  });

  it('无效 Bearer Token 应置空 req.user 并放行', async () => {
    const req = createMockRequest({
      headers: { authorization: 'Bearer invalid' },
    } as Record<string, unknown>);
    const res = createMockResponse();
    const next = createMockNext();

    await new Promise<void>((resolve) => {
      optionalJwtAuth(req, res, () => {
        next();
        resolve();
      });
    });

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeNull();
  });

  it('无 Bearer Token 应匿名放行', () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    optionalJwtAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeNull();
  });

  it('应注入脱敏日志上下文', async () => {
    const token = await generateToken('user-1', 'readonly');
    const childFn = vi.fn(() => ({ info: vi.fn(), warn: vi.fn() }));
    const req = createMockRequest({
      headers: { authorization: `Bearer ${token}` },
      log: { child: childFn },
    } as Record<string, unknown>);
    const res = createMockResponse();
    const next = createMockNext();

    await new Promise<void>((resolve) => {
      optionalJwtAuth(req, res, () => {
        next();
        resolve();
      });
    });

    expect(childFn).toHaveBeenCalled();
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

  it('optionalJwtAuth 验证异常应匿名放行', async () => {
    const req = createMockRequest({
      headers: { authorization: 'Bearer not.valid.jwt' },
    } as Record<string, unknown>);
    const res = createMockResponse();
    const next = createMockNext();

    await new Promise<void>((resolve) => {
      optionalJwtAuth(req, res, () => {
        next();
        resolve();
      });
    });

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeNull();
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
    req: AuthenticatedRequest;
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

  it('Redis ready/error 事件应更新可用性标志', async () => {
    expect(capturedRedisHandlers.ready).toBeTypeOf('function');
    expect(capturedRedisHandlers.error).toBeTypeOf('function');

    redisMocks.useRedisSuccess();
    capturedRedisHandlers.ready!();
    const tokenAfterReady = await generateRefreshToken('redis-ready-user', 'admin');
    expect(tokenAfterReady).toBeTruthy();

    capturedRedisHandlers.error!();
    redisMocks.ping.mockRejectedValueOnce(new Error('redis down after error event'));
    const tokenAfterError = await generateRefreshToken('redis-error-user', 'analyst');
    expect(tokenAfterError).toBeTruthy();
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

  it('Redis refresh 读取异常应回退内存并仍可刷新', async () => {
    redisMocks.ping.mockResolvedValue('PONG');
    redisMocks.set.mockRejectedValueOnce(new Error('Redis write failed on generate'));
    const refreshToken = await generateRefreshToken('redis-refresh-fallback', 'admin');

    redisMocks.useRedisSuccess();
    redisMocks.get.mockRejectedValueOnce(new Error('Redis read failed during refresh'));

    const result = await refreshAccessToken(refreshToken);
    expect(result).not.toBeNull();
    expect(result!.accessToken).toBeTruthy();
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

  it('内存模式 refresh token 过期后应返回 null', async () => {
    vi.useFakeTimers();
    redisMocks.useMemoryFallback();
    const refreshToken = await generateRefreshToken('expired-memory-user', 'admin');
    vi.advanceTimersByTime((mocks.config.JWT_REFRESH_TTL + 60) * 1000);

    const result = await refreshAccessToken(refreshToken);
    expect(result).toBeNull();
    vi.useRealTimers();
  });

  it('内存模式 family 被撤销后 refresh 应拒绝', async () => {
    redisMocks.useMemoryFallback();
    const refreshToken = await generateRefreshToken('family-revoked-user', 'admin');
    const first = await refreshAccessToken(refreshToken);
    expect(first).not.toBeNull();

    await refreshAccessToken(refreshToken);
    const afterReuse = await refreshAccessToken(first!.refreshToken);
    expect(afterReuse).toBeNull();
  });

  it('revokeAllUserSessions Redis 异常应回退内存', async () => {
    redisMocks.useRedisSuccess();
    await generateRefreshToken('revoke-fallback-user', 'admin');
    redisMocks.smembers.mockRejectedValueOnce(new Error('smembers failed'));

    await expect(revokeAllUserSessions('revoke-fallback-user')).resolves.toBeUndefined();
  });

  it('Bearer 认证成功应注入脱敏日志上下文', async () => {
    redisMocks.useMemoryFallback();
    const token = await generateToken('log-context-user', 'admin');
    const childFn = vi.fn(() => ({ info: vi.fn(), warn: vi.fn() }));
    const req = createMockRequest({
      headers: { authorization: `Bearer ${token}` },
      log: { child: childFn },
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
    expect(childFn).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin' }));
  });
});
