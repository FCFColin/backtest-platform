/**
 * jwtAuth RS256 路径独立测试（避免 vi.resetModules 污染 HS256 套件）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';
import { createLoggerMocks } from '../../helpers/mockFactories.js';

const mocks = vi.hoisted(() => ({
  config: {
    NODE_ENV: 'development' as string,
    JWT_SECRET: 'test-jwt-secret-for-unit-tests',
    JWT_ACCESS_TTL: 900,
    JWT_REFRESH_TTL: 604800,
    ADMIN_API_KEY: '',
    JWT_ALGORITHM: 'RS256' as 'RS256' | 'HS256',
    JWT_PRIVATE_KEY: '',
    JWT_PRIVATE_KEY_FILE: '',
    JWT_PUBLIC_KEY: '',
    JWT_PUBLIC_KEY_FILE: '',
    DEV_SKIP_AUTH: false,
  },
}));

const redisMocks = vi.hoisted(() => ({
  ping: vi.fn().mockRejectedValue(new Error('redis unavailable')),
  get: vi.fn().mockRejectedValue(new Error('redis unavailable')),
  set: vi.fn().mockRejectedValue(new Error('redis unavailable')),
  del: vi.fn().mockRejectedValue(new Error('redis unavailable')),
  sadd: vi.fn().mockRejectedValue(new Error('redis unavailable')),
  smembers: vi.fn().mockRejectedValue(new Error('redis unavailable')),
  expire: vi.fn().mockRejectedValue(new Error('redis unavailable')),
  on: vi.fn(),
}));

const fsMocks = vi.hoisted(() => ({
  readFileSync: vi.fn(),
}));

vi.mock('fs', () => ({
  default: { readFileSync: fsMocks.readFileSync },
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: mocks.config,
  validateConfig: vi.fn(),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

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

describe('jwtAuth RS256 路径', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.config.NODE_ENV = 'development';
    mocks.config.JWT_ALGORITHM = 'RS256';
  });

  it('RS256 模式应签发并验证 access token', async () => {
    const mod = await import('../../../packages/backend/src/middleware/jwtAuth.js');
    const token = await mod.generateToken('rs256-user', 'admin');
    const payload = await mod.verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('rs256-user');
    expect(payload!.role).toBe('admin');
  });

  it('RS256 refresh token 生命周期应完整', async () => {
    const mod = await import('../../../packages/backend/src/middleware/jwtAuth.js');
    const refresh = await mod.generateRefreshToken('rs256-refresh', 'analyst');
    const rotated = await mod.refreshAccessToken(refresh);
    expect(rotated).not.toBeNull();
    expect(rotated!.accessToken).toBeTruthy();
  });

  it('jwtAuth verify 异常时应返回 INVALID_TOKEN', async () => {
    const mod = await import('../../../packages/backend/src/middleware/jwtAuth.js');
    const req = {
      method: 'GET',
      path: '/api/test',
      headers: { authorization: 'Bearer not-a-valid-jwt' },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn();

    await new Promise<void>((resolve) => {
      const originalJson = res.json.bind(res);
      res.json = vi.fn((...args: unknown[]) => {
        originalJson(...args);
        resolve();
        return res;
      });
      mod.jwtAuth(req, res, next);
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('生产环境缺少 RSA 密钥应拒绝签发 token', async () => {
    mocks.config.NODE_ENV = 'production';
    mocks.config.JWT_PRIVATE_KEY = '';
    mocks.config.JWT_PRIVATE_KEY_FILE = '';
    vi.resetModules();
    const mod = await import('../../../packages/backend/src/middleware/jwtAuth.js');
    await expect(mod.generateToken('prod-user', 'admin')).rejects.toThrow(/JWT_PRIVATE_KEY/);
  });

  it('getUserById 失败时 jwtAuth 应拒绝访问', async () => {
    const mod = await import('../../../packages/backend/src/middleware/jwtAuth.js');
    const { getUserById } = await import('../../../packages/backend/src/services/userService.js');
    vi.mocked(getUserById).mockRejectedValueOnce(new Error('db error'));
    const token = await mod.generateToken('user-db-error', 'admin');
    const req = {
      method: 'GET',
      path: '/secure',
      headers: { authorization: `Bearer ${token}` },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn();

    await new Promise<void>((resolve) => {
      res.json = vi.fn(() => {
        resolve();
        return res;
      });
      mod.jwtAuth(req, res, next);
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('RS256 环境变量内联 PEM 应能签发并验证', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256', {
      modulusLength: 2048,
      extractable: true,
    });
    mocks.config.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
    mocks.config.JWT_PUBLIC_KEY = await exportSPKI(publicKey);
    mocks.config.NODE_ENV = 'production';
    vi.resetModules();
    const mod = await import('../../../packages/backend/src/middleware/jwtAuth.js');
    const token = await mod.generateToken('inline-pem-user', 'analyst');
    const payload = await mod.verifyToken(token);
    expect(payload?.sub).toBe('inline-pem-user');
    expect(payload?.role).toBe('analyst');
  });

  it('RS256 PEM 文件路径应能读取并签发', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256', {
      modulusLength: 2048,
      extractable: true,
    });
    const privatePem = await exportPKCS8(privateKey);
    const publicPem = await exportSPKI(publicKey);

    fsMocks.readFileSync.mockImplementation((filePath: string) => {
      if (String(filePath).includes('private')) return privatePem;
      if (String(filePath).includes('public')) return publicPem;
      throw new Error('ENOENT');
    });

    mocks.config.JWT_PRIVATE_KEY = '';
    mocks.config.JWT_PUBLIC_KEY = '';
    mocks.config.JWT_PRIVATE_KEY_FILE = '/secrets/private.pem';
    mocks.config.JWT_PUBLIC_KEY_FILE = '/secrets/public.pem';
    mocks.config.NODE_ENV = 'production';
    vi.resetModules();
    const mod = await import('../../../packages/backend/src/middleware/jwtAuth.js');
    const token = await mod.generateToken('file-pem-user', 'readonly');
    expect(token.split('.')).toHaveLength(3);
    expect(fsMocks.readFileSync).toHaveBeenCalled();
  });

  it('readPemFile 读取失败应抛出明确错误', async () => {
    fsMocks.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    mocks.config.JWT_PRIVATE_KEY = '';
    mocks.config.JWT_PRIVATE_KEY_FILE = '/missing/private.pem';
    mocks.config.JWT_PUBLIC_KEY = '';
    mocks.config.JWT_PUBLIC_KEY_FILE = '';
    mocks.config.NODE_ENV = 'production';
    vi.resetModules();
    const mod = await import('../../../packages/backend/src/middleware/jwtAuth.js');
    await expect(mod.generateToken('missing-pem', 'admin')).rejects.toThrow(/无法读取 PEM 文件/);
  });

  it('生产环境缺少 RSA 公钥应拒绝验证 RS256 token', async () => {
    mocks.config.NODE_ENV = 'production';
    mocks.config.JWT_PRIVATE_KEY = '';
    mocks.config.JWT_PRIVATE_KEY_FILE = '';
    mocks.config.JWT_PUBLIC_KEY = '';
    mocks.config.JWT_PUBLIC_KEY_FILE = '';
    vi.resetModules();
    const mod = await import('../../../packages/backend/src/middleware/jwtAuth.js');
    await expect(mod.generateToken('prod-user', 'admin')).rejects.toThrow(/JWT_PRIVATE_KEY/);
  });
});
