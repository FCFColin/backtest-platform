/**
 * jwtAuth HS256 测试（合并自 valid/invalid/roles/edge-cases 4 文件）
 *
 * 覆盖：Token 生成验证、Refresh 生命周期、中间件认证（有效/无效/RBAC）、
 * 安全攻击、Redis 边界、assignGuestReadonly、RS256 算法边界。
 *
 * RS256 隔离测试见 jwt-auth.rs256.test.ts（vi.resetModules 全局隔离需要）。
 * 本文件末尾的 RS256 边界测试自包含（beforeEach resetModules + 动态 import），放最后避免污染。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignJWT, importJWK, generateKeyPair, exportPKCS8, exportSPKI } from 'jose';
import {
  createLoggerMocks,
  createRedisModuleMock,
  createJwtAuthConfigMocks,
  type JwtAuthConfigMocks,
} from '../../helpers/mockFactories.js';
import { createJwtAuthUserRepoMock, setupJwtAuthTestMocks } from '../../helpers/jwtAuthSetup.js';
import { base64urlEncode, signTestToken } from '../../helpers/authFixtures.js';
import type { JwtPayload } from '../../../packages/backend/src/middleware/authTypes.js';

const mocks = vi.hoisted(() => ({ config: {} as JwtAuthConfigMocks }));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: Object.assign(mocks.config, createJwtAuthConfigMocks()),
  validateConfig: vi.fn(),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

const redisMocks = vi.hoisted(() => ({}) as Record<string, unknown>);

vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () =>
  createRedisModuleMock(
    { withStore: true, withSets: true, withHandlers: true, withMemoryHelpers: true },
    redisMocks,
  ),
);

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
  optionalJwtAuth,
  assignGuestReadonly,
} from '../../../packages/backend/src/middleware/jwtAuth.js';
import { getUserById } from '../../../packages/backend/src/repositories/userRepo.js';
import {
  createJwtAuthMockRequest,
  createJwtAuthMockResponse,
  createJwtAuthMockNext,
  awaitMiddleware,
} from '../../helpers/expressMocks.js';

/** 运行 jwtAuth 中间件并等待 res.json 完成（异步 401 场景共用） */
async function runJwtAuth(headers: Record<string, unknown>): Promise<{
  req: ReturnType<typeof createJwtAuthMockRequest>;
  res: ReturnType<typeof createJwtAuthMockResponse>;
  next: ReturnType<typeof createJwtAuthMockNext>;
}> {
  const req = createJwtAuthMockRequest({ headers } as Record<string, unknown>);
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

/** 断言 jwtAuth 对给定 authorization 头返回 401 + problem+json */
async function expectJwtAuth401(authHeader: string): Promise<void> {
  const { res, next } = await runJwtAuth({ authorization: authHeader });
  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(401);
  expect(res.header).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
}

/** HS256 签发辅助（RS256 边界测试中构造 HS256 token） */
async function signHS256(payload: Record<string, unknown>): Promise<string> {
  const key = await importJWK({ kty: 'oct', k: base64urlEncode(mocks.config.JWT_SECRET) }, 'HS256');
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
}

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { sub: 'user-1', role: 'admin', ...overrides };
}

// ============================================================
// valid — Token 生成与验证
// ============================================================
describe('JWT Token 生成与验证', () => {
  const roles = ['admin', 'analyst', 'readonly'] as const;

  it.each(roles)('应为 %s 角色生成有效 token', async (role) => {
    const token = await generateToken('user-1', role);
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);
  });

  it.each(roles)('验证 %s 角色 token 应返回正确 payload', async (role) => {
    const payload = await verifyToken(await generateToken('user-1', role));
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('user-1');
    expect(payload!.role).toBe(role);
  });

  it('篡改 token 应验证失败', async () => {
    const token = await generateToken('user-1', 'admin');
    expect(await verifyToken(token.slice(0, -5) + 'XXXXX')).toBeNull();
  });

  it.each([
    ['空 token', ''],
    ['非 JWT 格式', 'not-a-jwt'],
  ])('%s 应验证失败', async (_n, input) => {
    expect(await verifyToken(input)).toBeNull();
  });

  it('alg=none 攻击应被拒绝', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'hacker', role: 'admin', iat: 0, exp: 9999999999 }),
    ).toString('base64url');
    expect(await verifyToken(`${header}.${payload}.`)).toBeNull();
  });

  it('签名不匹配应验证失败', async () => {
    const parts = (await generateToken('user-1', 'admin')).split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: 'hacker', role: 'admin', iat: 0, exp: 9999999999 }),
    ).toString('base64url');
    expect(await verifyToken(`${parts[0]}.${tamperedPayload}.${parts[2]}`)).toBeNull();
  });
});

describe('Refresh Token 生命周期', () => {
  beforeEach(() => {
    redisMocks.useMemoryFallback();
  });

  it('生成 refresh token 后应可刷新', async () => {
    const result = await refreshAccessToken(await generateRefreshToken('user-1', 'admin'));
    expect(result).not.toBeNull();
    expect(result!.accessToken).toBeTruthy();
    expect(result!.refreshToken).toBeTruthy();
  });

  it('刷新后旧 token 应失效（轮换机制）', async () => {
    const refreshToken = await generateRefreshToken('user-1', 'admin');
    expect(await refreshAccessToken(refreshToken)).not.toBeNull();
    expect(await refreshAccessToken(refreshToken)).toBeNull();
  });

  it('新 refresh token 应可继续刷新', async () => {
    const result1 = await refreshAccessToken(await generateRefreshToken('user-1', 'analyst'));
    expect(result1).not.toBeNull();
    expect(await refreshAccessToken(result1!.refreshToken)).not.toBeNull();
  });

  it('吊销后 refresh token 应失效', async () => {
    const refreshToken = await generateRefreshToken('user-1', 'admin');
    await revokeRefreshToken(refreshToken);
    expect(await refreshAccessToken(refreshToken)).toBeNull();
  });

  it('不存在的 refresh token 应返回 null', async () => {
    expect(await refreshAccessToken('nonexistent-token')).toBeNull();
  });

  it('刷新返回的 access token 应可验证', async () => {
    const result = await refreshAccessToken(await generateRefreshToken('user-1', 'analyst'));
    const payload = await verifyToken(result!.accessToken);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('user-1');
    expect(payload!.role).toBe('analyst');
  });

  it('Token Family 复用检测：旧 token 被复用时应撤销整个家族', async () => {
    const refreshToken = await generateRefreshToken('user-1', 'admin');
    const result1 = await refreshAccessToken(refreshToken);
    expect(result1).not.toBeNull();
    expect(await refreshAccessToken(refreshToken)).toBeNull();
    expect(await refreshAccessToken(result1!.refreshToken)).toBeNull();
  });
});

describe('jwtAuth 中间件 — 有效认证', () => {
  beforeEach(() => {
    setupJwtAuthTestMocks(mocks, redisMocks);
  });

  it('Bearer Token 认证成功应调用 next', async () => {
    const token = await generateToken('user-1', 'admin');
    const req = createJwtAuthMockRequest({
      headers: { authorization: `Bearer ${token}` },
    } as Record<string, unknown>);
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

    await awaitMiddleware(jwtAuth, req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
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
    expect(result!.refreshToken).not.toBe(refreshToken);
    expect(redisMocks.store.has(`refresh_token:${refreshToken}`)).toBe(false);
    expect(redisMocks.store.has(`refresh_token:used:${refreshToken}`)).toBe(true);
  });

  it('revokeRefreshToken 应撤销 Redis 中的 family', async () => {
    const refreshToken = await generateRefreshToken('user-redis', 'readonly');
    const entry = JSON.parse(redisMocks.store.get(`refresh_token:${refreshToken}`)!);

    await revokeRefreshToken(refreshToken);

    const familyRaw = redisMocks.store.get(`token_family:${entry.familyId}`);
    expect(familyRaw).toBeTruthy();
    expect(JSON.parse(familyRaw!).revoked).toBe(true);
    expect(redisMocks.store.has(`refresh_token:${refreshToken}`)).toBe(false);
  });

  it('revokeAllUserSessions 应撤销 Redis 中用户的全部 family', async () => {
    const refreshToken = await generateRefreshToken('user-redis', 'admin');
    const entry = JSON.parse(redisMocks.store.get(`refresh_token:${refreshToken}`)!);

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
    expect(await refreshAccessToken(refreshToken)).toBeNull();
    expect(await refreshAccessToken(result1!.refreshToken)).toBeNull();
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
    expect(await refreshAccessToken(refreshToken)).not.toBeNull();
  });
});

// ============================================================
// invalid — 无效认证与安全攻击
// ============================================================
describe('jwtAuth 中间件 — 无效认证', () => {
  beforeEach(() => {
    setupJwtAuthTestMocks(mocks, redisMocks);
  });

  it('无效 Bearer Token 应返回 401', async () => {
    const { res, next } = await runJwtAuth({ authorization: 'Bearer invalid-token' });
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
    const req = createJwtAuthMockRequest({
      headers: { authorization: `Bearer ${token}` },
    } as Record<string, unknown>);
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

    await awaitMiddleware(optionalJwtAuth, req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user?.sub).toBe('user-1');
  });

  it('应注入脱敏日志上下文', async () => {
    const token = await generateToken('user-1', 'readonly');
    const childFn = vi.fn(() => ({ info: vi.fn(), warn: vi.fn() }));
    const req = createJwtAuthMockRequest({
      headers: { authorization: `Bearer ${token}` },
      log: { child: childFn },
    } as Record<string, unknown>);
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

    await awaitMiddleware(optionalJwtAuth, req, res, next);

    expect(childFn).toHaveBeenCalled();
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

  it.each([
    ['Bearer 后无 token 应返回 401', 'Bearer '],
    ['Bearer 仅空白应返回 401', 'Bearer    '],
  ])('%s', async (_name, authHeader) => {
    await expectJwtAuth401(authHeader);
  });

  it('Basic 认证头应返回 401（缺少凭证）', async () => {
    await expectJwtAuth401('Basic dXNlcjpwYXNz');
  });

  it('无空格的 Bearer 前缀应返回 401', async () => {
    const { res, next } = await runJwtAuth({ authorization: 'Bearertoken-without-space' });
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

    expect(await verifyToken(expiredToken)).toBeNull();
    await expectJwtAuth401(`Bearer ${expiredToken}`);
  });

  it.each([
    ['缺少 sub 声明的 token 应被拒绝（身份不可识别）', { role: 'admin' }],
    ['空字符串 sub 应被拒绝', { sub: '', role: 'admin' }],
    ['缺少 role 声明的 token 应被拒绝（RBAC 不可判定）', { sub: 'user-1' }],
    ['伪造的非法 role 应被拒绝（越权防护）', { sub: 'user-1', role: 'superadmin' }],
  ])('%s', async (_name, payload) => {
    expect(await verifyToken(await signTestToken(payload))).toBeNull();
  });

  it('缺少 exp 声明的 token 应被拒绝（永不过期 = 安全风险）', async () => {
    expect(await verifyToken(await signTestToken({ sub: 'user-1', role: 'admin' }, { omitExp: true }))).toBeNull();
  });

  it('算法混淆攻击：RS256 签名的 token 不应通过 HS256 验证', async () => {
    const { privateKey: rs256PrivateKey } = await generateKeyPair('RS256', { modulusLength: 2048 });
    const rs256Token = await new SignJWT({ sub: 'attacker', role: 'admin' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(rs256PrivateKey);

    expect(await verifyToken(rs256Token)).toBeNull();
  });

  it('JWT 炸弹：1MB payload 应在合理时间内完成验证且不崩溃', async () => {
    const start = Date.now();
    const payload = await verifyToken(
      await signTestToken({ sub: 'user-1', role: 'admin', data: 'A'.repeat(1024 * 1024) }),
    );
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('user-1');
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('Null 字节注入：sub 中的 \\0 应原样保留，不被截断或注入', async () => {
    const payload = await verifyToken(await signTestToken({ sub: 'user\0admin', role: 'admin' }));
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('user\0admin');
    expect(payload!.sub.length).toBe('user\0admin'.length);
  });
});

// ============================================================
// roles — RBAC 与会话撤销
// ============================================================
describe('jwtAuth 中间件 — API Key 与 DEV 模式', () => {
  beforeEach(() => {
    setupJwtAuthTestMocks(mocks, redisMocks);
    // mockResolvedValueOnce 队列不被 vi.clearAllMocks 清除，需显式 reset 防止跨 describe 泄漏
    apiKeyMocks.verifyApiKey.mockReset();
    apiKeyMocks.verifyApiKey.mockImplementation(async () => null);
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
      headers: { authorization: `Bearer ${token}`, 'x-api-key': 'test-api-key-12345' },
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
    expect(await refreshAccessToken(refreshToken)).toBeNull();
  });

  it('内存模式撤销后 access token 应验证失败', async () => {
    redisMocks.useMemoryFallback();
    const accessToken = await generateToken('user-revoke', 'admin');
    await revokeAllUserSessions('user-revoke');
    expect(await verifyToken(accessToken)).toBeNull();
  });

  it('Redis 模式应撤销用户全部 family', async () => {
    redisMocks.useRedisSuccess();
    const refreshToken = await generateRefreshToken('user-redis-revoke', 'analyst');
    await revokeAllUserSessions('user-redis-revoke');
    expect(await refreshAccessToken(refreshToken)).toBeNull();
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
    const { res, next } = await runJwtAuth({ authorization: `Bearer ${token}` });

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
    expect(await refreshAccessToken(refreshToken)).toBeNull();
  });

  it('Redis 过期 refresh token 应返回 null', async () => {
    redisMocks.useRedisSuccess();
    const refreshToken = await generateRefreshToken('expired-user', 'admin');
    const key = `refresh_token:${refreshToken}`;
    const entry = JSON.parse(redisMocks.store.get(key)!);
    entry.expiresAt = Math.floor(Date.now() / 1000) - 10;
    redisMocks.store.set(key, JSON.stringify(entry));

    expect(await refreshAccessToken(refreshToken)).toBeNull();
    expect(redisMocks.store.has(key)).toBe(false);
  });

  it('getUserById 异常时应拒绝 refresh', async () => {
    redisMocks.useMemoryFallback();
    const refreshToken = await generateRefreshToken('user-db-fail', 'admin');
    vi.mocked(getUserById).mockRejectedValueOnce(new Error('database unavailable'));
    expect(await refreshAccessToken(refreshToken)).toBeNull();
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

  async function jwtAuthWithToken(token: string) {
    return runJwtAuth({ authorization: `Bearer ${token}` });
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

// ============================================================
// Redis 边界与 PEM 路径（合并自 valid/invalid/roles 三处重复 describe）
// ============================================================
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

  it('Redis 可用性应通过 getRedisHealth 动态反映 ping 状态', async () => {
    redisMocks.useRedisSuccess();
    expect(await generateRefreshToken('redis-ready-user', 'admin')).toBeTruthy();

    redisMocks.useMemoryFallback();
    expect(await generateRefreshToken('redis-error-user', 'analyst')).toBeTruthy();
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

  it('内存模式 refresh token 过期后应返回 null', async () => {
    vi.useFakeTimers();
    redisMocks.useMemoryFallback();
    const refreshToken = await generateRefreshToken('expired-memory-user', 'admin');
    vi.advanceTimersByTime((mocks.config.JWT_REFRESH_TTL + 60) * 1000);

    expect(await refreshAccessToken(refreshToken)).toBeNull();
    vi.useRealTimers();
  });

  it('Bearer 认证成功应注入脱敏日志上下文', async () => {
    redisMocks.useMemoryFallback();
    const token = await generateToken('log-context-user', 'admin');
    const childFn = vi.fn(() => ({ info: vi.fn(), warn: vi.fn() }));
    const req = createJwtAuthMockRequest({
      headers: { authorization: `Bearer ${token}` },
      log: { child: childFn },
    } as Record<string, unknown>);
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

    await awaitMiddleware(jwtAuth, req, res, next);

    expect(next).toHaveBeenCalled();
    expect(childFn).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin' }));
  });

  it('内存模式 family 被撤销后 refresh 应拒绝', async () => {
    redisMocks.useMemoryFallback();
    const refreshToken = await generateRefreshToken('family-revoked-user', 'admin');
    const first = await refreshAccessToken(refreshToken);
    expect(first).not.toBeNull();

    await refreshAccessToken(refreshToken);
    expect(await refreshAccessToken(first!.refreshToken)).toBeNull();
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

    expect(await refreshAccessToken(refreshToken)).toBeNull();
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

// ============================================================
// edge-cases — 边缘场景（RS256 边界测试放最后，自包含 vi.resetModules）
// ============================================================
describe('assignGuestReadonly 中间件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useMemoryFallback();
    mocks.config.NODE_ENV = 'production';
    mocks.config.JWT_ALGORITHM = 'HS256';
  });

  it('req.user 为 undefined 时应注入 guest readonly 用户', () => {
    const req = createJwtAuthMockRequest();
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

    assignGuestReadonly(req, res, next);

    expect(req.user).toBeDefined();
    expect(req.user!.sub).toBe('guest');
    expect(req.user!.role).toBe('readonly');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('req.user 为 null 时应注入 guest readonly 用户', () => {
    const req = createJwtAuthMockRequest({ user: null });
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

    assignGuestReadonly(req, res, next);

    expect(req.user).toBeDefined();
    expect(req.user!.sub).toBe('guest');
    expect(req.user!.role).toBe('readonly');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('req.user 已存在时应保留原用户不覆盖', () => {
    const existingUser: JwtPayload = { sub: 'real-user', role: 'admin', iat: 123, exp: 456 };
    const req = createJwtAuthMockRequest({ user: existingUser });
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

    assignGuestReadonly(req, res, next);

    expect(req.user).toBe(existingUser);
    expect(req.user!.sub).toBe('real-user');
    expect(req.user!.role).toBe('admin');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('无论 req.user 是否存在都应调用 next', () => {
    const req = createJwtAuthMockRequest();
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

    assignGuestReadonly(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('verifyToken 非有限 exp 边界', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useMemoryFallback();
    mocks.config.NODE_ENV = 'production';
    mocks.config.JWT_ALGORITHM = 'HS256';
  });

  it('exp 为 Infinity 的 token 应被拒绝（JSON 序列化后为 null，hasRequiredClaims 拒绝）', async () => {
    const key = await importJWK(
      { kty: 'oct', k: base64urlEncode(mocks.config.JWT_SECRET) },
      'HS256',
    );
    const token = await new SignJWT(validPayload({ exp: Infinity }))
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .sign(key);

    expect(await verifyToken(token)).toBeNull();
  });
});

describe('verifyToken RS256 算法边界', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    redisMocks.useMemoryFallback();
    mocks.config.NODE_ENV = 'production';
    mocks.config.JWT_ALGORITHM = 'RS256';
    mocks.config.JWT_PRIVATE_KEY = '';
    mocks.config.JWT_PRIVATE_KEY_FILE = '';
    mocks.config.JWT_PUBLIC_KEY = '';
    mocks.config.JWT_PUBLIC_KEY_FILE = '';
  });

  async function setupRS256Config(): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey }> {
    const { publicKey, privateKey } = await generateKeyPair('RS256', {
      modulusLength: 2048,
      extractable: true,
    });
    mocks.config.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
    mocks.config.JWT_PUBLIC_KEY = await exportSPKI(publicKey);
    return { privateKey, publicKey };
  }

  it('RS256 模式应拒绝 HS256 签发的 token（禁止算法回退）', async () => {
    await setupRS256Config();
    const mod = await import('../../../packages/backend/src/middleware/jwtAuth.js');

    expect(await mod.verifyToken(await signHS256(validPayload()))).toBeNull();
  });

  it('应拒绝使用不同 RSA 密钥对签发的 token（kid 不匹配）', async () => {
    await setupRS256Config();
    const mod = await import('../../../packages/backend/src/middleware/jwtAuth.js');

    const foreignKeys = await generateKeyPair('RS256', {
      modulusLength: 2048,
      extractable: true,
    });
    const foreignToken = await new SignJWT(validPayload())
      .setProtectedHeader({ alg: 'RS256', kid: 'foreign-key-id' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(foreignKeys.privateKey);

    expect(await mod.verifyToken(foreignToken)).toBeNull();
  });

  it('应拒绝缺失签名段的 RS256 token', async () => {
    const { privateKey } = await setupRS256Config();
    const mod = await import('../../../packages/backend/src/middleware/jwtAuth.js');

    const token = await new SignJWT(validPayload())
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    const parts = token.split('.');
    const noSigToken = `${parts[0]}.${parts[1]}.`;

    expect(await mod.verifyToken(noSigToken)).toBeNull();
  });
});
