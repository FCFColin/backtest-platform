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
 *   vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: mockLogger(loggerMocks) }));
 */

import { vi } from 'vitest';

/** Logger mock 方法集合 */
interface LoggerMocks {
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
 * @returns 可直接用于 vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: ... })) 的对象
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
export function createConfigMocks(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    NODE_ENV: 'test',
    SERVE_STATIC: false,
    API_PORT: 5001,
    GO_ENGINE_URL: 'http://127.0.0.1:5004',
    ENGINE_TIMEOUT_MS: 5000,
    GO_DATA_SERVICE_URL: 'http://127.0.0.1:5003',
    GO_DATA_SERVICE_TIMEOUT_MS: 5000,
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
    SYNC_COMPUTE_TIMEOUT_MS: 30000,
    APP_BASE_URL: 'http://localhost:5173',
    PROJECT_ROOT: '/tmp/test',
    MIGRATIONS_DIR: '/tmp/test/migrations',
    FRONTEND_DIST_DIR: '/tmp/test/dist',
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
    AUDIT_HMAC_KEY: '',
    DEBUG_AUTH_TOKEN: '',
    METRICS_AUTH_TOKEN: '',
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
    OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: '',
    ...overrides,
  };
}

/**
 * Redis mock 配置选项
 *
 * 企业理由：16 个测试文件重复定义 redisMocks，变体包括：
 * - 简单 vi.fn 列表（backtest-result-cache、worker 等）
 * - Map/Set 支撑的内存模式（jwt-auth、refresh-token、idempotency）
 * - 事件 handlers/emit 模式（data-service、login-lockout）
 * - 全部 reject 模式（jwt-auth.rs256）
 * 本工厂通过选项组合统一这些变体，消除重复。
 */
interface RedisMocksOptions {
  /** 包含 Map<string,string> 支撑的 store + resetStore 辅助方法（jwt-auth/refresh-token/idempotency 内存模式） */
  withStore?: boolean;
  /** 包含 Map<string,Set<string>> 支撑的 sets + sadd/smembers 方法（要求 withStore） */
  withSets?: boolean;
  /** 包含事件 handlers map + emit 方法，on 调用会存储 handler（data-service/login-lockout 事件模式） */
  withHandlers?: boolean;
  /** 包含 useMemoryFallback + useRedisSuccess 辅助方法（要求 withStore；jwt-auth/refresh-token/idempotency） */
  withMemoryHelpers?: boolean;
  /** useMemoryFallback 抛出的错误消息（默认 'Redis not available in test'） */
  memoryFallbackErrorMessage?: string;
  /** 额外方法或覆写（最后应用，覆盖默认值；如 { scan: vi.fn().mockResolvedValue(['0', []]) }） */
  methods?: Record<string, ReturnType<typeof vi.fn>>;
  /** 若提供，所有默认方法（ping/get/set/del/expire/[sadd]/[smembers]）reject 该错误（jwt-auth.rs256 模式） */
  rejectWithError?: Error;
}

/**
 * 创建 Redis 客户端 mock（appRedis）
 *
 * 工厂在 vi.mock 工厂内调用，通过 target 参数将属性写入 vi.hoisted 创建的占位对象，
 * 使得测试代码可在 top-level 直接引用 redisMocks.useMemoryFallback() 等方法。
 *
 * 用法：
 *   import { createRedisMocks } from '../helpers/mockFactories.js';
 *   const redisMocks = vi.hoisted(() => ({}) as Record<string, unknown>);
 *   vi.mock('.../redisClient.js', () => ({
 *     redisConnection: {},
 *     appRedis: createRedisMocks({ withStore: true, withSets: true, withMemoryHelpers: true }, redisMocks),
 *   }));
 *
 * @param opts - 配置选项，控制包含哪些方法与辅助函数
 * @param target - 可选的目标对象（通常为 vi.hoisted 创建的空对象）；不传则新建
 * @returns Redis mock 对象（与 target 同一引用）
 */
export function createRedisMocks(
  opts: RedisMocksOptions = {},
  target: Record<string, unknown> = {},
): Record<string, unknown> {
  const {
    withStore = false,
    withSets = false,
    withHandlers = false,
    withMemoryHelpers = false,
    memoryFallbackErrorMessage = 'Redis not available in test',
    methods = {},
    rejectWithError,
  } = opts;

  const store = withStore ? new Map<string, string>() : undefined;
  const sets = withSets ? new Map<string, Set<string>>() : undefined;
  const handlers = withHandlers
    ? ({} as Record<string, Array<(...args: unknown[]) => void>>)
    : undefined;

  const makeFn = (): ReturnType<typeof vi.fn> =>
    rejectWithError ? vi.fn().mockRejectedValue(rejectWithError) : vi.fn();

  target.ping = makeFn();
  target.get = makeFn();
  target.set = makeFn();
  target.del = makeFn();
  target.expire = makeFn();

  if (withSets) {
    target.sadd = makeFn();
    target.smembers = makeFn();
  }

  if (withHandlers) {
    target.on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!handlers![event]) handlers![event] = [];
      handlers![event].push(handler);
    });
    target.emit = function (event: string, ...args: unknown[]): void {
      for (const h of handlers![event] ?? []) h(...args);
    };
    target.handlers = handlers;
  } else {
    target.on = vi.fn();
  }

  if (store) target.store = store;
  if (sets) target.sets = sets;

  if (withStore) {
    target.resetStore = () => {
      store!.clear();
      sets?.clear();
    };
  }

  if (withMemoryHelpers) {
    target.useMemoryFallback = () => {
      (target.resetStore as () => void | undefined)?.();
      const err = new Error(memoryFallbackErrorMessage);
      (target.ping as ReturnType<typeof vi.fn>).mockRejectedValue(err);
      (target.get as ReturnType<typeof vi.fn>).mockRejectedValue(err);
      (target.set as ReturnType<typeof vi.fn>).mockRejectedValue(err);
      (target.del as ReturnType<typeof vi.fn>).mockRejectedValue(err);
      if (target.sadd) (target.sadd as ReturnType<typeof vi.fn>).mockRejectedValue(err);
      if (target.smembers) (target.smembers as ReturnType<typeof vi.fn>).mockRejectedValue(err);
      (target.expire as ReturnType<typeof vi.fn>).mockRejectedValue(err);
      if (target.emit) (target.emit as (e: string, ...a: unknown[]) => void)('error');
    };
    target.useRedisSuccess = () => {
      (target.resetStore as () => void | undefined)?.();
      (target.ping as ReturnType<typeof vi.fn>).mockResolvedValue('PONG');
      (target.get as ReturnType<typeof vi.fn>).mockImplementation((key: string) =>
        Promise.resolve(store!.get(key) ?? null),
      );
      (target.set as ReturnType<typeof vi.fn>).mockImplementation((key: string, value: string) => {
        store!.set(key, value);
        return Promise.resolve('OK');
      });
      (target.del as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
        store!.delete(key);
        return Promise.resolve(1);
      });
      if (target.sadd) {
        (target.sadd as ReturnType<typeof vi.fn>).mockImplementation(
          (key: string, member: string) => {
            const s = sets!.get(key) ?? new Set<string>();
            s.add(member);
            sets!.set(key, s);
            return Promise.resolve(1);
          },
        );
      }
      if (target.smembers) {
        (target.smembers as ReturnType<typeof vi.fn>).mockImplementation((key: string) =>
          Promise.resolve([...(sets!.get(key) ?? [])]),
        );
      }
      (target.expire as ReturnType<typeof vi.fn>).mockResolvedValue(1);
      if (target.emit) (target.emit as (e: string, ...a: unknown[]) => void)('ready');
    };
  }

  Object.assign(target, methods);

  return target;
}

/**
 * JWT 认证测试专用 config mock 工厂
 *
 * 企业理由：4 个 jwt-auth 测试文件重复定义相同的 config 块（13 个字段），
 * 每次新增字段需逐文件修改。本工厂集中维护 jwtAuth 测试默认值，
 * 与 createConfigMocks 区别在于仅包含 jwtAuth 关心的字段，且 JWT_ALGORITHM 为字面量联合类型。
 *
 * 用法：
 *   const mocks = vi.hoisted(() => ({ config: {} as JwtAuthConfigMocks }));
 *   vi.mock('.../config/index.js', () => ({
 *     config: Object.assign(mocks.config, createJwtAuthConfigMocks()),
 *     validateConfig: vi.fn(),
 *   }));
 */

/** JWT 认证测试 config mock 类型（JWT_ALGORITHM 为字面量联合，便于赋值时类型检查） */
export interface JwtAuthConfigMocks {
  NODE_ENV: string;
  JWT_SECRET: string;
  JWT_ACCESS_TTL: number;
  JWT_REFRESH_TTL: number;
  ADMIN_API_KEY: string;
  JWT_ALGORITHM: 'RS256' | 'HS256';
  JWT_PRIVATE_KEY: string;
  JWT_PRIVATE_KEY_FILE: string;
  JWT_PUBLIC_KEY: string;
  JWT_PUBLIC_KEY_FILE: string;
  DEV_SKIP_AUTH: boolean;
}

/**
 * 创建 jwtAuth 测试专用 config mock
 *
 * @param overrides - 覆盖默认字段（如 { JWT_ALGORITHM: 'RS256', NODE_ENV: 'development' }）
 * @returns 完整的 JwtAuthConfigMocks 对象
 */
export function createJwtAuthConfigMocks(
  overrides: Partial<JwtAuthConfigMocks> = {},
): JwtAuthConfigMocks {
  return {
    NODE_ENV: 'production',
    JWT_SECRET: 'test-jwt-secret-for-unit-tests',
    JWT_ACCESS_TTL: 900,
    JWT_REFRESH_TTL: 604800,
    ADMIN_API_KEY: '',
    JWT_ALGORITHM: 'HS256',
    JWT_PRIVATE_KEY: '',
    JWT_PRIVATE_KEY_FILE: '',
    JWT_PUBLIC_KEY: '',
    JWT_PUBLIC_KEY_FILE: '',
    DEV_SKIP_AUTH: false,
    ...overrides,
  };
}
