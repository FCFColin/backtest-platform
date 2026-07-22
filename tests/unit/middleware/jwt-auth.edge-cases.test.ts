/**
 * jwtAuth 边缘场景测试
 *
 * 覆盖其他 jwt-auth.* 测试文件未涉及的场景：
 * - assignGuestReadonly 中间件（4 个）
 * - 非有限 exp 边界（1 个）
 * - RS256 算法边界：HS256 回退禁止、外来密钥拒绝、缺失签名段拒绝（3 个）
 *
 * Mock 策略与 jwt-auth.valid.test.ts 一致：Redis + getUserById 外层 mock。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignJWT, exportPKCS8, exportSPKI, generateKeyPair, importJWK } from 'jose';
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
vi.mock('../../../packages/backend/src/infrastructure/apiKeyVerifier.js', () => ({
  verifyApiKey: apiKeyMocks.verifyApiKey,
}));

redisMocks.useMemoryFallback();

import {
  verifyToken,
  assignGuestReadonly,
} from '../../../packages/backend/src/middleware/jwtAuth.js';

function base64urlEncode(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { sub: 'user-1', role: 'admin', ...overrides };
}

async function signHS256(payload: Record<string, unknown>): Promise<string> {
  const key = await importJWK({ kty: 'oct', k: base64urlEncode(mocks.config.JWT_SECRET) }, 'HS256');
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
}

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
    const existingUser: JwtPayload = {
      sub: 'real-user',
      role: 'admin',
      iat: 123,
      exp: 456,
    };
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
    // JSON.stringify(Infinity) === 'null'，解码后 exp 为 null，typeof !== 'number'
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

    const hs256Token = await signHS256(validPayload());
    expect(await mod.verifyToken(hs256Token)).toBeNull();
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
