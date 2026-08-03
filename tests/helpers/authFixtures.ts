import { SignJWT, importJWK } from 'jose';
import { vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { JwtAuthConfigMocks } from './mockFactories.js';
import { createMockRequest, createMockResponse } from './expressMocks.js';

const DEFAULT_JWT_SECRET = 'test-jwt-secret-for-unit-tests';

export const validPasswordLoginPayload = {
  username: 'testuser',
  password: 'correct-pass',
};

/**
 * Base64URL 编码（无填充）
 *
 * 用于构造 JWK oct 密钥时的 k 字段编码。
 *
 * @param input - UTF-8 字符串
 * @returns Base64URL 编码字符串（无 = 填充）
 */
export function base64urlEncode(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface SignTestTokenOptions {
  omitExp?: boolean;
  secret?: string;
}

/**
 * 使用 HS256 签发测试 token
 *
 * 集中维护"构造密钥 + 签发"模板，消除 5+ 处重复样板。
 * 默认使用 DEFAULT_JWT_SECRET，与 jwt-auth 测试 config 默认值一致。
 *
 * @param payload - JWT payload（不含 iat/exp，由本函数注入）
 * @param options - 可选配置：omitExp=true 时不设置 exp；secret 自定义密钥
 * @returns 签发后的 JWT 字符串
 */
export async function signTestToken(
  payload: Record<string, unknown>,
  options: SignTestTokenOptions = {},
): Promise<string> {
  const secret = options.secret ?? DEFAULT_JWT_SECRET;
  const key = await importJWK({ kty: 'oct', k: base64urlEncode(secret) }, 'HS256');
  const builder = new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt();
  if (!options.omitExp) builder.setExpirationTime('1h');
  return builder.sign(key);
}

/**
 * 创建 DB 用户行 fixture（snake_case 字段，模拟 pg 返回的原始 row）
 *
 * 合并自 tests/helpers/userFixtures.ts。
 *
 * @param overrides - 覆盖默认字段
 * @returns 包含 id/username/role/created_at/is_active 等字段的 DB 行
 */
export function mockUserRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'user-123',
    username: 'testuser',
    role: 'analyst',
    created_at: new Date('2020-01-02'),
    is_active: true,
    ...overrides,
  };
}

/**
 * 创建带 password_hash 的 DB 用户行（用于 verifyUser 测试）
 *
 * @param overrides - 覆盖默认字段
 * @returns 包含 password_hash 字段的 DB 行
 */
export function mockUserRecordWithPassword(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return mockUserRecord({
    password_hash: 'hashed-password',
    ...overrides,
  });
}

export function createAuthRoutesConfig() {
  return {
    NODE_ENV: 'production' as string,
    JWT_SECRET: 'test-jwt-secret',
    JWT_ALGORITHM: 'HS256',
    JWT_ACCESS_TTL: 900,
    JWT_REFRESH_TTL: 604800,
    JWT_PRIVATE_KEY: '',
    JWT_PRIVATE_KEY_FILE: '',
    JWT_PUBLIC_KEY: '',
    JWT_PUBLIC_KEY_FILE: '',
  };
}

export function createAuthConfigMock() {
  return {
    SESSION_IDLE_TIMEOUT_READONLY_SEC: 1800,
    SESSION_IDLE_TIMEOUT_ANALYST_SEC: 3600,
  };
}

export function createAuthJwtAuthMocks(target: Record<string, unknown> = {}) {
  target.generateToken = vi.fn();
  target.generateRefreshToken = vi.fn();
  target.refreshAccessToken = vi.fn();
  target.revokeRefreshToken = vi.fn();
  target.revokeAllUserSessions = vi.fn();
  target.jwtAuth = vi.fn((_req: Request, _res: Response, next: NextFunction) => next());
  target.hashUserId = vi.fn((sub?: string) => sub);
  target.requireUser = vi.fn((req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', title: 'Unauthorized', status: 401 },
      });
      return false;
    }
    return true;
  });
  return target;
}

export function createAuthUserServiceMocks(target: Record<string, unknown> = {}) {
  target.verifyUser = vi.fn();
  target.anonymizeUser = vi.fn();
  return target;
}

export function createLoginLockoutMocks(target: Record<string, unknown> = {}) {
  target.isLockedOut = vi.fn().mockResolvedValue(0);
  target.recordFailure = vi.fn().mockResolvedValue(undefined);
  target.clearFailures = vi.fn().mockResolvedValue(undefined);
  return target;
}

export function createMembershipServiceMocks(target: Record<string, unknown> = {}) {
  target.resolveDefaultOrg = vi.fn().mockResolvedValue(null);
  target.getMembership = vi.fn().mockResolvedValue(null);
  target.getUserMemberships = vi.fn().mockResolvedValue([]);
  target.isPlatformAdmin = vi.fn().mockResolvedValue(false);
  target.orgRoleToGlobalRole = (r: string) => (r === 'owner' ? 'admin' : r);
  return target;
}

/**
 * 创建 userRepo.getUserById 的默认 mock 实现
 *
 * 返回一个 vi.fn，模拟活跃 analyst 用户。供 jwt-auth 测试的 vi.mock 工厂使用：
 *   vi.mock('.../userRepo.js', () => ({ getUserById: createJwtAuthUserRepoMock() }));
 *
 * @returns vi.fn 实例，调用时返回 mock 用户对象
 */
export function createJwtAuthUserRepoMock() {
  return vi.fn().mockImplementation(async (id: string) => ({
    id,
    username: 'test-user',
    role: 'analyst' as const,
    isActive: true,
    createdAt: new Date(),
  }));
}

/**
 * 重置 jwtAuth HS256 测试的默认 mock 状态
 *
 * 在 beforeEach 中调用，将 config 重置为 production + HS256 + 默认 JWT_SECRET，
 * 并将 redisMocks 切换到 Redis 成功模式（ADR-045：内存降级路径已删除）。
 * 供所有 jwt-auth.* 测试文件的 beforeEach 复用。
 *
 * @param mocks - 测试文件的 vi.hoisted mocks 对象（含 config 属性）
 * @param redisMocks - 测试文件的 vi.hoisted redisMocks 对象
 */
export function setupJwtAuthTestMocks(
  mocks: { config: JwtAuthConfigMocks },
  redisMocks: Record<string, unknown>,
): void {
  vi.clearAllMocks();
  (redisMocks.useRedisSuccess as () => void | undefined)?.();
  mocks.config.NODE_ENV = 'production';
  mocks.config.JWT_SECRET = 'test-jwt-secret-for-unit-tests';
  mocks.config.JWT_ALGORITHM = 'HS256';
}

export function mockLongIdempotencyKey(): string {
  return 'a'.repeat(129);
}

export const SQL_INJECTION_KEY = "'; DROP TABLE idempotency_keys;--";

export const XSS_KEY = '<script>alert(1)</script>';

export const NEWLINE_INJECTION_KEY = 'valid-key\r\nX-Evil: injected';

/**
 * 创建带 idempotency-key header 的 req/res/next 三元组
 *
 * @param key - 幂等 key（默认生成 `test-key-default-<rand>`）
 * @param method - HTTP 方法（默认 POST）
 * @param path - 请求路径（默认 /api/test）
 * @returns 包含 req/res/next 的三元组（res 额外附加 on 方法）
 */
export function createIdempotencyReqRes(
  key?: string,
  method = 'POST',
  path = '/api/test',
): {
  req: ReturnType<typeof createMockRequest>;
  res: Response & { on: ReturnType<typeof vi.fn> };
  next: ReturnType<typeof vi.fn>;
} {
  const resolvedKey = key ?? `test-key-default-${Math.random().toString(16).slice(2, 10)}`;
  const req = createMockRequest({
    method,
    headers: { 'idempotency-key': resolvedKey },
    path,
    url: path,
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  });
  const res = {
    ...createMockResponse(),
    on: vi.fn(),
  } as unknown as Response & { on: ReturnType<typeof vi.fn> };
  const next = vi.fn();
  return { req, res, next };
}
