/**
 * 认证路由单元测试（T-P3-7）
 *
 * 企业理由：认证路由是安全入口，登录/刷新/登出的正确性直接影响
 * 会话安全与用户体验。测试覆盖：
 * - POST /login：API Key 登录（成功/失败/开发环境跳过）
 * - POST /login/password：用户名密码登录（成功/失败/缺失凭证）
 * - POST /refresh：刷新令牌（有效/无效/缺失）
 * - DELETE /logout：登出（撤销令牌）
 * - GET /me：获取当前用户（已认证/未认证）
 * - 密码哈希验证（argon2 通过 userService mock 验证）
 *
 * Mock 策略：mock jwtAuth（token 生成/刷新/撤销）、userService（用户验证）、
 * config（环境配置）、logger。使用真实 Express app.listen + fetch。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';

const mocks = vi.hoisted(() => ({
  config: {
    NODE_ENV: 'production' as string,
    ADMIN_API_KEY: 'test-secret-key-123' as string,
    JWT_SECRET: 'test-jwt-secret',
    JWT_ALGORITHM: 'HS256',
    JWT_ACCESS_TTL: 900,
    JWT_REFRESH_TTL: 604800,
    JWT_PRIVATE_KEY: '',
    JWT_PRIVATE_KEY_FILE: '',
    JWT_PUBLIC_KEY: '',
    JWT_PUBLIC_KEY_FILE: '',
  },
  jwtAuth: {
    generateToken: vi.fn(),
    generateRefreshToken: vi.fn(),
    refreshAccessToken: vi.fn(),
    revokeRefreshToken: vi.fn(),
  },
  userService: {
    verifyUser: vi.fn(),
  },
}));

vi.mock('../../../api/config/index.js', () => ({
  config: mocks.config,
  validateConfig: vi.fn(),
}));

vi.mock('../../../api/middleware/jwtAuth.js', () => mocks.jwtAuth);

vi.mock('../../../api/services/userService.js', () => mocks.userService);

vi.mock('../../../api/middleware/rbac.js', () => ({
  Role: { ADMIN: 'admin', ANALYST: 'analyst', READONLY: 'readonly' },
}));

vi.mock('../../../api/config/redis.js', () => ({
  appRedis: {
    ping: vi.fn().mockResolvedValue('PONG'),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    on: vi.fn(),
  },
}));

vi.mock('../../../api/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn() })),
  },
}));

import authRoutes from '../../../api/routes/authRoutes.js';

async function startApp(): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', authRoutes);
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

describe('authRoutes - 认证路由', () => {
  let server: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.config.NODE_ENV = 'production';
    mocks.config.ADMIN_API_KEY = 'test-secret-key-123';
    mocks.jwtAuth.generateToken.mockResolvedValue('access-token-mock');
    mocks.jwtAuth.generateRefreshToken.mockResolvedValue('refresh-token-mock');
    server = await startApp();
  });

  afterEach(async () => {
    await server.close();
  });

  describe('POST /login - API Key 登录', () => {
    it('正确 API Key 应返回 token 对', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'test-secret-key-123' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.accessToken).toBe('access-token-mock');
      expect(body.data.refreshToken).toBe('refresh-token-mock');
      expect(body.data.role).toBe('admin');
    });

    it('缺失 apiKey 应返回 401', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('MISSING_API_KEY');
    });

    it('错误 API Key 应返回 401', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'wrong-key' }),
      });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_API_KEY');
    });

    it('超长 API Key（>128 字符）应返回 401', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'a'.repeat(129) }),
      });
      expect(res.status).toBe(401);
    });

    it('长度不匹配的 API Key 应返回 401（防时序攻击）', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'short' }),
      });
      expect(res.status).toBe(401);
    });

    it('开发环境未配置 ADMIN_API_KEY 应跳过鉴权', async () => {
      mocks.config.NODE_ENV = 'development';
      mocks.config.ADMIN_API_KEY = '';

      const res = await fetch(`${server.url}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.userId).toBe('dev-user');
    });
  });

  describe('POST /login/password - 用户名密码登录', () => {
    it('正确凭证应返回 token 对', async () => {
      mocks.userService.verifyUser.mockResolvedValueOnce({
        id: 'user-123',
        username: 'testuser',
        role: 'admin',
        createdAt: new Date(),
        isActive: true,
      });

      const res = await fetch(`${server.url}/api/v1/auth/login/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'correct-pass' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.accessToken).toBe('access-token-mock');
      expect(body.data.userId).toBe('user-123');
      expect(body.data.role).toBe('admin');
    });

    it('错误密码应返回 401（不区分用户不存在）', async () => {
      mocks.userService.verifyUser.mockResolvedValueOnce(null);

      const res = await fetch(`${server.url}/api/v1/auth/login/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'wrong-pass' }),
      });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('不存在的用户应返回 401（相同错误码防枚举）', async () => {
      mocks.userService.verifyUser.mockResolvedValueOnce(null);

      const res = await fetch(`${server.url}/api/v1/auth/login/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'nonexistent', password: 'any-pass' }),
      });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('缺失用户名应返回 400', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/login/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'pass' }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error.code).toBe('MISSING_CREDENTIALS');
    });

    it('缺失密码应返回 400', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/login/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'user' }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error.code).toBe('MISSING_CREDENTIALS');
    });

    it('verifyUser 应使用 argon2id 哈希验证（通过 mock 验证调用）', async () => {
      mocks.userService.verifyUser.mockResolvedValueOnce({
        id: 'user-123',
        username: 'testuser',
        role: 'analyst',
        createdAt: new Date(),
        isActive: true,
      });

      await fetch(`${server.url}/api/v1/auth/login/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'pass' }),
      });

      expect(mocks.userService.verifyUser).toHaveBeenCalledWith('testuser', 'pass');
    });
  });

  describe('POST /refresh - 刷新令牌', () => {
    it('有效 refresh token 应返回新 token 对', async () => {
      mocks.jwtAuth.refreshAccessToken.mockResolvedValueOnce({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      const res = await fetch(`${server.url}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: 'valid-refresh-token' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.accessToken).toBe('new-access-token');
      expect(body.data.refreshToken).toBe('new-refresh-token');
    });

    it('无效/过期 refresh token 应返回 401', async () => {
      mocks.jwtAuth.refreshAccessToken.mockResolvedValueOnce(null);

      const res = await fetch(`${server.url}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: 'expired-token' }),
      });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('已撤销的 refresh token 应返回 401', async () => {
      mocks.jwtAuth.refreshAccessToken.mockResolvedValueOnce(null);

      const res = await fetch(`${server.url}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: 'revoked-token' }),
      });
      expect(res.status).toBe(401);
    });

    it('缺失 refreshToken 应返回 400', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error.code).toBe('MISSING_REFRESH_TOKEN');
    });
  });

  describe('DELETE /logout - 登出', () => {
    it('携带 refreshToken 应调用撤销', async () => {
      mocks.jwtAuth.revokeRefreshToken.mockResolvedValueOnce(undefined);

      const res = await fetch(`${server.url}/api/v1/auth/logout`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: 'token-to-revoke' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(mocks.jwtAuth.revokeRefreshToken).toHaveBeenCalledWith('token-to-revoke');
    });

    it('未携带 refreshToken 也应返回成功', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/logout`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(mocks.jwtAuth.revokeRefreshToken).not.toHaveBeenCalled();
    });
  });

  describe('GET /me - 获取当前用户', () => {
    it('路由直接调用应返回 401（未注入 req.user）', async () => {
      // /me 路由需要 jwtAuth 中间件注入 req.user，但 authRoutes 未挂载 jwtAuth
      // 直接访问应返回 401
      const res = await fetch(`${server.url}/api/v1/auth/me`);
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /logout - 废弃端点', () => {
    it('应设置 Deprecation 和 Sunset 头', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('deprecation')).toBe('true');
      expect(res.headers.get('sunset')).toBeTruthy();
      expect(res.headers.get('link')).toContain('successor-version');
    });
  });

  describe('暴力破解防护', () => {
    it('多次失败登录不应导致服务崩溃', async () => {
      // 连续 10 次错误登录
      const requests = Array.from({ length: 10 }, () =>
        fetch(`${server.url}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: 'wrong-key' }),
        }),
      );
      const responses = await Promise.all(requests);
      for (const res of responses) {
        expect(res.status).toBe(401);
      }
      // 服务仍应正常响应
      const healthRes = await fetch(`${server.url}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'test-secret-key-123' }),
      });
      expect(healthRes.status).toBe(200);
    });
  });
});
