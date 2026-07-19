import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignJWT, importJWK, generateKeyPair } from 'jose';
import {
  createLoggerMocks,
  createRedisMocks,
  createJwtAuthConfigMocks,
  type JwtAuthConfigMocks,
} from '../../helpers/mockFactories.js';
import { createJwtAuthUserRepoMock, setupJwtAuthTestMocks } from '../../helpers/jwtAuthSetup.js';
import { base64urlEncode, signTestToken } from '../../helpers/jwtFixtures.js';

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
    { withStore: true, withSets: true, withMemoryHelpers: true },
    redisMocks,
  ),
}));

vi.mock('../../../packages/backend/src/repositories/userRepo.js', () => ({
  getUserById: createJwtAuthUserRepoMock(),
}));

const apiKeyMocks = vi.hoisted(() => ({
  verifyApiKey: vi.fn(async () => null),
}));
vi.mock('../../../packages/backend/src/services/apiKeyVerifier.js', () => ({
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

  it('无效 Bearer Token 应返回 401', async () => {
    const req = createJwtAuthMockRequest({
      headers: { authorization: 'Bearer invalid-token' },
    } as Record<string, unknown>);
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

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
    const req = createJwtAuthMockRequest({
      headers: { 'x-api-key': 'wrong-key' },
    } as Record<string, unknown>);
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

    jwtAuth(req, res, next);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('无认证凭证应返回 401', () => {
    const req = createJwtAuthMockRequest();
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

    jwtAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('超长 x-api-key 应返回 401（防缓冲区攻击）', async () => {
    apiKeyMocks.verifyApiKey.mockResolvedValueOnce(null);
    mocks.config.ADMIN_API_KEY = 'test-api-key-12345';
    const req = createJwtAuthMockRequest({
      headers: { 'x-api-key': 'a'.repeat(129) },
    } as Record<string, unknown>);
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

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
    const req = createJwtAuthMockRequest({
      headers: { authorization: 'Bearer invalid' },
    } as Record<string, unknown>);
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

    await awaitMiddleware(optionalJwtAuth, req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeNull();
  });

  it('无 Bearer Token 应匿名放行', () => {
    const req = createJwtAuthMockRequest();
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

    optionalJwtAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeNull();
  });

  it('optionalJwtAuth 验证异常应匿名放行', async () => {
    const req = createJwtAuthMockRequest({
      headers: { authorization: 'Bearer not.valid.jwt' },
    } as Record<string, unknown>);
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

    await awaitMiddleware(optionalJwtAuth, req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeNull();
  });
});

describe('jwtAuth 畸形 Authorization 头', () => {
  beforeEach(() => {
    setupJwtAuthTestMocks(mocks, redisMocks);
  });

  async function expectJwtAuth401(authHeader: string): Promise<void> {
    const req = createJwtAuthMockRequest({
      headers: { authorization: authHeader },
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
  }

  it.each([
    ['Bearer 后无 token 应返回 401', 'Bearer '],
    ['Bearer 仅空白应返回 401', 'Bearer    '],
  ])('%s', async (_name, authHeader) => {
    await expectJwtAuth401(authHeader);
  });

  it('Basic 认证头应返回 401（缺少凭证）', async () => {
    const req = createJwtAuthMockRequest({
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    } as Record<string, unknown>);
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

    jwtAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.header).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
  });

  it('无空格的 Bearer 前缀应返回 401', async () => {
    const req = createJwtAuthMockRequest({
      headers: { authorization: 'Bearertoken-without-space' },
    } as Record<string, unknown>);
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

    jwtAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('并发 jwtAuth 调用应各自独立验证', async () => {
    const token = await generateToken('concurrent-user', 'analyst');
    const results = await Promise.all(
      Array.from({ length: 5 }, async () => {
        const req = createJwtAuthMockRequest({
          headers: { authorization: `Bearer ${token}` },
        } as Record<string, unknown>);
        const res = createJwtAuthMockResponse();
        const next = createJwtAuthMockNext();
        await awaitMiddleware(jwtAuth, req, res, next);
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
    setupJwtAuthTestMocks(mocks, redisMocks);
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

    const req = createJwtAuthMockRequest({
      headers: { authorization: `Bearer ${expiredToken}` },
    } as Record<string, unknown>);
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

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

  it.each([
    ['缺少 sub 声明的 token 应被拒绝（身份不可识别）', { role: 'admin' }],
    ['空字符串 sub 应被拒绝', { sub: '', role: 'admin' }],
    ['缺少 role 声明的 token 应被拒绝（RBAC 不可判定）', { sub: 'user-1' }],
    ['伪造的非法 role 应被拒绝（越权防护）', { sub: 'user-1', role: 'superadmin' }],
  ])('%s', async (_name, payload) => {
    const token = await signTestToken(payload);
    expect(await verifyToken(token)).toBeNull();
  });

  it('缺少 exp 声明的 token 应被拒绝（永不过期 = 安全风险）', async () => {
    const token = await signTestToken({ sub: 'user-1', role: 'admin' }, { omitExp: true });
    expect(await verifyToken(token)).toBeNull();
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
    const hugeData = 'A'.repeat(1024 * 1024);
    const bombToken = await signTestToken({ sub: 'user-1', role: 'admin', data: hugeData });

    const start = Date.now();
    const payload = await verifyToken(bombToken);
    const elapsed = Date.now() - start;

    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('user-1');
    expect(elapsed).toBeLessThan(2000);
  });

  it('Null 字节注入：sub 中的 \\0 应原样保留，不被截断或注入', async () => {
    const nullByteToken = await signTestToken({ sub: 'user\0admin', role: 'admin' });

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
