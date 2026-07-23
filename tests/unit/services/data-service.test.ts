/**
 * DataService 单元测试（合并自 part1/2/3 + cache.test.ts，Task 2.5）
 *
 * 覆盖职责：
 * - fetchHistoryData（PostgreSQL 查询 / 熔断 / SQL 注入防护 / 磁盘缓存 / Go 数据服务降级）
 * - validateTickers / initDb（DB 校验门禁 + schema 初始化优雅降级）
 * - searchTickers（全文搜索 / SQL 注入防护 / Go 服务降级）
 * - invalidateTickerCache / invalidateAllCache（内存 + 磁盘 + Redis 三级缓存失效）
 *
 * 合并理由：原 4 个 partN/cache 测试文件共享 100+ 行 vi.hoisted + vi.mock 设置样板，
 * 合并后削减 ~300 行重复代码，同时按职责聚合断言。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLoggerMocks, createConfigMocks, createRedisModuleMock } from '../../helpers/mockFactories.js';
import {
  setupHttpGetSuccess as makeHttpSuccess,
  setupHttpGetError as makeHttpError,
} from '../../helpers/dataServiceFixtures.js';

const {
  dbMocks,
  tickerValidationMocks,
  loggerMocks,
  redisMocks,
  fsMocks,
  fsPromisesMocks,
  circuitBreakerMocks,
  integrityMocks,
  httpMocks,
} = vi.hoisted(() => ({
  dbMocks: {
    getPool: vi.fn(),
    getReadPool: vi.fn(),
    initSchema: vi.fn().mockResolvedValue(undefined),
  },
  tickerValidationMocks: { validateTickerFormat: vi.fn(), isValidTicker: vi.fn() },
  loggerMocks: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  },
  redisMocks: {} as Record<string, unknown>,
  fsMocks: {
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn(),
    statSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
    unlinkSync: vi.fn(),
  },
  fsPromisesMocks: {
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    access: vi.fn(),
    readdir: vi.fn().mockResolvedValue([]),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
  circuitBreakerMocks: { instance: { fire: vi.fn(), opened: false, on: vi.fn() } },
  integrityMocks: {
    signFileSync: vi.fn(),
    verifyFileSync: vi.fn().mockReturnValue(true),
    signFile: vi.fn().mockResolvedValue(undefined),
    verifyFile: vi.fn().mockResolvedValue(true),
  },
  httpMocks: { request: vi.fn() },
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => {
  Object.assign(loggerMocks, createLoggerMocks());
  return { logger: loggerMocks };
});
vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: dbMocks.getPool,
  getReadPool: dbMocks.getReadPool,
}));
vi.mock('../../../packages/backend/src/db/migrations.js', () => ({
  initSchema: dbMocks.initSchema,
}));
vi.mock('../../../packages/backend/src/utils/tickerValidation.js', () => ({
  validateTickerFormat: tickerValidationMocks.validateTickerFormat,
  isValidTicker: tickerValidationMocks.isValidTicker,
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
    redisMocks,
  ),
);
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
  validateTickers,
  initDb,
  searchTickers,
  invalidateTickerCache,
  invalidateAllCache,
} from '../../../packages/backend/src/infrastructure/dataFacade.js';

describe('fetchHistoryData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    circuitBreakerMocks.instance.opened = false;
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });
    tickerValidationMocks.validateTickerFormat.mockReturnValue({ valid: [], invalid: [] });
    tickerValidationMocks.isValidTicker.mockImplementation(
      (ticker: string) => /^[A-Z0-9._-]{1,20}$/.test(ticker),
    );
    fsMocks.existsSync.mockReturnValue(false);
  });

  it('PostgreSQL 正常查询时应返回 DB 中的价格数据', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({
      valid: ['AAPL', 'BND'],
      invalid: [],
    });
    circuitBreakerMocks.instance.fire.mockResolvedValue({
      rows: [
        { ticker: 'AAPL', date: new Date('2024-01-02'), close: 185.5 },
        { ticker: 'AAPL', date: new Date('2024-01-03'), close: 186.0 },
        { ticker: 'BND', date: new Date('2024-01-02'), close: 72.3 },
      ],
    });

    const { data: result } = await fetchHistoryData(['AAPL', 'BND'], '2024-01-01', '2024-01-31');

    expect(result.AAPL).toEqual({ '2024-01-02': 185.5, '2024-01-03': 186.0 });
    expect(result.BND).toEqual({ '2024-01-02': 72.3 });
  });

  it('应使用参数化查询（ANY($1)）防止 SQL 注入', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({ valid: ['AAPL'], invalid: [] });
    circuitBreakerMocks.instance.fire.mockResolvedValue({
      rows: [{ ticker: 'AAPL', date: new Date('2024-01-02'), close: 185.5 }],
    });

    await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');

    expect(circuitBreakerMocks.instance.fire).toHaveBeenCalledWith(
      expect.stringContaining('ticker = ANY($1)'),
      [['AAPL'], '2024-01-01', '2024-01-31'],
    );
  });

  it('DB 查询失败时不应回退 JSON，返回空结果', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({ valid: ['AAPL'], invalid: [] });
    circuitBreakerMocks.instance.fire.mockRejectedValue(new Error('connection lost'));
    redisMocks.ping.mockRejectedValue(new Error('redis unavailable'));

    const { data: result } = await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');

    expect(result).toEqual({});
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  it('熔断器 Open 状态时不应调用 DB，且未入库标的无数据', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({ valid: ['AAPL'], invalid: [] });
    circuitBreakerMocks.instance.opened = true;
    redisMocks.ping.mockRejectedValue(new Error('redis unavailable'));

    const { data: result } = await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');

    expect(circuitBreakerMocks.instance.fire).not.toHaveBeenCalled();
    expect(result).toEqual({});
  });

  it('空结果集时应返回空对象', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({ valid: ['UNKNOWN'], invalid: [] });
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });
    fsMocks.existsSync.mockReturnValue(false);

    const { data: result } = await fetchHistoryData(['UNKNOWN'], '2024-01-01', '2024-01-31');

    expect(result).toEqual({});
  });

  it('DB 返回 NaN close 时应原样传递（文档化当前行为）', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({ valid: ['AAPL'], invalid: [] });
    circuitBreakerMocks.instance.fire.mockResolvedValue({
      rows: [{ ticker: 'AAPL', date: new Date('2024-01-02'), close: NaN }],
    });

    const { data: result } = await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');

    expect(result.AAPL).toEqual({ '2024-01-02': NaN });
    expect(Number.isNaN(result.AAPL['2024-01-02'])).toBe(true);
  });

  it('全部 ticker 非法时应返回空结果且不查询价格', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({
      valid: [],
      invalid: ['@@@invalid@@@'],
    });

    const { data: result } = await fetchHistoryData(['@@@invalid@@@'], '2024-01-01', '2024-01-31');

    expect(result).toEqual({});
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  it('date 字段为字符串时应直接使用（不调用 toISOString）', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({ valid: ['AAPL'], invalid: [] });
    circuitBreakerMocks.instance.fire.mockResolvedValue({
      rows: [{ ticker: 'AAPL', date: '2024-01-02', close: 185.5 }],
    });

    const { data: result } = await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');

    expect(result.AAPL).toEqual({ '2024-01-02': 185.5 });
  });

  it('部分 ticker 在 DB 中有数据、部分缺失时，缺失标的不会从 JSON 回退', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({
      valid: ['AAPL', 'MISSING'],
      invalid: [],
    });
    circuitBreakerMocks.instance.fire.mockResolvedValue({
      rows: [{ ticker: 'AAPL', date: new Date('2024-01-02'), close: 185.5 }],
    });
    redisMocks.ping.mockRejectedValue(new Error('redis unavailable'));

    const { data: result } = await fetchHistoryData(
      ['AAPL', 'MISSING'],
      '2024-01-01',
      '2024-01-31',
    );

    expect(result.AAPL).toEqual({ '2024-01-02': 185.5 });
    expect(result.MISSING).toBeUndefined();
  });
});

describe('validateTickers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    circuitBreakerMocks.instance.opened = false;
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });
    tickerValidationMocks.isValidTicker.mockImplementation(
      (ticker: string) => /^[A-Z0-9._-]{1,20}$/.test(ticker),
    );
    fsMocks.existsSync.mockReturnValue(false);
  });

  it('DB 可用时应通过 tickers 表验证', async () => {
    circuitBreakerMocks.instance.fire.mockResolvedValue({
      rows: [{ ticker: 'AAPL' }, { ticker: 'BND' }],
    });

    const result = await validateTickers(['AAPL', 'BND', 'UNKNOWN']);

    expect(result.valid).toEqual(['AAPL', 'BND']);
    expect(result.unknown).toEqual(['UNKNOWN']);
    expect(result.invalid).toEqual([]);
  });

  it('应使用 ANY($1) 参数化查询', async () => {
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });

    await validateTickers(['AAPL']);

    expect(circuitBreakerMocks.instance.fire).toHaveBeenCalledWith(
      expect.stringContaining('ticker = ANY($1)'),
      [['AAPL']],
    );
  });

  it('DB 失败时应将全部 ticker 标为 unknown', async () => {
    circuitBreakerMocks.instance.fire.mockRejectedValue(new Error('db down'));

    const result = await validateTickers(['AAPL', 'UNKNOWN']);

    expect(result.valid).toEqual([]);
    expect(result.unknown).toEqual(['AAPL', 'UNKNOWN']);
    expect(result.invalid).toEqual([]);
  });
});

describe('initDb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initSchema 成功时应记录 info 日志', async () => {
    dbMocks.initSchema.mockResolvedValue(undefined);

    await initDb();

    expect(dbMocks.initSchema).toHaveBeenCalled();
    expect(loggerMocks.info).toHaveBeenCalledWith(expect.stringContaining('initDb'));
  });

  it('initSchema 失败时应记录 warn 日志且不抛出（优雅降级）', async () => {
    dbMocks.initSchema.mockRejectedValue(new Error('db unavailable'));

    await expect(initDb()).resolves.toBeUndefined();
    expect(loggerMocks.warn).toHaveBeenCalled();
  });
});

describe('validateTickers 边界场景', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    circuitBreakerMocks.instance.opened = false;
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });
    tickerValidationMocks.isValidTicker.mockImplementation(
      (ticker: string) => /^[A-Z0-9._-]{1,20}$/.test(ticker),
    );
    fsMocks.existsSync.mockReturnValue(false);
    redisMocks.ping.mockRejectedValue(new Error('redis unavailable'));
  });

  it('空 ticker 列表应返回空 valid/invalid/unknown', async () => {
    const result = await validateTickers([]);

    expect(result).toEqual({ valid: [], invalid: [], unknown: [] });
  });

  // table-driven：边界场景共享"调用 validateTickers + 期望 valid/invalid/unknown"结构
  it.each([
    {
      name: '熔断器 Open 时',
      setup: () => {
        circuitBreakerMocks.instance.opened = true;
      },
      input: ['AAPL', 'GHOST'],
      expected: { valid: [], unknown: ['AAPL', 'GHOST'], invalid: [] },
      fireNotCalled: true,
    },
    {
      name: 'DB 查询成功但 ticker 无数据时',
      setup: () => {
        circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });
      },
      input: ['UNKNOWN'],
      expected: { valid: [], unknown: ['UNKNOWN'], invalid: [] },
      fireNotCalled: false,
    },
    {
      name: 'DB 查询失败时',
      setup: () => {
        circuitBreakerMocks.instance.fire.mockRejectedValue(new Error('db down'));
      },
      input: ['BROKEN'],
      expected: { valid: [], unknown: ['BROKEN'], invalid: [] },
      fireNotCalled: false,
    },
    {
      name: 'DB 有 ticker 记录时',
      setup: () => {
        circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [{ ticker: 'AAPL' }] });
      },
      input: ['AAPL'],
      expected: { valid: ['AAPL'], unknown: [], invalid: [] },
      fireNotCalled: false,
    },
  ])('$name应返回正确结果', async ({ setup, input, expected, fireNotCalled }) => {
    setup();
    const result = await validateTickers(input);
    expect(result).toEqual(expected);
    if (fireNotCalled) {
      expect(circuitBreakerMocks.instance.fire).not.toHaveBeenCalled();
    }
  });
});

describe('searchTickers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    circuitBreakerMocks.instance.opened = false;
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });
    integrityMocks.verifyFileSync.mockReturnValue(true);
    fsMocks.existsSync.mockReturnValue(false);
  });

  it('DB 可用时应通过全文搜索返回结果', async () => {
    circuitBreakerMocks.instance.fire.mockResolvedValue({
      rows: [{ ticker: '600519.SH', category: '贵州茅台', market: 'A股' }],
    });

    const result = await searchTickers('茅台');

    expect(result).toEqual([{ ticker: '600519.SH', name: '贵州茅台', market: 'A股' }]);
    expect(circuitBreakerMocks.instance.fire).toHaveBeenCalledWith(
      expect.stringContaining('search_vector'),
      expect.arrayContaining(['simple', expect.any(String)]),
    );
  });

  it('DB 无结果时应返回空数组（不回退 Go）', async () => {
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });

    const result = await searchTickers('不存在的标的');

    expect(result).toEqual([]);
    expect(httpMocks.request).not.toHaveBeenCalled();
  });

  it('恶意 SQL 注入式 query 应被拒绝并返回空数组', async () => {
    const result = await searchTickers("'; DROP TABLE tickers; --");

    expect(result).toEqual([]);
    expect(circuitBreakerMocks.instance.fire).not.toHaveBeenCalled();
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  // table-driven：query 长度/非法 market 校验共享相同断言
  it.each([
    {
      name: 'query 超过 100 字符',
      query: 'A'.repeat(101),
      market: undefined as string | undefined,
    },
    { name: '非法 market 参数', query: '茅台', market: 'A股;DROP' },
  ])('$name 应被拒绝并返回空数组', async ({ query, market }) => {
    const result =
      market === undefined ? await searchTickers(query) : await searchTickers(query, market);

    expect(result).toEqual([]);
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  it('DB 失败且磁盘缓存未命中时应调用 Go 数据服务', async () => {
    circuitBreakerMocks.instance.fire.mockRejectedValue(new Error('db down'));
    fsMocks.existsSync.mockReturnValue(false);
    httpMocks.request.mockImplementation(
      makeHttpSuccess(
        JSON.stringify({
          success: true,
          data: [{ ticker: 'AAPL', name: 'Apple', market: '美股' }],
        }),
      ),
    );

    const result = await searchTickers('AAPL');

    expect(result).toEqual([{ ticker: 'AAPL', name: 'Apple', market: '美股' }]);
    expect(httpMocks.request).toHaveBeenCalled();
    expect(integrityMocks.signFile).toHaveBeenCalled();
  });

  it('DB 与 Go 数据服务均失败时应返回空数组', async () => {
    circuitBreakerMocks.instance.opened = true;
    fsMocks.existsSync.mockReturnValue(false);
    httpMocks.request.mockImplementation(makeHttpError('connection refused'));

    const result = await searchTickers('茅台');

    expect(result).toEqual([]);
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  it('带 market 过滤时 DB 查询应附加 market 参数', async () => {
    circuitBreakerMocks.instance.fire.mockResolvedValue({
      rows: [{ ticker: '000001.SZ', category: '平安银行', market: 'A股' }],
    });

    await searchTickers('平安', 'A股');

    expect(circuitBreakerMocks.instance.fire).toHaveBeenCalledWith(
      expect.stringContaining('market = $3'),
      ['simple', '平安', 'A股'],
    );
  });
});

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
