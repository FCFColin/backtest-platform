import { vi } from 'vitest';
import type { PoolClient } from 'pg';

interface LoggerMocks {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  child: ReturnType<typeof vi.fn>;
}

/**
 * 创建 logger mock 方法集合（vi.hoisted 安全；须在 vi.mock 调用前使用）。
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

/** 由 createLoggerMocks() 的返回值构造 vi.mock 工厂可用的 logger 对象。 */
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
 * 创建 config mock 对象（vi.hoisted 安全）。集中维护完整 config 默认值，测试文件只需覆写关心的属性。
 * @param overrides - 要覆写的配置属性（支持全部 config 属性）
 * @returns 完整的 config mock 对象
 */
export function createConfigMocks(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    NODE_ENV: 'test',
    SERVE_STATIC: false,
    API_PORT: 15001,
    GO_ENGINE_URL: 'http://127.0.0.1:15004',
    ENGINE_TIMEOUT_MS: 5000,
    GO_DATA_SERVICE_URL: 'http://127.0.0.1:15003',
    GO_DATA_SERVICE_TIMEOUT_MS: 5000,
    ENGINE_AUTH_TOKEN: 'dev-engine-auth-token',
    DATA_SERVICE_AUTH_TOKEN: 'dev-data-service-auth-token',
    CORS_ORIGINS: true,
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
    WORKER_CONCURRENCY: 4,
    BACKTEST_SYNC_WAIT_MS: 10000,
    REDIS_URL: 'redis://localhost:6379',
    REDIS_SENTINELS: '',
    REDIS_SENTINEL_NAME: 'mymaster',
    REDIS_PASSWORD: '',
    DB_POOL_MAX: 20,
    DB_POOL_MIN: 2,
    TRUST_PROXY_HOPS: 1,
    COMPUTE_RATE_LIMIT_MAX: 10,
    SYNC_COMPUTE_TIMEOUT_MS: 30000,
    APP_BASE_URL: 'http://localhost:15173',
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

interface RedisMocksOptions {
  withStore?: boolean;
  withSets?: boolean;
  withHandlers?: boolean;
  withMemoryHelpers?: boolean;
  memoryFallbackErrorMessage?: string;
  methods?: Record<string, ReturnType<typeof vi.fn>>;
  rejectWithError?: Error;
}

/**
 * 创建 Redis 客户端 mock（appRedis）。在 vi.mock 工厂内调用，通过 target 参数将属性写入
 * vi.hoisted 创建的占位对象，使测试代码可在 top-level 直接引用 useMemoryFallback() 等方法。
 * @param opts - 控制包含哪些方法与辅助函数
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
    const reject = (key: string, err: Error) =>
      (target[key] as ReturnType<typeof vi.fn>).mockRejectedValue(err);
    target.useMemoryFallback = () => {
      (target.resetStore as () => void | undefined)?.();
      const err = new Error(memoryFallbackErrorMessage);
      for (const k of ['ping', 'get', 'set', 'del', 'expire']) reject(k, err);
      if (target.sadd) reject('sadd', err);
      if (target.smembers) reject('smembers', err);
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
 * 创建 Redis 模块完整 mock（appRedis + getRedisHealth + markRedisUnhealthy）。
 * getRedisHealth 通过调用 appRedis.ping() 动态返回健康状态，与 useRedisSuccess/useMemoryFallback 联动。
 * @param opts - RedisMocksOptions，控制 appRedis mock 行为
 * @param target - vi.hoisted 创建的占位对象，供测试代码引用 useRedisSuccess 等
 * @returns 完整的 redisClient 模块 mock 对象（含 redisConnection/appRedis/getRedisHealth/markRedisUnhealthy）
 */
export function createRedisModuleMock(
  opts: RedisMocksOptions = {},
  target: Record<string, unknown> = {},
) {
  const appRedis = createRedisMocks(opts, target);
  return {
    redisConnection: {},
    appRedis,
    getRedisHealth: vi.fn(async () => {
      try {
        return (await (appRedis.ping as () => Promise<unknown>)()) === 'PONG';
      } catch {
        return false;
      }
    }),
    markRedisUnhealthy: vi.fn(),
  };
}

export interface JwtAuthConfigMocks {
  NODE_ENV: string;
  JWT_SECRET: string;
  JWT_ACCESS_TTL: number;
  JWT_REFRESH_TTL: number;
  JWT_ALGORITHM: 'RS256' | 'HS256';
  JWT_PRIVATE_KEY: string;
  JWT_PRIVATE_KEY_FILE: string;
  JWT_PUBLIC_KEY: string;
  JWT_PUBLIC_KEY_FILE: string;
  DEV_SKIP_AUTH: boolean;
}

/**
 * 创建 jwtAuth 测试专用 config mock。
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
    JWT_ALGORITHM: 'HS256',
    JWT_PRIVATE_KEY: '',
    JWT_PRIVATE_KEY_FILE: '',
    JWT_PUBLIC_KEY: '',
    JWT_PUBLIC_KEY_FILE: '',
    DEV_SKIP_AUTH: false,
    ...overrides,
  };
}

/**
 * 构造一个 mock pg.Pool,默认 query 返回空结果集
 * @returns 包含 mock query 方法的对象(可强转为 pg.Pool)
 */
export function createMockPool(): { query: ReturnType<typeof vi.fn> } {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  } as unknown as { query: ReturnType<typeof vi.fn> };
}

/**
 * 构造一个 mock PoolClient,记录所有 query 调用
 * @returns 包含 mock query + release 方法的 PoolClient
 */
export function createMockClient(): PoolClient & { query: ReturnType<typeof vi.fn> } {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
    release: vi.fn(),
  } as unknown as PoolClient & { query: ReturnType<typeof vi.fn> };
}

interface PoolDbMocks {
  query: ReturnType<typeof vi.fn>;
  withTenant?: ReturnType<typeof vi.fn>;
}

/**
 * 构造 db/pool 模块 mock：withTenant/withTenantReadOnly 转发到 dbMocks（记录租户断言），
 * getPool/getReadPool 返回带 query 的假池。用于 vi.mock('...db/pool.js') 工厂。
 * @param dbMocks - vi.hoisted 创建的 query/withTenant mock 集合
 * @returns pool 模块 mock 对象
 */
export function createPoolModuleMock(dbMocks: PoolDbMocks) {
  const client = () => ({ query: dbMocks.query });
  return {
    getPool: () => client(),
    getReadPool: () => client(),
    withTenant: <T>(tenantId: string, fn: (c: ReturnType<typeof client>) => Promise<T> | T) => {
      dbMocks.withTenant?.(tenantId);
      return fn(client());
    },
    withTenantReadOnly: <T>(
      tenantId: string,
      fn: (c: ReturnType<typeof client>) => Promise<T> | T,
    ) => {
      dbMocks.withTenant?.(tenantId);
      return fn(client());
    },
  };
}
