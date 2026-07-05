import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import type { NextFunction, Response } from 'express';
import { createLoggerMocks, mockLogger } from '../../helpers/mockFactories.js';

const jwtSignerMocks = vi.hoisted(() => ({
  getOrCachePublicKey: vi.fn(),
  getOrCacheHS256Key: vi.fn(),
}));

const refreshTokenMocks = vi.hoisted(() => ({
  isAccessTokenRevokedForUser: vi.fn(),
  isUserSessionValid: vi.fn(),
}));

const devBypassMocks = vi.hoisted(() => ({
  tryDevBypass: vi.fn(),
}));

const apiKeyMocks = vi.hoisted(() => ({
  handleApiKeyAuth: vi.fn(),
  handleOptionalApiKey: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  config: {
    NODE_ENV: 'production' as string,
    JWT_SECRET: 'test-jwt-secret-for-unit-tests',
    JWT_ACCESS_TTL: 900,
    JWT_REFRESH_TTL: 604800,
    JWT_ALGORITHM: 'RS256' as 'RS256' | 'HS256',
    ADMIN_API_KEY: '',
    DEV_SKIP_AUTH: false,
  },
}));

vi.mock('../../../api/config/index.js', () => ({ config: mocks.config }));
vi.mock('../../../api/utils/logger.js', () => ({ logger: mockLogger(createLoggerMocks()) }));
vi.mock('../../../api/middleware/jwtSigner.js', () => jwtSignerMocks);
vi.mock('../../../api/middleware/refreshToken.js', () => refreshTokenMocks);
vi.mock('../../../api/middleware/devBypass.js', () => devBypassMocks);
vi.mock('../../../api/middleware/apiKeyAuth.js', () => apiKeyMocks);

import { SignJWT, generateKeyPair, importJWK } from 'jose';
import type { AuthenticatedRequest, JwtPayload } from '../../../api/middleware/authTypes.js';

let rs256PrivateKey: CryptoKey;
let rs256PublicKey: CryptoKey;
let hs256Key: CryptoKey;

beforeAll(async () => {
  const keys = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
  rs256PublicKey = keys.publicKey;
  rs256PrivateKey = keys.privateKey;

  hs256Key = await importJWK(
    {
      kty: 'oct',
      k: Buffer.from('test-hs256-secret')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, ''),
    },
    'HS256',
  );
});

function createMockReq(overrides: Record<string, unknown> = {}): AuthenticatedRequest {
  return {
    headers: {},
    path: '/test',
    method: 'GET',
    id: 'req-123',
    ...overrides,
  } as unknown as AuthenticatedRequest;
}

function createMockRes(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

function createMockNext(): ReturnType<typeof vi.fn> {
  return vi.fn();
}

async function signRS256(payload: Record<string, unknown>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(rs256PrivateKey);
}

async function signHS256(payload: Record<string, unknown>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(hs256Key);
}

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { sub: 'user-1', role: 'admin', ...overrides };
}

describe('jwtVerifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    jwtSignerMocks.getOrCachePublicKey.mockResolvedValue(rs256PublicKey);
    jwtSignerMocks.getOrCacheHS256Key.mockResolvedValue(hs256Key);
    refreshTokenMocks.isAccessTokenRevokedForUser.mockResolvedValue(false);
    refreshTokenMocks.isUserSessionValid.mockResolvedValue(true);
    devBypassMocks.tryDevBypass.mockReturnValue(false);
    apiKeyMocks.handleApiKeyAuth.mockImplementation(
      (_req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
        res.status(401).json({ success: false });
      },
    );
    apiKeyMocks.handleOptionalApiKey.mockImplementation(
      (req: AuthenticatedRequest, next: NextFunction) => {
        req.user = null;
        next();
      },
    );

    mocks.config.NODE_ENV = 'production';
    mocks.config.JWT_ALGORITHM = 'RS256';
    mocks.config.ADMIN_API_KEY = '';
    mocks.config.DEV_SKIP_AUTH = false;
  });

  describe('verifyToken', () => {
    it('should return payload for a valid RS256 token', async () => {
      vi.resetModules();
      const { verifyToken } = await import('../../../api/middleware/jwtVerifier.js');
      const token = await signRS256(validPayload());
      const payload = await verifyToken(token);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe('user-1');
      expect(payload!.role).toBe('admin');
    });

    it('should return payload for each valid role', async () => {
      vi.resetModules();
      const { verifyToken } = await import('../../../api/middleware/jwtVerifier.js');

      for (const role of ['admin', 'analyst', 'readonly'] as const) {
        const token = await signRS256(validPayload({ role }));
        const payload = await verifyToken(token);
        expect(payload).not.toBeNull();
        expect(payload!.role).toBe(role);
      }
    });

    it('should return null for empty token', async () => {
      vi.resetModules();
      const { verifyToken } = await import('../../../api/middleware/jwtVerifier.js');
      expect(await verifyToken('')).toBeNull();
    });

    it('should return null for malformed token', async () => {
      vi.resetModules();
      const { verifyToken } = await import('../../../api/middleware/jwtVerifier.js');
      expect(await verifyToken('not-a-jwt')).toBeNull();
    });

    it('should return null for tampered signature', async () => {
      vi.resetModules();
      const { verifyToken } = await import('../../../api/middleware/jwtVerifier.js');
      const token = await signRS256(validPayload());
      const tampered = token.slice(0, -10) + 'X'.repeat(10);
      expect(await verifyToken(tampered)).toBeNull();
    });

    it('should reject alg=none attack', async () => {
      vi.resetModules();
      const { verifyToken } = await import('../../../api/middleware/jwtVerifier.js');

      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({ sub: 'hacker', role: 'admin', iat: 0, exp: 9999999999 }),
      ).toString('base64url');
      const attackToken = `${header}.${payload}.`;
      expect(await verifyToken(attackToken)).toBeNull();
    });

    it('should reject token with tampered payload', async () => {
      vi.resetModules();
      const { verifyToken } = await import('../../../api/middleware/jwtVerifier.js');

      const token = await signRS256(validPayload());
      const parts = token.split('.');
      const tamperedPayload = Buffer.from(
        JSON.stringify({ sub: 'hacker', role: 'admin', iat: 0, exp: 9999999999 }),
      ).toString('base64url');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
      expect(await verifyToken(tamperedToken)).toBeNull();
    });

    it('should reject expired token', async () => {
      vi.resetModules();
      const { verifyToken } = await import('../../../api/middleware/jwtVerifier.js');

      const expiredToken = await new SignJWT(validPayload())
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
        .sign(rs256PrivateKey);

      expect(await verifyToken(expiredToken)).toBeNull();
    });

    it('should reject missing sub claim', async () => {
      vi.resetModules();
      const { verifyToken } = await import('../../../api/middleware/jwtVerifier.js');

      const { sub: _, ...noSub } = validPayload();
      const token = await signRS256(noSub);
      expect(await verifyToken(token)).toBeNull();
    });

    it('should reject empty sub claim', async () => {
      vi.resetModules();
      const { verifyToken } = await import('../../../api/middleware/jwtVerifier.js');

      const token = await signRS256(validPayload({ sub: '' }));
      expect(await verifyToken(token)).toBeNull();
    });

    it('should reject missing role claim', async () => {
      vi.resetModules();
      const { verifyToken } = await import('../../../api/middleware/jwtVerifier.js');

      const { role: _, ...noRole } = validPayload();
      const token = await signRS256(noRole);
      expect(await verifyToken(token)).toBeNull();
    });

    it('should reject invalid role claim', async () => {
      vi.resetModules();
      const { verifyToken } = await import('../../../api/middleware/jwtVerifier.js');

      const token = await signRS256(validPayload({ role: 'superadmin' }));
      expect(await verifyToken(token)).toBeNull();
    });

    it('should reject missing exp claim', async () => {
      vi.resetModules();
      const { verifyToken } = await import('../../../api/middleware/jwtVerifier.js');

      const token = await new SignJWT({ sub: 'user-1', role: 'admin' })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuedAt()
        .sign(rs256PrivateKey);

      expect(await verifyToken(token)).toBeNull();
    });

    it('should reject revoked access token', async () => {
      refreshTokenMocks.isAccessTokenRevokedForUser.mockResolvedValue(true);
      vi.resetModules();
      const { verifyToken } = await import('../../../api/middleware/jwtVerifier.js');

      const token = await signRS256(validPayload());
      expect(await verifyToken(token)).toBeNull();
      expect(refreshTokenMocks.isAccessTokenRevokedForUser).toHaveBeenCalledWith(
        'user-1',
        expect.any(Number),
      );
    });

    it('should pass revocation check for non-revoked token', async () => {
      vi.resetModules();
      const { verifyToken } = await import('../../../api/middleware/jwtVerifier.js');

      const token = await signRS256(validPayload());
      const payload = await verifyToken(token);
      expect(payload).not.toBeNull();
    });

    it('should verify HS256 token when configured for HS256', async () => {
      mocks.config.JWT_ALGORITHM = 'HS256';
      vi.resetModules();
      const { verifyToken } = await import('../../../api/middleware/jwtVerifier.js');

      const token = await signHS256(validPayload());
      const payload = await verifyToken(token);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe('user-1');
      expect(payload!.role).toBe('admin');
    });

    it('should fall back from RS256 to HS256 when RS256 verification fails and HS256 configured', async () => {
      mocks.config.JWT_ALGORITHM = 'HS256';
      jwtSignerMocks.getOrCachePublicKey.mockResolvedValue(rs256PublicKey);
      vi.resetModules();
      const { verifyToken } = await import('../../../api/middleware/jwtVerifier.js');

      const token = await signHS256(validPayload());
      const payload = await verifyToken(token);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe('user-1');
    });

    it('should not fall back to HS256 when algorithm is RS256', async () => {
      mocks.config.JWT_ALGORITHM = 'RS256';
      vi.resetModules();
      const { verifyToken } = await import('../../../api/middleware/jwtVerifier.js');

      const token = await signHS256(validPayload());
      expect(await verifyToken(token)).toBeNull();
    });

    it('should accept token with null byte in sub', async () => {
      vi.resetModules();
      const { verifyToken } = await import('../../../api/middleware/jwtVerifier.js');

      const token = await signRS256(validPayload({ sub: 'user\0admin' }));
      const payload = await verifyToken(token);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe('user\0admin');
    });
  });

  describe('jwtAuth middleware', () => {
    it('should call next and set req.user for valid Bearer token', async () => {
      vi.resetModules();
      const { jwtAuth } = await import('../../../api/middleware/jwtVerifier.js');

      const token = await signRS256(validPayload());
      const req = createMockReq({ headers: { authorization: `Bearer ${token}` } });
      const res = createMockRes();
      const next = createMockNext();

      await new Promise<void>((resolve) => {
        jwtAuth(req, res, () => {
          next();
          resolve();
        });
      });

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).not.toBeNull();
      expect((req.user as JwtPayload).sub).toBe('user-1');
    });

    it('should return 401 for invalid Bearer token', async () => {
      vi.resetModules();
      const { jwtAuth } = await import('../../../api/middleware/jwtVerifier.js');

      const req = createMockReq({ headers: { authorization: 'Bearer invalid-token' } });
      const res = createMockRes();
      const next = createMockNext();

      await new Promise<void>((resolve) => {
        const origJson = res.json.bind(res);
        res.json = vi.fn((...args: unknown[]) => {
          origJson(...args);
          resolve();
          return res;
        }) as typeof res.json;
        jwtAuth(req, res, next);
      });

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 401 for expired token', async () => {
      const expiredToken = await new SignJWT(validPayload())
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
        .sign(rs256PrivateKey);

      vi.resetModules();
      const { jwtAuth } = await import('../../../api/middleware/jwtVerifier.js');

      const req = createMockReq({ headers: { authorization: `Bearer ${expiredToken}` } });
      const res = createMockRes();
      const next = createMockNext();

      await new Promise<void>((resolve) => {
        const origJson = res.json.bind(res);
        res.json = vi.fn((...args: unknown[]) => {
          origJson(...args);
          resolve();
          return res;
        }) as typeof res.json;
        jwtAuth(req, res, next);
      });

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 401 for revoked session', async () => {
      refreshTokenMocks.isAccessTokenRevokedForUser.mockResolvedValue(true);
      vi.resetModules();
      const { jwtAuth } = await import('../../../api/middleware/jwtVerifier.js');

      const token = await signRS256(validPayload());
      const req = createMockReq({ headers: { authorization: `Bearer ${token}` } });
      const res = createMockRes();
      const next = createMockNext();

      await new Promise<void>((resolve) => {
        const origJson = res.json.bind(res);
        res.json = vi.fn((...args: unknown[]) => {
          origJson(...args);
          resolve();
          return res;
        }) as typeof res.json;
        jwtAuth(req, res, next);
      });

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 401 for disabled account', async () => {
      refreshTokenMocks.isUserSessionValid.mockResolvedValue(false);
      vi.resetModules();
      const { jwtAuth } = await import('../../../api/middleware/jwtVerifier.js');

      const token = await signRS256(validPayload());
      const req = createMockReq({ headers: { authorization: `Bearer ${token}` } });
      const res = createMockRes();
      const next = createMockNext();

      await new Promise<void>((resolve) => {
        const origJson = res.json.bind(res);
        res.json = vi.fn((...args: unknown[]) => {
          origJson(...args);
          resolve();
          return res;
        }) as typeof res.json;
        jwtAuth(req, res, next);
      });

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 401 for missing auth header', async () => {
      vi.resetModules();
      const { jwtAuth } = await import('../../../api/middleware/jwtVerifier.js');

      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      jwtAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 401 for Bearer without token', async () => {
      vi.resetModules();
      const { jwtAuth } = await import('../../../api/middleware/jwtVerifier.js');

      const req = createMockReq({ headers: { authorization: 'Bearer ' } });
      const res = createMockRes();
      const next = createMockNext();

      await new Promise<void>((resolve) => {
        const origJson = res.json.bind(res);
        res.json = vi.fn((...args: unknown[]) => {
          origJson(...args);
          resolve();
          return res;
        }) as typeof res.json;
        jwtAuth(req, res, next);
      });

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should delegate to handleApiKeyAuth when x-api-key header present', async () => {
      let apiKeyCalled = false;
      apiKeyMocks.handleApiKeyAuth.mockImplementation(
        (_req: AuthenticatedRequest, _res: Response, _next: NextFunction) => {
          apiKeyCalled = true;
        },
      );

      vi.resetModules();
      const { jwtAuth } = await import('../../../api/middleware/jwtVerifier.js');

      const req = createMockReq({ headers: { 'x-api-key': 'some-api-key' } });
      const res = createMockRes();
      const next = createMockNext();

      jwtAuth(req, res, next);

      expect(apiKeyCalled).toBe(true);
      expect(apiKeyMocks.handleApiKeyAuth).toHaveBeenCalled();
    });

    it('should use dev bypass when tryDevBypass returns true', async () => {
      devBypassMocks.tryDevBypass.mockImplementation(
        (req: AuthenticatedRequest, next: NextFunction) => {
          req.user = { sub: 'dev-user', role: 'readonly', iat: 0, exp: 99999 };
          next();
          return true;
        },
      );

      vi.resetModules();
      const { jwtAuth } = await import('../../../api/middleware/jwtVerifier.js');

      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      jwtAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect((req.user as JwtPayload).sub).toBe('dev-user');
      expect(devBypassMocks.tryDevBypass).toHaveBeenCalled();
    });

    it('should prioritize Bearer token over x-api-key', async () => {
      vi.resetModules();
      const { jwtAuth } = await import('../../../api/middleware/jwtVerifier.js');

      const token = await signRS256(validPayload());
      const req = createMockReq({
        headers: {
          authorization: `Bearer ${token}`,
          'x-api-key': 'some-key',
        },
      });
      const res = createMockRes();
      const next = createMockNext();

      await new Promise<void>((resolve) => {
        jwtAuth(req, res, () => {
          next();
          resolve();
        });
      });

      expect(next).toHaveBeenCalled();
      expect((req.user as JwtPayload).sub).toBe('user-1');
      expect(apiKeyMocks.handleApiKeyAuth).not.toHaveBeenCalled();
    });

    it('should handle concurrent jwtAuth calls independently', async () => {
      vi.resetModules();
      const { jwtAuth } = await import('../../../api/middleware/jwtVerifier.js');

      const tokens = await Promise.all([
        signRS256(validPayload({ sub: 'user-1', role: 'admin' })),
        signRS256(validPayload({ sub: 'user-2', role: 'analyst' })),
        signRS256(validPayload({ sub: 'user-3', role: 'readonly' })),
      ]);

      const results = await Promise.all(
        tokens.map((token) => {
          const req = createMockReq({ headers: { authorization: `Bearer ${token}` } });
          const res = createMockRes();
          const next = createMockNext();
          return new Promise<AuthenticatedRequest>((resolve) => {
            jwtAuth(req, res, () => {
              next();
              resolve(req);
            });
          });
        }),
      );

      expect(results[0].user?.sub).toBe('user-1');
      expect(results[1].user?.sub).toBe('user-2');
      expect(results[2].user?.sub).toBe('user-3');
      expect(results[0].user?.role).toBe('admin');
      expect(results[1].user?.role).toBe('analyst');
      expect(results[2].user?.role).toBe('readonly');
    });
  });

  describe('optionalJwtAuth middleware', () => {
    it('should set req.user and call next for valid Bearer token', async () => {
      vi.resetModules();
      const { optionalJwtAuth } = await import('../../../api/middleware/jwtVerifier.js');

      const token = await signRS256(validPayload());
      const req = createMockReq({ headers: { authorization: `Bearer ${token}` } });
      const res = createMockRes();
      const next = createMockNext();

      await new Promise<void>((resolve) => {
        optionalJwtAuth(req, res, () => {
          next();
          resolve();
        });
      });

      expect(next).toHaveBeenCalled();
      expect((req.user as JwtPayload).sub).toBe('user-1');
    });

    it('should set null user and call next for invalid Bearer token', async () => {
      vi.resetModules();
      const { optionalJwtAuth } = await import('../../../api/middleware/jwtVerifier.js');

      const req = createMockReq({ headers: { authorization: 'Bearer invalid' } });
      const res = createMockRes();
      const next = createMockNext();

      await new Promise<void>((resolve) => {
        optionalJwtAuth(req, res, () => {
          next();
          resolve();
        });
      });

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeNull();
    });

    it('should call next with null user when no auth header', async () => {
      vi.resetModules();
      const { optionalJwtAuth } = await import('../../../api/middleware/jwtVerifier.js');

      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      optionalJwtAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeNull();
      expect(apiKeyMocks.handleOptionalApiKey).toHaveBeenCalled();
    });

    it('should not throw when verifyJwt throws unexpected error', async () => {
      jwtSignerMocks.getOrCachePublicKey.mockRejectedValue(new Error('unexpected crypto error'));
      vi.resetModules();
      const { optionalJwtAuth } = await import('../../../api/middleware/jwtVerifier.js');

      const req = createMockReq({ headers: { authorization: 'Bearer some-token' } });
      const res = createMockRes();
      const next = createMockNext();

      await new Promise<void>((resolve) => {
        optionalJwtAuth(req, res, () => {
          next();
          resolve();
        });
      });

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeNull();
    });
  });

  describe('assignGuestReadonly', () => {
    it('should assign guest user when req.user is undefined', async () => {
      vi.resetModules();
      const { assignGuestReadonly } = await import('../../../api/middleware/jwtVerifier.js');

      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      assignGuestReadonly(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user!.sub).toBe('guest');
      expect(req.user!.role).toBe('readonly');
      expect(next).toHaveBeenCalled();
    });

    it('should assign guest user when req.user is null', async () => {
      vi.resetModules();
      const { assignGuestReadonly } = await import('../../../api/middleware/jwtVerifier.js');

      const req = createMockReq({ user: null });
      const res = createMockRes();
      const next = createMockNext();

      assignGuestReadonly(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user!.sub).toBe('guest');
      expect(req.user!.role).toBe('readonly');
      expect(next).toHaveBeenCalled();
    });

    it('should preserve existing user when already set', async () => {
      vi.resetModules();
      const { assignGuestReadonly } = await import('../../../api/middleware/jwtVerifier.js');

      const existingUser: JwtPayload = { sub: 'real-user', role: 'admin', iat: 123, exp: 456 };
      const req = createMockReq({ user: existingUser });
      const res = createMockRes();
      const next = createMockNext();

      assignGuestReadonly(req, res, next);

      expect(req.user).toBe(existingUser);
      expect(req.user!.sub).toBe('real-user');
      expect(next).toHaveBeenCalled();
    });

    it('should always call next', async () => {
      vi.resetModules();
      const { assignGuestReadonly } = await import('../../../api/middleware/jwtVerifier.js');

      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      assignGuestReadonly(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('verifyToken edge cases', () => {
    it('should return null for token with non-finite exp', async () => {
      vi.resetModules();
      const { verifyToken } = await import('../../../api/middleware/jwtVerifier.js');

      const token = await new SignJWT(validPayload({ exp: Infinity }))
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuedAt()
        .sign(rs256PrivateKey);

      expect(await verifyToken(token)).toBeNull();
    });

    it('should check revoked status with correct iat', async () => {
      vi.resetModules();
      const { verifyToken } = await import('../../../api/middleware/jwtVerifier.js');

      const specificIat = Math.floor(Date.now() / 1000);
      const token = await new SignJWT(validPayload())
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuedAt(specificIat)
        .setExpirationTime('1h')
        .sign(rs256PrivateKey);

      await verifyToken(token);

      expect(refreshTokenMocks.isAccessTokenRevokedForUser).toHaveBeenCalledWith(
        'user-1',
        specificIat,
      );
    });

    it('should check user session validity via jwtAuth middleware', async () => {
      refreshTokenMocks.isUserSessionValid.mockResolvedValue(false);
      vi.resetModules();
      const { jwtAuth } = await import('../../../api/middleware/jwtVerifier.js');

      const token = await signRS256(validPayload());
      const req = createMockReq({ headers: { authorization: `Bearer ${token}` } });
      const res = createMockRes();
      const next = createMockNext();

      await new Promise<void>((resolve) => {
        const origJson = res.json.bind(res);
        res.json = vi.fn((...args: unknown[]) => {
          origJson(...args);
          resolve();
          return res;
        }) as typeof res.json;
        jwtAuth(req, res, next);
      });

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});
