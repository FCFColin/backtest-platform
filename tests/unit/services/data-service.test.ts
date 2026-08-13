import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  dbMocks,
  tickerValidationMocks,
  loggerMocks,
  redisMocks,
  circuitBreakerMocks,
  goDataServiceClientMocks,
  dataQueryMocks,
  dataCacheMocks,
  dateUtilsMocks,
  setupDefault,
  setValid,
  rows,
  setupRedisDown,
} from './dataService.shared.js';

import {
  fetchHistoryData,
  validateTickers,
  initDb,
  searchTickers,
  invalidateAllCache,
} from '../../../packages/backend/src/infrastructure/dataFacade.js';

beforeEach(() => {
  setupDefault();
});

describe('normal scenarios', () => {
  describe('fetchHistoryData', () => {
    beforeEach(() => {
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
      expect(goDataServiceClientMocks.callGoDataService).not.toHaveBeenCalled();
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
      goDataServiceClientMocks.callGoDataService.mockResolvedValue(
        JSON.stringify({
          success: true,
          data: [{ ticker: 'AAPL', name: 'Apple', market: '美股' }],
        }),
      );
      const result = await searchTickers('AAPL');
      expect(result).toEqual([{ ticker: 'AAPL', name: 'Apple', market: '美股' }]);
      expect(goDataServiceClientMocks.callGoDataService).toHaveBeenCalled();
    });
    it('DB 与 Go 数据服务均失败时应返回空数组', async () => {
      circuitBreakerMocks.instance.opened = true;
      goDataServiceClientMocks.callGoDataService.mockRejectedValue(new Error('connection refused'));
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
      circuitBreakerMocks.instance.opened = false;
      redisMocks.ping.mockResolvedValue('PONG');
      redisMocks.scan.mockResolvedValue(['0', []]);
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
    it('Redis scan 失败时全量失效仍应完成', async () => {
      redisMocks.scan.mockRejectedValue(new Error('scan failed'));
      await expect(invalidateAllCache()).resolves.toBeUndefined();
      expect(loggerMocks.warn).toHaveBeenCalled();
    });
  });
});

describe('extended scenarios', () => {
  describe('fetchHistoryData 扩展场景', () => {
    beforeEach(async () => {
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
      goDataServiceClientMocks.callGoDataService.mockResolvedValue(
        JSON.stringify({
          success: true,
          data: [{ date: '2024-01-02', close: 99.0 }],
        }),
      );
      const { data: result } = await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');
      expect(result.AAPL).toEqual({ '2024-01-02': 99.0 });
      expect(goDataServiceClientMocks.callGoDataService).toHaveBeenCalledWith(
        expect.stringContaining('/api/data/price/AAPL'),
        undefined,
      );
      expect(redisMocks.set).toHaveBeenCalled();
    });
    it('Go 数据服务调用失败时应记录 warn 并返回空', async () => {
      setValid(['FAIL']);
      goDataServiceClientMocks.callGoDataService.mockRejectedValue(new Error('server error'));
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
            rows: [
              { ticker, date: new Date('2024-01-02'), close: ticker === 'AAPL' ? 185.5 : 72.3 },
            ],
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
      expect(goDataServiceClientMocks.callGoDataService).not.toHaveBeenCalled();
    });
  });
  describe('dataFacade 编排（mock dataQuery/dataCache 层）', () => {
    let facade: typeof import('../../../packages/backend/src/infrastructure/dataFacade.js');
    const d = (t: string, v: number) => ({ [t]: { '2024-01-02': v } });
    beforeEach(async () => {
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
        '局部脏缓存应补取仍缺失的标的（不当作完整命中）',
        ['AAPL', 'MSFT', 'GOOG'],
        {
          valid: ['AAPL'],
          result: d('AAPL', 100),
          missing: ['MSFT', 'GOOG'],
          cached: d('MSFT', 200),
          go: { result: d('GOOG', 300), degraded: false },
        },
        {
          data: { ...d('AAPL', 100), ...d('MSFT', 200), ...d('GOOG', 300) },
          degraded: false,
          goArgs: ['GOOG'],
        },
      ],
      [
        'Go 补齐全部缺失（degraded=false）',
        ['AAPL', 'MSFT'],
        {
          valid: ['AAPL'],
          result: d('AAPL', 100),
          missing: ['MSFT'],
          go: { result: d('MSFT', 200), degraded: false },
        },
        { data: { ...d('AAPL', 100), ...d('MSFT', 200) }, degraded: false, goArgs: ['MSFT'] },
      ],
      [
        'Go 返回 degraded 标记（数据齐全但来自实时源）',
        ['AAPL', 'MSFT'],
        {
          valid: ['AAPL'],
          result: d('AAPL', 100),
          missing: ['MSFT'],
          go: { result: d('MSFT', 200), degraded: true },
        },
        {
          data: { ...d('AAPL', 100), ...d('MSFT', 200) },
          degraded: true,
          warningContains: '实时源',
          goArgs: ['MSFT'],
        },
      ],
      [
        'Go 仍无法获取部分（degraded=true）',
        ['AAPL', 'MSFT', 'GOOG'],
        {
          valid: ['AAPL'],
          result: {},
          missing: ['MSFT', 'GOOG'],
          go: { result: d('MSFT', 200), degraded: false },
        },
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
        { unknown: ['NEW'], go: { result: d('NEW', 50), degraded: false } },
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
      else expect(res.degraded).toBe(false);
      if (e.warning !== undefined) expect(res.degradedWarning).toBe(e.warning);
      if (e.warningContains) expect(res.degradedWarning).toContain(e.warningContains);
      if (e.warningUndefined) expect(res.degradedWarning).toBeUndefined();
      if (e.noCacheRead) expect(dataCacheMocks.readCache).not.toHaveBeenCalled();
      if (e.cacheRead) expect(dataCacheMocks.readCache).toHaveBeenCalledWith('cache-key');
      if (e.noGo) expect(dataQueryMocks.fetchMissingFromGoService).not.toHaveBeenCalled();
      if (e.noDb) expect(dataQueryMocks.queryPricesFromDb).not.toHaveBeenCalled();
      if (e.info) expect(loggerMocks.info).toHaveBeenCalledWith(expect.stringContaining(e.info));
      if (e.warn) expect(loggerMocks.warn).toHaveBeenCalledWith(expect.stringContaining(e.warn));
      if (e.goArgs) {
        expect(dataQueryMocks.fetchMissingFromGoService).toHaveBeenCalledWith(
          expect.arrayContaining(e.goArgs),
          e.defaultDates ? '' : '2024-01-02',
          e.defaultDates ? '' : '2024-01-03',
          'cache-key',
          undefined,
        );
      }
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
      expect(facade.invalidateAllCache).toBe(dataCacheMocks.invalidateAllCache);
    });
  });
});
