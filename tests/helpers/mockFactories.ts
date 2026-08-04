import { vi } from 'vitest';
import type { PoolClient } from 'pg';

interface LoggerMocks {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  child: ReturnType<typeof vi.fn>;
}

/** 创建 logger mock（vi.hoisted 安全）。返回值可直接用作 vi.mock 工厂中的 logger。@returns LoggerMocks */
export function createLoggerMocks(): LoggerMocks {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  };
}

/** @deprecated 使用 createLoggerMocks() 返回值直接作为 logger。保留向后兼容。 */
export const mockLogger = (m: LoggerMocks) => m;

const CONFIG_DEFAULTS: Record<string, unknown> = {
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
};

/** 创建 config mock（vi.hoisted 安全）。@param overrides - 覆写属性 @returns 完整 config mock */
export function createConfigMocks(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...CONFIG_DEFAULTS, ...overrides };
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

/** 创建 Redis 客户端 mock（appRedis）。在 vi.mock 工厂内调用，target 参数将属性写入 vi.hoisted 占位对象。 @param opts - 控制包含哪些方法 @param target - vi.hoisted 占位对象 @returns Redis mock */
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

/** 创建 Redis 模块完整 mock（appRedis + getRedisHealth + markRedisUnhealthy）。@param opts - RedisMocksOptions @param target - vi.hoisted 占位对象 @returns redisClient 模块 mock */
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

export type JwtAuthConfigMocks = ReturnType<typeof createConfigMocks>;
/** 创建 jwtAuth 测试专用 config mock。@param overrides - 覆盖默认字段 */
export function createJwtAuthConfigMocks(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return createConfigMocks({ NODE_ENV: 'production', ...overrides });
}

/** 构造 mock pg.Pool。@returns 带 mock query 的对象 */
export function createMockPool(): { query: ReturnType<typeof vi.fn> } {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  } as unknown as { query: ReturnType<typeof vi.fn> };
}

/**
 * Reset all common backend mocks to default state in one call.
 * Replaces the repetitive beforeEach boilerplate in most test files.
 *
 * @example
 * // In test file:
 * const m = vi.hoisted(() => ({
 *   logger: createLoggerMocks(),
 *   db: { query: vi.fn() },
 * }));
 * vi.mock('../../src/utils/logger.js', () => ({ logger: mockLogger(m.logger) }));
 * // ...other vi.mock calls...
 * beforeEach(() => resetBackendMocks(m));
 */
export function resetBackendMocks(mocks: {
  logger: LoggerMocks;
  db?: { query: ReturnType<typeof vi.fn> };
  redis?: Record<string, ReturnType<typeof vi.fn>>;
  circuitBreaker?: { instance: { fire: ReturnType<typeof vi.fn> } };
}): void {
  vi.clearAllMocks();
  mocks.logger.info.mockResolvedValue(undefined);
  mocks.logger.warn.mockResolvedValue(undefined);
  mocks.logger.error.mockResolvedValue(undefined);
  mocks.logger.debug.mockResolvedValue(undefined);
  mocks.logger.child.mockReturnValue(mocks.logger);
  if (mocks.db) mocks.db.query.mockResolvedValue({ rows: [], rowCount: 0 });
  if (mocks.redis) for (const fn of Object.values(mocks.redis)) fn.mockResolvedValue(undefined);
  if (mocks.circuitBreaker)
    mocks.circuitBreaker.instance.fire.mockResolvedValue({ rows: [], rowCount: 0 });
}

/** 构造 mock PoolClient。@returns 带 mock query + release 的 PoolClient */
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

/** 构造 db/pool 模块 mock：withTenant/withTenantReadOnly 转发到 dbMocks。 @param dbMocks - vi.hoisted 创建的 query/withTenant mock @returns pool 模块 mock */
export function createPoolModuleMock(dbMocks: PoolDbMocks) {
  const client = () => ({ query: dbMocks.query });
  const withTenant = <T>(
    tenantId: string,
    fn: (c: ReturnType<typeof client>) => Promise<T> | T,
  ) => {
    dbMocks.withTenant?.(tenantId);
    return fn(client());
  };
  return {
    getPool: () => client(),
    getReadPool: () => client(),
    withTenant,
    withTenantReadOnly: withTenant,
  };
}
