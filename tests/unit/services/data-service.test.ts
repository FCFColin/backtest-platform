import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  dbMocks,
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

describe('fetchHistoryData', () => {
  beforeEach(() => {
    setupRedisDown();
  });
  it('PostgreSQL 正常查询时应返回 DB 中的价格数据', async () => {
    setValid(['AAPL', 'BND']);
    circuitBreakerMocks.instance.fire.mockResolvedValue(
      rows(
        { ticker: 'AAPL', date: new Date('2024-01-02'), close: 185.5 },
        { ticker: 'BND', date: new Date('2024-01-02'), close: 72.3 },
      ),
    );
    const { data: result } = await fetchHistoryData(['AAPL', 'BND'], '2024-01-01', '2024-01-31');
    expect(result.AAPL).toEqual({ '2024-01-02': 185.5 });
    expect(result.BND).toEqual({ '2024-01-02': 72.3 });
  });
  it.each([
    [
      'DB 查询失败',
      ['AAPL'],
      () => circuitBreakerMocks.instance.fire.mockRejectedValue(new Error('connection lost')),
      true,
    ],
    [
      '熔断器 Open',
      ['AAPL'],
      () => {
        circuitBreakerMocks.instance.opened = true;
      },
      false,
    ],
    ['空结果集', ['UNKNOWN'], () => {}, false],
  ])('%s 时应返回空对象', async (_n, tickers, arrange, expectWarn) => {
    arrange();
    const { data: result } = await fetchHistoryData(tickers, '2024-01-01', '2024-01-31');
    expect(result).toEqual({});
    if (expectWarn) expect(loggerMocks.warn).toHaveBeenCalled();
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
  });
  it.each([
    ['空 ticker 列表', () => {}, [], false],
    [
      '熔断器 Open',
      () => {
        circuitBreakerMocks.instance.opened = true;
      },
      ['AAPL'],
      true,
    ],
    [
      'DB 查询失败',
      () => circuitBreakerMocks.instance.fire.mockRejectedValue(new Error('db down')),
      ['BROKEN'],
      false,
    ],
  ])('%s 应返回 unknown', async (_n, setup, input, fireNotCalled) => {
    setup();
    const result = await validateTickers(input);
    expect(result).toEqual({ valid: [], unknown: input, invalid: [] });
    if (fireNotCalled) expect(circuitBreakerMocks.instance.fire).not.toHaveBeenCalled();
  });
});

describe('initDb', () => {
  it('initSchema 成功时应记录 info 日志', async () => {
    await initDb();
    expect(dbMocks.initSchema).toHaveBeenCalledTimes(1);
    expect(loggerMocks.info).toHaveBeenCalledWith(expect.stringContaining('initDb'));
  });
  it('initSchema 失败时应优雅降级', async () => {
    dbMocks.initSchema.mockRejectedValue(new Error('db unavailable'));
    await expect(initDb()).resolves.toBeUndefined();
    expect(loggerMocks.warn).toHaveBeenCalled();
  });
});

describe('searchTickers', () => {
  it('DB 可用时应通过全文搜索返回结果', async () => {
    circuitBreakerMocks.instance.fire.mockResolvedValue({
      rows: [{ ticker: '600519.SH', category: '贵州茅台', market: 'A股' }],
    });
    const result = await searchTickers('茅台');
    expect(result).toEqual([{ ticker: '600519.SH', name: '贵州茅台', market: 'A股' }]);
  });
  it('DB 无结果时应返回空数组', async () => {
    expect(await searchTickers('不存在的标的')).toEqual([]);
  });
  it.each([
    ["'; DROP TABLE tickers; --", undefined, true],
    ['A'.repeat(101), undefined, false],
    ['茅台', 'A股;DROP', false],
  ])('恶意/超长 query "%s" 应返回空数组', async (query, market, noDbCall) => {
    const result =
      market === undefined ? await searchTickers(query) : await searchTickers(query, market);
    expect(result).toEqual([]);
    if (noDbCall) expect(circuitBreakerMocks.instance.fire).not.toHaveBeenCalled();
  });
  it('DB 失败时应调用 Go 数据服务', async () => {
    circuitBreakerMocks.instance.fire.mockRejectedValue(new Error('db down'));
    goDataServiceClientMocks.callGoDataService.mockResolvedValue(
      JSON.stringify({ success: true, data: [{ ticker: 'AAPL', name: 'Apple', market: '美股' }] }),
    );
    expect(await searchTickers('AAPL')).toEqual([
      { ticker: 'AAPL', name: 'Apple', market: '美股' },
    ]);
  });
  it('DB 与 Go 均失败时应返回空数组', async () => {
    circuitBreakerMocks.instance.opened = true;
    goDataServiceClientMocks.callGoDataService.mockRejectedValue(new Error('connection refused'));
    expect(await searchTickers('茅台')).toEqual([]);
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

describe('缓存失效', () => {
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
  });
  it('Redis scan 失败时全量失效仍应完成', async () => {
    redisMocks.scan.mockRejectedValue(new Error('scan failed'));
    await expect(invalidateAllCache()).resolves.toBeUndefined();
  });
});

describe('fetchHistoryData 扩展', () => {
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
      '缓存未命中走 Go 并写入缓存',
      async () => {
        redisMocks.ping.mockResolvedValue('PONG');
        redisMocks.get.mockResolvedValue(null);
      },
    ],
  ])('%s', async (_n, arrangeRedis) => {
    setValid(['AAPL']);
    await arrangeRedis();
    goDataServiceClientMocks.callGoDataService.mockResolvedValue(
      JSON.stringify({ success: true, data: [{ date: '2024-01-02', close: 99.0 }] }),
    );
    const { data: result } = await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');
    expect(result.AAPL).toEqual({ '2024-01-02': 99.0 });
    expect(redisMocks.set).toHaveBeenCalled();
  });
  it('Go 数据服务调用失败时应返回空', async () => {
    setValid(['FAIL']);
    goDataServiceClientMocks.callGoDataService.mockRejectedValue(new Error('server error'));
    expect((await fetchHistoryData(['FAIL'], '2024-01-01', '2024-01-31')).data).toEqual({});
  });
});

describe('dataFacade 编排', () => {
  let facade: typeof import('../../../packages/backend/src/infrastructure/dataFacade.js');
  const d = (t: string, v: number) => ({ [t]: { '2024-01-02': v } });

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('../../../packages/backend/src/infrastructure/dataQuery.js', () => dataQueryMocks);
    vi.doMock('../../../packages/backend/src/infrastructure/dataCache.js', () => dataCacheMocks);
    vi.doMock('../../../packages/backend/src/utils/misc.js', () => ({
      toDateStr: dateUtilsMocks.toDateStr,
      DEFAULT_START_DATE: '2000-01-01',
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
  // 期望对象字段因用例而异，统一放宽为可选索引访问
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- 期望字段因用例而异 */
  type Exp = { data: unknown } & Record<string, any>;
  it.each<[string, string[], Record<string, unknown>, Exp]>([
    [
      '全部 DB 命中',
      ['AAPL', 'MSFT'],
      { valid: ['AAPL', 'MSFT'], result: { ...d('AAPL', 100), ...d('MSFT', 200) } },
      { data: { ...d('AAPL', 100), ...d('MSFT', 200) }, noCacheRead: true, noGo: true },
    ],
    [
      '存在非法标的',
      ['AAPL', 'BAD!'],
      { valid: ['AAPL'], invalid: ['BAD!'], result: d('AAPL', 100) },
      { data: d('AAPL', 100) },
    ],
    ['全部非法', ['BAD1', 'BAD2'], { invalid: ['BAD1', 'BAD2'] }, { data: {}, noDb: true }],
    [
      'DB 降级',
      ['AAPL'],
      { valid: ['AAPL'], result: d('AAPL', 100), dbDegraded: true },
      { data: d('AAPL', 100), degraded: true },
    ],
    [
      '缓存命中补缺',
      ['AAPL', 'MSFT'],
      { valid: ['AAPL'], result: d('AAPL', 100), missing: ['MSFT'], cached: d('MSFT', 200) },
      { data: { ...d('AAPL', 100), ...d('MSFT', 200) }, noGo: true },
    ],
    [
      'Go 补齐',
      ['AAPL', 'MSFT'],
      {
        valid: ['AAPL'],
        result: d('AAPL', 100),
        missing: ['MSFT'],
        go: { result: d('MSFT', 200), degraded: false },
      },
      { data: { ...d('AAPL', 100), ...d('MSFT', 200) }, goArgs: ['MSFT'] },
    ],
    [
      'Go degraded',
      ['AAPL', 'MSFT'],
      {
        valid: ['AAPL'],
        result: d('AAPL', 100),
        missing: ['MSFT'],
        go: { result: d('MSFT', 200), degraded: true },
      },
      { data: { ...d('AAPL', 100), ...d('MSFT', 200) }, degraded: true, goArgs: ['MSFT'] },
    ],
    [
      '双重降级',
      ['AAPL', 'MSFT'],
      {
        valid: ['AAPL'],
        result: d('AAPL', 100),
        missing: ['MSFT'],
        dbDegraded: true,
        go: { result: d('MSFT', 200), degraded: true },
      },
      { data: { ...d('AAPL', 100), ...d('MSFT', 200) }, degraded: true, goArgs: ['MSFT'] },
    ],
    [
      'Go 部分失败',
      ['AAPL', 'MSFT', 'GOOG'],
      {
        valid: ['AAPL'],
        result: {},
        missing: ['MSFT', 'GOOG'],
        go: { result: d('MSFT', 200), degraded: false },
      },
      { data: d('MSFT', 200), degraded: true, goArgs: ['MSFT', 'GOOG'] },
    ],
    [
      '默认日期',
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
    expect(res.degraded).toBe(e.degraded ?? false);
    if (e.noCacheRead) expect(dataCacheMocks.readCache).not.toHaveBeenCalled();
    if (e.noGo) expect(dataQueryMocks.fetchMissingFromGoService).not.toHaveBeenCalled();
    if (e.noDb) expect(dataQueryMocks.queryPricesFromDb).not.toHaveBeenCalled();
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
  it('底层 validateTickers 抛错时向上传播', async () => {
    dataQueryMocks.validateTickers.mockRejectedValue(new Error('boom'));
    await expect(facade.fetchHistoryData(['AAPL'], '2024-01-02', '2024-01-03')).rejects.toThrow(
      'boom',
    );
  });
});
