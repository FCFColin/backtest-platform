import { describe, it, expect, vi, beforeEach } from 'vitest';

const configMocks = vi.hoisted(() => ({
  GO_DATA_SERVICE_URL: 'http://127.0.0.1:5003',
  DATA_SERVICE_AUTH_TOKEN: 'dev-token',
  COMPUTE_RATE_LIMIT_MAX: 10,
  NODE_ENV: 'test',
  REDIS_URL: 'redis://localhost:6379',
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

const redisMocks = vi.hoisted(() => ({
  call: vi.fn(),
  on: vi.fn(),
}));

const rateLimitCalls = vi.hoisted(() => [] as object[]);

vi.mock('express-rate-limit', () => {
  const factory = (opts: object) => {
    rateLimitCalls.push(opts);
    return (_req: unknown, _res: unknown, next: () => void) => {
      next();
    };
  };
  return { default: factory, rateLimit: factory, MemoryStore: class {} };
});

vi.mock('rate-limit-redis', () => ({
  RedisStore: class MockStore {},
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: configMocks,
}));

vi.mock('../../../packages/backend/src/config/redis.js', () => ({
  appRedis: redisMocks,
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: loggerMocks,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  rateLimitCalls.length = 0;
});

describe('限流器导出与基本行为', () => {
  it('应导出所有限流器', async () => {
    const mod = await import('../../../packages/backend/src/utils/rateLimiter.js');
    expect(mod.apiLimiter).toBeDefined();
    expect(mod.computeLimiter).toBeDefined();
    expect(mod.adminLimiter).toBeDefined();
    expect(mod.loginLimiter).toBeDefined();
    expect(mod.refreshLimiter).toBeDefined();
    expect(mod.registerLimiter).toBeDefined();
  });

  it('所有限流器应为函数', async () => {
    const mod = await import('../../../packages/backend/src/utils/rateLimiter.js');
    for (const key of [
      'apiLimiter',
      'computeLimiter',
      'adminLimiter',
      'loginLimiter',
      'refreshLimiter',
      'registerLimiter',
    ]) {
      expect(typeof mod[key as keyof typeof mod]).toBe('function');
    }
  });

  it('限流器中间件应调用 next()', async () => {
    const mod = await import('../../../packages/backend/src/utils/rateLimiter.js');
    const next = vi.fn();
    (mod.apiLimiter as (...args: never[]) => void)({}, {}, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('限流器配置参数', () => {
  it('应创建 6 个限流器', async () => {
    await import('../../../packages/backend/src/utils/rateLimiter.js');
    expect(rateLimitCalls.length).toBe(6);
  });

  it('apiLimiter: 15分钟 100次', async () => {
    await import('../../../packages/backend/src/utils/rateLimiter.js');
    const opts = rateLimitCalls[0] as Record<string, unknown>;
    expect(opts.windowMs).toBe(15 * 60 * 1000);
    expect(opts.max).toBe(100);
    expect(opts.standardHeaders).toBe(true);
    expect(opts.legacyHeaders).toBe(false);
  });

  it('computeLimiter: 1分钟 COMPUTE_RATE_LIMIT_MAX 次', async () => {
    await import('../../../packages/backend/src/utils/rateLimiter.js');
    const opts = rateLimitCalls[1] as Record<string, unknown>;
    expect(opts.windowMs).toBe(60 * 1000);
    expect(opts.max).toBe(configMocks.COMPUTE_RATE_LIMIT_MAX);
    expect(typeof opts.keyGenerator).toBe('function');
  });

  it('adminLimiter: 1分钟 30次', async () => {
    await import('../../../packages/backend/src/utils/rateLimiter.js');
    const opts = rateLimitCalls[2] as Record<string, unknown>;
    expect(opts.windowMs).toBe(60 * 1000);
    expect(opts.max).toBe(30);
    expect(opts.passOnStoreError).toBe(true);
  });

  it('loginLimiter: 15分钟 10次', async () => {
    await import('../../../packages/backend/src/utils/rateLimiter.js');
    const opts = rateLimitCalls[3] as Record<string, unknown>;
    expect(opts.windowMs).toBe(15 * 60 * 1000);
    expect(opts.max).toBe(10);
    expect(typeof opts.keyGenerator).toBe('function');
  });

  it('registerLimiter: 1小时 3次', async () => {
    await import('../../../packages/backend/src/utils/rateLimiter.js');
    const opts = rateLimitCalls[5] as Record<string, unknown>;
    expect(opts.windowMs).toBe(60 * 60 * 1000);
    expect(opts.max).toBe(3);
  });
});

describe('computeLimiter keyGenerator', () => {
  function makeReq(overrides: Record<string, unknown> = {}) {
    return {
      headers: {},
      ip: '127.0.0.1',
      body: {},
      ...overrides,
    } as unknown as import('express').Request;
  }

  it('有 tenantId 时优先返回 tenant 键', async () => {
    await import('../../../packages/backend/src/utils/rateLimiter.js');
    const opts = rateLimitCalls[1] as Record<string, unknown>;
    const keyGen = opts.keyGenerator as (req: import('express').Request) => string;
    expect(keyGen(makeReq({ tenantId: 'tenant-abc' }))).toBe('tenant:tenant-abc');
  });

  it('有 Bearer JWT 时使用 tenant_id', async () => {
    await import('../../../packages/backend/src/utils/rateLimiter.js');
    const opts = rateLimitCalls[1] as Record<string, unknown>;
    const keyGen = opts.keyGenerator as (req: import('express').Request) => string;
    const payload = Buffer.from(JSON.stringify({ sub: 'u1', tenant_id: 't-456' })).toString(
      'base64url',
    );
    const jwt = `header.${payload}.signature`;
    expect(keyGen(makeReq({ headers: { authorization: `Bearer ${jwt}` } }))).toBe('tenant:t-456');
  });

  it('有 x-api-key 时使用 apikey 哈希', async () => {
    await import('../../../packages/backend/src/utils/rateLimiter.js');
    const opts = rateLimitCalls[1] as Record<string, unknown>;
    const keyGen = opts.keyGenerator as (req: import('express').Request) => string;
    expect(keyGen(makeReq({ headers: { 'x-api-key': 'my-key' } }))).toMatch(/^apikey:/);
  });

  it('无标识时回退到 IP', async () => {
    await import('../../../packages/backend/src/utils/rateLimiter.js');
    const opts = rateLimitCalls[1] as Record<string, unknown>;
    const keyGen = opts.keyGenerator as (req: import('express').Request) => string;
    expect(keyGen(makeReq({ ip: '10.0.0.1' }))).toBe('10.0.0.1');
  });
});

describe('loginLimiter keyGenerator', () => {
  function makeReq(body: Record<string, unknown> = {}, ip = '10.0.0.1') {
    return { body, ip } as unknown as import('express').Request;
  }

  it('有 username 时使用 user 键', async () => {
    await import('../../../packages/backend/src/utils/rateLimiter.js');
    const opts = rateLimitCalls[3] as Record<string, unknown>;
    const keyGen = opts.keyGenerator as (req: import('express').Request) => string;
    expect(keyGen(makeReq({ username: 'admin' }))).toBe('user:admin');
  });

  it('有 apiKey 时使用 apikey 哈希', async () => {
    await import('../../../packages/backend/src/utils/rateLimiter.js');
    const opts = rateLimitCalls[3] as Record<string, unknown>;
    const keyGen = opts.keyGenerator as (req: import('express').Request) => string;
    expect(keyGen(makeReq({ apiKey: 'sk-test' }))).toMatch(/^apikey:/);
  });

  it('有 refreshToken 时使用 refresh 哈希', async () => {
    await import('../../../packages/backend/src/utils/rateLimiter.js');
    const opts = rateLimitCalls[3] as Record<string, unknown>;
    const keyGen = opts.keyGenerator as (req: import('express').Request) => string;
    expect(keyGen(makeReq({ refreshToken: 'rt-val' }))).toMatch(/^refresh:/);
  });

  it('无字段时回退到 IP', async () => {
    await import('../../../packages/backend/src/utils/rateLimiter.js');
    const opts = rateLimitCalls[3] as Record<string, unknown>;
    const keyGen = opts.keyGenerator as (req: import('express').Request) => string;
    expect(keyGen(makeReq({}))).toBe('10.0.0.1');
  });
});
