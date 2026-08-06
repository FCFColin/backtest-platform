import { vi } from 'vitest';
import type { PoolClient } from 'pg';

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

export function createConfigMocks(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...CONFIG_DEFAULTS, ...overrides };
}

export function mockConfigModule(overrides: Record<string, unknown> = {}) {
  return {
    config: createConfigMocks(overrides),
    validateConfig: vi.fn(),
    USAGE_METRIC: { BACKTEST: 'backtest' },
  };
}

export function mockBacktestQueue(
  add: ReturnType<typeof vi.fn>,
  getJob?: ReturnType<typeof vi.fn>,
) {
  return { backtestQueue: { add, ...(getJob ? { getJob } : {}) } };
}

export function createMetricsMocks() {
  return {
    registerSemaphoreMetrics: vi.fn(),
    registerCircuitBreakerMetrics: vi.fn(),
    recordCacheHit: vi.fn(),
    recordCacheMiss: vi.fn(),
    recordCacheEviction: vi.fn(),
    recordDataServiceCall: vi.fn(),
    recordEngineCall: vi.fn(),
    recordEngineUnavailable: vi.fn(),
    engineCallDuration: { observe: vi.fn() },
    recordBacktestRequest: vi.fn(),
    recordDegradedResponse: vi.fn(),
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

function createRedisMocks(
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
      (handlers![event] ??= []).push(handler);
    });
    target.emit = (event: string, ...args: unknown[]) =>
      (handlers![event] ?? []).forEach((h) => h(...args));
    target.handlers = handlers;
  } else {
    target.on = vi.fn();
  }
  if (store) target.store = store;
  if (sets) target.sets = sets;
  if (withStore)
    target.resetStore = () => {
      store!.clear();
      sets?.clear();
    };

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
      if (target.sadd)
        (target.sadd as ReturnType<typeof vi.fn>).mockImplementation(
          (key: string, member: string) => {
            const s = sets!.get(key) ?? new Set<string>();
            s.add(member);
            sets!.set(key, s);
            return Promise.resolve(1);
          },
        );
      if (target.smembers)
        (target.smembers as ReturnType<typeof vi.fn>).mockImplementation((key: string) =>
          Promise.resolve([...(sets!.get(key) ?? [])]),
        );
      (target.expire as ReturnType<typeof vi.fn>).mockResolvedValue(1);
      if (target.emit) (target.emit as (e: string, ...a: unknown[]) => void)('ready');
    };
  }

  Object.assign(target, methods);

  return target;
}

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
export function createJwtAuthConfigMocks(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return createConfigMocks({ NODE_ENV: 'production', ...overrides });
}

export function createMockPool(): { query: ReturnType<typeof vi.fn> } {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  } as unknown as { query: ReturnType<typeof vi.fn> };
}

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
