import {
  dbMocks,
  loggerMocks,
  redisMocks as rd,
  circuitBreakerMocks as cb,
  goDataServiceClientMocks as goSvc,
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

type Fail = 'reject' | 'open';

const goRes = (data: unknown) => JSON.stringify({ success: true, data });

beforeEach(() => {
  setupDefault();
});

describe('fetchHistoryData', () => {
  beforeEach(() => {
    setupRedisDown();
  });
  it('PostgreSQL 正常查询时应返回 DB 中的价格数据', async () => {
    const row = (t: string, c: number) => ({ ticker: t, date: new Date('2024-01-02'), close: c });
    setValid(['AAPL', 'BND']);
    cb.instance.fire.mockResolvedValue(rows(row('AAPL', 185.5), row('BND', 72.3)));
    const { data: result } = await fetchHistoryData(['AAPL', 'BND'], '2024-01-01', '2024-01-31');
    expect(result.AAPL).toEqual({ '2024-01-02': 185.5 });
    expect(result.BND).toEqual({ '2024-01-02': 72.3 });
  });
  it.each<[string, string[], Fail | null]>([
    ['DB 查询失败', ['AAPL'], 'reject'],
    ['熔断器 Open', ['AAPL'], 'open'],
    ['空结果集', ['UNKNOWN'], null],
  ])('%s 时应返回空对象', async (_n, tickers, fail) => {
    if (fail === 'reject') cb.instance.fire.mockRejectedValue(new Error('connection lost'));
    else if (fail === 'open') cb.instance.opened = true;
    const { data: result } = await fetchHistoryData(tickers, '2024-01-01', '2024-01-31');
    expect(result).toEqual({});
    if (fail === 'reject') expect(loggerMocks.warn).toHaveBeenCalled();
  });
});

describe('validateTickers', () => {
  it('DB 可用时应通过 tickers 表验证', async () => {
    cb.instance.fire.mockResolvedValue({ rows: [{ ticker: 'AAPL' }, { ticker: 'BND' }] });
    const result = await validateTickers(['AAPL', 'BND', 'UNKNOWN']);
    expect(result.valid).toEqual(['AAPL', 'BND']);
    expect(result.unknown).toEqual(['UNKNOWN']);
  });
  it.each<[string, string[], Fail | null]>([
    ['空 ticker 列表', [], null],
    ['熔断器 Open', ['AAPL'], 'open'],
    ['DB 查询失败', ['BROKEN'], 'reject'],
  ])('%s 应返回 unknown', async (_n, input, fail) => {
    if (fail === 'open') cb.instance.opened = true;
    else if (fail === 'reject') cb.instance.fire.mockRejectedValue(new Error('db down'));
    const result = await validateTickers(input);
    expect(result).toEqual({ valid: [], unknown: input, invalid: [] });
    if (fail === 'open') expect(cb.instance.fire).not.toHaveBeenCalled();
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
    cb.instance.fire.mockResolvedValue({
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
    expect(await searchTickers(query, market)).toEqual([]);
    if (noDbCall) expect(cb.instance.fire).not.toHaveBeenCalled();
  });
  it('DB 失败时应调用 Go 数据服务', async () => {
    cb.instance.fire.mockRejectedValue(new Error('db down'));
    const apple = [{ ticker: 'AAPL', name: 'Apple', market: '美股' }];
    goSvc.callGoDataService.mockResolvedValue(goRes(apple));
    expect(await searchTickers('AAPL')).toEqual(apple);
  });
  it('DB 与 Go 均失败时应返回空数组', async () => {
    cb.instance.opened = true;
    goSvc.callGoDataService.mockRejectedValue(new Error('connection refused'));
    expect(await searchTickers('茅台')).toEqual([]);
  });
  it('带 market 过滤时 DB 查询应附加 market 参数', async () => {
    cb.instance.fire.mockResolvedValue({
      rows: [{ ticker: '000001.SZ', category: '平安银行', market: 'A股' }],
    });
    await searchTickers('平安', 'A股');
    expect(cb.instance.fire).toHaveBeenCalledWith(expect.stringContaining('market = $3'), [
      'simple',
      '平安',
      'A股',
    ]);
  });
});

describe('缓存失效', () => {
  beforeEach(() => {
    cb.instance.opened = false;
    rd.ping.mockResolvedValue('PONG');
    rd.scan.mockResolvedValue(['0', []]);
  });
  it('全量失效时应清空 L1 并删除 Redis 缓存', async () => {
    const keys = ['cache:org:shared:price:AAPL', 'cache:org:shared:price:BND'];
    rd.scan.mockResolvedValue(['0', keys]);
    await invalidateAllCache();
    expect(rd.del).toHaveBeenCalledWith(...keys);
  });
  it('Redis scan 失败时全量失效仍应完成', async () => {
    rd.scan.mockRejectedValue(new Error('scan failed'));
    await expect(invalidateAllCache()).resolves.toBeUndefined();
  });
});

describe('fetchHistoryData 扩展', () => {
  beforeEach(async () => {
    setupRedisDown();
    rd.emit('error');
    await invalidateAllCache();
  });
  it.each<[string, string | null]>([
    ['Redis 缓存损坏回退 Go', '{ corrupted json'],
    ['缓存未命中走 Go 并写入缓存', null],
  ])('%s', async (_n, cached) => {
    rd.ping.mockResolvedValue('PONG');
    rd.get.mockResolvedValue(cached);
    setValid(['AAPL']);
    goSvc.callGoDataService.mockResolvedValue(goRes([{ date: '2024-01-02', close: 99.0 }]));
    const { data: result } = await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');
    expect(result.AAPL).toEqual({ '2024-01-02': 99.0 });
    expect(rd.set).toHaveBeenCalled();
  });
  it('Go 数据服务调用失败时应返回空', async () => {
    setValid(['FAIL']);
    goSvc.callGoDataService.mockRejectedValue(new Error('server error'));
    expect((await fetchHistoryData(['FAIL'], '2024-01-01', '2024-01-31')).data).toEqual({});
  });
});

describe('dataFacade 编排', () => {
  let facade: typeof import('../../../packages/backend/src/infrastructure/dataFacade.js');
  const dq = dataQueryMocks;
  const dc = dataCacheMocks;
  const d = (t: string, v: number) => ({ [t]: { '2024-01-02': v } });
  const g = (t: string, p: number, dg = false) => ({ result: d(t, p), degraded: dg });
  const toResult = (p: Record<string, number>) =>
    Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { '2024-01-02': v }]));
  const aapl = ['AAPL'];
  const two = ['AAPL', 'MSFT'];
  const pr1 = { AAPL: 100 };
  const pr2 = { AAPL: 100, MSFT: 200 };
  const dAapl = d('AAPL', 100);
  const dBoth = { ...dAapl, ...d('MSFT', 200) };

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('../../../packages/backend/src/infrastructure/dataQuery.js', () => dataQueryMocks);
    vi.doMock('../../../packages/backend/src/infrastructure/dataCache.js', () => dataCacheMocks);
    vi.doMock('../../../packages/backend/src/utils/misc.js', () => ({
      toDateStr: dateUtilsMocks.toDateStr,
      DEFAULT_START_DATE: '2000-01-01',
    }));
    dateUtilsMocks.toDateStr.mockReturnValue('2024-01-01');
    dc.getCacheKey.mockReturnValue('cache-key');
    facade = await import('../../../packages/backend/src/infrastructure/dataFacade.js');
  });
  function mockSetup(o: {
    valid?: string[];
    invalid?: string[];
    unknown?: string[];
    p?: Record<string, number>;
    missing?: string[];
    dbDeg?: boolean;
    cached?: unknown;
    go?: Record<string, unknown>;
  }) {
    dq.validateTickers.mockResolvedValue({
      valid: o.valid ?? [],
      invalid: o.invalid ?? [],
      unknown: o.unknown ?? [],
    });
    dq.queryPricesFromDb.mockResolvedValue({
      result: toResult(o.p ?? {}),
      missing: o.missing ?? [],
      dbDegraded: o.dbDeg ?? false,
    });
    dc.readCache.mockResolvedValue(o.cached ?? null);
    if (o.go) dq.fetchMissingFromGoService.mockResolvedValue(o.go);
  }
  // 期望对象字段因用例而异，统一放宽为可选索引访问
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- 期望字段因用例而异 */
  type Exp = { data: unknown } & Record<string, any>;
  it.each<[string, string[], Record<string, unknown>, Exp]>([
    ['全部 DB 命中', two, { valid: two, p: pr2 }, { data: dBoth, noCacheRead: true, noGo: true }],
    ['存在非法标的', ['AAPL', 'BAD!'], { valid: aapl, invalid: ['BAD!'], p: pr1 }, { data: dAapl }],
    ['全部非法', ['BAD1', 'BAD2'], { invalid: ['BAD1', 'BAD2'] }, { data: {}, noDb: true }],
    ['DB 降级', ['AAPL'], { valid: aapl, p: pr1, dbDeg: true }, { data: dAapl, degraded: true }],
    [
      '缓存命中补缺',
      two,
      { valid: aapl, p: pr1, missing: ['MSFT'], cached: d('MSFT', 200) },
      { data: dBoth, noGo: true },
    ],
    [
      'Go 补齐',
      two,
      { valid: aapl, p: pr1, missing: ['MSFT'], go: g('MSFT', 200) },
      { data: dBoth, goArgs: ['MSFT'] },
    ],
    [
      'Go degraded',
      two,
      { valid: aapl, p: pr1, missing: ['MSFT'], go: g('MSFT', 200, true) },
      { data: dBoth, degraded: true, goArgs: ['MSFT'] },
    ],
    [
      '双重降级',
      two,
      { valid: aapl, p: pr1, missing: ['MSFT'], dbDeg: true, go: g('MSFT', 200, true) },
      { data: dBoth, degraded: true, goArgs: ['MSFT'] },
    ],
    [
      'Go 部分失败',
      ['AAPL', 'MSFT', 'GOOG'],
      { valid: aapl, missing: ['MSFT', 'GOOG'], go: g('MSFT', 200) },
      { data: d('MSFT', 200), degraded: true, goArgs: ['MSFT', 'GOOG'] },
    ],
    [
      '默认日期',
      ['NEW'],
      { unknown: ['NEW'], go: g('NEW', 50) },
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
    if (e.noCacheRead) expect(dc.readCache).not.toHaveBeenCalled();
    if (e.noGo) expect(dq.fetchMissingFromGoService).not.toHaveBeenCalled();
    if (e.noDb) expect(dq.queryPricesFromDb).not.toHaveBeenCalled();
    if (e.goArgs) {
      expect(dq.fetchMissingFromGoService).toHaveBeenCalledWith(
        expect.arrayContaining(e.goArgs),
        e.defaultDates ? '' : '2024-01-02',
        e.defaultDates ? '' : '2024-01-03',
        'cache-key',
        undefined,
      );
    }
  });
  it('底层 validateTickers 抛错时向上传播', async () => {
    dq.validateTickers.mockRejectedValue(new Error('boom'));
    await expect(facade.fetchHistoryData(['AAPL'], '2024-01-02', '2024-01-03')).rejects.toThrow(
      'boom',
    );
  });
});
