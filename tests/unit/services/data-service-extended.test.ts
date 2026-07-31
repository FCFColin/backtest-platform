import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  tickerValidationMocks,
  loggerMocks,
  redisMocks,
  circuitBreakerMocks,
  httpMocks,
  dataQueryMocks,
  dataCacheMocks,
  dateUtilsMocks,
  setupDefault,
  setValid,
  setupRedisDown,
} from './dataService.shared.js';
import { setupHttpGetSuccess as makeHttpSuccess } from '../../helpers/dataServiceFixtures.js';

import {
  fetchHistoryData,
  invalidateAllCache,
} from '../../../packages/backend/src/infrastructure/dataFacade.js';

describe('fetchHistoryData 扩展场景', () => {
  beforeEach(async () => {
    setupDefault();
    setupRedisDown();
    redisMocks.emit('error');
    await invalidateAllCache();
  });
  it.each([
    [
      'Redis 缓存损坏回退 Go',
      async () => {
        redisMocks.ping.mockResolvedValue('PONG');
        redisMocks.get.mockResolvedValue('{ corrupted json');
      },
    ],
    [
      '缓存未命中走 Go HTTP 路径并写入缓存',
      async () => {
        redisMocks.ping.mockResolvedValue('PONG');
        redisMocks.get.mockResolvedValue(null);
      },
    ],
  ])('%s', async (_n, arrangeRedis) => {
    setValid(['AAPL']);
    await arrangeRedis();
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
    expect(httpMocks.request).toHaveBeenCalledWith(
      expect.stringContaining('/api/data/price/AAPL'),
      expect.any(Object),
      expect.any(Function),
    );
    expect(redisMocks.set).toHaveBeenCalled();
  });
  it('Go 数据服务 HTTP 非 2xx 时应记录 warn 并返回空', async () => {
    setValid(['FAIL']);
    httpMocks.request.mockImplementation(makeHttpSuccess('server error', 500));
    const { data: result } = await fetchHistoryData(['FAIL'], '2024-01-01', '2024-01-31');
    expect(result).toEqual({});
    expect(loggerMocks.warn).toHaveBeenCalled();
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
    tickerValidationMocks.validateTickerFormat.mockImplementation((tickers: string[]) => ({
      valid: tickers,
      invalid: [],
    }));
    circuitBreakerMocks.instance.fire.mockImplementation(
      async (_sql: string, params: unknown[]) => {
        const ticker = (params as [string[]])[0][0];
        return {
          rows: [{ ticker, date: new Date('2024-01-02'), close: ticker === 'AAPL' ? 185.5 : 72.3 }],
        };
      },
    );
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
    redisMocks.get.mockImplementation(async (key: string) =>
      String(key).includes(':history:') ? JSON.stringify(cachedGo) : null,
    );
    const { data: result } = await fetchHistoryData(['CACHED'], '2024-01-01', '2024-01-31');
    expect(result.CACHED).toEqual({ '2024-01-02': 50.0 });
    expect(httpMocks.request).not.toHaveBeenCalled();
  });
});
describe('dataFacade 编排（mock dataQuery/dataCache 层）', () => {
  let facade: typeof import('../../../packages/backend/src/infrastructure/dataFacade.js');
  const d = (t: string, v: number) => ({ [t]: { '2024-01-02': v } });
  beforeEach(async () => {
    setupDefault();
    vi.resetModules();
    vi.doMock('../../../packages/backend/src/infrastructure/dataQuery.js', () => dataQueryMocks);
    vi.doMock('../../../packages/backend/src/infrastructure/dataCache.js', () => dataCacheMocks);
    vi.doMock('../../../packages/backend/src/utils/misc.js', () => ({
      toDateStr: dateUtilsMocks.toDateStr,
    }));
    dateUtilsMocks.toDateStr.mockReturnValue('2024-01-01');
    dataCacheMocks.getCacheKey.mockReturnValue('cache-key');
    facade = await import('../../../packages/backend/src/infrastructure/dataFacade.js');
  });
  function mockSetup(o: {
    valid?: string[];
    invalid?: string[];
    unknown?: string[];
    result?: Record<string, unknown>;
    missing?: string[];
    dbDegraded?: boolean;
    cached?: unknown;
    go?: Record<string, unknown>;
  }) {
    dataQueryMocks.validateTickers.mockResolvedValue({
      valid: o.valid ?? [],
      invalid: o.invalid ?? [],
      unknown: o.unknown ?? [],
    });
    dataQueryMocks.queryPricesFromDb.mockResolvedValue({
      result: o.result ?? {},
      missing: o.missing ?? [],
      dbDegraded: o.dbDegraded ?? false,
    });
    dataCacheMocks.readCache.mockResolvedValue(o.cached ?? null);
    if (o.go) dataQueryMocks.fetchMissingFromGoService.mockResolvedValue(o.go);
  }
  it.each([
    [
      '全部 DB 命中（不查缓存/Go）',
      ['AAPL', 'MSFT'],
      { valid: ['AAPL', 'MSFT'], result: { ...d('AAPL', 100), ...d('MSFT', 200) } },
      {
        data: { ...d('AAPL', 100), ...d('MSFT', 200) },
        degraded: false,
        warningUndefined: true,
        noCacheRead: true,
        noGo: true,
        info: 'DB hit',
      },
    ],
    [
      '存在非法标的（记录 warn 并忽略）',
      ['AAPL', 'BAD!'],
      { valid: ['AAPL'], invalid: ['BAD!'], result: d('AAPL', 100) },
      { data: d('AAPL', 100), warn: '非法 ticker' },
    ],
    [
      '全部标的非法（不查询 DB）',
      ['BAD1', 'BAD2'],
      { invalid: ['BAD1', 'BAD2'] },
      { data: {}, degraded: false, noDb: true, warn: '全部' },
    ],
    [
      'DB 降级（degraded=true + 告警）',
      ['AAPL'],
      { valid: ['AAPL'], result: d('AAPL', 100), dbDegraded: true },
      { data: d('AAPL', 100), degraded: true, warning: '数据库不可用，部分数据可能缺失' },
    ],
  ])('%s', async (_n, tickers, o, e) => {
    mockSetup(o);
    const res = await facade.fetchHistoryData(tickers, '2024-01-02', '2024-01-03');
    expect(res.data).toEqual(e.data);
    if (e.degraded !== undefined) expect(res.degraded).toBe(e.degraded);
    else expect(res.degraded).toBe(false);
    if (e.warning !== undefined) expect(res.degradedWarning).toBe(e.warning);
    if (e.warningUndefined) expect(res.degradedWarning).toBeUndefined();
    if (e.noCacheRead) expect(dataCacheMocks.readCache).not.toHaveBeenCalled();
    if (e.noGo) expect(dataQueryMocks.fetchMissingFromGoService).not.toHaveBeenCalled();
    if (e.noDb) expect(dataQueryMocks.queryPricesFromDb).not.toHaveBeenCalled();
    if (e.info) expect(loggerMocks.info).toHaveBeenCalledWith(expect.stringContaining(e.info));
    if (e.warn) expect(loggerMocks.warn).toHaveBeenCalledWith(expect.stringContaining(e.warn));
  });
  it.each([
    [
      '缺失标的命中缓存（不调用 Go）',
      ['AAPL', 'MSFT'],
      { valid: ['AAPL'], result: d('AAPL', 100), missing: ['MSFT'], cached: d('MSFT', 200) },
      {
        data: { ...d('AAPL', 100), ...d('MSFT', 200) },
        degraded: false,
        noGo: true,
        info: 'cache hit',
      },
    ],
    [
      '未知标的也参与缓存查询',
      ['AAPL', 'NEW'],
      { valid: ['AAPL'], unknown: ['NEW'], result: d('AAPL', 100), cached: d('NEW', 50) },
      { data: { ...d('AAPL', 100), ...d('NEW', 50) }, cacheRead: true },
    ],
    [
      'Go 补齐全部缺失（degraded=false）',
      ['AAPL', 'MSFT'],
      { valid: ['AAPL'], result: d('AAPL', 100), missing: ['MSFT'], go: d('MSFT', 200) },
      { data: { ...d('AAPL', 100), ...d('MSFT', 200) }, degraded: false, goArgs: ['MSFT'] },
    ],
    [
      'Go 仍无法获取部分（degraded=true）',
      ['AAPL', 'MSFT', 'GOOG'],
      { valid: ['AAPL'], result: {}, missing: ['MSFT', 'GOOG'], go: d('MSFT', 200) },
      {
        data: d('MSFT', 200),
        degraded: true,
        warningContains: '1 个标的',
        goArgs: ['MSFT', 'GOOG'],
      },
    ],
    [
      'start/end 为空时使用默认日期范围',
      ['NEW'],
      { unknown: ['NEW'], go: d('NEW', 50) },
      { data: d('NEW', 50), defaultDates: true },
    ],
  ])('%s', async (_n, tickers, o, e) => {
    mockSetup(o);
    const res = await facade.fetchHistoryData(
      tickers,
      e.defaultDates ? '' : '2024-01-02',
      e.defaultDates ? '' : '2024-01-03',
    );
    expect(res.data).toEqual(e.data);
    if (e.degraded !== undefined) expect(res.degraded).toBe(e.degraded);
    if (e.noGo) expect(dataQueryMocks.fetchMissingFromGoService).not.toHaveBeenCalled();
    if (e.cacheRead) expect(dataCacheMocks.readCache).toHaveBeenCalledWith('cache-key');
    if (e.info) expect(loggerMocks.info).toHaveBeenCalledWith(expect.stringContaining(e.info));
    if (e.warningContains) expect(res.degradedWarning).toContain(e.warningContains);
    if (e.goArgs) {
      expect(dataQueryMocks.fetchMissingFromGoService).toHaveBeenCalledWith(
        expect.arrayContaining(e.goArgs),
        e.defaultDates ? '2000-01-01' : '2024-01-02',
        e.defaultDates ? '2024-01-01' : '2024-01-03',
        'cache-key',
        undefined,
      );
    }
    if (e.defaultDates) expect(dateUtilsMocks.toDateStr).toHaveBeenCalledWith(expect.any(Date));
  });
  it('底层 validateTickers 抛错时向上传播（span 记录异常）', async () => {
    dataQueryMocks.validateTickers.mockRejectedValue(new Error('validation boom'));
    await expect(facade.fetchHistoryData(['AAPL'], '2024-01-02', '2024-01-03')).rejects.toThrow(
      'validation boom',
    );
    expect(dataQueryMocks.queryPricesFromDb).not.toHaveBeenCalled();
  });
  it('直接暴露 dataQuery / dataCache 的函数（去除包装层）', () => {
    expect(facade.validateTickers).toBe(dataQueryMocks.validateTickers);
    expect(facade.searchTickers).toBe(dataQueryMocks.searchTickers);
    expect(facade.invalidateTickerCache).toBe(dataCacheMocks.invalidateTickerCache);
    expect(facade.invalidateAllCache).toBe(dataCacheMocks.invalidateAllCache);
  });
});
