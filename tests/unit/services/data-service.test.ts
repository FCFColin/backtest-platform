import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLoggerMocks, createConfigMocks, createRedisModuleMock } from '../../helpers/mockFactories.js';
import { setupHttpGetSuccess as makeHttpSuccess, setupHttpGetError as makeHttpError } from '../../helpers/dataServiceFixtures.js';

const { dbMocks, tickerValidationMocks, loggerMocks, redisMocks, fsMocks, fsPromisesMocks, circuitBreakerMocks, integrityMocks, httpMocks } = vi.hoisted(() => ({
  dbMocks: { getPool: vi.fn(), getReadPool: vi.fn(), initSchema: vi.fn().mockResolvedValue(undefined) },
  tickerValidationMocks: { validateTickerFormat: vi.fn(), isValidTicker: vi.fn() },
  loggerMocks: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })) },
  redisMocks: {} as Record<string, unknown>,
  fsMocks: { existsSync: vi.fn().mockReturnValue(false), readFileSync: vi.fn(), statSync: vi.fn(), writeFileSync: vi.fn(), mkdirSync: vi.fn(), readdirSync: vi.fn().mockReturnValue([]), unlinkSync: vi.fn() },
  fsPromisesMocks: { readFile: vi.fn(), writeFile: vi.fn().mockResolvedValue(undefined), access: vi.fn(), readdir: vi.fn().mockResolvedValue([]), unlink: vi.fn().mockResolvedValue(undefined) },
  circuitBreakerMocks: { instance: { fire: vi.fn(), opened: false, on: vi.fn() } },
  integrityMocks: { signFileSync: vi.fn(), verifyFileSync: vi.fn().mockReturnValue(true), signFile: vi.fn().mockResolvedValue(undefined), verifyFile: vi.fn().mockResolvedValue(true) },
  httpMocks: { request: vi.fn() },
}));
vi.mock('../../../packages/backend/src/utils/logger.js', () => { Object.assign(loggerMocks, createLoggerMocks()); return { logger: loggerMocks }; });
vi.mock('../../../packages/backend/src/db/pool.js', () => ({ getPool: dbMocks.getPool, getReadPool: dbMocks.getReadPool }));
vi.mock('../../../packages/backend/src/db/migrations.js', () => ({ initSchema: dbMocks.initSchema }));
vi.mock('../../../packages/backend/src/utils/tickerValidation.js', () => ({ validateTickerFormat: tickerValidationMocks.validateTickerFormat, isValidTicker: tickerValidationMocks.isValidTicker }));
vi.mock('../../../packages/backend/src/utils/metrics.js', () => ({
  registerSemaphoreMetrics: vi.fn(), registerCircuitBreakerMetrics: vi.fn(), recordCacheHit: vi.fn(), recordCacheMiss: vi.fn(),
  recordDataServiceCall: vi.fn(), recordEngineCall: vi.fn(), recordEngineUnavailable: vi.fn(), engineCallDuration: { observe: vi.fn() },
  recordBacktestRequest: vi.fn(), recordDegradedResponse: vi.fn(),
}));
vi.mock('../../../packages/backend/src/config/index.js', () => ({ config: createConfigMocks({ GO_DATA_SERVICE_URL: 'http://127.0.0.1:15003' }) }));
vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () =>
  createRedisModuleMock({ withHandlers: true, methods: { ping: vi.fn().mockRejectedValue(new Error('redis unavailable')), get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK'), del: vi.fn().mockResolvedValue(1), scan: vi.fn().mockResolvedValue(['0', []]) } }, redisMocks),
);
vi.mock('opossum', () => ({ default: vi.fn(() => circuitBreakerMocks.instance), CircuitBreaker: vi.fn(() => circuitBreakerMocks.instance) }));
vi.mock('fs', () => ({ default: fsMocks, ...fsMocks }));
vi.mock('fs/promises', () => ({ default: fsPromisesMocks, ...fsPromisesMocks }));
vi.mock('../../../packages/backend/src/utils/integrity.js', () => ({ signFileSync: integrityMocks.signFileSync, verifyFileSync: integrityMocks.verifyFileSync, signFile: integrityMocks.signFile, verifyFile: integrityMocks.verifyFile }));
vi.mock('http', () => ({ default: { request: httpMocks.request }, request: httpMocks.request, Agent: vi.fn(() => ({ sockets: {}, destroy: vi.fn() })) }));

import { fetchHistoryData, validateTickers, initDb, searchTickers, invalidateTickerCache, invalidateAllCache } from '../../../packages/backend/src/infrastructure/dataFacade.js';

function setupDefault() {
  vi.clearAllMocks();
  circuitBreakerMocks.instance.opened = false;
  circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });
  tickerValidationMocks.validateTickerFormat.mockReturnValue({ valid: [], invalid: [] });
  tickerValidationMocks.isValidTicker.mockImplementation((t: string) => /^[A-Z0-9._-]{1,20}$/.test(t));
  fsMocks.existsSync.mockReturnValue(false);
  integrityMocks.verifyFileSync.mockReturnValue(true);
  integrityMocks.verifyFile.mockResolvedValue(true);
  fsPromisesMocks.access.mockRejectedValue(new Error('no file'));
}
function setValid(tickers: string[]) { tickerValidationMocks.validateTickerFormat.mockReturnValue({ valid: tickers, invalid: [] }); }
function rows(...r: { ticker: string; date: unknown; close: number }[]) { return { rows: r }; }
function setupRedisDown() { redisMocks.ping.mockRejectedValue(new Error('redis unavailable')); redisMocks.get.mockResolvedValue(null); }

describe('fetchHistoryData', () => {
  beforeEach(() => { setupDefault(); setupRedisDown(); });
  it('PostgreSQL 正常查询时应返回 DB 中的价格数据', async () => {
    setValid(['AAPL', 'BND']);
    circuitBreakerMocks.instance.fire.mockResolvedValue(rows(
      { ticker: 'AAPL', date: new Date('2024-01-02'), close: 185.5 },
      { ticker: 'AAPL', date: new Date('2024-01-03'), close: 186.0 },
      { ticker: 'BND', date: new Date('2024-01-02'), close: 72.3 },
    ));
    const { data: result } = await fetchHistoryData(['AAPL', 'BND'], '2024-01-01', '2024-01-31');
    expect(result.AAPL).toEqual({ '2024-01-02': 185.5, '2024-01-03': 186.0 });
    expect(result.BND).toEqual({ '2024-01-02': 72.3 });
  });
  it('应使用参数化查询（ANY($1)）防止 SQL 注入', async () => {
    setValid(['AAPL']);
    circuitBreakerMocks.instance.fire.mockResolvedValue(rows({ ticker: 'AAPL', date: new Date('2024-01-02'), close: 185.5 }));
    await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');
    expect(circuitBreakerMocks.instance.fire).toHaveBeenCalledWith(expect.stringContaining('ticker = ANY($1)'), [['AAPL'], '2024-01-01', '2024-01-31']);
  });
  it('DB 查询失败时不应回退 JSON，返回空结果', async () => {
    setValid(['AAPL']);
    circuitBreakerMocks.instance.fire.mockRejectedValue(new Error('connection lost'));
    const { data: result } = await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');
    expect(result).toEqual({});
    expect(loggerMocks.warn).toHaveBeenCalled();
  });
  it('熔断器 Open 状态时不应调用 DB，且未入库标的无数据', async () => {
    setValid(['AAPL']);
    circuitBreakerMocks.instance.opened = true;
    const { data: result } = await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');
    expect(circuitBreakerMocks.instance.fire).not.toHaveBeenCalled();
    expect(result).toEqual({});
  });
  it('空结果集时应返回空对象', async () => {
    setValid(['UNKNOWN']);
    const { data: result } = await fetchHistoryData(['UNKNOWN'], '2024-01-01', '2024-01-31');
    expect(result).toEqual({});
  });
  it('DB 返回 NaN close 时应原样传递（文档化当前行为）', async () => {
    setValid(['AAPL']);
    circuitBreakerMocks.instance.fire.mockResolvedValue(rows({ ticker: 'AAPL', date: new Date('2024-01-02'), close: NaN }));
    const { data: result } = await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');
    expect(result.AAPL).toEqual({ '2024-01-02': NaN });
    expect(Number.isNaN(result.AAPL['2024-01-02'])).toBe(true);
  });
  it('全部 ticker 非法时应返回空结果且不查询价格', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({ valid: [], invalid: ['@@@invalid@@@'] });
    const { data: result } = await fetchHistoryData(['@@@invalid@@@'], '2024-01-01', '2024-01-31');
    expect(result).toEqual({});
    expect(loggerMocks.warn).toHaveBeenCalled();
  });
  it('date 字段为字符串时应直接使用（不调用 toISOString）', async () => {
    setValid(['AAPL']);
    circuitBreakerMocks.instance.fire.mockResolvedValue(rows({ ticker: 'AAPL', date: '2024-01-02', close: 185.5 }));
    const { data: result } = await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');
    expect(result.AAPL).toEqual({ '2024-01-02': 185.5 });
  });
  it('部分 ticker 在 DB 中有数据、部分缺失时，缺失标的不会从 JSON 回退', async () => {
    setValid(['AAPL', 'MISSING']);
    circuitBreakerMocks.instance.fire.mockResolvedValue(rows({ ticker: 'AAPL', date: new Date('2024-01-02'), close: 185.5 }));
    const { data: result } = await fetchHistoryData(['AAPL', 'MISSING'], '2024-01-01', '2024-01-31');
    expect(result.AAPL).toEqual({ '2024-01-02': 185.5 });
    expect(result.MISSING).toBeUndefined();
  });
});

describe('validateTickers', () => {
  beforeEach(setupDefault);
  it('DB 可用时应通过 tickers 表验证', async () => {
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [{ ticker: 'AAPL' }, { ticker: 'BND' }] });
    const result = await validateTickers(['AAPL', 'BND', 'UNKNOWN']);
    expect(result.valid).toEqual(['AAPL', 'BND']);
    expect(result.unknown).toEqual(['UNKNOWN']);
    expect(result.invalid).toEqual([]);
  });
  it('应使用 ANY($1) 参数化查询', async () => {
    await validateTickers(['AAPL']);
    expect(circuitBreakerMocks.instance.fire).toHaveBeenCalledWith(expect.stringContaining('ticker = ANY($1)'), [['AAPL']]);
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
  beforeEach(() => { vi.clearAllMocks(); });
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
  beforeEach(() => { setupDefault(); setupRedisDown(); });
  it('空 ticker 列表应返回空 valid/invalid/unknown', async () => {
    const result = await validateTickers([]);
    expect(result).toEqual({ valid: [], invalid: [], unknown: [] });
  });
  it.each([
    { name: '熔断器 Open 时', setup: () => { circuitBreakerMocks.instance.opened = true; }, input: ['AAPL', 'GHOST'], expected: { valid: [], unknown: ['AAPL', 'GHOST'], invalid: [] }, fireNotCalled: true },
    { name: 'DB 查询成功但 ticker 无数据时', setup: () => { circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] }); }, input: ['UNKNOWN'], expected: { valid: [], unknown: ['UNKNOWN'], invalid: [] }, fireNotCalled: false },
    { name: 'DB 查询失败时', setup: () => { circuitBreakerMocks.instance.fire.mockRejectedValue(new Error('db down')); }, input: ['BROKEN'], expected: { valid: [], unknown: ['BROKEN'], invalid: [] }, fireNotCalled: false },
    { name: 'DB 有 ticker 记录时', setup: () => { circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [{ ticker: 'AAPL' }] }); }, input: ['AAPL'], expected: { valid: ['AAPL'], unknown: [], invalid: [] }, fireNotCalled: false },
  ])('$name应返回正确结果', async ({ setup, input, expected, fireNotCalled }) => {
    setup();
    const result = await validateTickers(input);
    expect(result).toEqual(expected);
    if (fireNotCalled) expect(circuitBreakerMocks.instance.fire).not.toHaveBeenCalled();
  });
});

describe('searchTickers', () => {
  beforeEach(setupDefault);
  it('DB 可用时应通过全文搜索返回结果', async () => {
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [{ ticker: '600519.SH', category: '贵州茅台', market: 'A股' }] });
    const result = await searchTickers('茅台');
    expect(result).toEqual([{ ticker: '600519.SH', name: '贵州茅台', market: 'A股' }]);
    expect(circuitBreakerMocks.instance.fire).toHaveBeenCalledWith(expect.stringContaining('search_vector'), expect.arrayContaining(['simple', expect.any(String)]));
  });
  it('DB 无结果时应返回空数组（不回退 Go）', async () => {
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
  it.each([
    { name: 'query 超过 100 字符', query: 'A'.repeat(101), market: undefined as string | undefined },
    { name: '非法 market 参数', query: '茅台', market: 'A股;DROP' },
  ])('$name 应被拒绝并返回空数组', async ({ query, market }) => {
    const result = market === undefined ? await searchTickers(query) : await searchTickers(query, market);
    expect(result).toEqual([]);
    expect(loggerMocks.warn).toHaveBeenCalled();
  });
  it('DB 失败且缓存未命中时应调用 Go 数据服务', async () => {
    circuitBreakerMocks.instance.fire.mockRejectedValue(new Error('db down'));
    httpMocks.request.mockImplementation(makeHttpSuccess(JSON.stringify({ success: true, data: [{ ticker: 'AAPL', name: 'Apple', market: '美股' }] })));
    const result = await searchTickers('AAPL');
    expect(result).toEqual([{ ticker: 'AAPL', name: 'Apple', market: '美股' }]);
    expect(httpMocks.request).toHaveBeenCalled();
  });
  it('DB 与 Go 数据服务均失败时应返回空数组', async () => {
    circuitBreakerMocks.instance.opened = true;
    httpMocks.request.mockImplementation(makeHttpError('connection refused'));
    const result = await searchTickers('茅台');
    expect(result).toEqual([]);
    expect(loggerMocks.warn).toHaveBeenCalled();
  });
  it('带 market 过滤时 DB 查询应附加 market 参数', async () => {
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [{ ticker: '000001.SZ', category: '平安银行', market: 'A股' }] });
    await searchTickers('平安', 'A股');
    expect(circuitBreakerMocks.instance.fire).toHaveBeenCalledWith(expect.stringContaining('market = $3'), ['simple', '平安', 'A股']);
  });
});

describe('缓存失效函数', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    circuitBreakerMocks.instance.opened = false;
    redisMocks.ping.mockResolvedValue('PONG');
    redisMocks.scan.mockResolvedValue(['0', []]);
  });
  it('按 ticker 失效时应删除 Redis 价格缓存及相关 key', async () => {
    redisMocks.scan.mockImplementation(async (...args: unknown[]) => {
      const pattern = String(args[2]);
      if (pattern.includes(':price:')) return ['0', ['cache:org:shared:price:AAPL']];
      return ['0', []];
    });
    await invalidateTickerCache('AAPL');
    expect(loggerMocks.info).toHaveBeenCalledWith(expect.stringContaining('ticker=AAPL'));
    expect(redisMocks.del).toHaveBeenCalledWith('cache:org:shared:price:ticker=AAPL');
  });
  it('全量失效时应清空 L1 并删除 Redis 缓存', async () => {
    redisMocks.scan.mockResolvedValue(['0', ['cache:org:shared:price:AAPL', 'cache:org:shared:price:BND']]);
    await invalidateAllCache();
    expect(redisMocks.del).toHaveBeenCalledWith('cache:org:shared:price:AAPL', 'cache:org:shared:price:BND');
    expect(loggerMocks.info).toHaveBeenCalledWith(expect.stringContaining('全量失效'));
  });
  it('Redis 删除失败时应降级且不抛出', async () => {
    redisMocks.scan.mockResolvedValue(['0', ['cache:org:shared:price:AAPL']]);
    redisMocks.del.mockRejectedValueOnce(new Error('redis del failed'));
    await expect(invalidateTickerCache('AAPL')).resolves.toBeUndefined();
    expect(loggerMocks.warn).toHaveBeenCalled();
  });
  it('Redis scan 失败时全量失效仍应完成', async () => {
    redisMocks.scan.mockRejectedValue(new Error('scan failed'));
    await expect(invalidateAllCache()).resolves.toBeUndefined();
    expect(loggerMocks.warn).toHaveBeenCalled();
  });
  it('Redis 不可用时按 ticker 失效应降级且不调用 del', async () => {
    redisMocks.ping.mockRejectedValue(new Error('redis unavailable'));
    await expect(invalidateTickerCache('AAPL')).resolves.toBeUndefined();
    expect(redisMocks.del).not.toHaveBeenCalled();
  });
});

describe('fetchHistoryData 扩展场景', () => {
  beforeEach(async () => {
    setupDefault();
    setupRedisDown();
    redisMocks.emit('error');
    await invalidateAllCache();
  });
  it('PostgreSQL 查询成功时应直接返回行情', async () => {
    setValid(['AAPL']);
    circuitBreakerMocks.instance.fire.mockResolvedValue(rows(
      { ticker: 'AAPL', date: '2024-01-02', close: 185.5 },
      { ticker: 'AAPL', date: '2024-01-03', close: 186.0 },
    ));
    const { data: result } = await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');
    expect(result.AAPL).toEqual({ '2024-01-02': 185.5, '2024-01-03': 186.0 });
  });
  it('Redis 中存在损坏缓存时应跳过缓存调用 Go 数据服务', async () => {
    setValid(['AAPL']);
    redisMocks.ping.mockResolvedValue('PONG');
    redisMocks.get.mockResolvedValue('{ corrupted json');
    httpMocks.request.mockImplementation(makeHttpSuccess(JSON.stringify({ success: true, data: [{ date: '2024-01-02', close: 99.0 }] })));
    const { data: result } = await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');
    expect(result.AAPL).toEqual({ '2024-01-02': 99.0 });
    expect(httpMocks.request).toHaveBeenCalled();
  });
  it('Go 数据服务 HTTP 路径应返回价格并写入缓存', async () => {
    setValid(['MSFT']);
    redisMocks.ping.mockResolvedValue('PONG');
    redisMocks.get.mockResolvedValue(null);
    httpMocks.request.mockImplementation(makeHttpSuccess(JSON.stringify({ success: true, data: [{ date: '2024-01-02', close: 400.0 }, { date: '2024-01-03', close: 401.0 }] })));
    const { data: result } = await fetchHistoryData(['MSFT'], '2024-01-01', '2024-01-31');
    expect(result.MSFT).toEqual({ '2024-01-02': 400.0, '2024-01-03': 401.0 });
    expect(httpMocks.request).toHaveBeenCalledWith(expect.stringContaining('/api/data/price/MSFT'), expect.any(Object), expect.any(Function));
    expect(redisMocks.set).toHaveBeenCalled();
  });
  it('Go 数据服务 HTTP 非 2xx 时应记录 warn 并返回空', async () => {
    setValid(['FAIL']);
    httpMocks.request.mockImplementation(makeHttpSuccess('server error', 500));
    const { data: result } = await fetchHistoryData(['FAIL'], '2024-01-01', '2024-01-31');
    expect(result).toEqual({});
    expect(loggerMocks.warn).toHaveBeenCalled();
  });
  it('PostgreSQL 不可用时未命中 Go 服务应返回空', async () => {
    setValid(['VTI']);
    circuitBreakerMocks.instance.fire.mockRejectedValue(new Error('db down'));
    const { data: result } = await fetchHistoryData(['VTI'], '2024-01-01', '2024-01-31');
    expect(result.VTI).toBeUndefined();
  });
  it('PostgreSQL 返回数据时应包含请求日期范围内的行情', async () => {
    setValid(['LARGE']);
    const r = Array.from({ length: 11 }, (_, i) => {
      const day = String(50 + i).padStart(2, '0');
      return { ticker: 'LARGE', date: `2024-01-${day}`, close: 100 + 49 + i };
    });
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: r });
    const { data: result } = await fetchHistoryData(['LARGE'], '2024-01-50', '2024-01-60');
    expect(Object.keys(result.LARGE).length).toBe(11);
    expect(result.LARGE['2024-01-50']).toBe(149);
  });
  it('并发 fetchHistoryData 调用应各自返回正确结果', async () => {
    tickerValidationMocks.validateTickerFormat.mockImplementation((tickers: string[]) => ({ valid: tickers, invalid: [] }));
    circuitBreakerMocks.instance.fire.mockImplementation(async (_sql: string, params: unknown[]) => {
      const ticker = (params as [string[]])[0][0];
      return { rows: [{ ticker, date: new Date('2024-01-02'), close: ticker === 'AAPL' ? 185.5 : 72.3 }] };
    });
    const [{ data: r1 }, { data: r2 }] = await Promise.all([
      fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31'),
      fetchHistoryData(['BND'], '2024-01-01', '2024-01-31'),
    ]);
    expect(r1.AAPL).toEqual({ '2024-01-02': 185.5 });
    expect(r2.BND).toEqual({ '2024-01-02': 72.3 });
  });
  it('Redis history 缓存命中时应直接返回', async () => {
    setValid(['CACHED']);
    const cachedGo = { CACHED: { '2024-01-02': 50.0 } };
    redisMocks.ping.mockResolvedValue('PONG');
    redisMocks.get.mockImplementation(async (key: string) => String(key).includes(':history:') ? JSON.stringify(cachedGo) : null);
    const { data: result } = await fetchHistoryData(['CACHED'], '2024-01-01', '2024-01-31');
    expect(result.CACHED).toEqual({ '2024-01-02': 50.0 });
    expect(httpMocks.request).not.toHaveBeenCalled();
  });
});
