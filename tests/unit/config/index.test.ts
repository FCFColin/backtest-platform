/**
 * 配置模块单元测试（Task 11）
 *
 * 覆盖：开发/生产环境校验、默认值、CORS_ORIGINS、默认密钥启动拦截、env 解析函数。
 * 通过 snapshot/restore 隔离 config 属性与 process.env，applyValidProd 提供合法生产基线。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { mockLogger } from '../../helpers/mockFactories.js';

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));
// Mock dotenv 避免 .env 干扰
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
  config: vi.fn(),
}));

import { config, validateConfig } from '../../../packages/backend/src/config/index.js';
import { assertNoDefaultSecrets } from '../../../packages/backend/src/config/assertNoDefaultSecrets.js';
import {
  requireSecret,
  resolveJwtAlgorithm,
  parseCorsOrigins,
} from '../../../packages/backend/src/config/env.js';

const CFG_KEYS = [
  'NODE_ENV',
  'JWT_SECRET',
  'JWT_ALGORITHM',
  'JWT_PRIVATE_KEY',
  'JWT_PRIVATE_KEY_FILE',
  'JWT_PUBLIC_KEY',
  'JWT_PUBLIC_KEY_FILE',
  'ENGINE_AUTH_TOKEN',
  'DATA_SERVICE_AUTH_TOKEN',
  'REQUIRE_API_KEY',
  'CORS_ORIGINS',
  'TRUST_PROXY_HOPS',
  'AUDIT_HMAC_KEY',
  'DEV_SKIP_AUTH',
  'EMAIL_TRANSPORT',
  'EMAIL_SMTP_HOST',
];
const ENV_KEYS = ['DATABASE_URL', 'TRUST_PROXY_HOPS'];
let snap: Record<string, unknown> = {};
let envSnap: Record<string, string | undefined> = {};

function snapshot() {
  snap = {};
  envSnap = {};
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
  beforeEach(() => {
    vi.clearAllMocks();
    snapshot();
  });
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
  beforeEach(() => {
    vi.clearAllMocks();
    snapshot();
    applyValidProd();
  });
  afterEach(() => restore());

  it.each<[string, () => void, string]>([
    [
      '默认 JWT_SECRET',
      () => {
        config.JWT_SECRET = 'dev-only-jwt-secret-change-in-production';
      },
      'JWT_SECRET',
    ],
    [
      '默认 ENGINE_AUTH_TOKEN',
      () => {
        config.ENGINE_AUTH_TOKEN = 'dev-engine-auth-token';
      },
      'ENGINE_AUTH_TOKEN',
    ],
    [
      'ENGINE_AUTH_TOKEN 为空',
      () => {
        config.ENGINE_AUTH_TOKEN = '';
      },
      'ENGINE_AUTH_TOKEN',
    ],
    [
      '默认 DATA_SERVICE_AUTH_TOKEN',
      () => {
        config.DATA_SERVICE_AUTH_TOKEN = 'dev-data-service-auth-token';
      },
      'DATA_SERVICE_AUTH_TOKEN',
    ],
    [
      'RS256 缺 PRIVATE_KEY',
      () => {
        config.JWT_ALGORITHM = 'RS256';
        config.JWT_PRIVATE_KEY = '';
        config.JWT_PRIVATE_KEY_FILE = '';
      },
      'JWT_PRIVATE_KEY',
    ],
    [
      'RS256 缺 PUBLIC_KEY',
      () => {
        config.JWT_ALGORITHM = 'RS256';
        config.JWT_PRIVATE_KEY = 'fake-private-key';
        config.JWT_PUBLIC_KEY = '';
        config.JWT_PUBLIC_KEY_FILE = '';
      },
      'JWT_PUBLIC_KEY',
    ],
    [
      'TRUST_PROXY_HOPS 为负数',
      () => {
        (config as Record<string, unknown>).TRUST_PROXY_HOPS = -1;
      },
      'TRUST_PROXY_HOPS',
    ],
    [
      'EMAIL_TRANSPORT=smtp 未设置 EMAIL_SMTP_HOST',
      () => {
        config.EMAIL_TRANSPORT = 'smtp';
        config.EMAIL_SMTP_HOST = '';
      },
      'EMAIL_SMTP_HOST',
    ],
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
    try {
      validateConfig();
    } catch (e) {
      msg = (e as Error).message;
    }
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

describe('P0-02: assertNoDefaultSecrets — 默认密钥启动拦截', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  it.each([
    ['JWT_SECRET', 'dev-only-jwt-secret-change-in-production'],
    ['ENGINE_AUTH_TOKEN', 'dev-engine-auth-token'],
    ['DATA_SERVICE_AUTH_TOKEN', 'dev-data-service-auth-token'],
  ])('生产环境 + 默认 %s → process.exit(1)', (field, defaultValue) => {
    process.env.NODE_ENV = 'production';
    const config = {
      JWT_SECRET: 'a-very-strong-secret',
      ENGINE_AUTH_TOKEN: 'a-very-strong-token',
      DATA_SERVICE_AUTH_TOKEN: 'another-strong-token',
      [field]: defaultValue,
    };
    assertNoDefaultSecrets(config);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(field));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('生产环境 + 多个默认密钥 → 错误信息包含所有违规字段', () => {
    process.env.NODE_ENV = 'production';
    const config = {
      JWT_SECRET: 'dev-only-jwt-secret-change-in-production',
      ENGINE_AUTH_TOKEN: 'dev-engine-auth-token',
      DATA_SERVICE_AUTH_TOKEN: 'dev-data-service-auth-token',
    };
    assertNoDefaultSecrets(config);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const errorMessage = (errorSpy.mock.calls[0] as unknown[])[0] as string;
    expect(errorMessage).toContain('JWT_SECRET');
    expect(errorMessage).toContain('ENGINE_AUTH_TOKEN');
    expect(errorMessage).toContain('DATA_SERVICE_AUTH_TOKEN');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('开发环境 + 默认密钥 → 不退出（允许开发环境使用默认值）', () => {
    process.env.NODE_ENV = 'development';
    const config = {
      JWT_SECRET: 'dev-only-jwt-secret-change-in-production',
      ENGINE_AUTH_TOKEN: 'dev-engine-auth-token',
      DATA_SERVICE_AUTH_TOKEN: 'dev-data-service-auth-token',
    };
    assertNoDefaultSecrets(config);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('生产环境 + 全部非默认密钥 → 不退出', () => {
    process.env.NODE_ENV = 'production';
    const config = {
      JWT_SECRET: 'a-super-strong-jwt-secret-for-production',
      ENGINE_AUTH_TOKEN: 'a-super-strong-engine-token',
      DATA_SERVICE_AUTH_TOKEN: 'a-super-strong-data-service-token',
    };
    assertNoDefaultSecrets(config);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('NODE_ENV 未设置 → 不检查（等同非生产环境）', () => {
    delete process.env.NODE_ENV;
    const config = {
      JWT_SECRET: 'dev-only-jwt-secret-change-in-production',
      ENGINE_AUTH_TOKEN: 'dev-engine-auth-token',
      DATA_SERVICE_AUTH_TOKEN: 'dev-data-service-auth-token',
    };
    assertNoDefaultSecrets(config);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe('H-006: requireSecret — secret 缺失时 throw', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    originalEnv.TEST_SECRET_H006 = process.env.TEST_SECRET_H006;
  });

  afterEach(() => {
    if (originalEnv.TEST_SECRET_H006 === undefined) delete process.env.TEST_SECRET_H006;
    else process.env.TEST_SECRET_H006 = originalEnv.TEST_SECRET_H006;
  });

  it('env var 缺失时 throw 包含变量名', () => {
    delete process.env.TEST_SECRET_H006;
    expect(() => requireSecret('TEST_SECRET_H006')).toThrow('TEST_SECRET_H006');
  });

  it('env var 为空字符串时 throw', () => {
    process.env.TEST_SECRET_H006 = '';
    expect(() => requireSecret('TEST_SECRET_H006')).toThrow('TEST_SECRET_H006');
  });

  it('env var 已设置时返回值', () => {
    process.env.TEST_SECRET_H006 = 'a-strong-secret-value';
    expect(requireSecret('TEST_SECRET_H006')).toBe('a-strong-secret-value');
  });
});

describe('H-006: env.ts 源码不含硬编码默认值（authConfig + engineConfig 合并后）', () => {
  const envSource = readFileSync(
    resolve(process.cwd(), 'packages/backend/src/config/env.ts'),
    'utf-8',
  );

  it('env.ts 不含 hardcoded dev- defaults', () => {
    expect(envSource).not.toContain("|| 'dev-");
  });

  it('env.ts 使用 requireSecret 获取 JWT_SECRET', () => {
    expect(envSource).toContain("requireSecret('JWT_SECRET')");
  });

  it('env.ts 使用 requireSecret 获取 ENGINE_AUTH_TOKEN', () => {
    expect(envSource).toContain("requireSecret('ENGINE_AUTH_TOKEN')");
  });

  it('env.ts 使用 requireSecret 获取 DATA_SERVICE_AUTH_TOKEN', () => {
    expect(envSource).toContain("requireSecret('DATA_SERVICE_AUTH_TOKEN')");
  });
});

describe('H-006: 模块导入 — secret 缺失时 fail-fast', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    originalEnv.JWT_SECRET = process.env.JWT_SECRET;
    originalEnv.ENGINE_AUTH_TOKEN = process.env.ENGINE_AUTH_TOKEN;
    originalEnv.DATA_SERVICE_AUTH_TOKEN = process.env.DATA_SERVICE_AUTH_TOKEN;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.resetModules();
  });

  it('JWT_SECRET 缺失时 requireSecret 直接 throw', () => {
    delete process.env.JWT_SECRET;
    expect(() => requireSecret('JWT_SECRET')).toThrow('JWT_SECRET is required');
  });

  it('ENGINE_AUTH_TOKEN 缺失时 requireSecret 直接 throw', () => {
    delete process.env.ENGINE_AUTH_TOKEN;
    expect(() => requireSecret('ENGINE_AUTH_TOKEN')).toThrow('ENGINE_AUTH_TOKEN is required');
  });

  it('DATA_SERVICE_AUTH_TOKEN 缺失时 requireSecret 直接 throw', () => {
    delete process.env.DATA_SERVICE_AUTH_TOKEN;
    expect(() => requireSecret('DATA_SERVICE_AUTH_TOKEN')).toThrow(
      'DATA_SERVICE_AUTH_TOKEN is required',
    );
  });

  it('所有 secret 已设置时 requireSecret 正常返回', () => {
    process.env.JWT_SECRET = originalEnv.JWT_SECRET || 'dev-only-jwt-secret-change-in-production';
    process.env.ENGINE_AUTH_TOKEN = originalEnv.ENGINE_AUTH_TOKEN || 'dev-engine-auth-token';
    process.env.DATA_SERVICE_AUTH_TOKEN =
      originalEnv.DATA_SERVICE_AUTH_TOKEN || 'dev-data-service-auth-token';

    expect(requireSecret('JWT_SECRET')).toBeDefined();
    expect(requireSecret('ENGINE_AUTH_TOKEN')).toBeDefined();
    expect(requireSecret('DATA_SERVICE_AUTH_TOKEN')).toBeDefined();
  });
});

describe('resolveJwtAlgorithm', () => {
  const originalAlg = process.env.JWT_ALGORITHM;
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalAlg === undefined) delete process.env.JWT_ALGORITHM;
    else process.env.JWT_ALGORITHM = originalAlg;
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
  });

  it('显式 JWT_ALGORITHM 应优先于 NODE_ENV 默认值', () => {
    process.env.JWT_ALGORITHM = 'RS256';
    process.env.NODE_ENV = 'development';
    expect(resolveJwtAlgorithm()).toBe('RS256');
  });

  it('NODE_ENV 决定默认算法：production→RS256，其他→HS256', () => {
    delete process.env.JWT_ALGORITHM;
    process.env.NODE_ENV = 'production';
    expect(resolveJwtAlgorithm()).toBe('RS256');

    process.env.NODE_ENV = 'development';
    expect(resolveJwtAlgorithm()).toBe('HS256');

    // NODE_ENV 未设置时也应回退到 development→HS256
    delete process.env.NODE_ENV;
    expect(resolveJwtAlgorithm()).toBe('HS256');
  });
});

describe('parseCorsOrigins', () => {
  it('undefined / 空串 / 纯空白 / "*" 应返回 true（允许所有来源）', () => {
    expect(parseCorsOrigins(undefined)).toBe(true);
    expect(parseCorsOrigins('')).toBe(true);
    expect(parseCorsOrigins('   ')).toBe(true);
    expect(parseCorsOrigins('*')).toBe(true);
    expect(parseCorsOrigins('  *  ')).toBe(true);
  });

  it('逗号分隔列表应返回 trim 后的非空数组', () => {
    expect(parseCorsOrigins('https://a.com, https://b.com')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  it('应过滤空条目（首尾逗号、连续逗号、纯空白条目）', () => {
    expect(parseCorsOrigins(',https://a.com,, ,')).toEqual(['https://a.com']);
  });
});
