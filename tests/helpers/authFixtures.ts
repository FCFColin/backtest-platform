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

function base64urlEncode(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

interface SignTestTokenOptions {
  omitExp?: boolean;
  secret?: string;
}

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

export function signRsa(payload: Record<string, unknown>, key: CryptoKey, kid?: string) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', ...(kid ? { kid } : {}) })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
}

/** 默认 JWT payload 工厂 */
export function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { sub: 'user-1', role: 'admin', ...overrides };
}

export function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/** 解码 JWT payload */
export function decodePayload(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}

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
    JWT_REFRESH_TTL: 604800,
  };
}

export function createAuthJwtAuthMocks(target: Record<string, unknown> = {}) {
  target.RT_COOKIE = 'rt';
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
  target.registerUser = vi.fn();
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

export function createJwtAuthUserRepoMock() {
  return vi.fn().mockImplementation(async (id: string) => ({
    id,
    username: 'test-user',
    role: 'analyst' as const,
    isActive: true,
    createdAt: new Date(),
  }));
}

/** 重置 jwtAuth HS256 测试的默认 mock 状态 */
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

export function createIdempotencyReqRes(
  key?: string,
  method = 'POST',
  path = '/api/test',
  noKey = false,
): {
  req: ReturnType<typeof createMockRequest>;
  res: Response & { on: ReturnType<typeof vi.fn> };
  next: ReturnType<typeof vi.fn>;
} {
  const resolvedKey = key ?? `test-key-default-${Math.random().toString(16).slice(2, 10)}`;
  const req = createMockRequest({
    method,
    headers: noKey ? {} : { 'idempotency-key': resolvedKey },
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
