/**
 * 配置模块单元测试（Task 11）
 *
 * 覆盖：开发/生产环境校验、默认值、CORS_ORIGINS。
 * 通过 snapshot/restore 隔离 config 属性与 process.env，applyValidProd 提供合法生产基线。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockLogger } from '../../helpers/mockFactories.js';

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: mockLogger(loggerMocks) }));
vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));

import { config, validateConfig } from '../../../packages/backend/src/config/index.js';

const CFG_KEYS = ['NODE_ENV', 'JWT_SECRET', 'JWT_ALGORITHM', 'JWT_PRIVATE_KEY', 'JWT_PRIVATE_KEY_FILE', 'JWT_PUBLIC_KEY', 'JWT_PUBLIC_KEY_FILE', 'ENGINE_AUTH_TOKEN', 'DATA_SERVICE_AUTH_TOKEN', 'REQUIRE_API_KEY', 'CORS_ORIGINS', 'TRUST_PROXY_HOPS', 'AUDIT_HMAC_KEY', 'DEV_SKIP_AUTH', 'EMAIL_TRANSPORT', 'EMAIL_SMTP_HOST'];
const ENV_KEYS = ['DATABASE_URL', 'TRUST_PROXY_HOPS'];
let snap: Record<string, unknown> = {};
let envSnap: Record<string, string | undefined> = {};

function snapshot() {
  snap = {}; envSnap = {};
  for (const k of CFG_KEYS) snap[k] = (config as Record<string, unknown>)[k];
  for (const k of ENV_KEYS) envSnap[k] = process.env[k];
}
function restore() {
  for (const k of CFG_KEYS) (config as Record<string, unknown>)[k] = snap[k];
  for (const k of ENV_KEYS) {
    if (envSnap[k] === undefined) delete process.env[k];
    else process.env[k] = envSnap[k] as string;
  }
}
function applyValidProd() {
  config.NODE_ENV = 'production';
  config.JWT_SECRET = 'strong-jwt-secret-32-chars-minimum-ok';
  config.ENGINE_AUTH_TOKEN = 'strong-engine-token-32chars-minimum!!';
  config.DATA_SERVICE_AUTH_TOKEN = 'strong-data-token-32chars-minimum!!';
  config.JWT_ALGORITHM = 'HS256';
  config.JWT_PRIVATE_KEY = '';
  config.JWT_PRIVATE_KEY_FILE = '';
  config.JWT_PUBLIC_KEY = '';
  config.JWT_PUBLIC_KEY_FILE = '';
  config.REQUIRE_API_KEY = true;
  config.CORS_ORIGINS = ['https://example.com'];
  config.AUDIT_HMAC_KEY = 'a-very-strong-hmac-key-of-32-chars+';
  config.DEV_SKIP_AUTH = false;
  process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
  process.env.TRUST_PROXY_HOPS = '1';
}

describe('validateConfig - 开发环境（宽松校验）', () => {
  beforeEach(() => { vi.clearAllMocks(); snapshot(); });
  afterEach(() => restore());

  it.each(['development', 'test'])('%s 环境不应抛错（宽松校验）', (env) => {
    config.NODE_ENV = env;
    expect(() => validateConfig()).not.toThrow();
  });

  it('开发环境允许使用默认 ENGINE_AUTH_TOKEN', () => {
    config.NODE_ENV = 'development';
    config.ENGINE_AUTH_TOKEN = 'dev-engine-auth-token';
    expect(() => validateConfig()).not.toThrow();
  });
});

describe('validateConfig - 生产环境（严格校验）', () => {
  beforeEach(() => { vi.clearAllMocks(); snapshot(); applyValidProd(); });
  afterEach(() => restore());

  it.each<[string, () => void, string]>([
    ['默认 JWT_SECRET', () => { config.JWT_SECRET = 'dev-only-jwt-secret-change-in-production'; }, 'JWT_SECRET'],
    ['默认 ENGINE_AUTH_TOKEN', () => { config.ENGINE_AUTH_TOKEN = 'dev-engine-auth-token'; }, 'ENGINE_AUTH_TOKEN'],
    ['ENGINE_AUTH_TOKEN 为空', () => { config.ENGINE_AUTH_TOKEN = ''; }, 'ENGINE_AUTH_TOKEN'],
    ['默认 DATA_SERVICE_AUTH_TOKEN', () => { config.DATA_SERVICE_AUTH_TOKEN = 'dev-data-service-auth-token'; }, 'DATA_SERVICE_AUTH_TOKEN'],
    ['RS256 缺 PRIVATE_KEY', () => { config.JWT_ALGORITHM = 'RS256'; config.JWT_PRIVATE_KEY = ''; config.JWT_PRIVATE_KEY_FILE = ''; }, 'JWT_PRIVATE_KEY'],
    ['RS256 缺 PUBLIC_KEY', () => { config.JWT_ALGORITHM = 'RS256'; config.JWT_PRIVATE_KEY = 'fake-private-key'; config.JWT_PUBLIC_KEY = ''; config.JWT_PUBLIC_KEY_FILE = ''; }, 'JWT_PUBLIC_KEY'],
    ['TRUST_PROXY_HOPS 为负数', () => { (config as Record<string, unknown>).TRUST_PROXY_HOPS = -1; }, 'TRUST_PROXY_HOPS'],
    ['EMAIL_TRANSPORT=smtp 未设置 EMAIL_SMTP_HOST', () => { config.EMAIL_TRANSPORT = 'smtp'; config.EMAIL_SMTP_HOST = ''; }, 'EMAIL_SMTP_HOST'],
  ])('%s 应抛错', (_n, mutate, code) => {
    mutate();
    expect(() => validateConfig()).toThrow(code);
  });

  it('DATABASE_URL 未通过环境变量设置应抛错', () => {
    delete process.env.DATABASE_URL;
    expect(() => validateConfig()).toThrow('DATABASE_URL');
  });

  it('生产环境未设置 TRUST_PROXY_HOPS 应抛错', () => {
    delete process.env.TRUST_PROXY_HOPS;
    expect(() => validateConfig()).toThrow('TRUST_PROXY_HOPS');
  });

  it('所有配置正确时不应抛错', () => {
    expect(() => validateConfig()).not.toThrow();
  });

  it('REQUIRE_API_KEY=false 时不应抛错（RBAC 始终生效，REQUIRE_API_KEY 已退役）', () => {
    config.REQUIRE_API_KEY = false;
    expect(() => validateConfig()).not.toThrow();
  });

  it('多个校验失败时错误信息应包含全部失败项', () => {
    config.JWT_SECRET = 'dev-only-jwt-secret-change-in-production';
    config.ENGINE_AUTH_TOKEN = 'dev-engine-auth-token';
    config.DATA_SERVICE_AUTH_TOKEN = 'dev-data-service-auth-token';
    let msg = '';
    try { validateConfig(); } catch (e) { msg = (e as Error).message; }
    expect(msg).toContain('JWT_SECRET');
    expect(msg).toContain('ENGINE_AUTH_TOKEN');
    expect(msg).toContain('DATA_SERVICE_AUTH_TOKEN');
  });
});

describe('config 默认值', () => {
  it.each([
    ['ENGINE_TIMEOUT_MS', 120000],
    ['DB_POOL_MAX', 20],
    ['DB_STATEMENT_TIMEOUT_MS', 10000],
    ['JWT_ACCESS_TTL', 900],
    ['JWT_REFRESH_TTL', 604800],
  ])('%s 默认应为 %i', (key, expected) => {
    expect((config as Record<string, unknown>)[key]).toBe(expected);
  });

  it('GO_ENGINE_URL 默认应指向 15004 端口', () => {
    expect(config.GO_ENGINE_URL).toContain('15004');
  });
  it('ENGINE_AUTH_TOKEN 与 DATA_SERVICE_AUTH_TOKEN 应有默认值（开发环境）', () => {
    expect(config.ENGINE_AUTH_TOKEN.length).toBeGreaterThan(0);
    expect(config.DATA_SERVICE_AUTH_TOKEN.length).toBeGreaterThan(0);
  });
  it('DATABASE_URL 应为有效的 PostgreSQL localhost 连接字符串', () => {
    expect(config.DATABASE_URL).toMatch(/^postgresql:\/\/.*@localhost:\d+\/\w+$/);
  });
  it('REDIS_URL 应为 redis:// 协议指向 localhost', () => {
    expect(config.REDIS_URL).toContain('redis://');
    expect(config.REDIS_URL).toContain('localhost');
  });
});

describe('CORS_ORIGINS', () => {
  it('未设置时应为 true 或字符串数组', () => {
    expect(config.CORS_ORIGINS === true || Array.isArray(config.CORS_ORIGINS)).toBe(true);
  });
});