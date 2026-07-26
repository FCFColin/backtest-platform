/**
 * assignGuestAnalyst 中间件单元测试
 *
 * 企业理由：jwtAuth.ts 中 assignGuestAnalyst 为未认证请求注入 analyst 访客身份，
 * 使匿名用户可使用计算功能（回测/优化/信号等）。该函数此前无单测覆盖（0/6 → 5/6
 * 函数覆盖缺口），P0-02 补测以达 90% 关键文件门控。
 *
 * 覆盖分支：
 * - req.user 为 undefined → 注入 guest analyst 身份（含 iat/exp/attachAuthLogContext）
 * - req.user 为 null → 注入 guest analyst 身份
 * - req.user 已存在 → 保留原用户不覆盖
 *
 * Mock 策略与 jwt-auth.edge-cases.test.ts 一致：config + logger + redis + userRepo + apiKeyVerifier。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLoggerMocks, createRedisMocks } from '../../helpers/mockFactories.js';
import { createJwtAuthUserRepoMock } from '../../helpers/jwtAuthSetup.js';
import type { JwtPayload } from '../../../packages/backend/src/middleware/authTypes.js';
import {
  createJwtAuthMockRequest,
  createJwtAuthMockResponse,
  createJwtAuthMockNext,
} from '../../helpers/expressMocks.js';

const mocks = vi.hoisted(() => ({
  config: {
    NODE_ENV: 'production' as string,
    JWT_SECRET: 'test-jwt-secret-for-unit-tests',
    JWT_ACCESS_TTL: 900,
    JWT_REFRESH_TTL: 604800,
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

const redisMocks = vi.hoisted(() => ({}) as Record<string, unknown>);

vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  redisConnection: {},
  appRedis: createRedisMocks(
    { withStore: true, withSets: true, withMemoryHelpers: true },
    redisMocks,
  ),
  getRedisHealth: vi.fn(async () => {
    try {
      return (await redisMocks.ping()) === 'PONG';
    } catch {
      return false;
    }
  }),
  markRedisUnhealthy: vi.fn(),
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

import { assignGuestAnalyst } from '../../../packages/backend/src/middleware/jwtAuth.js';

describe('assignGuestAnalyst 中间件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useMemoryFallback();
    mocks.config.NODE_ENV = 'production';
    mocks.config.JWT_ALGORITHM = 'HS256';
  });

  it('req.user 为 undefined 时应注入 guest analyst 用户', () => {
    const req = createJwtAuthMockRequest();
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

    assignGuestAnalyst(req, res, next);

    expect(req.user).toBeDefined();
    expect(req.user!.sub).toBe('guest');
    expect(req.user!.role).toBe('analyst');
    expect(typeof req.user!.iat).toBe('number');
    expect(typeof req.user!.exp).toBe('number');
    expect(req.user!.exp).toBeGreaterThan(req.user!.iat!);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('req.user 为 null 时应注入 guest analyst 用户', () => {
    const req = createJwtAuthMockRequest({ user: null });
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

    assignGuestAnalyst(req, res, next);

    expect(req.user).toBeDefined();
    expect(req.user!.sub).toBe('guest');
    expect(req.user!.role).toBe('analyst');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('req.user 已存在时应保留原用户不覆盖', () => {
    const existingUser: JwtPayload = {
      sub: 'real-user',
      role: 'admin',
      iat: 123,
      exp: 456,
    };
    const req = createJwtAuthMockRequest({ user: existingUser });
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();

    assignGuestAnalyst(req, res, next);

    expect(req.user).toBe(existingUser);
    expect(req.user!.sub).toBe('real-user');
    expect(req.user!.role).toBe('admin');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('注入的 guest analyst iat 应为当前时间附近', () => {
    const req = createJwtAuthMockRequest();
    const res = createJwtAuthMockResponse();
    const next = createJwtAuthMockNext();
    const before = Math.floor(Date.now() / 1000);

    assignGuestAnalyst(req, res, next);

    const after = Math.floor(Date.now() / 1000);
    expect(req.user!.iat).toBeGreaterThanOrEqual(before);
    expect(req.user!.iat).toBeLessThanOrEqual(after);
  });
});
