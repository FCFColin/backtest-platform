import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLoggerMocks, mockLogger } from '../../helpers/mockFactories.js';
import { generateKeyPair, exportPKCS8, exportSPKI, SignJWT, jwtVerify } from 'jose';

const mocks = vi.hoisted(() => ({
  config: {
    NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-for-unit-tests', JWT_ACCESS_TTL: 900, JWT_REFRESH_TTL: 604800,
    JWT_ALGORITHM: 'RS256', JWT_PRIVATE_KEY: '', JWT_PRIVATE_KEY_FILE: '', JWT_PUBLIC_KEY: '', JWT_PUBLIC_KEY_FILE: '',
  },
  fs: { readFileSync: vi.fn() },
}));
vi.mock('../../../packages/backend/src/config/index.js', () => ({ config: mocks.config }));
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: mockLogger(createLoggerMocks()) }));
vi.mock('fs', () => ({ default: { readFileSync: mocks.fs.readFileSync }, readFileSync: mocks.fs.readFileSync }));

const decodePayload = (token: string): Record<string, unknown> => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
async function loadSigner() { vi.resetModules(); return import('../../../packages/backend/src/middleware/jwtAuth.js'); }
function resetConfig(env = 'test') {
  mocks.config.NODE_ENV = env; mocks.config.JWT_ALGORITHM = 'RS256';
  mocks.config.JWT_PRIVATE_KEY = ''; mocks.config.JWT_PRIVATE_KEY_FILE = '';
  mocks.config.JWT_PUBLIC_KEY = ''; mocks.config.JWT_PUBLIC_KEY_FILE = '';
}
async function setupRsaKeyPair() {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
  const privatePem = await exportPKCS8(privateKey);
  const publicPem = await exportSPKI(publicKey);
  mocks.config.JWT_PRIVATE_KEY = privatePem; mocks.config.JWT_PUBLIC_KEY = publicPem;
  return { publicKey, privateKey, privatePem, publicPem };
}
function setupPemFileMock(privatePem: string, publicPem: string) {
  mocks.fs.readFileSync.mockImplementation((fp: string) => {
    if (String(fp).includes('private')) return privatePem;
    if (String(fp).includes('public')) return publicPem;
    throw new Error('ENOENT');
  });
}

describe('jwtSigner', () => {
  beforeEach(() => { vi.clearAllMocks(); resetConfig(); });

  describe('generateToken', () => {
    it('should generate a valid 3-part JWT for each role', async () => {
      const { generateToken } = await loadSigner();
      for (const role of ['admin', 'analyst', 'readonly'] as const) {
        const token = await generateToken('user-1', role);
        expect(token).toBeTruthy(); expect(typeof token).toBe('string'); expect(token.split('.')).toHaveLength(3);
      }
    });
    it('should embed correct sub and role in payload', async () => {
      const { generateToken } = await loadSigner();
      const payload = decodePayload(await generateToken('user-42', 'admin'));
      expect(payload.sub).toBe('user-42'); expect(payload.role).toBe('admin');
    });
    it('should set iat and exp timestamps', async () => {
      const { generateToken } = await loadSigner();
      const before = Math.floor(Date.now() / 1000);
      const payload = decodePayload(await generateToken('user-1', 'analyst'));
      const after = Math.floor(Date.now() / 1000);
      expect(payload.iat).toBeGreaterThanOrEqual(before); expect(payload.iat).toBeLessThanOrEqual(after);
      expect(payload.exp).toBe(payload.iat! + mocks.config.JWT_ACCESS_TTL);
    });
    it.each([
      ['full tenant context', { tenantId: 'org-123', orgRole: 'owner', platformAdmin: true }, { tenant_id: 'org-123', org_role: 'owner', platform_admin: true }],
      ['no tenant context', undefined, { tenant_id: undefined, org_role: undefined, platform_admin: undefined }],
      ['only tenantId', { tenantId: 'org-456' }, { tenant_id: 'org-456', org_role: undefined, platform_admin: undefined }],
    ])('should embed tenant fields correctly for %s', async (_n, ctx, expected) => {
      const { generateToken } = await loadSigner();
      const payload = decodePayload(await generateToken('user-1', 'admin', ctx));
      expect(payload.tenant_id).toBe(expected.tenant_id);
      expect(payload.org_role).toBe(expected.org_role);
      expect(payload.platform_admin).toBe(expected.platform_admin);
    });
    it('should produce tokens verifiable with RS256 public key', async () => {
      const { generateToken, getOrCachePublicKey } = await loadSigner();
      const token = await generateToken('verify-me', 'analyst');
      const { payload } = await jwtVerify(token, await getOrCachePublicKey(), { algorithms: ['RS256'] });
      expect(payload.sub).toBe('verify-me'); expect(payload.role).toBe('analyst');
    });
    it('should work in HS256 mode', async () => {
      mocks.config.JWT_ALGORITHM = 'HS256';
      const { generateToken, getOrCacheHS256Key } = await loadSigner();
      const { payload } = await jwtVerify(await generateToken('hs256-user', 'admin'), await getOrCacheHS256Key(), { algorithms: ['HS256'] });
      expect(payload.sub).toBe('hs256-user'); expect(payload.role).toBe('admin');
    });
    it('should handle long userId strings', async () => {
      const { generateToken } = await loadSigner();
      const longId = 'a'.repeat(200);
      expect(decodePayload(await generateToken(longId, 'readonly')).sub).toBe(longId);
    });
  });

  describe('getOrCachePrivateKey', () => {
    it('should load private key from JWT_PRIVATE_KEY env var in production', async () => {
      await setupRsaKeyPair(); mocks.config.NODE_ENV = 'production';
      expect(await (await loadSigner()).getOrCachePrivateKey()).toBeTruthy();
    });
    it('should read private key from PEM file when file path configured', async () => {
      const { privatePem, publicPem } = await setupRsaKeyPair();
      setupPemFileMock(privatePem, publicPem);
      mocks.config.JWT_PRIVATE_KEY = ''; mocks.config.JWT_PRIVATE_KEY_FILE = '/secrets/private.pem';
      mocks.config.JWT_PUBLIC_KEY = ''; mocks.config.JWT_PUBLIC_KEY_FILE = '/secrets/public.pem';
      mocks.config.NODE_ENV = 'production';
      await (await loadSigner()).getOrCachePrivateKey();
      expect(mocks.fs.readFileSync).toHaveBeenCalledWith('/secrets/private.pem', 'utf-8');
    });
    it('should auto-generate key in non-production mode when no keys configured', async () => {
      mocks.config.NODE_ENV = 'development';
      expect(await (await loadSigner()).getOrCachePrivateKey()).toBeTruthy();
    });
    it('should throw in production when no RSA keys configured', async () => {
      mocks.config.NODE_ENV = 'production';
      const { getOrCachePrivateKey } = await loadSigner();
      await expect(getOrCachePrivateKey()).rejects.toThrow(/JWT_PRIVATE_KEY/);
    });
    it('should return cached key on repeated calls', async () => {
      mocks.config.NODE_ENV = 'development';
      const s = await loadSigner();
      expect(await s.getOrCachePrivateKey()).toBe(await s.getOrCachePrivateKey());
    });
  });

  describe('getOrCachePublicKey', () => {
    it('should load public key from JWT_PUBLIC_KEY env var in production', async () => {
      await setupRsaKeyPair(); mocks.config.NODE_ENV = 'production';
      expect(await (await loadSigner()).getOrCachePublicKey()).toBeTruthy();
    });
    it('should read public key from PEM file when file path configured', async () => {
      const { privatePem, publicPem } = await setupRsaKeyPair();
      setupPemFileMock(privatePem, publicPem);
      mocks.config.JWT_PUBLIC_KEY = ''; mocks.config.JWT_PUBLIC_KEY_FILE = '/secrets/public.pem';
      mocks.config.JWT_PRIVATE_KEY = ''; mocks.config.JWT_PRIVATE_KEY_FILE = '/secrets/private.pem';
      mocks.config.NODE_ENV = 'production';
      await (await loadSigner()).getOrCachePublicKey();
      expect(mocks.fs.readFileSync).toHaveBeenCalledWith('/secrets/public.pem', 'utf-8');
    });
    it('should auto-generate key pair and return public key in dev mode', async () => {
      mocks.config.NODE_ENV = 'development';
      expect(await (await loadSigner()).getOrCachePublicKey()).toBeTruthy();
    });
    it('should throw in production when no RSA public key configured', async () => {
      mocks.config.NODE_ENV = 'production';
      const { getOrCachePublicKey } = await loadSigner();
      await expect(getOrCachePublicKey()).rejects.toThrow(/JWT_PUBLIC_KEY/);
    });
    it('should return cached public key on repeated calls', async () => {
      mocks.config.NODE_ENV = 'development';
      const s = await loadSigner();
      expect(await s.getOrCachePublicKey()).toBe(await s.getOrCachePublicKey());
    });
    it('should pair with private key for round-trip sign+verify', async () => {
      await setupRsaKeyPair(); mocks.config.NODE_ENV = 'production';
      const { getOrCachePublicKey, generateToken } = await loadSigner();
      const { payload } = await jwtVerify(await generateToken('roundtrip', 'admin'), await getOrCachePublicKey(), { algorithms: ['RS256'] });
      expect(payload.sub).toBe('roundtrip');
    });
  });

  describe('getOrCacheHS256Key', () => {
    it('should return an HS256-compatible key', async () => {
      mocks.config.JWT_ALGORITHM = 'HS256';
      const { getOrCacheHS256Key, generateToken } = await loadSigner();
      const key = await getOrCacheHS256Key();
      const { payload } = await jwtVerify(await generateToken('hs256-test', 'analyst'), key, { algorithms: ['HS256'] });
      expect(payload.sub).toBe('hs256-test');
    });
    it('should cache the HS256 key on repeated calls', async () => {
      const s = await loadSigner();
      expect(await s.getOrCacheHS256Key()).toBe(await s.getOrCacheHS256Key());
    });
  });

  describe('PEM file error handling', () => {
    it('should throw a descriptive error when PEM file is missing', async () => {
      mocks.fs.readFileSync.mockImplementation(() => { throw new Error('ENOENT: no such file or directory'); });
      mocks.config.JWT_PRIVATE_KEY = ''; mocks.config.JWT_PRIVATE_KEY_FILE = '/missing/private.pem';
      mocks.config.NODE_ENV = 'production';
      const { getOrCachePrivateKey } = await loadSigner();
      await expect(getOrCachePrivateKey()).rejects.toThrow(/无法读取 PEM 文件/);
    });
    it('should throw a descriptive error when PEM file path has invalid content', async () => {
      mocks.fs.readFileSync.mockReturnValue('not-a-valid-pem-key');
      mocks.config.JWT_PRIVATE_KEY = ''; mocks.config.JWT_PRIVATE_KEY_FILE = '/secrets/private.pem';
      mocks.config.NODE_ENV = 'production';
      const { getOrCachePrivateKey } = await loadSigner();
      await expect(getOrCachePrivateKey()).rejects.toThrow();
    });
  });

  describe('key pair pairing (internal dev key pair)', () => {
    it('dev-generated private and public keys should work for signing and verification', async () => {
      mocks.config.NODE_ENV = 'development';
      const { getOrCachePrivateKey, getOrCachePublicKey } = await loadSigner();
      const token = await new SignJWT({ sub: 'dev-pair', role: 'admin' }).setProtectedHeader({ alg: 'RS256' }).setIssuedAt().setExpirationTime('1h').sign(await getOrCachePrivateKey());
      const { payload } = await jwtVerify(token, await getOrCachePublicKey(), { algorithms: ['RS256'] });
      expect(payload.sub).toBe('dev-pair');
    });
    it('dev key pair should be reused on subsequent calls (cached)', async () => {
      mocks.config.NODE_ENV = 'development';
      const s = await loadSigner();
      expect(await s.getOrCachePrivateKey()).toBe(await s.getOrCachePrivateKey());
    });
  });

  describe('production with RS256 env var keys end-to-end', () => {
    it('should generate tokens in production with configured RSA keys', async () => {
      await setupRsaKeyPair(); mocks.config.NODE_ENV = 'production';
      const { generateToken, getOrCachePublicKey } = await loadSigner();
      const { payload } = await jwtVerify(await generateToken('prod-user', 'analyst'), await getOrCachePublicKey(), { algorithms: ['RS256'] });
      expect(payload.sub).toBe('prod-user'); expect(payload.role).toBe('analyst');
    });
  });

  describe('readPemFile error propagation', () => {
    it.each([
      ['fs read error', () => { throw new Error('EACCES: permission denied'); }, '/etc/secrets/key.pem', /无法读取 PEM 文件.*\/etc\/secrets\/key\.pem/],
      ['non-Error exception', () => { throw 'string error'; }, '/secrets/key.pem', /无法读取 PEM 文件/],
    ])('%s should produce Chinese error message', async (_n, impl, filePath, pattern) => {
      mocks.fs.readFileSync.mockImplementation(impl);
      mocks.config.JWT_PRIVATE_KEY = ''; mocks.config.JWT_PRIVATE_KEY_FILE = filePath;
      mocks.config.NODE_ENV = 'production';
      const { getOrCachePrivateKey } = await loadSigner();
      await expect(getOrCachePrivateKey()).rejects.toThrow(pattern);
    });
  });

  describe('HS256 fallback key', () => {
    it('should be importable from JWK using JWT_SECRET', async () => {
      expect(await (await loadSigner()).getOrCacheHS256Key()).toBeTruthy();
    });
    it('should sign and verify HS256 tokens when algorithm is HS256', async () => {
      mocks.config.JWT_ALGORITHM = 'HS256';
      const { generateToken, getOrCacheHS256Key } = await loadSigner();
      const { payload } = await jwtVerify(await generateToken('jwk-test', 'readonly'), await getOrCacheHS256Key(), { algorithms: ['HS256'] });
      expect(payload.sub).toBe('jwk-test');
    });
  });
});