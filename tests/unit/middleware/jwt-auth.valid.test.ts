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
vi.mock('../../../packages/backend/src/services/apiKeyVerifier.js', () => ({
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
} from '../../../packages/backend/src/middleware/jwtAuth.js';
import { getUserById } from '../../../packages/backend/src/repositories/userRepo.js';
import {
  createJwtAuthMockRequest,
  createJwtAuthMockResponse,
  createJwtAuthMockNext,
  awaitMiddleware,
} from '../../helpers/expressMocks.js';

const capturedRedisHandlers = (() => {
  const ready = redisMocks.on.mock.calls.find(([ev]) => ev === 'ready')?.[1] as
    (() => void) | undefined;
  const error = redisMocks.on.mock.calls.find(([ev]) => ev === 'error')?.[1] as
    (() => void) | undefined;
  return { ready, error };
})();

describe('JWT Token 生成与验证', () => {
  const roles = ['admin', 'analyst', 'readonly'] as const;

  it.each(roles)('应为 %s 角色生成有效 token', async (role) => {
    const token = await generateToken('user-1', role);
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);
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
    const result2 = await refreshAccessToken(refreshToken);
    expect(result2).toBeNull();
  });

  it('新 refresh token 应可继续刷新', async () => {
    const refreshToken = await generateRefreshToken('user-1', 'analyst');
    const result1 = await refreshAccessToken(refreshToken);
    expect(result1).not.toBeNull();
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
    const result1 = await refreshAccessToken(refreshToken);
    expect(result1).not.toBeNull();
    const result2 = await refreshAccessToken(refreshToken);
    expect(result2).toBeNull();
    const result3 = await refreshAccessToken(result1!.refreshToken);
    expect(result3).toBeNull();
  });
});

describe('jwtAuth 中间件', () => {
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

    const result = await refreshAccessToken(refreshToken);
    expect(result).toBeNull();
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
});
