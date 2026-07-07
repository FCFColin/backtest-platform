import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignJWT, importJWK, generateKeyPair } from 'jose';
import { createLoggerMocks } from '../../helpers/mockFactories.js';

function base64urlEncode(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

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
  jwtAuth,
  optionalJwtAuth,
} from '../../../packages/backend/src/middleware/jwtAuth.js';
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

  it('无效 Bearer Token 应返回 401', async () => {
    const req = createMockRequest({
      headers: { authorization: 'Bearer invalid-token' },
    } as Record<string, unknown>);
    const res = createMockResponse();
    const next = createMockNext();

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

  it('无效 x-api-key 应返回 401', async () => {
    apiKeyMocks.verifyApiKey.mockResolvedValueOnce(null);
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

  it('超长 x-api-key 应返回 401（防缓冲区攻击）', async () => {
    apiKeyMocks.verifyApiKey.mockResolvedValueOnce(null);
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
});

describe('optionalJwtAuth 中间件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useMemoryFallback();
    mocks.config.NODE_ENV = 'production';
    mocks.config.JWT_ALGORITHM = 'HS256';
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
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(key);

    const payload = await verifyToken(expiredToken);
    expect(payload).toBeNull();

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

    expect(await verifyToken(tokenFakeRole)).toBeNull();
  });

  it('缺少 exp 声明的 token 应被拒绝（永不过期 = 安全风险）', async () => {
    const key = await importJWK(
      { kty: 'oct', k: base64urlEncode(mocks.config.JWT_SECRET) },
      'HS256',
    );
    const tokenWithoutExp = await new SignJWT({ sub: 'user-1', role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .sign(key);

    expect(await verifyToken(tokenWithoutExp)).toBeNull();
  });

  it('算法混淆攻击：RS256 签名的 token 不应通过 HS256 验证', async () => {
    const { privateKey: rs256PrivateKey } = await generateKeyPair('RS256', { modulusLength: 2048 });
    const rs256Token = await new SignJWT({ sub: 'attacker', role: 'admin' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(rs256PrivateKey);

    const payload = await verifyToken(rs256Token);
    expect(payload).toBeNull();
  });

  it('JWT 炸弹：1MB payload 应在合理时间内完成验证且不崩溃', async () => {
    const key = await importJWK(
      { kty: 'oct', k: base64urlEncode(mocks.config.JWT_SECRET) },
      'HS256',
    );
    const hugeData = 'A'.repeat(1024 * 1024);
    const bombToken = await new SignJWT({ sub: 'user-1', role: 'admin', data: hugeData })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);

    const start = Date.now();
    const payload = await verifyToken(bombToken);
    const elapsed = Date.now() - start;

    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('user-1');
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
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('user\0admin');
    expect(payload!.sub.length).toBe('user\0admin'.length);
  });
});

describe('jwtAuth Redis 边界与 PEM 路径', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config.NODE_ENV = 'production';
    mocks.config.JWT_SECRET = 'test-jwt-secret-for-unit-tests';
    mocks.config.JWT_ALGORITHM = 'HS256';
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
});
