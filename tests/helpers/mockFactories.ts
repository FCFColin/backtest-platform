/**
 * 测试辅助：共享 mock 工厂
 *
 * 企业理由：15+ 测试文件重复定义相同的 logger mock 和 vi.hoisted 模式，
 * 每次新增日志方法（如 child/trace）需逐文件修改，易遗漏。
 * 本模块集中维护共享 mock 工厂，消除重复，确保行为一致。
 *
 * 用法：
 *   import { createLoggerMocks, mockLogger } from '../helpers/mockFactories.js';
 *   const loggerMocks = createLoggerMocks();
 *   vi.mock('../../../api/utils/logger.js', () => ({ logger: mockLogger(loggerMocks) }));
 */

import { vi } from 'vitest';

/** Logger mock 方法集合 */
export interface LoggerMocks {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  child: ReturnType<typeof vi.fn>;
}

/**
 * 创建 logger mock 方法集合（vi.hoisted 安全）
 *
 * 必须在 vi.mock 调用前使用，确保 mock 引用在工厂执行前已绑定。
 *
 * @returns 包含 info/warn/error/debug/child 方法的 mock 对象
 */
export function createLoggerMocks(): LoggerMocks {
  return {
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
  };
}

/**
 * 根据 LoggerMocks 构造 logger mock 对象（供 vi.mock 工厂使用）
 *
 * @param mocks - createLoggerMocks() 的返回值
 * @returns 可直接用于 vi.mock('../../../api/utils/logger.js', () => ({ logger: ... })) 的对象
 */
export function mockLogger(mocks: LoggerMocks) {
  return {
    info: mocks.info,
    warn: mocks.warn,
    error: mocks.error,
    debug: mocks.debug,
    child: mocks.child,
  };
}

/**
 * 创建 config mock 对象（vi.hoisted 安全）
 *
 * 企业理由：17 个测试文件重复定义相同的 config mock 对象（每个文件覆写 1-10 个属性），
 * 新增配置项时需逐文件修改，易遗漏。本工厂集中维护完整 config 默认值，
 * 测试文件只需覆写关心的属性即可。
 *
 * @param overrides - 要覆写的配置属性（支持全部 config 属性）
 * @returns 完整的 config mock 对象
 */
export function createConfigMocks(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    NODE_ENV: 'test',
    SERVE_STATIC: false,
    API_PORT: 5001,
    GO_ENGINE_URL: 'http://127.0.0.1:5004',
    ENGINE_TIMEOUT_MS: 5000,
    GO_DATA_SERVICE_URL: 'http://127.0.0.1:5003',
    ENGINE_AUTH_TOKEN: 'dev-engine-auth-token',
    DATA_SERVICE_AUTH_TOKEN: 'dev-data-service-auth-token',
    CORS_ORIGINS: true,
    ADMIN_API_KEY: '',
    REQUIRE_API_KEY: false,
    DEV_SKIP_AUTH: false,
    JWT_SECRET: 'test-jwt-secret-for-unit-tests',
    JWT_ACCESS_TTL: 900,
    JWT_REFRESH_TTL: 604800,
    JWT_ALGORITHM: 'HS256',
    JWT_PRIVATE_KEY: '',
    JWT_PRIVATE_KEY_FILE: '',
    JWT_PUBLIC_KEY: '',
    JWT_PUBLIC_KEY_FILE: '',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    DATABASE_READ_URL: '',
    DB_STATEMENT_TIMEOUT_MS: 10000,
    BACKTEST_SYNC_TIMEOUT_MS: 120000,
    REDIS_URL: 'redis://localhost:6379',
    DB_POOL_MAX: 20,
    DB_POOL_MIN: 2,
    TRUST_PROXY_HOPS: 1,
    COMPUTE_RATE_LIMIT_MAX: 10,
    APP_BASE_URL: 'http://localhost:5173',
    EMAIL_TRANSPORT: 'console',
    EMAIL_FROM: 'Backtest Platform <no-reply@backtest.local>',
    EMAIL_SMTP_HOST: '',
    EMAIL_SMTP_PORT: 587,
    EMAIL_SMTP_SECURE: false,
    EMAIL_SMTP_USER: '',
    EMAIL_SMTP_PASS: '',
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
    STRIPE_PUBLISHABLE_KEY: '',
    STRIPE_PRICE_PRO: '',
    STRIPE_PRICE_ENTERPRISE: '',
    ...overrides,
  };
}
