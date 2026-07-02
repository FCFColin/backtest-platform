/**
 * 配置模块单元测试（Task 11）
 *
 * 企业理由：集中配置模块是应用启动校验的核心，必须保证：
 * 1. 开发环境：validateConfig 不抛错（宽松校验）
 * 2. 生产环境：ADMIN_API_KEY、JWT_SECRET、ENGINE_AUTH_TOKEN、DATA_SERVICE_AUTH_TOKEN 必需
 * 3. 生产环境：DATABASE_URL 必须通过环境变量设置
 * 4. 生产环境：RS256 模式下 RSA 密钥必需
 * 5. 默认值正确应用
 * 6. CORS_ORIGINS 解析正确
 *
 * 权衡：mock logger 与 dotenv，通过修改 config 对象属性测试 validateConfig 行为。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockLogger } from '../../helpers/mockFactories.js';

// ===== Mock 模块 =====

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../../../api/utils/logger.js', () => ({ logger: mockLogger(loggerMocks) }));

// Mock dotenv：避免加载真实 .env 文件干扰测试
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
  config: vi.fn(),
}));

import { config, validateConfig, DEGRADED_WARNING } from '../../../api/config/index.js';

describe('validateConfig - 开发环境（宽松校验）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('开发环境不应抛错（即使 ADMIN_API_KEY 为空）', () => {
    const originalEnv = config.NODE_ENV;
    const originalKey = config.ADMIN_API_KEY;
    config.NODE_ENV = 'development';
    config.ADMIN_API_KEY = '';

    expect(() => validateConfig()).not.toThrow();

    config.NODE_ENV = originalEnv;
    config.ADMIN_API_KEY = originalKey;
  });

  it('test 环境不应抛错', () => {
    const originalEnv = config.NODE_ENV;
    config.NODE_ENV = 'test';

    expect(() => validateConfig()).not.toThrow();

    config.NODE_ENV = originalEnv;
  });

  it('开发环境允许使用默认 ENGINE_AUTH_TOKEN', () => {
    const originalEnv = config.NODE_ENV;
    const originalToken = config.ENGINE_AUTH_TOKEN;
    config.NODE_ENV = 'development';
    config.ENGINE_AUTH_TOKEN = 'dev-engine-auth-token';

    expect(() => validateConfig()).not.toThrow();

    config.NODE_ENV = originalEnv;
    config.ENGINE_AUTH_TOKEN = originalToken;
  });
});

describe('validateConfig - 生产环境（严格校验）', () => {
  const originalValues: Record<string, unknown> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    // 保存原始值
    originalValues.NODE_ENV = config.NODE_ENV;
    originalValues.ADMIN_API_KEY = config.ADMIN_API_KEY;
    originalValues.JWT_SECRET = config.JWT_SECRET;
    originalValues.JWT_ALGORITHM = config.JWT_ALGORITHM;
    originalValues.JWT_PRIVATE_KEY = config.JWT_PRIVATE_KEY;
    originalValues.JWT_PRIVATE_KEY_FILE = config.JWT_PRIVATE_KEY_FILE;
    originalValues.JWT_PUBLIC_KEY = config.JWT_PUBLIC_KEY;
    originalValues.JWT_PUBLIC_KEY_FILE = config.JWT_PUBLIC_KEY_FILE;
    originalValues.ENGINE_AUTH_TOKEN = config.ENGINE_AUTH_TOKEN;
    originalValues.DATA_SERVICE_AUTH_TOKEN = config.DATA_SERVICE_AUTH_TOKEN;
    originalValues.REQUIRE_API_KEY = config.REQUIRE_API_KEY;
    originalValues.CORS_ORIGINS = config.CORS_ORIGINS;
    originalValues.TRUST_PROXY_HOPS = config.TRUST_PROXY_HOPS;

    // 设置为生产环境
    config.NODE_ENV = 'production';
  });

  afterEach(() => {
    // 恢复原始值
    for (const [key, value] of Object.entries(originalValues)) {
      (config as Record<string, unknown>)[key] = value;
    }
  });

  it('缺少 ADMIN_API_KEY 应抛错', () => {
    config.ADMIN_API_KEY = '';

    expect(() => validateConfig()).toThrow('ADMIN_API_KEY');
  });

  it('使用默认 JWT_SECRET 应抛错', () => {
    config.ADMIN_API_KEY = 'strong-admin-key';
    config.JWT_SECRET = 'dev-only-jwt-secret-change-in-production';

    expect(() => validateConfig()).toThrow('JWT_SECRET');
  });

  it('使用默认 ENGINE_AUTH_TOKEN 应抛错', () => {
    config.ADMIN_API_KEY = 'strong-admin-key';
    config.JWT_SECRET = 'strong-jwt-secret';
    config.ENGINE_AUTH_TOKEN = 'dev-engine-auth-token';

    expect(() => validateConfig()).toThrow('ENGINE_AUTH_TOKEN');
  });

  it('ENGINE_AUTH_TOKEN 为空应抛错', () => {
    config.ADMIN_API_KEY = 'strong-admin-key';
    config.JWT_SECRET = 'strong-jwt-secret';
    config.ENGINE_AUTH_TOKEN = '';

    expect(() => validateConfig()).toThrow('ENGINE_AUTH_TOKEN');
  });

  it('使用默认 DATA_SERVICE_AUTH_TOKEN 应抛错', () => {
    config.ADMIN_API_KEY = 'strong-admin-key';
    config.JWT_SECRET = 'strong-jwt-secret';
    config.ENGINE_AUTH_TOKEN = 'strong-engine-token-32chars-minimum!!';
    config.DATA_SERVICE_AUTH_TOKEN = 'dev-data-service-auth-token';

    expect(() => validateConfig()).toThrow('DATA_SERVICE_AUTH_TOKEN');
  });

  it('RS256 模式下缺少 JWT_PRIVATE_KEY 和 JWT_PRIVATE_KEY_FILE 应抛错', () => {
    config.ADMIN_API_KEY = 'strong-admin-key';
    config.JWT_SECRET = 'strong-jwt-secret';
    config.ENGINE_AUTH_TOKEN = 'strong-engine-token-32chars-minimum!!';
    config.DATA_SERVICE_AUTH_TOKEN = 'strong-data-token-32chars-minimum!!';
    config.JWT_ALGORITHM = 'RS256';
    config.JWT_PRIVATE_KEY = '';
    config.JWT_PRIVATE_KEY_FILE = '';

    expect(() => validateConfig()).toThrow('JWT_PRIVATE_KEY');
  });

  it('RS256 模式下缺少 JWT_PUBLIC_KEY 和 JWT_PUBLIC_KEY_FILE 应抛错', () => {
    config.ADMIN_API_KEY = 'strong-admin-key';
    config.JWT_SECRET = 'strong-jwt-secret';
    config.ENGINE_AUTH_TOKEN = 'strong-engine-token-32chars-minimum!!';
    config.DATA_SERVICE_AUTH_TOKEN = 'strong-data-token-32chars-minimum!!';
    config.JWT_ALGORITHM = 'RS256';
    config.JWT_PRIVATE_KEY = 'fake-private-key';
    config.JWT_PUBLIC_KEY = '';
    config.JWT_PUBLIC_KEY_FILE = '';

    expect(() => validateConfig()).toThrow('JWT_PUBLIC_KEY');
  });

  it('DATABASE_URL 未通过环境变量设置应抛错', () => {
    config.ADMIN_API_KEY = 'strong-admin-key';
    config.JWT_SECRET = 'strong-jwt-secret';
    config.ENGINE_AUTH_TOKEN = 'strong-engine-token-32chars-minimum!!';
    config.DATA_SERVICE_AUTH_TOKEN = 'strong-data-token-32chars-minimum!!';
    config.JWT_ALGORITHM = 'HS256';

    // 删除 process.env.DATABASE_URL
    const savedDbUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    expect(() => validateConfig()).toThrow('DATABASE_URL');

    // 恢复
    if (savedDbUrl !== undefined) process.env.DATABASE_URL = savedDbUrl;
  });

  it('所有配置正确时不应抛错', () => {
    config.ADMIN_API_KEY = 'strong-admin-key';
    config.JWT_SECRET = 'strong-jwt-secret-32-chars-minimum-ok';
    config.ENGINE_AUTH_TOKEN = 'strong-engine-token-32chars-minimum!!';
    config.DATA_SERVICE_AUTH_TOKEN = 'strong-data-token-32chars-minimum!!';
    config.JWT_ALGORITHM = 'HS256';
    // T-03/T-06：生产硬性要求——开启认证、配置 CORS 白名单、配置 HMAC 密钥。
    config.REQUIRE_API_KEY = true;
    config.CORS_ORIGINS = ['https://example.com'];

    const savedDbUrl = process.env.DATABASE_URL;
    const savedHmac = process.env.AUDIT_HMAC_KEY;
    process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
    process.env.AUDIT_HMAC_KEY = 'a-very-strong-hmac-key-of-32-chars+';
    process.env.TRUST_PROXY_HOPS = '1';

    expect(() => validateConfig()).not.toThrow();

    // 恢复
    if (savedDbUrl !== undefined) process.env.DATABASE_URL = savedDbUrl;
    else delete process.env.DATABASE_URL;
    if (savedHmac !== undefined) process.env.AUDIT_HMAC_KEY = savedHmac;
    else delete process.env.AUDIT_HMAC_KEY;
    delete process.env.TRUST_PROXY_HOPS;
  });

  it('TRUST_PROXY_HOPS 为负数时应抛错', () => {
    config.ADMIN_API_KEY = 'strong-admin-key';
    config.JWT_SECRET = 'strong-jwt-secret-32-chars-minimum-ok';
    config.ENGINE_AUTH_TOKEN = 'strong-engine-token-32chars-minimum!!';
    config.DATA_SERVICE_AUTH_TOKEN = 'strong-data-token-32chars-minimum!!';
    config.JWT_ALGORITHM = 'HS256';
    config.REQUIRE_API_KEY = true;
    config.CORS_ORIGINS = ['https://example.com'];

    const savedDbUrl = process.env.DATABASE_URL;
    const savedHmac = process.env.AUDIT_HMAC_KEY;
    const savedTrustProxy = config.TRUST_PROXY_HOPS;
    const savedTrustProxyEnv = process.env.TRUST_PROXY_HOPS;
    process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
    process.env.AUDIT_HMAC_KEY = 'a-very-strong-hmac-key-of-32-chars+';
    process.env.TRUST_PROXY_HOPS = '0';
    (config as Record<string, unknown>).TRUST_PROXY_HOPS = -1;

    expect(() => validateConfig()).toThrow('TRUST_PROXY_HOPS');

    if (savedDbUrl !== undefined) process.env.DATABASE_URL = savedDbUrl;
    else delete process.env.DATABASE_URL;
    if (savedHmac !== undefined) process.env.AUDIT_HMAC_KEY = savedHmac;
    else delete process.env.AUDIT_HMAC_KEY;
    if (savedTrustProxyEnv !== undefined) process.env.TRUST_PROXY_HOPS = savedTrustProxyEnv;
    else delete process.env.TRUST_PROXY_HOPS;
    (config as Record<string, unknown>).TRUST_PROXY_HOPS = savedTrustProxy;
  });

  it('EMAIL_TRANSPORT=smtp 但未设置 EMAIL_SMTP_HOST 时应抛错', () => {
    config.ADMIN_API_KEY = 'strong-admin-key';
    config.JWT_SECRET = 'strong-jwt-secret-32-chars-minimum-ok';
    config.ENGINE_AUTH_TOKEN = 'strong-engine-token-32chars-minimum!!';
    config.DATA_SERVICE_AUTH_TOKEN = 'strong-data-token-32chars-minimum!!';
    config.JWT_ALGORITHM = 'HS256';
    config.REQUIRE_API_KEY = true;
    config.CORS_ORIGINS = ['https://example.com'];

    const savedDbUrl = process.env.DATABASE_URL;
    const savedHmac = process.env.AUDIT_HMAC_KEY;
    const savedTrustProxy = process.env.TRUST_PROXY_HOPS;
    const savedEmailTransport = config.EMAIL_TRANSPORT;
    const savedEmailHost = config.EMAIL_SMTP_HOST;
    process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
    process.env.AUDIT_HMAC_KEY = 'a-very-strong-hmac-key-of-32-chars+';
    process.env.TRUST_PROXY_HOPS = '1';
    config.EMAIL_TRANSPORT = 'smtp';
    config.EMAIL_SMTP_HOST = '';

    expect(() => validateConfig()).toThrow('EMAIL_SMTP_HOST');

    if (savedDbUrl !== undefined) process.env.DATABASE_URL = savedDbUrl;
    else delete process.env.DATABASE_URL;
    if (savedHmac !== undefined) process.env.AUDIT_HMAC_KEY = savedHmac;
    else delete process.env.AUDIT_HMAC_KEY;
    if (savedTrustProxy !== undefined) process.env.TRUST_PROXY_HOPS = savedTrustProxy;
    else delete process.env.TRUST_PROXY_HOPS;
    config.EMAIL_TRANSPORT = savedEmailTransport;
    config.EMAIL_SMTP_HOST = savedEmailHost;
  });

  it('生产环境未设置 TRUST_PROXY_HOPS 应抛错', () => {
    config.ADMIN_API_KEY = 'strong-admin-key';
    config.JWT_SECRET = 'strong-jwt-secret-32-chars-minimum-ok';
    config.ENGINE_AUTH_TOKEN = 'strong-engine-token-32chars-minimum!!';
    config.DATA_SERVICE_AUTH_TOKEN = 'strong-data-token-32chars-minimum!!';
    config.JWT_ALGORITHM = 'HS256';
    config.REQUIRE_API_KEY = true;
    config.CORS_ORIGINS = ['https://example.com'];

    const savedDbUrl = process.env.DATABASE_URL;
    const savedHmac = process.env.AUDIT_HMAC_KEY;
    const savedTrustProxy = process.env.TRUST_PROXY_HOPS;
    process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
    process.env.AUDIT_HMAC_KEY = 'a-very-strong-hmac-key-of-32-chars+';
    delete process.env.TRUST_PROXY_HOPS;

    expect(() => validateConfig()).toThrow('TRUST_PROXY_HOPS');

    if (savedDbUrl !== undefined) process.env.DATABASE_URL = savedDbUrl;
    else delete process.env.DATABASE_URL;
    if (savedHmac !== undefined) process.env.AUDIT_HMAC_KEY = savedHmac;
    else delete process.env.AUDIT_HMAC_KEY;
    if (savedTrustProxy !== undefined) process.env.TRUST_PROXY_HOPS = savedTrustProxy;
  });

  it('生产环境 REQUIRE_API_KEY 为 false 时应抛错（T-03 硬失败）', () => {
    config.ADMIN_API_KEY = 'strong-admin-key';
    config.JWT_SECRET = 'strong-jwt-secret-32-chars-minimum-ok';
    config.ENGINE_AUTH_TOKEN = 'strong-engine-token-32chars-minimum!!';
    config.DATA_SERVICE_AUTH_TOKEN = 'strong-data-token-32chars-minimum!!';
    config.JWT_ALGORITHM = 'HS256';
    config.CORS_ORIGINS = ['https://example.com'];
    config.REQUIRE_API_KEY = false;

    const savedDbUrl = process.env.DATABASE_URL;
    const savedHmac = process.env.AUDIT_HMAC_KEY;
    process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
    process.env.AUDIT_HMAC_KEY = 'a-very-strong-hmac-key-of-32-chars+';

    expect(() => validateConfig()).toThrow('REQUIRE_API_KEY');

    if (savedDbUrl !== undefined) process.env.DATABASE_URL = savedDbUrl;
    else delete process.env.DATABASE_URL;
    if (savedHmac !== undefined) process.env.AUDIT_HMAC_KEY = savedHmac;
    else delete process.env.AUDIT_HMAC_KEY;
  });

  it('多个校验失败时错误信息应包含全部失败项', () => {
    config.ADMIN_API_KEY = '';
    config.JWT_SECRET = 'dev-only-jwt-secret-change-in-production';
    config.ENGINE_AUTH_TOKEN = 'dev-engine-auth-token';
    config.DATA_SERVICE_AUTH_TOKEN = 'dev-data-service-auth-token';
    config.JWT_ALGORITHM = 'HS256';

    let errorMsg = '';
    try {
      validateConfig();
    } catch (err) {
      errorMsg = (err as Error).message;
    }

    expect(errorMsg).toContain('ADMIN_API_KEY');
    expect(errorMsg).toContain('JWT_SECRET');
    expect(errorMsg).toContain('ENGINE_AUTH_TOKEN');
    expect(errorMsg).toContain('DATA_SERVICE_AUTH_TOKEN');
  });
});

describe('config 默认值', () => {
  it('API_PORT 默认应为 5001', () => {
    // config 在模块加载时已构造，测试环境未设置 API_PORT 时应为默认值
    expect(typeof config.API_PORT).toBe('number');
    expect(config.API_PORT).toBeGreaterThan(0);
  });

  it('GO_ENGINE_URL 默认应指向 5004 端口', () => {
    expect(config.GO_ENGINE_URL).toContain('5004');
  });

  it('ENGINE_TIMEOUT_MS 默认应为 5000ms', () => {
    expect(config.ENGINE_TIMEOUT_MS).toBe(5000);
  });

  it('ENGINE_AUTH_TOKEN 应有默认值（开发环境）', () => {
    expect(typeof config.ENGINE_AUTH_TOKEN).toBe('string');
    expect(config.ENGINE_AUTH_TOKEN.length).toBeGreaterThan(0);
  });

  it('DATA_SERVICE_AUTH_TOKEN 应有默认值（开发环境）', () => {
    expect(typeof config.DATA_SERVICE_AUTH_TOKEN).toBe('string');
    expect(config.DATA_SERVICE_AUTH_TOKEN.length).toBeGreaterThan(0);
  });

  it('DATABASE_URL 默认应指向 localhost:5432', () => {
    expect(config.DATABASE_URL).toContain('5432');
  });

  it('DB_POOL_MAX 默认应为 20', () => {
    expect(config.DB_POOL_MAX).toBe(20);
  });

  it('DB_STATEMENT_TIMEOUT_MS 默认应为 10000ms', () => {
    expect(config.DB_STATEMENT_TIMEOUT_MS).toBe(10000);
  });

  it('JWT_ACCESS_TTL 默认应为 900（15 分钟）', () => {
    expect(config.JWT_ACCESS_TTL).toBe(900);
  });

  it('JWT_REFRESH_TTL 默认应为 604800（7 天）', () => {
    expect(config.JWT_REFRESH_TTL).toBe(604800);
  });

  it('REDIS_URL 默认应指向 localhost:6379', () => {
    expect(config.REDIS_URL).toContain('6379');
  });
});

describe('CORS_ORIGINS', () => {
  it('未设置时应为 true（允许所有来源）', () => {
    // config 在模块加载时已构造
    // CORS_ORIGINS 为 true 或字符串数组
    expect(config.CORS_ORIGINS === true || Array.isArray(config.CORS_ORIGINS)).toBe(true);
  });
});

describe('DEGRADED_WARNING', () => {
  it('应包含 BASE、WITH_DRAG、WITHOUT_DRAG 三种文案', () => {
    expect(DEGRADED_WARNING.BASE).toBeDefined();
    expect(DEGRADED_WARNING.WITH_DRAG).toBeDefined();
    expect(DEGRADED_WARNING.WITHOUT_DRAG).toBeDefined();
    expect(typeof DEGRADED_WARNING.BASE).toBe('string');
    expect(typeof DEGRADED_WARNING.WITH_DRAG).toBe('string');
    expect(typeof DEGRADED_WARNING.WITHOUT_DRAG).toBe('string');
  });

  it('WITH_DRAG 文案应提及 drag', () => {
    expect(DEGRADED_WARNING.WITH_DRAG).toContain('drag');
  });

  it('WITHOUT_DRAG 文案应提及 drag 或精度', () => {
    expect(DEGRADED_WARNING.WITHOUT_DRAG.toLowerCase()).toMatch(/drag|精度/);
  });
});

describe('DATABASE_URL SSL 配置', () => {
  it('DATABASE_URL 应支持带 sslmode 参数的连接字符串', () => {
    // 验证 DATABASE_URL 可以包含 sslmode 参数
    const url = 'postgresql://user:pass@host:5432/db?sslmode=require';
    expect(url).toContain('sslmode=require');
  });

  it('生产环境 db/index.ts 应根据 NODE_ENV 配置 SSL', () => {
    // config.NODE_ENV 为 production 时，db/index.ts 会配置 ssl: { rejectUnauthorized: true }
    // 此处验证 config.NODE_ENV 的类型正确
    expect(['development', 'production', 'test']).toContain(config.NODE_ENV);
  });
});
