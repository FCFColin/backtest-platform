import { vi } from 'vitest';
import {
  createLoggerMocks,
  createConfigMocks,
  createRedisModuleMock,
} from '../../helpers/mockFactories.js';

/**
 * data-service.test.ts / data-service-extended.test.ts 共享的 mock 配置与 setup helpers。
 *
 * vitest 的 vi.mock 会提升执行，且 hoisted 变量不能直接 export（参见
 * tests/helpers/dataManageRoutesFixtures.ts 既有模式），因此统一放入
 * internalMocks 容器，vi.mock 工厂与对外导出均通过属性引用获取。
 */
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
  integrity: {
    signFileSync: vi.fn(),
    verifyFileSync: vi.fn().mockReturnValue(true),
    signFile: vi.fn().mockResolvedValue(undefined),
    verifyFile: vi.fn().mockResolvedValue(true),
  },
  http: { request: vi.fn() },
  dataQuery: {
    validateTickers: vi.fn(),
    queryPricesFromDb: vi.fn(),
    fetchMissingFromGoService: vi.fn(),
    searchTickers: vi.fn(),
  },
  dataCache: {
    getCacheKey: vi.fn(),
    readCache: vi.fn(),
    invalidateTickerCache: vi.fn(),
    invalidateAllCache: vi.fn(),
  },
  dateUtils: { toDateStr: vi.fn() },
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => {
  Object.assign(internalMocks.logger, createLoggerMocks());
  return { logger: internalMocks.logger };
});
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
vi.mock('../../../packages/backend/src/utils/metrics.js', () => ({
  registerSemaphoreMetrics: vi.fn(),
  registerCircuitBreakerMetrics: vi.fn(),
  recordCacheHit: vi.fn(),
  recordCacheMiss: vi.fn(),
  recordDataServiceCall: vi.fn(),
  recordEngineCall: vi.fn(),
  recordEngineUnavailable: vi.fn(),
  engineCallDuration: { observe: vi.fn() },
  recordBacktestRequest: vi.fn(),
  recordDegradedResponse: vi.fn(),
}));
vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: createConfigMocks({ GO_DATA_SERVICE_URL: 'http://127.0.0.1:15003' }),
}));
vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () =>
  createRedisModuleMock(
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
);
vi.mock('opossum', () => ({
  default: vi.fn(() => internalMocks.circuitBreaker.instance),
  CircuitBreaker: vi.fn(() => internalMocks.circuitBreaker.instance),
}));
vi.mock('fs', () => ({ default: internalMocks.fs, ...internalMocks.fs }));
vi.mock('fs/promises', () => ({ default: internalMocks.fsPromises, ...internalMocks.fsPromises }));
vi.mock('../../../packages/backend/src/utils/integrity.js', () => ({
  signFileSync: internalMocks.integrity.signFileSync,
  verifyFileSync: internalMocks.integrity.verifyFileSync,
  signFile: internalMocks.integrity.signFile,
  verifyFile: internalMocks.integrity.verifyFile,
}));
vi.mock('http', () => ({
  default: { request: internalMocks.http.request },
  request: internalMocks.http.request,
  Agent: vi.fn(() => ({ sockets: {}, destroy: vi.fn() })),
}));

export const dbMocks = internalMocks.db;
export const tickerValidationMocks = internalMocks.tickerValidation;
export const loggerMocks = internalMocks.logger;
export const redisMocks = internalMocks.redis;
export const fsMocks = internalMocks.fs;
export const fsPromisesMocks = internalMocks.fsPromises;
export const circuitBreakerMocks = internalMocks.circuitBreaker;
export const integrityMocks = internalMocks.integrity;
export const httpMocks = internalMocks.http;
export const dataQueryMocks = internalMocks.dataQuery;
export const dataCacheMocks = internalMocks.dataCache;
export const dateUtilsMocks = internalMocks.dateUtils;

/**
 * 重置所有 mock 调用记录并恢复默认实现（beforeEach 通用）
 */
export function setupDefault(): void {
  vi.clearAllMocks();
  circuitBreakerMocks.instance.opened = false;
  circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });
  tickerValidationMocks.validateTickerFormat.mockReturnValue({ valid: [], invalid: [] });
  tickerValidationMocks.isValidTicker.mockImplementation((t: string) =>
    /^[A-Z0-9._-]{1,20}$/.test(t),
  );
  fsMocks.existsSync.mockReturnValue(false);
  integrityMocks.verifyFileSync.mockReturnValue(true);
  integrityMocks.verifyFile.mockResolvedValue(true);
  fsPromisesMocks.access.mockRejectedValue(new Error('no file'));
}

/**
 * 设置 validateTickerFormat 返回全部合法 ticker
 *
 * @param tickers - 合法 ticker 列表
 */
export function setValid(tickers: string[]): void {
  tickerValidationMocks.validateTickerFormat.mockReturnValue({ valid: tickers, invalid: [] });
}

/**
 * 构造带 rows 字段的查询结果
 *
 * @param r - 行数据（ticker/date/close）
 * @returns { rows } 查询结果对象
 */
export function rows(...r: { ticker: string; date: unknown; close: number }[]) {
  return { rows: r };
}

/**
 * 切换到 Redis 不可用状态（ping/get 拒绝）
 */
export function setupRedisDown(): void {
  redisMocks.ping.mockRejectedValue(new Error('redis unavailable'));
  redisMocks.get.mockResolvedValue(null);
}
