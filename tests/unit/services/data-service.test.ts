import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  dbMocks,
  tickerValidationMocks,
  loggerMocks,
  redisMocks,
  circuitBreakerMocks,
  httpMocks,
  setupDefault,
  setValid,
  rows,
  setupRedisDown,
} from './dataService.shared.js';
import {
  setupHttpGetSuccess as makeHttpSuccess,
  setupHttpGetError as makeHttpError,
} from '../../helpers/dataServiceFixtures.js';

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
    setupDefault();
    setupRedisDown();
  });
  it('PostgreSQL 正常查询时应返回 DB 中的价格数据', async () => {
    setValid(['AAPL', 'BND']);
    circuitBreakerMocks.instance.fire.mockResolvedValue(
      rows(
        { ticker: 'AAPL', date: new Date('2024-01-02'), close: 185.5 },
        { ticker: 'AAPL', date: new Date('2024-01-03'), close: 186.0 },
        { ticker: 'BND', date: new Date('2024-01-02'), close: 72.3 },
      ),
    );
    const { data: result } = await fetchHistoryData(['AAPL', 'BND'], '2024-01-01', '2024-01-31');
    expect(result.AAPL).toEqual({ '2024-01-02': 185.5, '2024-01-03': 186.0 });
    expect(result.BND).toEqual({ '2024-01-02': 72.3 });
  });
  it('应使用参数化查询（ANY($1)）防止 SQL 注入', async () => {
    setValid(['AAPL']);
    circuitBreakerMocks.instance.fire.mockResolvedValue(
      rows({ ticker: 'AAPL', date: new Date('2024-01-02'), close: 185.5 }),
    );
    await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');
    expect(circuitBreakerMocks.instance.fire).toHaveBeenCalledWith(
      expect.stringContaining('ticker = ANY($1)'),
      [['AAPL'], '2024-01-01', '2024-01-31'],
    );
  });
  it.each([
    [
      'DB 查询失败',
      ['AAPL', 'VTI'],
      () => {
        circuitBreakerMocks.instance.fire.mockRejectedValue(new Error('connection lost'));
      },
      true,
      false,
    ],
    [
      '熔断器 Open（不查 DB）',
      ['AAPL'],
      () => {
        circuitBreakerMocks.instance.opened = true;
      },
      false,
      true,
    ],
    ['空结果集', ['UNKNOWN'], () => {}, false, false],
    [
      '全部 ticker 非法',
      ['@@@invalid@@@'],
      () => {
        tickerValidationMocks.validateTickerFormat.mockReturnValue({
          valid: [],
          invalid: ['@@@invalid@@@'],
        });
      },
      true,
      false,
    ],
  ])('%s 时应返回空对象', async (_n, tickers, arrange, expectWarn, noDbCall) => {
    arrange();
    const { data: result } = await fetchHistoryData(tickers, '2024-01-01', '2024-01-31');
    expect(result).toEqual({});
    if (expectWarn) expect(loggerMocks.warn).toHaveBeenCalled();
    if (noDbCall) expect(circuitBreakerMocks.instance.fire).not.toHaveBeenCalled();
  });
  it.each([
    ['DB 返回 NaN close 时应原样传递（文档化当前行为）', NaN, new Date('2024-01-02'), true],
    ['date 字段为字符串时应直接使用（不调用 toISOString）', 185.5, '2024-01-02', false],
  ])('%s', async (_n, close, date, checkIsNaN) => {
    setValid(['AAPL']);
    circuitBreakerMocks.instance.fire.mockResolvedValue(rows({ ticker: 'AAPL', date, close }));
    const { data: result } = await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');
    expect(result.AAPL).toEqual({ '2024-01-02': close });
    if (checkIsNaN) expect(Number.isNaN(result.AAPL['2024-01-02'])).toBe(true);
  });
  it('部分 ticker 缺失时不会从 JSON 回退', async () => {
    setValid(['AAPL', 'MISSING']);
    circuitBreakerMocks.instance.fire.mockResolvedValue(
      rows({ ticker: 'AAPL', date: new Date('2024-01-02'), close: 185.5 }),
    );
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
  beforeEach(setupDefault);
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
    await validateTickers(['AAPL']);
    expect(circuitBreakerMocks.instance.fire).toHaveBeenCalledWith(
      expect.stringContaining('ticker = ANY($1)'),
      [['AAPL']],
    );
  });
});
describe('initDb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('initSchema 成功时应记录 info 日志且不记录 warn', async () => {
    dbMocks.initSchema.mockResolvedValue(undefined);
    await initDb();
    expect(dbMocks.initSchema).toHaveBeenCalledTimes(1);
    expect(loggerMocks.info).toHaveBeenCalledWith(expect.stringContaining('initDb'));
    expect(loggerMocks.warn).not.toHaveBeenCalled();
  });
  it('initSchema 失败时应记录 warn 日志且不抛出（优雅降级）', async () => {
    dbMocks.initSchema.mockRejectedValue(new Error('db unavailable'));
    await expect(initDb()).resolves.toBeUndefined();
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('PostgreSQL 不可用'),
    );
  });
});
describe('validateTickers 边界场景', () => {
  beforeEach(() => {
    setupDefault();
    setupRedisDown();
  });
  it.each([
    ['空 ticker 列表', () => {}, [], false],
    [
      '熔断器 Open',
      () => {
        circuitBreakerMocks.instance.opened = true;
      },
      ['AAPL', 'GHOST'],
      true,
    ],
    [
      'DB 查询失败',
      () => {
        circuitBreakerMocks.instance.fire.mockRejectedValue(new Error('db down'));
      },
      ['BROKEN'],
      false,
    ],
  ])('%s 应返回 unknown 结果', async (_n, setup, input, fireNotCalled) => {
    setup();
    const result = await validateTickers(input);
    expect(result).toEqual({ valid: [], unknown: input, invalid: [] });
    if (fireNotCalled) expect(circuitBreakerMocks.instance.fire).not.toHaveBeenCalled();
  });
});
describe('searchTickers', () => {
  beforeEach(setupDefault);
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
    const result = await searchTickers('不存在的标的');
    expect(result).toEqual([]);
    expect(httpMocks.request).not.toHaveBeenCalled();
  });
  it.each([
    ['恶意 SQL 注入式 query', "'; DROP TABLE tickers; --", undefined, true],
    ['query 超过 100 字符', 'A'.repeat(101), undefined, false],
    ['非法 market 参数', '茅台', 'A股;DROP', false],
  ])('%s 应被拒绝并返回空数组', async (_n, query, market, noDbCall) => {
    const result =
      market === undefined ? await searchTickers(query) : await searchTickers(query, market);
    expect(result).toEqual([]);
    expect(loggerMocks.warn).toHaveBeenCalled();
    if (noDbCall) expect(circuitBreakerMocks.instance.fire).not.toHaveBeenCalled();
  });
  it('DB 失败且缓存未命中时应调用 Go 数据服务', async () => {
    circuitBreakerMocks.instance.fire.mockRejectedValue(new Error('db down'));
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
  });
  it('DB 与 Go 数据服务均失败时应返回空数组', async () => {
    circuitBreakerMocks.instance.opened = true;
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
    redisMocks.scan.mockResolvedValue([
      '0',
      ['cache:org:shared:price:AAPL', 'cache:org:shared:price:BND'],
    ]);
    await invalidateAllCache();
    expect(redisMocks.del).toHaveBeenCalledWith(
      'cache:org:shared:price:AAPL',
      'cache:org:shared:price:BND',
    );
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
