import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLoggerMocks, mockLogger } from '../../helpers/mockFactories.js';

const mocks = vi.hoisted(() => ({
  config: {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-jwt-secret-for-unit-tests',
    JWT_ACCESS_TTL: 900,
    JWT_REFRESH_TTL: 604800,
    JWT_ALGORITHM: 'RS256',
    JWT_PRIVATE_KEY: '',
    JWT_PRIVATE_KEY_FILE: '',
    JWT_PUBLIC_KEY: '',
    JWT_PUBLIC_KEY_FILE: '',
  },
  fs: {
    readFileSync: vi.fn(),
  },
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({ config: mocks.config }));
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(createLoggerMocks()),
}));
vi.mock('fs', () => ({
  default: { readFileSync: mocks.fs.readFileSync },
  readFileSync: mocks.fs.readFileSync,
}));

import { generateKeyPair, exportPKCS8, exportSPKI, SignJWT, jwtVerify } from 'jose';

function decodePayload(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}

describe('jwtSigner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config.NODE_ENV = 'test';
    mocks.config.JWT_ALGORITHM = 'RS256';
    mocks.config.JWT_PRIVATE_KEY = '';
    mocks.config.JWT_PRIVATE_KEY_FILE = '';
    mocks.config.JWT_PUBLIC_KEY = '';
    mocks.config.JWT_PUBLIC_KEY_FILE = '';
  });

  describe('generateToken', () => {
    it('should generate a valid 3-part JWT for each role', async () => {
      vi.resetModules();
      const { generateToken } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');

      for (const role of ['admin', 'analyst', 'readonly'] as const) {
        const token = await generateToken('user-1', role);
        expect(token).toBeTruthy();
        expect(typeof token).toBe('string');
        expect(token.split('.')).toHaveLength(3);
      }
    });

    it('should embed correct sub and role in payload', async () => {
      vi.resetModules();
      const { generateToken } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');

      const token = await generateToken('user-42', 'admin');
      const payload = decodePayload(token);
      expect(payload.sub).toBe('user-42');
      expect(payload.role).toBe('admin');
    });

    it('should set iat and exp timestamps', async () => {
      vi.resetModules();
      const { generateToken } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');

      const before = Math.floor(Date.now() / 1000);
      const token = await generateToken('user-1', 'analyst');
      const after = Math.floor(Date.now() / 1000);
      const payload = decodePayload(token);

      expect(payload.iat).toBeGreaterThanOrEqual(before);
      expect(payload.iat).toBeLessThanOrEqual(after);
      expect(payload.exp).toBe(payload.iat! + mocks.config.JWT_ACCESS_TTL);
    });

    it('should embed tenant context when provided', async () => {
      vi.resetModules();
      const { generateToken } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');

      const token = await generateToken('user-1', 'admin', {
        tenantId: 'org-123',
        orgRole: 'owner',
        platformAdmin: true,
      });
      const payload = decodePayload(token);
      expect(payload.tenant_id).toBe('org-123');
      expect(payload.org_role).toBe('owner');
      expect(payload.platform_admin).toBe(true);
    });

    it('should omit tenant fields when no tenant context given', async () => {
      vi.resetModules();
      const { generateToken } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');

      const token = await generateToken('user-1', 'readonly');
      const payload = decodePayload(token);
      expect(payload.tenant_id).toBeUndefined();
      expect(payload.org_role).toBeUndefined();
      expect(payload.platform_admin).toBeUndefined();
    });

    it('should embed only tenantId when orgRole alone is missing', async () => {
      vi.resetModules();
      const { generateToken } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');

      const token = await generateToken('user-1', 'admin', { tenantId: 'org-456' });
      const payload = decodePayload(token);
      expect(payload.tenant_id).toBe('org-456');
      expect(payload.org_role).toBeUndefined();
      expect(payload.platform_admin).toBeUndefined();
    });

    it('should produce tokens verifiable with RS256 public key', async () => {
      vi.resetModules();
      const { generateToken, getOrCachePublicKey } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');

      const token = await generateToken('verify-me', 'analyst');
      const publicKey = await getOrCachePublicKey();
      const { payload } = await jwtVerify(token, publicKey, { algorithms: ['RS256'] });
      expect(payload.sub).toBe('verify-me');
      expect(payload.role).toBe('analyst');
    });

    it('should work in HS256 mode', async () => {
      mocks.config.JWT_ALGORITHM = 'HS256';
      vi.resetModules();
      const { generateToken, getOrCacheHS256Key } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');

      const token = await generateToken('hs256-user', 'admin');
      const key = await getOrCacheHS256Key();
      const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
      expect(payload.sub).toBe('hs256-user');
      expect(payload.role).toBe('admin');
    });

    it('should handle long userId strings', async () => {
      vi.resetModules();
      const { generateToken } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');

      const longId = 'a'.repeat(200);
      const token = await generateToken(longId, 'readonly');
      const payload = decodePayload(token);
      expect(payload.sub).toBe(longId);
    });
  });

  describe('getOrCachePrivateKey', () => {
    it('should load private key from JWT_PRIVATE_KEY env var in production', async () => {
      const { publicKey, privateKey } = await generateKeyPair('RS256', {
        modulusLength: 2048,
        extractable: true,
      });
      mocks.config.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
      mocks.config.JWT_PUBLIC_KEY = await exportSPKI(publicKey);
      mocks.config.NODE_ENV = 'production';

      vi.resetModules();
      const { getOrCachePrivateKey } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');
      const key = await getOrCachePrivateKey();
      expect(key).toBeTruthy();
    });

    it('should read private key from PEM file when file path configured', async () => {
      const { publicKey, privateKey } = await generateKeyPair('RS256', {
        modulusLength: 2048,
        extractable: true,
      });
      const privatePem = await exportPKCS8(privateKey);
      const publicPem = await exportSPKI(publicKey);

      mocks.fs.readFileSync.mockImplementation((filePath: string) => {
        if (String(filePath).includes('private')) return privatePem;
        if (String(filePath).includes('public')) return publicPem;
        throw new Error('ENOENT');
      });

      mocks.config.JWT_PRIVATE_KEY = '';
      mocks.config.JWT_PRIVATE_KEY_FILE = '/secrets/private.pem';
      mocks.config.JWT_PUBLIC_KEY = '';
      mocks.config.JWT_PUBLIC_KEY_FILE = '/secrets/public.pem';
      mocks.config.NODE_ENV = 'production';

      vi.resetModules();
      const { getOrCachePrivateKey } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');
      const key = await getOrCachePrivateKey();
      expect(key).toBeTruthy();
      expect(mocks.fs.readFileSync).toHaveBeenCalledWith('/secrets/private.pem', 'utf-8');
    });

    it('should auto-generate key in non-production mode when no keys configured', async () => {
      mocks.config.NODE_ENV = 'development';
      mocks.config.JWT_PRIVATE_KEY = '';
      mocks.config.JWT_PRIVATE_KEY_FILE = '';

      vi.resetModules();
      const { getOrCachePrivateKey } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');
      const key = await getOrCachePrivateKey();
      expect(key).toBeTruthy();
    });

    it('should throw in production when no RSA keys configured', async () => {
      mocks.config.NODE_ENV = 'production';
      mocks.config.JWT_PRIVATE_KEY = '';
      mocks.config.JWT_PRIVATE_KEY_FILE = '';

      vi.resetModules();
      const { getOrCachePrivateKey } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');
      await expect(getOrCachePrivateKey()).rejects.toThrow(/JWT_PRIVATE_KEY/);
    });

    it('should return cached key on repeated calls', async () => {
      mocks.config.NODE_ENV = 'development';

      vi.resetModules();
      const jwtSigner = await import('../../../packages/backend/src/middleware/jwtSigner.js');

      const first = await jwtSigner.getOrCachePrivateKey();
      const second = await jwtSigner.getOrCachePrivateKey();
      expect(second).toBe(first);
    });
  });

  describe('getOrCachePublicKey', () => {
    it('should load public key from JWT_PUBLIC_KEY env var in production', async () => {
      const { publicKey, privateKey } = await generateKeyPair('RS256', {
        modulusLength: 2048,
        extractable: true,
      });
      mocks.config.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
      mocks.config.JWT_PUBLIC_KEY = await exportSPKI(publicKey);
      mocks.config.NODE_ENV = 'production';

      vi.resetModules();
      const { getOrCachePublicKey } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');
      const key = await getOrCachePublicKey();
      expect(key).toBeTruthy();
    });

    it('should read public key from PEM file when file path configured', async () => {
      const { publicKey, privateKey } = await generateKeyPair('RS256', {
        modulusLength: 2048,
        extractable: true,
      });
      const privatePem = await exportPKCS8(privateKey);
      const publicPem = await exportSPKI(publicKey);

      mocks.fs.readFileSync.mockImplementation((filePath: string) => {
        if (String(filePath).includes('public')) return publicPem;
        if (String(filePath).includes('private')) return privatePem;
        throw new Error('ENOENT');
      });

      mocks.config.JWT_PUBLIC_KEY = '';
      mocks.config.JWT_PUBLIC_KEY_FILE = '/secrets/public.pem';
      mocks.config.JWT_PRIVATE_KEY = '';
      mocks.config.JWT_PRIVATE_KEY_FILE = '/secrets/private.pem';
      mocks.config.NODE_ENV = 'production';

      vi.resetModules();
      const { getOrCachePublicKey } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');
      const key = await getOrCachePublicKey();
      expect(key).toBeTruthy();
      expect(mocks.fs.readFileSync).toHaveBeenCalledWith('/secrets/public.pem', 'utf-8');
    });

    it('should auto-generate key pair and return public key in dev mode', async () => {
      mocks.config.NODE_ENV = 'development';

      vi.resetModules();
      const { getOrCachePublicKey } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');
      const key = await getOrCachePublicKey();
      expect(key).toBeTruthy();
    });

    it('should throw in production when no RSA public key configured', async () => {
      mocks.config.NODE_ENV = 'production';
      mocks.config.JWT_PUBLIC_KEY = '';
      mocks.config.JWT_PUBLIC_KEY_FILE = '';

      vi.resetModules();
      const { getOrCachePublicKey } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');
      await expect(getOrCachePublicKey()).rejects.toThrow(/JWT_PUBLIC_KEY/);
    });

    it('should return cached public key on repeated calls', async () => {
      mocks.config.NODE_ENV = 'development';

      vi.resetModules();
      const jwtSigner = await import('../../../packages/backend/src/middleware/jwtSigner.js');

      const first = await jwtSigner.getOrCachePublicKey();
      const second = await jwtSigner.getOrCachePublicKey();
      expect(second).toBe(first);
    });

    it('should pair with private key for round-trip sign+verify', async () => {
      const { publicKey, privateKey } = await generateKeyPair('RS256', {
        modulusLength: 2048,
        extractable: true,
      });
      mocks.config.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
      mocks.config.JWT_PUBLIC_KEY = await exportSPKI(publicKey);
      mocks.config.NODE_ENV = 'production';

      vi.resetModules();
      const { getOrCachePublicKey, generateToken } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');

      const token = await generateToken('roundtrip', 'admin');
      const pubKey = await getOrCachePublicKey();
      const { payload } = await jwtVerify(token, pubKey, { algorithms: ['RS256'] });
      expect(payload.sub).toBe('roundtrip');
    });
  });

  describe('getOrCacheHS256Key', () => {
    it('should return an HS256-compatible key', async () => {
      mocks.config.JWT_ALGORITHM = 'HS256';

      vi.resetModules();
      const { getOrCacheHS256Key, generateToken } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');

      const key = await getOrCacheHS256Key();
      expect(key).toBeTruthy();

      const token = await generateToken('hs256-test', 'analyst');
      const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
      expect(payload.sub).toBe('hs256-test');
    });

    it('should cache the HS256 key on repeated calls', async () => {
      vi.resetModules();
      const jwtSigner = await import('../../../packages/backend/src/middleware/jwtSigner.js');

      const first = await jwtSigner.getOrCacheHS256Key();
      const second = await jwtSigner.getOrCacheHS256Key();
      expect(second).toBe(first);
    });
  });

  describe('PEM file error handling', () => {
    it('should throw a descriptive error when PEM file is missing', async () => {
      mocks.fs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      mocks.config.JWT_PRIVATE_KEY = '';
      mocks.config.JWT_PRIVATE_KEY_FILE = '/missing/private.pem';
      mocks.config.JWT_PUBLIC_KEY = '';
      mocks.config.JWT_PUBLIC_KEY_FILE = '';
      mocks.config.NODE_ENV = 'production';

      vi.resetModules();
      const { getOrCachePrivateKey } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');
      await expect(getOrCachePrivateKey()).rejects.toThrow(/无法读取 PEM 文件/);
    });

    it('should throw a descriptive error when PEM file path has invalid content', async () => {
      mocks.fs.readFileSync.mockReturnValue('not-a-valid-pem-key');

      mocks.config.JWT_PRIVATE_KEY = '';
      mocks.config.JWT_PRIVATE_KEY_FILE = '/secrets/private.pem';
      mocks.config.NODE_ENV = 'production';

      vi.resetModules();
      const { getOrCachePrivateKey } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');

      const readPemFile = mocks.fs.readFileSync as unknown as ReturnType<typeof vi.fn>;
      expect(readPemFile).toHaveBeenCalledTimes(0);
      await expect(getOrCachePrivateKey()).rejects.toThrow();
    });
  });

  describe('key pair pairing (internal dev key pair)', () => {
    it('dev-generated private and public keys should work for signing and verification', async () => {
      mocks.config.NODE_ENV = 'development';

      vi.resetModules();
      const { getOrCachePrivateKey, getOrCachePublicKey } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');

      const privKey = await getOrCachePrivateKey();
      const pubKey = await getOrCachePublicKey();
      const token = await new SignJWT({ sub: 'dev-pair', role: 'admin' })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(privKey);

      const { payload } = await jwtVerify(token, pubKey, { algorithms: ['RS256'] });
      expect(payload.sub).toBe('dev-pair');
    });

    it('dev key pair should be reused on subsequent calls (cached)', async () => {
      mocks.config.NODE_ENV = 'development';

      vi.resetModules();
      const { getOrCachePrivateKey } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');

      const first = await getOrCachePrivateKey();
      const second = await getOrCachePrivateKey();
      expect(second).toBe(first);
    });
  });

  describe('production with RS256 env var keys end-to-end', () => {
    it('should generate tokens in production with configured RSA keys', async () => {
      const { publicKey, privateKey } = await generateKeyPair('RS256', {
        modulusLength: 2048,
        extractable: true,
      });
      mocks.config.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
      mocks.config.JWT_PUBLIC_KEY = await exportSPKI(publicKey);
      mocks.config.NODE_ENV = 'production';

      vi.resetModules();
      const { generateToken, getOrCachePublicKey } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');

      const token = await generateToken('prod-user', 'analyst');
      const pubKey = await getOrCachePublicKey();
      const { payload } = await jwtVerify(token, pubKey, { algorithms: ['RS256'] });
      expect(payload.sub).toBe('prod-user');
      expect(payload.role).toBe('analyst');
    });
  });

  describe('readPemFile error propagation', () => {
    it('fs read error should produce Chinese error message with file path', async () => {
      mocks.fs.readFileSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      mocks.config.JWT_PRIVATE_KEY = '';
      mocks.config.JWT_PRIVATE_KEY_FILE = '/etc/secrets/key.pem';
      mocks.config.NODE_ENV = 'production';

      vi.resetModules();
      const { getOrCachePrivateKey } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');
      await expect(getOrCachePrivateKey()).rejects.toThrow(
        /无法读取 PEM 文件.*\/etc\/secrets\/key\.pem/,
      );
    });

    it('non-Error exception should still produce Chinese error message', async () => {
      mocks.fs.readFileSync.mockImplementation(() => {
        throw 'string error';
      });

      mocks.config.JWT_PRIVATE_KEY = '';
      mocks.config.JWT_PRIVATE_KEY_FILE = '/secrets/key.pem';
      mocks.config.NODE_ENV = 'production';

      vi.resetModules();
      const { getOrCachePrivateKey } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');
      await expect(getOrCachePrivateKey()).rejects.toThrow(/无法读取 PEM 文件/);
    });
  });

  describe('HS256 fallback key', () => {
    it('should be importable from JWK using JWT_SECRET', async () => {
      vi.resetModules();
      const { getOrCacheHS256Key } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');
      const key = await getOrCacheHS256Key();
      expect(key).toBeTruthy();
    });

    it('should sign and verify HS256 tokens when algorithm is HS256', async () => {
      mocks.config.JWT_ALGORITHM = 'HS256';
      vi.resetModules();
      const { generateToken, getOrCacheHS256Key } =
        await import('../../../packages/backend/src/middleware/jwtSigner.js');

      const token = await generateToken('jwk-test', 'readonly');
      const key = await getOrCacheHS256Key();
      const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
      expect(payload.sub).toBe('jwk-test');
    });
  });
});
