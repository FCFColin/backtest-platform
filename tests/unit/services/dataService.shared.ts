import { vi } from 'vitest';
import {
  createConfigMocks,
  createRedisModuleMock,
  createMetricsMocks,
} from '../../helpers/mockFactories.js';

const internalMocks = vi.hoisted(() => ({
  db: {
    getPool: vi.fn(),
    getReadPool: vi.fn(),
    initSchema: vi.fn().mockResolvedValue(undefined),
  },
  tickerValidation: { validateTickerFormat: vi.fn(), isValidTicker: vi.fn() },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  },
  redis: {} as Record<string, unknown>,
  fs: {
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn(),
    statSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
    unlinkSync: vi.fn(),
  },
  fsPromises: {
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    access: vi.fn(),
    readdir: vi.fn().mockResolvedValue([]),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
  circuitBreaker: { instance: { fire: vi.fn(), opened: false, on: vi.fn() } },
  goDataServiceClient: {
    callGoDataService: vi.fn(),
    fetchGoJson: vi.fn(async (path: string, orgId?: string) => {
      const parsed = JSON.parse(
        await internalMocks.goDataServiceClient.callGoDataService(path, orgId),
      );
      return { success: Boolean(parsed.success), data: parsed.data };
    }),
  },
  dataQuery: {
    validateTickers: vi.fn(),
    queryPricesFromDb: vi.fn(),
    fetchMissingFromGoService: vi.fn(),
    searchTickers: vi.fn(),
    missingTickers: (result: Record<string, Record<string, number>>, tickers: string[]) =>
      tickers.filter((t) => !result[t] || Object.keys(result[t]).length === 0),
  },
  dataCache: {
    getCacheKey: vi.fn(),
    readCache: vi.fn(),
    invalidateAllCache: vi.fn(),
  },
  dateUtils: { toDateStr: vi.fn() },
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: internalMocks.logger }));
vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: internalMocks.db.getPool,
  getReadPool: internalMocks.db.getReadPool,
}));
vi.mock('../../../packages/backend/src/db/migrations.js', () => ({
  initSchema: internalMocks.db.initSchema,
}));
vi.mock('../../../packages/backend/src/utils/tickerValidation.js', () => ({
  validateTickerFormat: internalMocks.tickerValidation.validateTickerFormat,
  isValidTicker: internalMocks.tickerValidation.isValidTicker,
}));
vi.mock('../../../packages/backend/src/utils/metrics.js', () => createMetricsMocks());
vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: createConfigMocks({ GO_DATA_SERVICE_URL: 'http://127.0.0.1:15003' }),
}));
vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  ...createRedisModuleMock(
    {
      withHandlers: true,
      methods: {
        ping: vi.fn().mockRejectedValue(new Error('redis unavailable')),
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue('OK'),
        del: vi.fn().mockResolvedValue(1),
        scan: vi.fn().mockResolvedValue(['0', []]),
      },
    },
    internalMocks.redis,
  ),
  isSentinelMode: false,
  bullmqConnectionOptions: {},
}));
vi.mock('opossum', () => ({
  default: vi.fn(() => internalMocks.circuitBreaker.instance),
  CircuitBreaker: vi.fn(() => internalMocks.circuitBreaker.instance),
}));
vi.mock('fs', () => ({ default: internalMocks.fs, ...internalMocks.fs }));
vi.mock('fs/promises', () => ({ default: internalMocks.fsPromises, ...internalMocks.fsPromises }));
vi.mock('../../../packages/backend/src/infrastructure/goDataServiceClient.js', () => ({
  callGoDataService: internalMocks.goDataServiceClient.callGoDataService,
  fetchGoJson: internalMocks.goDataServiceClient.fetchGoJson,
}));

export const dbMocks = internalMocks.db;
export const tickerValidationMocks = internalMocks.tickerValidation;
export const loggerMocks = internalMocks.logger;
export const redisMocks = internalMocks.redis;
const fsMocks = internalMocks.fs;
const fsPromisesMocks = internalMocks.fsPromises;
export const circuitBreakerMocks = internalMocks.circuitBreaker;
export const goDataServiceClientMocks = internalMocks.goDataServiceClient;
export const dataQueryMocks = internalMocks.dataQuery;
export const dataCacheMocks = internalMocks.dataCache;
export const dateUtilsMocks = internalMocks.dateUtils;

export function setupDefault(): void {
  vi.clearAllMocks();
  circuitBreakerMocks.instance.opened = false;
  circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });
  tickerValidationMocks.validateTickerFormat.mockReturnValue({ valid: [], invalid: [] });
  tickerValidationMocks.isValidTicker.mockImplementation((t: string) =>
    /^[A-Z0-9._-]{1,20}$/.test(t),
  );
  fsMocks.existsSync.mockReturnValue(false);
  fsPromisesMocks.access.mockRejectedValue(new Error('no file'));
}

export function setValid(tickers: string[]): void {
  tickerValidationMocks.validateTickerFormat.mockReturnValue({ valid: tickers, invalid: [] });
}

export function rows(...r: { ticker: string; date: unknown; close: number }[]) {
  return { rows: r };
}

export function setupRedisDown(): void {
  redisMocks.ping.mockRejectedValue(new Error('redis unavailable'));
  redisMocks.get.mockResolvedValue(null);
}
