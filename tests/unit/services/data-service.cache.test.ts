/**
 * DataService 单元测试 - Cache 职责（Task 11 拆分）
 * 覆盖：invalidateTickerCache/invalidateAllCache、fetchHistoryData 扩展场景（HMAC、Go 服务、磁盘缓存、并发）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger, createConfigMocks, createRedisMocks } from '../../helpers/mockFactories.js';
import { setupHttpGetSuccess as makeHttpSuccess } from '../../helpers/dataServiceFixtures.js';

// ===== vi.hoisted：保证 mock 引用在 vi.mock 工厂执行前就绑定 =====
const dbMocks = vi.hoisted(() => ({
  getPool: vi.fn(),
  getReadPool: vi.fn(),
  initSchema: vi.fn().mockResolvedValue(undefined),
}));

const tickerValidationMocks = vi.hoisted(() => ({
  validateTickerFormat: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

const redisMocks = vi.hoisted(() => ({}) as Record<string, unknown>);

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  statSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  unlinkSync: vi.fn(),
}));

const fsPromisesMocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  access: vi.fn(),
  readdir: vi.fn().mockResolvedValue([]),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

const circuitBreakerMocks = vi.hoisted(() => ({
  instance: { fire: vi.fn(), opened: false, on: vi.fn() },
}));

const integrityMocks = vi.hoisted(() => ({
  signFileSync: vi.fn(),
  verifyFileSync: vi.fn().mockReturnValue(true),
  signFile: vi.fn().mockResolvedValue(undefined),
  verifyFile: vi.fn().mockResolvedValue(true),
}));

const httpMocks = vi.hoisted(() => ({ request: vi.fn() }));

// ===== Mock 模块 =====
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));
vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: dbMocks.getPool,
  getReadPool: dbMocks.getReadPool,
}));
vi.mock('../../../packages/backend/src/db/migrations.js', () => ({
  initSchema: dbMocks.initSchema,
}));
vi.mock('../../../packages/backend/src/utils/tickerValidation.js', () => ({
  validateTickerFormat: tickerValidationMocks.validateTickerFormat,
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
  config: createConfigMocks({ GO_DATA_SERVICE_URL: 'http://127.0.0.1:5003' }),
}));
vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  appRedis: createRedisMocks(
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
    redisMocks,
  ),
}));
vi.mock('opossum', () => ({
  default: vi.fn(() => circuitBreakerMocks.instance),
  CircuitBreaker: vi.fn(() => circuitBreakerMocks.instance),
}));
vi.mock('fs', () => ({ default: fsMocks, ...fsMocks }));
vi.mock('fs/promises', () => ({ default: fsPromisesMocks, ...fsPromisesMocks }));
vi.mock('../../../packages/backend/src/utils/integrity.js', () => ({
  signFileSync: integrityMocks.signFileSync,
  verifyFileSync: integrityMocks.verifyFileSync,
  signFile: integrityMocks.signFile,
  verifyFile: integrityMocks.verifyFile,
}));
vi.mock('http', () => ({ default: { request: httpMocks.request }, request: httpMocks.request }));

import {
  fetchHistoryData,
  invalidateTickerCache,
  invalidateAllCache,
} from '../../../packages/backend/src/services/dataService.js';

describe('缓存失效函数', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    circuitBreakerMocks.instance.opened = false;
    redisMocks.ping.mockResolvedValue('PONG');
    redisMocks.emit('ready');
    fsMocks.existsSync.mockReturnValue(true);
    fsPromisesMocks.readdir.mockResolvedValue([]);
    fsPromisesMocks.readFile.mockResolvedValue('0');
  });

  it('按 ticker 失效时应清除内存缓存并删除相关磁盘文件', async () => {
    fsPromisesMocks.readdir.mockResolvedValue([
      'history_AAPL=tickers_AAPL&start=2024-01-01.json',
      'other.json',
    ]);

    await invalidateTickerCache('AAPL');

    expect(loggerMocks.info).toHaveBeenCalledWith(expect.stringContaining('ticker=AAPL'));
    expect(fsPromisesMocks.unlink).toHaveBeenCalledTimes(1);
    expect(redisMocks.del).toHaveBeenCalledWith('price_cache:AAPL');
  });

  it('全量失效时应递增版本号并清空缓存', async () => {
    redisMocks.scan.mockResolvedValue(['0', ['price_cache:AAPL', 'price_cache:BND']]);

    await invalidateAllCache();

    expect(fsPromisesMocks.writeFile).toHaveBeenCalled();
    expect(redisMocks.del).toHaveBeenCalledWith('price_cache:AAPL', 'price_cache:BND');
    expect(loggerMocks.info).toHaveBeenCalledWith(expect.stringContaining('全量失效'));
  });

  it('Redis 删除失败时应降级到内存路径且不抛出', async () => {
    redisMocks.del.mockRejectedValueOnce(new Error('redis del failed'));

    await expect(invalidateTickerCache('AAPL')).resolves.toBeUndefined();
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  it('Redis scan 失败时全量失效仍应完成', async () => {
    redisMocks.scan.mockRejectedValue(new Error('scan failed'));

    await expect(invalidateAllCache()).resolves.toBeUndefined();
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  it('Redis 不可用时按 ticker 失效应降级到内存路径', async () => {
    redisMocks.emit('error');
    redisMocks.ping.mockRejectedValue(new Error('redis unavailable'));

    await expect(invalidateTickerCache('AAPL')).resolves.toBeUndefined();
    expect(redisMocks.del).not.toHaveBeenCalled();
  });
});

describe('fetchHistoryData 扩展场景', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    circuitBreakerMocks.instance.opened = false;
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });
    tickerValidationMocks.validateTickerFormat.mockReturnValue({ valid: [], invalid: [] });
    integrityMocks.verifyFileSync.mockReturnValue(true);
    integrityMocks.verifyFile.mockResolvedValue(true);
    fsMocks.existsSync.mockReturnValue(false);
    fsPromisesMocks.access.mockRejectedValue(new Error('no file'));
    redisMocks.ping.mockRejectedValue(new Error('redis unavailable'));
    redisMocks.get.mockResolvedValue(null);
    // 重置模块级 Redis/内存价格缓存，避免前一用例污染后续断言
    redisMocks.emit('error');
    await invalidateAllCache();
  });

  it('PostgreSQL 查询成功时应直接返回行情', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({ valid: ['AAPL'], invalid: [] });
    circuitBreakerMocks.instance.fire.mockResolvedValue({
      rows: [
        { ticker: 'AAPL', date: '2024-01-02', close: 185.5 },
        { ticker: 'AAPL', date: '2024-01-03', close: 186.0 },
      ],
    });

    const { data: result } = await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');

    expect(result.AAPL).toEqual({ '2024-01-02': 185.5, '2024-01-03': 186.0 });
  });

  it('HMAC 校验失败时应丢弃磁盘缓存并调用 Go 数据服务', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({ valid: ['AAPL'], invalid: [] });
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });
    fsMocks.existsSync.mockImplementation((p: string) => {
      const normalized = String(p).replace(/\\/g, '/');
      if (normalized.includes('.cache_version')) return false;
      if (normalized.includes('/data/cache') || normalized.includes('history_')) return true;
      return false;
    });
    integrityMocks.verifyFile.mockResolvedValue(true);
    integrityMocks.verifyFile.mockImplementation((p: string) => !String(p).includes('history_'));
    fsPromisesMocks.access.mockRejectedValue(new Error('no file'));
    // 让 history 缓存文件可通过 access 检查
    fsPromisesMocks.access.mockImplementation((p: string) => {
      const normalized = String(p).replace(/\\/g, '/');
      if (normalized.includes('history_')) return Promise.resolve();
      return Promise.reject(new Error('no file'));
    });
    httpMocks.request.mockImplementation(
      makeHttpSuccess(
        JSON.stringify({
          success: true,
          data: [{ date: '2024-01-02', close: 99.0 }],
        }),
      ),
    );

    const { data: result } = await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');

    expect(result.AAPL).toEqual({ '2024-01-02': 99.0 });
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'dataService' }),
      expect.stringContaining('完整性校验失败'),
    );
  });

  it('Go 数据服务 HTTP 路径应返回价格并写入缓存', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({ valid: ['MSFT'], invalid: [] });
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });
    fsMocks.existsSync.mockReturnValue(false);
    fsPromisesMocks.access.mockRejectedValue(new Error('no file'));
    httpMocks.request.mockImplementation(
      makeHttpSuccess(
        JSON.stringify({
          success: true,
          data: [
            { date: '2024-01-02', close: 400.0 },
            { date: '2024-01-03', close: 401.0 },
          ],
        }),
      ),
    );

    const { data: result } = await fetchHistoryData(['MSFT'], '2024-01-01', '2024-01-31');

    expect(result.MSFT).toEqual({ '2024-01-02': 400.0, '2024-01-03': 401.0 });
    expect(httpMocks.request).toHaveBeenCalledWith(
      expect.stringContaining('/api/data/price/MSFT'),
      expect.any(Object),
      expect.any(Function),
    );
    expect(fsPromisesMocks.writeFile).toHaveBeenCalled();
  });

  it('Go 数据服务 HTTP 非 2xx 时应记录 warn 并返回空', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({ valid: ['FAIL'], invalid: [] });
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });
    fsMocks.existsSync.mockReturnValue(false);
    httpMocks.request.mockImplementation(makeHttpSuccess('server error', 500));

    const { data: result } = await fetchHistoryData(['FAIL'], '2024-01-01', '2024-01-31');

    expect(result).toEqual({});
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  it('PostgreSQL 不可用时未命中 Go 服务应返回空', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({ valid: ['VTI'], invalid: [] });
    circuitBreakerMocks.instance.fire.mockRejectedValue(new Error('db down'));
    fsMocks.existsSync.mockReturnValue(false);

    const { data: result } = await fetchHistoryData(['VTI'], '2024-01-01', '2024-01-31');

    expect(result.VTI).toBeUndefined();
  });

  it('PostgreSQL 返回数据时应包含请求日期范围内的行情', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({ valid: ['LARGE'], invalid: [] });
    const rows = Array.from({ length: 11 }, (_, i) => {
      const day = String(50 + i).padStart(2, '0');
      return { ticker: 'LARGE', date: `2024-01-${day}`, close: 100 + 49 + i };
    });
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows });

    const { data: result } = await fetchHistoryData(['LARGE'], '2024-01-50', '2024-01-60');

    expect(Object.keys(result.LARGE).length).toBe(11);
    expect(result.LARGE['2024-01-50']).toBe(149);
  });

  it('并发 fetchHistoryData 调用应各自返回正确结果', async () => {
    tickerValidationMocks.validateTickerFormat.mockImplementation((tickers: string[]) => ({
      valid: tickers,
      invalid: [],
    }));
    circuitBreakerMocks.instance.fire.mockImplementation(async (sql: string, params: unknown[]) => {
      const tickerList = (params as [string[]])[0];
      const ticker = tickerList[0];
      return {
        rows: [{ ticker, date: new Date('2024-01-02'), close: ticker === 'AAPL' ? 185.5 : 72.3 }],
      };
    });

    const [{ data: r1 }, { data: r2 }] = await Promise.all([
      fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31'),
      fetchHistoryData(['BND'], '2024-01-01', '2024-01-31'),
    ]);

    expect(r1.AAPL).toEqual({ '2024-01-02': 185.5 });
    expect(r2.BND).toEqual({ '2024-01-02': 72.3 });
  });

  it('磁盘 history 缓存命中时应直接返回', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({ valid: ['CACHED'], invalid: [] });
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });
    const cachedGo = { CACHED: { '2024-01-02': 50.0 } };
    fsMocks.existsSync.mockReturnValue(true);
    fsPromisesMocks.access.mockResolvedValue(undefined);
    integrityMocks.verifyFile.mockResolvedValue(true);
    fsPromisesMocks.readFile.mockImplementation((p: string) => {
      if (String(p).includes('history_')) {
        return Promise.resolve(JSON.stringify({ __cacheVersion: 0, __data: cachedGo }));
      }
      return Promise.resolve('0');
    });

    const { data: result } = await fetchHistoryData(['CACHED'], '2024-01-01', '2024-01-31');

    expect(result.CACHED).toEqual({ '2024-01-02': 50.0 });
    expect(httpMocks.request).not.toHaveBeenCalled();
  });
});
