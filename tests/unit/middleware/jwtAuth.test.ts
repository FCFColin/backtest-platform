/**
 * JWT 认证中间件单元测试
 *
 * 企业理由：JWT 签发/验证/刷新/吊销是认证核心，任何 bug 都会导致
 * 认证绕过或合法用户被拒。Table-Driven 测试覆盖所有边界条件。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';

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
  },
}));

vi.mock('../../../api/config/index.js', () => ({
  config: mocks.config,
  validateConfig: vi.fn(),
}));

vi.mock('../../../api/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn() })),
  },
}));

// Mock appRedis：测试环境无 Redis，确保 ping 返回失败以使用内存回退
vi.mock('../../../api/config/redis.js', () => ({
  redisConnection: {},
  appRedis: {
    ping: vi.fn().mockRejectedValue(new Error('Redis not available in test')),
    get: vi.fn().mockRejectedValue(new Error('Redis not available in test')),
    set: vi.fn().mockRejectedValue(new Error('Redis not available in test')),
    del: vi.fn().mockRejectedValue(new Error('Redis not available in test')),
    on: vi.fn(),
  },
}));

import {
  generateToken,
  verifyToken,
  generateRefreshToken,
  refreshAccessToken,
  revokeRefreshToken,
  jwtAuth,
  type AuthenticatedRequest,
} from '../../../api/middleware/jwtAuth.js';

// Helper: create mock request
function createMockRequest(overrides: Partial<AuthenticatedRequest> = {}): AuthenticatedRequest {
  return {
    headers: {},
    path: '/test',
    method: 'GET',
    ...overrides,
  } as AuthenticatedRequest;
}

// Helper: create mock response
function createMockResponse(): Response {
  return {
    status: vi.fn().mockReturnThis(),
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
    const payload = Buffer.from(JSON.stringify({ sub: 'hacker', role: 'admin', iat: 0, exp: 9999999999 })).toString('base64url');
    const attackToken = `${header}.${payload}.`;
    expect(await verifyToken(attackToken)).toBeNull();
  });

  it('签名不匹配应验证失败', async () => {
    const token = await generateToken('user-1', 'admin');
    const parts = token.split('.');
    // 篡改 payload 部分
    const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'hacker', role: 'admin', iat: 0, exp: 9999999999 })).toString('base64url');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    expect(await verifyToken(tamperedToken)).toBeNull();
  });
});

describe('Refresh Token 生命周期', () => {
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
    } as any);
    const res = createMockResponse();
    const next = createMockNext();

    await new Promise<void>((resolve) => {
      jwtAuth(req, res, () => { next(); resolve(); });
    });

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user!.sub).toBe('user-1');
  });

  it('无效 Bearer Token 应返回 401', async () => {
    const req = createMockRequest({
      headers: { authorization: 'Bearer invalid-token' },
    } as any);
    const res = createMockResponse();
    const next = createMockNext();

    // jwtAuth is async internally, wait for it to complete
    await new Promise<void>((resolve) => {
      const originalJson = res.json.bind(res);
      res.json = vi.fn((...args: any[]) => {
        originalJson(...args);
        resolve();
        return res;
      });
      jwtAuth(req, res, next);
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('x-api-key 认证成功应注入 analyst 角色', () => {
    mocks.config.ADMIN_API_KEY = 'test-api-key-12345';
    const req = createMockRequest({
      headers: { 'x-api-key': 'test-api-key-12345' },
    } as any);
    const res = createMockResponse();
    const next = createMockNext();

    jwtAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user!.role).toBe('analyst'); // 关键：x-api-key 注入 analyst 而非 admin
  });

  it('无效 x-api-key 应返回 401', () => {
    mocks.config.ADMIN_API_KEY = 'test-api-key-12345';
    const req = createMockRequest({
      headers: { 'x-api-key': 'wrong-key' },
    } as any);
    const res = createMockResponse();
    const next = createMockNext();

    jwtAuth(req, res, next);

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

  it('开发环境应跳过认证并注入 admin 角色', () => {
    mocks.config.NODE_ENV = 'development';
    mocks.config.JWT_SECRET = 'dev-only-jwt-secret-change-in-production';
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    jwtAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user!.role).toBe('admin');
    expect(req.user!.sub).toBe('dev-user');
  });

  it('超长 x-api-key 应返回 401（防缓冲区攻击）', () => {
    mocks.config.ADMIN_API_KEY = 'test-api-key-12345';
    const req = createMockRequest({
      headers: { 'x-api-key': 'a'.repeat(129) },
    } as any);
    const res = createMockResponse();
    const next = createMockNext();

    jwtAuth(req, res, next);

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
    } as any);
    const res = createMockResponse();
    const next = createMockNext();

    await new Promise<void>((resolve) => {
      jwtAuth(req, res, () => { next(); resolve(); });
    });

    expect(next).toHaveBeenCalled();
    // Bearer Token 优先，角色应为 token 中的 readonly 而非 api-key 的 analyst
    expect(req.user!.role).toBe('readonly');
    expect(req.user!.sub).toBe('user-1');
  });
});
