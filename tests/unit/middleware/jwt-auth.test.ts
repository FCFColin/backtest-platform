import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignJWT, importJWK, generateKeyPair, jwtVerify } from 'jose';
import {
  setupJwtAuthTestMocks,
  base64urlEncode,
  signTestToken,
} from '../../helpers/authFixtures.js';
import {
  createJwtAuthMockRequest,
  createJwtAuthMockResponse,
  createJwtAuthMockNext,
  awaitMiddleware,
} from '../../helpers/expressMocks.js';
import {
  mocks,
  redisMocks,
  fsMocks,
  apiKeyMocks,
  mockUser,
  setupRsaKeys,
  resetRsaConfig,
  reloadJwtAuthModule,
} from './jwtAuth.shared.js';

import {
  generateToken,
  verifyToken,
  generateRefreshToken,
  refreshAccessToken,
  revokeAllUserSessions,
  jwtAuth,
  optionalJwtAuth,
  assignGuestReadonly,
} from '../../../packages/backend/src/middleware/jwtAuth.js';
redisMocks.useRedisSuccess();

function mockReqRes(reqInit: Record<string, unknown> = {}) {
  return {
    req: createJwtAuthMockRequest(reqInit),
    res: createJwtAuthMockResponse(),
    next: createJwtAuthMockNext(),
  };
}
async function expectJwtAuth401(
  headers: Record<string, unknown>,
  code?: string,
  mw = jwtAuth,
): Promise<void> {
  const { req, res, next } = mockReqRes({ headers });
  await new Promise<void>((resolve) => {
    const originalJson = res.json.bind(res);
    res.json = vi.fn((...args: unknown[]) => {
      originalJson(...args);
      resolve();
      return res;
    }) as typeof res.json;
    mw(req, res, next);
  });
  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(401);
  if (code) {
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.objectContaining({ code }) }),
    );
  } else {
    expect(res.header).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
  }
}
async function signHS256(payload: Record<string, unknown>, setExp = true): Promise<string> {
  const key = await importJWK({ kty: 'oct', k: base64urlEncode(mocks.config.JWT_SECRET) }, 'HS256');
  const builder = new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt();
  if (setExp) builder.setExpirationTime('1h');
  return builder.sign(key);
}
function signRsa(payload: Record<string, unknown>, key: CryptoKey, kid?: string) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', ...(kid ? { kid } : {}) })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
}
function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { sub: 'user-1', role: 'admin', ...overrides };
}
function setupAuthEnv() {
  setupJwtAuthTestMocks(mocks, redisMocks);
}
function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function decodePayload(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}
const HACKER = { sub: 'hacker', role: 'admin', iat: 0, exp: 9999999999 };

describe('JWT 生成与验证', () => {
  beforeEach(() => setupAuthEnv());
  it('各角色 token 格式正确且 payload 含 sub/role/iat/exp', async () => {
    for (const role of ['admin', 'analyst', 'readonly'] as const) {
      const t = await generateToken('user-1', role);
      const p = await verifyToken(t);
      expect(t.split('.')).toHaveLength(3);
      expect(p!.sub).toBe('user-1');
      expect(p!.role).toBe(role);
    }
    const before = Math.floor(Date.now() / 1000);
    const p = decodePayload(await generateToken('user-42', 'admin'));
    const after = Math.floor(Date.now() / 1000);
    expect(p.iat).toBeGreaterThanOrEqual(before);
    expect(p.iat).toBeLessThanOrEqual(after);
    expect(p.exp).toBe(p.iat! + mocks.config.JWT_ACCESS_TTL);
    const id = 'a'.repeat(200);
    expect(decodePayload(await generateToken(id, 'readonly')).sub).toBe(id);
  });
  it.each([
    ['完整租户上下文', { tenantId: 'org-123', orgRole: 'owner', platformAdmin: true }],
    ['无租户上下文', undefined],
    ['仅 tenantId', { tenantId: 'org-456' }],
  ])('%s 应正确嵌入租户字段', async (_n, ctx) => {
    const p = decodePayload(await generateToken('user-1', 'admin', ctx));
    expect(p.tenant_id).toBe(ctx?.tenantId);
    expect(p.org_role).toBe(ctx?.orgRole);
    expect(p.platform_admin).toBe(ctx?.platformAdmin);
  });
  const gen = () => generateToken('user-1', 'admin');
  it.each([
    ['篡改 token 尾部', async () => (await gen()).slice(0, -5) + 'XXXXX'],
    ['alg=none 攻击', async () => `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(HACKER)}.`],
    [
      'payload 篡改',
      async () => {
        const parts = (await gen()).split('.');
        return `${parts[0]}.${b64url(HACKER)}.${parts[2]}`;
      },
    ],
    ['空 token', async () => ''],
    ['非 JWT 格式', async () => 'not-a-jwt'],
    ['缺少 sub', { sub: undefined, role: 'admin' }],
    ['空 sub', { sub: '', role: 'admin' }],
    ['缺少 role', { sub: 'user-1' }],
    ['非法 role', { sub: 'user-1', role: 'superadmin' }],
  ])('%s 应验证失败', async (_n, payload) => {
    expect(
      await verifyToken(
        typeof payload === 'function' ? await payload() : await signTestToken(payload),
      ),
    ).toBeNull();
  });
  it.each([
    ['缺少 exp', async () => signTestToken({ sub: 'user-1', role: 'admin' }, { omitExp: true })],
    ['exp 为 Infinity', async () => signHS256(validPayload({ exp: Infinity }), false)],
  ])('%s 应被拒绝（永不过期 = 安全风险）', async (_n, build) => {
    expect(await verifyToken(await build())).toBeNull();
  });
  it('Null 字节注入：sub 含 \\0 应原样保留', async () => {
    const p = await verifyToken(await signTestToken({ sub: 'user\0admin', role: 'admin' }));
    expect(p!.sub).toBe('user\0admin');
    expect(p!.sub.length).toBe('user\0admin'.length);
  });
  it('JWT 炸弹：1MB payload 应在 2s 内完成验证且不崩溃', async () => {
    const start = Date.now();
    const p = await verifyToken(
      await signTestToken({ sub: 'user-1', role: 'admin', data: 'A'.repeat(1024 * 1024) }),
    );
    expect(p!.sub).toBe('user-1');
    expect(Date.now() - start).toBeLessThan(2000);
  });
  it('算法混淆攻击：RS256 签名的 token 不应通过 HS256 验证', async () => {
    const { privateKey } = await generateKeyPair('RS256', { modulusLength: 2048 });
    const t = await signRsa({ sub: 'attacker', role: 'admin' }, privateKey);
    expect(await verifyToken(t)).toBeNull();
  });
});

describe('jwtAuth 与相关中间件', () => {
  beforeEach(() => {
    setupAuthEnv();
    mockUser();
    apiKeyMocks.verifyApiKey.mockReset();
    apiKeyMocks.verifyApiKey.mockImplementation(async () => null);
  });
  it.each([
    ['jwtAuth', jwtAuth, 'admin', true],
    ['optionalJwtAuth', optionalJwtAuth, 'readonly', false],
  ])('%s 应注入脱敏日志上下文', async (_n, mw, role, checkRole) => {
    const token = await generateToken('log-context-user', role);
    const childFn = vi.fn(() => ({ info: vi.fn(), warn: vi.fn() }));
    const { req, res, next } = mockReqRes({
      headers: { authorization: `Bearer ${token}` },
      log: { child: childFn },
    });
    await awaitMiddleware(mw, req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user?.sub).toBe('log-context-user');
    if (checkRole) expect(childFn).toHaveBeenCalledWith(expect.objectContaining({ role }));
    else expect(childFn).toHaveBeenCalled();
  });
  it.each([
    ['无效 Bearer', { authorization: 'Bearer invalid-token' }],
    ['Bearer 后无 token', { authorization: 'Bearer ' }],
    ['Basic 认证缺凭证', { authorization: 'Basic dXNlcjpwYXNz' }],
    ['无空格 Bearer 前缀', { authorization: 'Bearertoken-without-space' }],
    ['无认证凭证', {}],
  ])('%s 应返回 401', async (_n, headers) => {
    await expectJwtAuth401(headers);
  });
  it.each([
    ['无效 x-api-key', 'wrong-key'],
    ['超长 x-api-key（防缓冲区攻击）', 'a'.repeat(129)],
  ])('%s 应返回 401', async (_n, key) => {
    apiKeyMocks.verifyApiKey.mockResolvedValueOnce(null);
    const { req, res, next } = mockReqRes({ headers: { 'x-api-key': key } });
    jwtAuth(req, res, next);
    await new Promise<void>((r) => setTimeout(r, 10));
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
  it.each([
    [
      'DB API Key（ADR-033）',
      { orgId: 'org-11111111-1111-1111-1111', keyId: 'key-22222222-2222-2222-2222' },
      {
        role: 'analyst',
        tenant_id: 'org-11111111-1111-1111-1111',
        org_role: 'analyst',
        sub: 'apikey:key-22222222-2222-2222-2222',
      },
    ],
    [
      '平台 break-glass（P0-04）',
      { orgId: null, keyId: 'key-22222222-2222-2222-2222', isPlatformAdmin: true },
      { role: 'admin', platform_admin: true },
    ],
  ])('%s 应注入对应 user', async (_n, apiKeyResult, expectedUser) => {
    apiKeyMocks.verifyApiKey.mockResolvedValueOnce(apiKeyResult as Record<string, unknown>);
    const { req, res, next } = mockReqRes({ headers: { 'x-api-key': 'bpk_live_testkey' } });
    await awaitMiddleware(jwtAuth, req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject(expectedUser);
  });
  it.each([true, false])('DEV_SKIP_AUTH=%s 应%s', async (skip) => {
    mocks.config.NODE_ENV = 'development';
    mocks.config.DEV_SKIP_AUTH = skip;
    mocks.config.JWT_SECRET = 'dev-only-jwt-secret-change-in-production';
    const { req, res, next } = mockReqRes();
    jwtAuth(req, res, next);
    await new Promise<void>((r) => setTimeout(r, 10));
    if (skip) {
      expect(next).toHaveBeenCalled();
      expect(req.user).toMatchObject({ role: 'readonly', sub: 'dev-user' });
    } else {
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    }
  });
  it('Bearer Token 优先于 x-api-key', async () => {
    const token = await generateToken('user-1', 'readonly');
    const { req, res, next } = mockReqRes({
      headers: { authorization: `Bearer ${token}`, 'x-api-key': 'test-api-key-12345' },
    });
    await awaitMiddleware(jwtAuth, req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({ role: 'readonly', sub: 'user-1' });
  });
  it('撤销后 access token 应失效（refresh 已在撤销用例覆盖）', async () => {
    redisMocks.useRedisSuccess();
    const at = await generateToken('user-revoke', 'admin');
    await revokeAllUserSessions('user-revoke');
    expect(await verifyToken(at)).toBeNull();
  });
  it.each([
    [
      '已停用用户',
      async () => {
        mockUser(false, 'readonly');
        return await generateToken('disabled-jwt-user', 'readonly');
      },
      'ACCOUNT_DISABLED',
    ],
    [
      '全局会话撤销',
      async () => {
        setupAuthEnv();
        const t = await generateToken('user-revoked-jwt', 'admin');
        await revokeAllUserSessions('user-revoked-jwt');
        return t;
      },
      'INVALID_TOKEN',
    ],
  ])('%s jwtAuth 应返回 401 %s', async (_n, build, code) => {
    await expectJwtAuth401({ authorization: `Bearer ${await build()}` }, code);
  });
  it('已停用用户 refresh 应被拒绝并删除 token', async () => {
    redisMocks.useRedisSuccess();
    const t = await generateRefreshToken('disabled-redis-refresh', 'admin');
    mockUser(false, 'readonly');
    expect(await refreshAccessToken(t)).toBeNull();
    expect(redisMocks.del).toHaveBeenCalled();
  });
  it('optionalJwtAuth：有效 Bearer 应设置 req.user 并放行', async () => {
    const token = await generateToken('user-1', 'analyst');
    const { req, res, next } = mockReqRes({ headers: { authorization: `Bearer ${token}` } });
    await awaitMiddleware(optionalJwtAuth, req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user?.sub).toBe('user-1');
  });
  it.each([
    ['无效 Bearer', { authorization: 'Bearer invalid' }],
    ['非 JWT 格式', { authorization: 'Bearer not.valid.jwt' }],
    ['无 Bearer', {}],
  ])('optionalJwtAuth：%s 应置空 req.user 并放行', async (_n, headers) => {
    const { req, res, next } = mockReqRes(headers);
    await awaitMiddleware(optionalJwtAuth, req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeNull();
  });
  it.each([
    ['undefined', undefined, false],
    ['null', null, false],
    ['已存在用户', { sub: 'real-user', role: 'admin', iat: 123, exp: 456 }, true],
  ])('assignGuestReadonly：req.user=%s 应%s', (_n, user, keepExisting) => {
    const { req, res, next } = mockReqRes(user === undefined ? {} : { user });
    assignGuestReadonly(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    if (keepExisting) expect(req.user).toBe(user);
    else expect(req.user).toMatchObject({ sub: 'guest', role: 'readonly' });
  });
});

describe('verifyToken RS256 算法边界', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    redisMocks.useMemoryFallback();
    resetRsaConfig();
    mocks.config.NODE_ENV = 'production';
    mocks.config.JWT_ALGORITHM = 'RS256';
  });
  it.each([
    ['HS256 签发（禁止算法回退）', async () => signHS256(validPayload())],
    [
      '不同 RSA 密钥对（kid 不匹配）',
      async () =>
        signRsa(
          validPayload(),
          (await generateKeyPair('RS256', { modulusLength: 2048, extractable: true })).privateKey,
          'foreign-key-id',
        ),
    ],
    [
      '缺失签名段',
      async (keys) => (await signRsa(validPayload(), keys.privateKey)).replace(/[^.]*$/, ''),
    ],
  ])('%s 应被拒绝', async (_n, build) => {
    const keys = await setupRsaKeys();
    const mod = await reloadJwtAuthModule();
    expect(await mod.verifyToken(await build(keys))).toBeNull();
  });
});

describe('jwtAuth RS256 路径（PEM 加载与签发）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useRedisSuccess();
    mockUser();
    resetRsaConfig();
    mocks.config.NODE_ENV = 'development';
    mocks.config.JWT_ALGORITHM = 'RS256';
  });
  it('开发模式无密钥配置时应自动生成密钥对并完成签发验证', async () => {
    const mod = await reloadJwtAuthModule();
    const t = await mod.generateToken('dev-user-rs', 'admin');
    const p = await mod.verifyToken(t);
    expect(p!.sub).toBe('dev-user-rs');
    expect(await mod.getOrCachePrivateKey()).toBeTruthy();
    expect(await mod.getOrCachePublicKey()).toBeTruthy();
  });
  it('生产环境内联 PEM 应签发并验证 access token（含公钥 jwtVerify）', async () => {
    await setupRsaKeys('production');
    const mod = await reloadJwtAuthModule();
    const t = await mod.generateToken('rs256-user', 'admin');
    const p = await mod.verifyToken(t);
    expect(p!.sub).toBe('rs256-user');
    expect(p!.role).toBe('admin');
    const { payload } = await jwtVerify(t, await mod.getOrCachePublicKey(), {
      algorithms: ['RS256'],
    });
    expect(payload.sub).toBe('rs256-user');
  });
  it('PEM 文件路径应能读取并签发', async () => {
    const { privatePem, publicPem } = await setupRsaKeys();
    mocks.config.NODE_ENV = 'production';
    mocks.config.JWT_PRIVATE_KEY = '';
    mocks.config.JWT_PRIVATE_KEY_FILE = '/secrets/private.pem';
    mocks.config.JWT_PUBLIC_KEY = '';
    mocks.config.JWT_PUBLIC_KEY_FILE = '/secrets/public.pem';
    fsMocks.readFileSync.mockImplementation((fp: string) => {
      if (String(fp).includes('private')) return privatePem;
      if (String(fp).includes('public')) return publicPem;
      throw new Error('ENOENT');
    });
    const mod = await reloadJwtAuthModule();
    const t = await mod.generateToken('file-pem-user', 'readonly');
    expect(t.split('.')).toHaveLength(3);
    expect(fsMocks.readFileSync).toHaveBeenCalledWith('/secrets/private.pem', 'utf-8');
    await mod.getOrCachePublicKey();
    expect(fsMocks.readFileSync).toHaveBeenCalledWith('/secrets/public.pem', 'utf-8');
  });
  it('生产环境缺少 RSA 密钥应拒绝签发与验证', async () => {
    resetRsaConfig();
    mocks.config.NODE_ENV = 'production';
    const mod = await reloadJwtAuthModule();
    await expect(mod.generateToken('prod-user', 'admin')).rejects.toThrow(/JWT_PRIVATE_KEY/);
    await expect(mod.getOrCachePublicKey()).rejects.toThrow(/JWT_PUBLIC_KEY/);
  });
  it('RS256 refresh token 生命周期应完整', async () => {
    const mod = await reloadJwtAuthModule();
    const r = await mod.refreshAccessToken(
      await mod.generateRefreshToken('rs256-refresh', 'analyst'),
    );
    expect(r).not.toBeNull();
    expect(r!.accessToken).toBeTruthy();
  });
  it('getUserById 失败时 jwtAuth 应拒绝访问', async () => {
    const mod = await reloadJwtAuthModule();
    const { getUserById: g } =
      await import('../../../packages/backend/src/repositories/userRepo.js');
    redisMocks.useRedisSuccess();
    vi.mocked(g).mockRejectedValueOnce(new Error('db error'));
    await expectJwtAuth401(
      { authorization: `Bearer ${await mod.generateToken('user-db-error', 'admin')}` },
      undefined,
      mod.jwtAuth,
    );
  });
});
