/**
 * dataFacade 单元测试（P0-02 T12）
 *
 * 企业理由：dataFacade 是数据访问编排核心，承载三条数据源分支：
 * 1. PostgreSQL 命中（无缺失标的）→ 直接返回
 * 2. 缓存命中（readCache 返回数据）→ 合并缓存返回
 * 3. Go data-fetcher 降级（缺失标的实时拉取，失败则标记 degraded）
 *
 * 降级信息必须通过返回值传递（P0 修复消除全局可变变量并发竞争），
 * 调用方据此时传播到 API 响应。本测试验证三条分支 + 降级标记 + initDb 容错。
 *
 * 权衡：仅验证编排逻辑与降级语义，不验证真实 DB/Go 行为（属集成测试范畴）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger } from '../../helpers/mockFactories.js';

// ===== vi.hoisted：保证 mock 引用在 vi.mock 工厂执行前绑定 =====
// 注意：vi.hoisted 回调在 import 初始化前执行，不可调用导入的工厂函数，
// 须内联 vi.fn()（与 outbox-publisher.test.ts 模式一致）。
const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

const dataQueryMocks = vi.hoisted(() => ({
  validateTickers: vi.fn(),
  queryPricesFromDb: vi.fn(),
  fetchMissingFromGoService: vi.fn(),
  searchTickers: vi.fn(),
}));

const dataCacheMocks = vi.hoisted(() => ({
  getCacheKey: vi.fn(),
  readCache: vi.fn(),
  invalidateTickerCache: vi.fn(),
  invalidateAllCache: vi.fn(),
}));

const migrationsMocks = vi.hoisted(() => ({
  initSchema: vi.fn(),
}));

const dateUtilsMocks = vi.hoisted(() => ({
  toDateStr: vi.fn(),
}));

// ===== Mock 模块 =====
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

vi.mock('../../../packages/backend/src/infrastructure/dataQuery.js', () => ({
  validateTickers: dataQueryMocks.validateTickers,
  queryPricesFromDb: dataQueryMocks.queryPricesFromDb,
  fetchMissingFromGoService: dataQueryMocks.fetchMissingFromGoService,
  searchTickers: dataQueryMocks.searchTickers,
}));

vi.mock('../../../packages/backend/src/infrastructure/dataCache.js', () => ({
  getCacheKey: dataCacheMocks.getCacheKey,
  readCache: dataCacheMocks.readCache,
  invalidateTickerCache: dataCacheMocks.invalidateTickerCache,
  invalidateAllCache: dataCacheMocks.invalidateAllCache,
}));

vi.mock('../../../packages/backend/src/db/migrations.js', () => ({
  initSchema: migrationsMocks.initSchema,
}));

vi.mock('../../../packages/backend/src/utils/dateUtils.js', () => ({
  toDateStr: dateUtilsMocks.toDateStr,
}));

import {
  initDb,
  fetchHistoryData,
  validateTickers,
  searchTickers,
  invalidateTickerCache,
  invalidateAllCache,
} from '../../../packages/backend/src/infrastructure/dataFacade.js';

describe('dataFacade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dateUtilsMocks.toDateStr.mockReturnValue('2024-01-01');
    dataCacheMocks.getCacheKey.mockReturnValue('cache-key');
  });

  describe('initDb', () => {
    it('schema 初始化成功时记录 info 日志', async () => {
      migrationsMocks.initSchema.mockResolvedValue(undefined);

      await initDb();

      expect(migrationsMocks.initSchema).toHaveBeenCalledTimes(1);
      expect(loggerMocks.info).toHaveBeenCalledWith(expect.stringContaining('initDb'));
      expect(loggerMocks.warn).not.toHaveBeenCalled();
    });

    it('schema 初始化失败时记录 warn 日志但不抛错（容错降级）', async () => {
      migrationsMocks.initSchema.mockRejectedValue(new Error('connection refused'));

      await expect(initDb()).resolves.toBeUndefined();

      expect(loggerMocks.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        expect.stringContaining('PostgreSQL 不可用'),
      );
    });
  });

  describe('fetchHistoryData — PostgreSQL 命中分支', () => {
    it('全部标的在 DB 命中（无缺失）时直接返回，不查缓存/Go', async () => {
      dataQueryMocks.validateTickers.mockResolvedValue({
        valid: ['AAPL', 'MSFT'],
        invalid: [],
        unknown: [],
      });
      const dbData = { AAPL: { '2024-01-02': 100 }, MSFT: { '2024-01-02': 200 } };
      dataQueryMocks.queryPricesFromDb.mockResolvedValue({
        result: dbData,
        missing: [],
        dbDegraded: false,
      });

      const res = await fetchHistoryData(['AAPL', 'MSFT'], '2024-01-02', '2024-01-03');

      expect(res.data).toEqual(dbData);
      expect(res.degraded).toBe(false);
      expect(res.degradedWarning).toBeUndefined();
      expect(dataCacheMocks.readCache).not.toHaveBeenCalled();
      expect(dataQueryMocks.fetchMissingFromGoService).not.toHaveBeenCalled();
      expect(loggerMocks.info).toHaveBeenCalledWith(expect.stringContaining('DB hit'));
    });

    it('存在非法标的时记录 warn 并忽略，仍走 DB 查询', async () => {
      dataQueryMocks.validateTickers.mockResolvedValue({
        valid: ['AAPL'],
        invalid: ['BAD!'],
        unknown: [],
      });
      dataQueryMocks.queryPricesFromDb.mockResolvedValue({
        result: { AAPL: { '2024-01-02': 100 } },
        missing: [],
        dbDegraded: false,
      });

      const res = await fetchHistoryData(['AAPL', 'BAD!'], '2024-01-02', '2024-01-03');

      expect(res.data).toEqual({ AAPL: { '2024-01-02': 100 } });
      expect(loggerMocks.warn).toHaveBeenCalledWith(expect.stringContaining('非法 ticker'));
    });

    it('全部标的非法时返回空结果且不查询 DB', async () => {
      dataQueryMocks.validateTickers.mockResolvedValue({
        valid: [],
        invalid: ['BAD1', 'BAD2'],
        unknown: [],
      });

      const res = await fetchHistoryData(['BAD1', 'BAD2'], '2024-01-02', '2024-01-03');

      expect(res.data).toEqual({});
      expect(res.degraded).toBe(false);
      expect(dataQueryMocks.queryPricesFromDb).not.toHaveBeenCalled();
      expect(loggerMocks.warn).toHaveBeenCalledWith(expect.stringContaining('全部'));
    });

    it('DB 降级时返回 degraded=true 并附带告警', async () => {
      dataQueryMocks.validateTickers.mockResolvedValue({
        valid: ['AAPL'],
        invalid: [],
        unknown: [],
      });
      dataQueryMocks.queryPricesFromDb.mockResolvedValue({
        result: { AAPL: { '2024-01-02': 100 } },
        missing: [],
        dbDegraded: true,
      });

      const res = await fetchHistoryData(['AAPL'], '2024-01-02', '2024-01-03');

      expect(res.degraded).toBe(true);
      expect(res.degradedWarning).toBe('数据库不可用，部分数据可能缺失');
    });
  });

  describe('fetchHistoryData — 缓存命中分支', () => {
    it('缺失标的命中缓存时合并缓存数据返回，不调用 Go', async () => {
      dataQueryMocks.validateTickers.mockResolvedValue({
        valid: ['AAPL'],
        invalid: [],
        unknown: [],
      });
      dataQueryMocks.queryPricesFromDb.mockResolvedValue({
        result: { AAPL: { '2024-01-02': 100 } },
        missing: ['MSFT'],
        dbDegraded: false,
      });
      const cached = { MSFT: { '2024-01-02': 200 } };
      dataCacheMocks.readCache.mockResolvedValue(cached);

      const res = await fetchHistoryData(['AAPL', 'MSFT'], '2024-01-02', '2024-01-03');

      expect(res.data).toEqual({
        AAPL: { '2024-01-02': 100 },
        MSFT: { '2024-01-02': 200 },
      });
      expect(res.degraded).toBe(false);
      expect(dataQueryMocks.fetchMissingFromGoService).not.toHaveBeenCalled();
      expect(loggerMocks.info).toHaveBeenCalledWith(expect.stringContaining('cache hit'));
    });

    it('未知标的也参与缓存查询', async () => {
      dataQueryMocks.validateTickers.mockResolvedValue({
        valid: ['AAPL'],
        invalid: [],
        unknown: ['NEW'],
      });
      dataQueryMocks.queryPricesFromDb.mockResolvedValue({
        result: { AAPL: { '2024-01-02': 100 } },
        missing: [],
        dbDegraded: false,
      });
      dataCacheMocks.readCache.mockResolvedValue({ NEW: { '2024-01-02': 50 } });

      const res = await fetchHistoryData(['AAPL', 'NEW'], '2024-01-02', '2024-01-03');

      expect(res.data).toEqual({
        AAPL: { '2024-01-02': 100 },
        NEW: { '2024-01-02': 50 },
      });
      expect(dataCacheMocks.readCache).toHaveBeenCalledWith('cache-key');
    });
  });

  describe('fetchHistoryData — Go data-fetcher 降级分支', () => {
    it('Go 服务补齐全部缺失标的时 degraded=false', async () => {
      dataQueryMocks.validateTickers.mockResolvedValue({
        valid: ['AAPL'],
        invalid: [],
        unknown: [],
      });
      dataQueryMocks.queryPricesFromDb.mockResolvedValue({
        result: { AAPL: { '2024-01-02': 100 } },
        missing: ['MSFT'],
        dbDegraded: false,
      });
      dataCacheMocks.readCache.mockResolvedValue(null);
      dataQueryMocks.fetchMissingFromGoService.mockResolvedValue({
        MSFT: { '2024-01-02': 200 },
      });

      const res = await fetchHistoryData(['AAPL', 'MSFT'], '2024-01-02', '2024-01-03');

      expect(res.data).toEqual({
        AAPL: { '2024-01-02': 100 },
        MSFT: { '2024-01-02': 200 },
      });
      expect(res.degraded).toBe(false);
      expect(dataQueryMocks.fetchMissingFromGoService).toHaveBeenCalledWith(
        ['MSFT'],
        '2024-01-02',
        '2024-01-03',
        'cache-key',
      );
    });

    it('Go 服务仍无法获取部分标的时 degraded=true 并附带告警', async () => {
      dataQueryMocks.validateTickers.mockResolvedValue({
        valid: ['AAPL'],
        invalid: [],
        unknown: [],
      });
      dataQueryMocks.queryPricesFromDb.mockResolvedValue({
        result: {},
        missing: ['MSFT', 'GOOG'],
        dbDegraded: false,
      });
      dataCacheMocks.readCache.mockResolvedValue(null);
      // Go 只补齐 MSFT，GOOG 仍缺失
      dataQueryMocks.fetchMissingFromGoService.mockResolvedValue({
        MSFT: { '2024-01-02': 200 },
      });

      const res = await fetchHistoryData(['AAPL', 'MSFT', 'GOOG'], '2024-01-02', '2024-01-03');

      expect(res.degraded).toBe(true);
      expect(res.degradedWarning).toContain('1 个标的');
      expect(res.data).toEqual({ MSFT: { '2024-01-02': 200 } });
    });

    it('start/end 为空字符串时使用默认日期范围（2000-01-01 至今天）', async () => {
      dataQueryMocks.validateTickers.mockResolvedValue({
        valid: [],
        invalid: [],
        unknown: ['NEW'],
      });
      dataQueryMocks.queryPricesFromDb.mockResolvedValue({
        result: {},
        missing: [],
        dbDegraded: false,
      });
      dataCacheMocks.readCache.mockResolvedValue(null);
      dataQueryMocks.fetchMissingFromGoService.mockResolvedValue({
        NEW: { '2024-01-02': 50 },
      });

      await fetchHistoryData(['NEW'], '', '');

      expect(dateUtilsMocks.toDateStr).toHaveBeenCalledWith(expect.any(Date));
      expect(dataQueryMocks.fetchMissingFromGoService).toHaveBeenCalledWith(
        ['NEW'],
        '2000-01-01',
        '2024-01-01', // toDateStr mock 返回值
        'cache-key',
      );
    });

    it('底层 validateTickers 抛错时向上传播（span 记录异常）', async () => {
      dataQueryMocks.validateTickers.mockRejectedValue(new Error('validation boom'));

      await expect(fetchHistoryData(['AAPL'], '2024-01-02', '2024-01-03')).rejects.toThrow(
        'validation boom',
      );

      expect(dataQueryMocks.queryPricesFromDb).not.toHaveBeenCalled();
    });
  });

  describe('re-exports', () => {
    it('直接暴露 dataQuery / dataCache 的函数（去除包装层）', () => {
      expect(validateTickers).toBe(dataQueryMocks.validateTickers);
      expect(searchTickers).toBe(dataQueryMocks.searchTickers);
      expect(invalidateTickerCache).toBe(dataCacheMocks.invalidateTickerCache);
      expect(invalidateAllCache).toBe(dataCacheMocks.invalidateAllCache);
    });
  });
});
