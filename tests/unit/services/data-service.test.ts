/**
 * DataService 单元测试（Task 11）
 *
 * 企业理由：DataService 是数据访问的核心服务，必须保证：
 * 1. PostgreSQL 主数据源正常查询（含字段映射 ticker/date/close）
 * 2. DB 不可用时降级到 JSON 文件回退（ADR-007 降级链路）
 * 3. 熔断器 Open 状态时跳过 DB 直接走 JSON 回退
 * 4. 空结果集正确处理
 * 5. NaN 价格值正确传递（文档化当前行为）
 * 6. 全部 ticker 非法时返回空结果
 *
 * 权衡：mock opossum CircuitBreaker、pg.Pool、fs，不验证真实数据库/文件行为。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger, createConfigMocks } from '../../helpers/mockFactories.js';

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
  child: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

const redisMocks = vi.hoisted(() => {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  return {
    ping: vi.fn().mockRejectedValue(new Error('redis unavailable')),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    scan: vi.fn().mockResolvedValue(['0', []]),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    }),
    /** 触发 redis 事件处理器（重置 dataService 内 priceCacheRedisAvailable） */
    emit(event: string) {
      for (const h of handlers[event] ?? []) h();
    },
  };
});

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  statSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  unlinkSync: vi.fn(),
}));

// CircuitBreaker mock：可控的 fire 与 opened 状态
const circuitBreakerMocks = vi.hoisted(() => ({
  instance: {
    fire: vi.fn(),
    opened: false,
    on: vi.fn(),
  },
}));

const integrityMocks = vi.hoisted(() => ({
  signFileSync: vi.fn(),
  verifyFileSync: vi.fn().mockReturnValue(true),
}));

const httpMocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

// ===== Mock 模块 =====

vi.mock('../../../api/utils/logger.js', () => ({ logger: mockLogger(loggerMocks) }));

vi.mock('../../../api/db/index.js', () => ({
  getPool: dbMocks.getPool,
  getReadPool: dbMocks.getReadPool,
  initSchema: dbMocks.initSchema,
}));

vi.mock('../../../api/utils/tickerValidation.js', () => ({
  validateTickerFormat: tickerValidationMocks.validateTickerFormat,
}));

vi.mock('../../../api/utils/metrics.js', () => ({
  registerSemaphoreMetrics: vi.fn(),
  registerCircuitBreakerMetrics: vi.fn(),
}));

vi.mock('../../../api/config/index.js', () => ({
  config: createConfigMocks({ GO_DATA_SERVICE_URL: 'http://127.0.0.1:5003' }),
}));

vi.mock('../../../api/config/redis.js', () => ({
  appRedis: redisMocks,
}));

// Mock opossum CircuitBreaker：返回可控实例
vi.mock('opossum', () => ({
  default: vi.fn(() => circuitBreakerMocks.instance),
}));

// Mock fs：控制 JSON 文件回退行为
vi.mock('fs', () => ({
  default: fsMocks,
  existsSync: fsMocks.existsSync,
  readFileSync: fsMocks.readFileSync,
  statSync: fsMocks.statSync,
  writeFileSync: fsMocks.writeFileSync,
  mkdirSync: fsMocks.mkdirSync,
  readdirSync: fsMocks.readdirSync,
  unlinkSync: fsMocks.unlinkSync,
}));

vi.mock('../../../api/utils/integrity.js', () => ({
  signFileSync: integrityMocks.signFileSync,
  verifyFileSync: integrityMocks.verifyFileSync,
}));

vi.mock('http', () => ({
  default: { get: httpMocks.get },
  get: httpMocks.get,
}));

import { EventEmitter } from 'events';
import {
  fetchHistoryData,
  validateTickers,
  initDb,
  searchTickers,
  invalidateCache,
} from '../../../api/services/dataService.js';

/** 模拟 http.get 成功响应（callGoDataService 三参数签名） */
function setupHttpGetSuccess(body: string, statusCode = 200): void {
  httpMocks.get.mockImplementation(
    (
      _url: string,
      _opts: unknown,
      callback: (res: EventEmitter & { statusCode: number }) => void,
    ) => {
      const req = new EventEmitter() as EventEmitter & {
        destroy: ReturnType<typeof vi.fn>;
        on: ReturnType<typeof vi.fn>;
      };
      req.destroy = vi.fn();
      req.on = vi.fn();
      const res = new EventEmitter() as EventEmitter & { statusCode: number };
      res.statusCode = statusCode;
      queueMicrotask(() => {
        callback(res);
        res.emit('data', Buffer.from(body));
        res.emit('end');
      });
      return req;
    },
  );
}

/** 模拟 http.get 网络错误 */
function setupHttpGetError(message: string): void {
  httpMocks.get.mockImplementation((_url: string, _opts: unknown, _callback: unknown) => {
    const req = new EventEmitter() as EventEmitter & {
      destroy: ReturnType<typeof vi.fn>;
      on: ReturnType<typeof vi.fn>;
    };
    req.destroy = vi.fn();
    req.on = vi.fn((event: string, handler: (err: Error) => void) => {
      if (event === 'error') queueMicrotask(() => handler(new Error(message)));
    });
    return req;
  });
}

describe('fetchHistoryData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认：熔断器关闭（DB 可用），ticker 格式合法
    circuitBreakerMocks.instance.opened = false;
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });
    tickerValidationMocks.validateTickerFormat.mockReturnValue({ valid: [], invalid: [] });
    // 默认：无 JSON 文件
    fsMocks.existsSync.mockReturnValue(false);
  });

  it('PostgreSQL 正常查询时应返回 DB 中的价格数据', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({
      valid: ['AAPL', 'BND'],
      invalid: [],
    });
    // DB 返回两行价格数据
    circuitBreakerMocks.instance.fire.mockResolvedValue({
      rows: [
        { ticker: 'AAPL', date: new Date('2024-01-02'), close: 185.5 },
        { ticker: 'AAPL', date: new Date('2024-01-03'), close: 186.0 },
        { ticker: 'BND', date: new Date('2024-01-02'), close: 72.3 },
      ],
    });

    const result = await fetchHistoryData(['AAPL', 'BND'], '2024-01-01', '2024-01-31');

    // 应按 ticker 分组，date 转为 YYYY-MM-DD 字符串
    expect(result.AAPL).toEqual({
      '2024-01-02': 185.5,
      '2024-01-03': 186.0,
    });
    expect(result.BND).toEqual({
      '2024-01-02': 72.3,
    });
  });

  it('应使用参数化查询（ANY($1)）防止 SQL 注入', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({
      valid: ['AAPL'],
      invalid: [],
    });
    circuitBreakerMocks.instance.fire.mockResolvedValue({
      rows: [{ ticker: 'AAPL', date: new Date('2024-01-02'), close: 185.5 }],
    });

    await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');

    // 验证熔断器 fire 调用的 SQL 与参数
    expect(circuitBreakerMocks.instance.fire).toHaveBeenCalledWith(
      expect.stringContaining('ticker = ANY($1)'),
      [['AAPL'], '2024-01-01', '2024-01-31'],
    );
  });

  it('DB 查询失败时不应回退 JSON，返回空结果', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({
      valid: ['AAPL'],
      invalid: [],
    });
    circuitBreakerMocks.instance.fire.mockRejectedValue(new Error('connection lost'));
    redisMocks.ping.mockRejectedValue(new Error('redis unavailable'));

    const result = await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');

    expect(result).toEqual({});
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  it('熔断器 Open 状态时不应调用 DB，且未入库标的无数据', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({
      valid: ['AAPL'],
      invalid: [],
    });
    circuitBreakerMocks.instance.opened = true;
    redisMocks.ping.mockRejectedValue(new Error('redis unavailable'));

    const result = await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');

    expect(circuitBreakerMocks.instance.fire).not.toHaveBeenCalled();
    expect(result).toEqual({});
  });

  it('空结果集时应返回空对象', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({
      valid: ['UNKNOWN'],
      invalid: [],
    });
    // DB 返回空结果
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });
    // JSON 文件不存在
    fsMocks.existsSync.mockReturnValue(false);

    const result = await fetchHistoryData(['UNKNOWN'], '2024-01-01', '2024-01-31');

    // 应返回空对象（无该 ticker 的数据）
    expect(result).toEqual({});
  });

  it('DB 返回 NaN close 时应原样传递（文档化当前行为）', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({
      valid: ['AAPL'],
      invalid: [],
    });
    circuitBreakerMocks.instance.fire.mockResolvedValue({
      rows: [{ ticker: 'AAPL', date: new Date('2024-01-02'), close: NaN }],
    });

    const result = await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');

    // NaN 值原样传递（当前实现不过滤 NaN）
    expect(result.AAPL).toEqual({ '2024-01-02': NaN });
    expect(Number.isNaN(result.AAPL['2024-01-02'])).toBe(true);
  });

  it('全部 ticker 非法时应返回空结果且不查询 DB', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({
      valid: [],
      invalid: ['@@@invalid@@@'],
    });

    const result = await fetchHistoryData(['@@@invalid@@@'], '2024-01-01', '2024-01-31');

    expect(result).toEqual({});
    // 不应调用 DB
    expect(circuitBreakerMocks.instance.fire).not.toHaveBeenCalled();
    // 应记录 warn 日志
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  it('date 字段为字符串时应直接使用（不调用 toISOString）', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({
      valid: ['AAPL'],
      invalid: [],
    });
    circuitBreakerMocks.instance.fire.mockResolvedValue({
      rows: [{ ticker: 'AAPL', date: '2024-01-02', close: 185.5 }],
    });

    const result = await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');

    expect(result.AAPL).toEqual({ '2024-01-02': 185.5 });
  });

  it('部分 ticker 在 DB 中有数据、部分缺失时，缺失标的不会从 JSON 回退', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({
      valid: ['AAPL', 'MISSING'],
      invalid: [],
    });
    circuitBreakerMocks.instance.fire.mockResolvedValueOnce({
      rows: [{ ticker: 'AAPL', date: new Date('2024-01-02'), close: 185.5 }],
    });
    redisMocks.ping.mockRejectedValue(new Error('redis unavailable'));

    const result = await fetchHistoryData(['AAPL', 'MISSING'], '2024-01-01', '2024-01-31');

    expect(result.AAPL).toEqual({ '2024-01-02': 185.5 });
    expect(result.MISSING).toBeUndefined();
  });
});

describe('validateTickers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    circuitBreakerMocks.instance.opened = false;
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });
    fsMocks.existsSync.mockReturnValue(false);
  });

  it('DB 可用时应通过 tickers 表验证', async () => {
    circuitBreakerMocks.instance.fire.mockResolvedValue({
      rows: [{ ticker: 'AAPL' }, { ticker: 'BND' }],
    });

    const result = await validateTickers(['AAPL', 'BND', 'UNKNOWN']);

    expect(result.valid).toEqual(['AAPL', 'BND']);
    expect(result.invalid).toEqual(['UNKNOWN']);
  });

  it('应使用 ANY($1) 参数化查询', async () => {
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });

    await validateTickers(['AAPL']);

    expect(circuitBreakerMocks.instance.fire).toHaveBeenCalledWith(
      expect.stringContaining('ticker = ANY($1)'),
      [['AAPL']],
    );
  });

  it('DB 失败时应将全部 ticker 标为 invalid', async () => {
    circuitBreakerMocks.instance.fire.mockRejectedValue(new Error('db down'));

    const result = await validateTickers(['AAPL', 'UNKNOWN']);

    expect(result.valid).toEqual([]);
    expect(result.invalid).toEqual(['AAPL', 'UNKNOWN']);
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
    expect(httpMocks.get).not.toHaveBeenCalled();
  });

  it('恶意 SQL 注入式 query 应被拒绝并返回空数组', async () => {
    const result = await searchTickers("'; DROP TABLE tickers; --");

    expect(result).toEqual([]);
    expect(circuitBreakerMocks.instance.fire).not.toHaveBeenCalled();
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  it('query 超过 100 字符应被拒绝', async () => {
    const result = await searchTickers('A'.repeat(101));

    expect(result).toEqual([]);
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  it('非法 market 参数应被拒绝', async () => {
    const result = await searchTickers('茅台', 'A股;DROP');

    expect(result).toEqual([]);
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  it('DB 失败时应回退到磁盘缓存', async () => {
    circuitBreakerMocks.instance.fire.mockRejectedValue(new Error('db down'));
    const cached = [{ ticker: 'SPY', name: 'S&P 500 ETF', market: '美股' }];
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readFileSync.mockReturnValue(
      JSON.stringify({
        __cacheVersion: 0,
        __data: cached,
      }),
    );

    const result = await searchTickers('SPY');

    expect(result).toEqual(cached);
  });

  it('DB 失败且磁盘缓存未命中时应调用 Go 数据服务', async () => {
    circuitBreakerMocks.instance.fire.mockRejectedValue(new Error('db down'));
    fsMocks.existsSync.mockReturnValue(false);
    setupHttpGetSuccess(
      JSON.stringify({
        success: true,
        data: [{ ticker: 'AAPL', name: 'Apple', market: '美股' }],
      }),
    );

    const result = await searchTickers('AAPL');

    expect(result).toEqual([{ ticker: 'AAPL', name: 'Apple', market: '美股' }]);
    expect(httpMocks.get).toHaveBeenCalled();
    expect(integrityMocks.signFileSync).toHaveBeenCalled();
  });

  it('Go 数据服务失败时应回退到 mock 搜索结果', async () => {
    circuitBreakerMocks.instance.opened = true;
    fsMocks.existsSync.mockReturnValue(false);
    setupHttpGetError('connection refused');

    const result = await searchTickers('茅台');

    expect(result.some((r) => r.name.includes('茅台'))).toBe(true);
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

describe('invalidateCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    circuitBreakerMocks.instance.opened = false;
    redisMocks.ping.mockResolvedValue('PONG');
    redisMocks.emit('ready');
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readdirSync.mockReturnValue([]);
    fsMocks.readFileSync.mockReturnValue('0');
  });

  it('按 ticker 失效时应清除内存缓存并删除相关磁盘文件', async () => {
    fsMocks.readdirSync.mockReturnValue([
      'history_AAPL=tickers_AAPL&start=2024-01-01.json',
      'other.json',
    ]);

    await invalidateCache('AAPL');

    expect(loggerMocks.info).toHaveBeenCalledWith(expect.stringContaining('ticker=AAPL'));
    expect(fsMocks.unlinkSync).toHaveBeenCalledTimes(1);
    expect(redisMocks.del).toHaveBeenCalledWith('price_cache:AAPL');
  });

  it('全量失效时应递增版本号并清空缓存', async () => {
    redisMocks.scan.mockResolvedValue(['0', ['price_cache:AAPL', 'price_cache:BND']]);

    await invalidateCache();

    expect(fsMocks.writeFileSync).toHaveBeenCalled();
    expect(redisMocks.del).toHaveBeenCalledWith('price_cache:AAPL', 'price_cache:BND');
    expect(loggerMocks.info).toHaveBeenCalledWith(expect.stringContaining('全量失效'));
  });

  it('Redis 删除失败时应降级到内存路径且不抛出', async () => {
    redisMocks.del.mockRejectedValueOnce(new Error('redis del failed'));

    await expect(invalidateCache('AAPL')).resolves.toBeUndefined();
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  it('Redis scan 失败时全量失效仍应完成', async () => {
    redisMocks.scan.mockRejectedValue(new Error('scan failed'));

    await expect(invalidateCache()).resolves.toBeUndefined();
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  it('Redis 不可用时按 ticker 失效应降级到内存路径', async () => {
    redisMocks.emit('error');
    redisMocks.ping.mockRejectedValue(new Error('redis unavailable'));

    await expect(invalidateCache('AAPL')).resolves.toBeUndefined();
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
    fsMocks.existsSync.mockReturnValue(false);
    redisMocks.ping.mockRejectedValue(new Error('redis unavailable'));
    redisMocks.get.mockResolvedValue(null);
    // 重置模块级 Redis/内存价格缓存，避免前一用例污染后续断言
    redisMocks.emit('error');
    await invalidateCache();
  });

  it('PostgreSQL 查询成功时应直接返回行情', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({
      valid: ['AAPL'],
      invalid: [],
    });
    circuitBreakerMocks.instance.fire.mockResolvedValue({
      rows: [
        { ticker: 'AAPL', date: '2024-01-02', close: 185.5 },
        { ticker: 'AAPL', date: '2024-01-03', close: 186.0 },
      ],
    });

    const result = await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');

    expect(result.AAPL).toEqual({ '2024-01-02': 185.5, '2024-01-03': 186.0 });
  });

  it('HMAC 校验失败时应丢弃磁盘缓存并调用 Go 数据服务', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({
      valid: ['AAPL'],
      invalid: [],
    });
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });
    fsMocks.existsSync.mockImplementation((p: string) => {
      const normalized = String(p).replace(/\\/g, '/');
      if (normalized.includes('.cache_version')) return false;
      // 仅 history 磁盘缓存存在；批量 ticker JSON 不存在，避免内存/Redis 缓存短路
      if (normalized.includes('/data/cache') || normalized.includes('history_')) return true;
      return false;
    });
    integrityMocks.verifyFileSync.mockImplementation(
      (p: string) => !String(p).includes('history_'),
    );
    setupHttpGetSuccess(
      JSON.stringify({
        success: true,
        data: [{ date: '2024-01-02', close: 99.0 }],
      }),
    );

    const result = await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');

    expect(result.AAPL).toEqual({ '2024-01-02': 99.0 });
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'dataService' }),
      expect.stringContaining('完整性校验失败'),
    );
  });

  it('Go 数据服务 HTTP 路径应返回价格并写入缓存', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({
      valid: ['MSFT'],
      invalid: [],
    });
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });
    fsMocks.existsSync.mockReturnValue(false);
    setupHttpGetSuccess(
      JSON.stringify({
        success: true,
        data: [
          { date: '2024-01-02', close: 400.0 },
          { date: '2024-01-03', close: 401.0 },
        ],
      }),
    );

    const result = await fetchHistoryData(['MSFT'], '2024-01-01', '2024-01-31');

    expect(result.MSFT).toEqual({ '2024-01-02': 400.0, '2024-01-03': 401.0 });
    expect(httpMocks.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/data/price/MSFT'),
      expect.any(Object),
      expect.any(Function),
    );
    expect(fsMocks.writeFileSync).toHaveBeenCalled();
  });

  it('Go 数据服务 HTTP 非 2xx 时应记录 warn 并返回空', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({
      valid: ['FAIL'],
      invalid: [],
    });
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });
    fsMocks.existsSync.mockReturnValue(false);
    setupHttpGetSuccess('server error', 500);

    const result = await fetchHistoryData(['FAIL'], '2024-01-01', '2024-01-31');

    expect(result).toEqual({});
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  it('PostgreSQL 不可用时未命中 Go 服务应返回空', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({
      valid: ['VTI'],
      invalid: [],
    });
    circuitBreakerMocks.instance.fire.mockRejectedValue(new Error('db down'));
    fsMocks.existsSync.mockReturnValue(false);

    const result = await fetchHistoryData(['VTI'], '2024-01-01', '2024-01-31');

    expect(result.VTI).toBeUndefined();
  });

  it('PostgreSQL 返回数据时应包含请求日期范围内的行情', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({
      valid: ['LARGE'],
      invalid: [],
    });
    const rows = Array.from({ length: 11 }, (_, i) => {
      const day = String(50 + i).padStart(2, '0');
      return { ticker: 'LARGE', date: `2024-01-${day}`, close: 100 + 49 + i };
    });
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows });

    const result = await fetchHistoryData(['LARGE'], '2024-01-50', '2024-01-60');

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

    const [r1, r2] = await Promise.all([
      fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31'),
      fetchHistoryData(['BND'], '2024-01-01', '2024-01-31'),
    ]);

    expect(r1.AAPL).toEqual({ '2024-01-02': 185.5 });
    expect(r2.BND).toEqual({ '2024-01-02': 72.3 });
  });

  it('磁盘 history 缓存命中时应直接返回', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({
      valid: ['CACHED'],
      invalid: [],
    });
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });
    const cachedGo = { CACHED: { '2024-01-02': 50.0 } };
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readFileSync.mockImplementation((p: string) => {
      if (String(p).includes('history_')) {
        return JSON.stringify({ __cacheVersion: 0, __data: cachedGo });
      }
      return '0';
    });

    const result = await fetchHistoryData(['CACHED'], '2024-01-01', '2024-01-31');

    expect(result.CACHED).toEqual({ '2024-01-02': 50.0 });
    expect(httpMocks.get).not.toHaveBeenCalled();
  });
});

describe('validateTickers 边界场景', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    circuitBreakerMocks.instance.opened = false;
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });
    fsMocks.existsSync.mockReturnValue(false);
    redisMocks.ping.mockRejectedValue(new Error('redis unavailable'));
  });

  it('空 ticker 列表应返回空 valid/invalid', async () => {
    const result = await validateTickers([]);

    expect(result).toEqual({ valid: [], invalid: [] });
  });

  it('熔断器 Open 时应跳过 DB 并全部标记 invalid', async () => {
    circuitBreakerMocks.instance.opened = true;

    const result = await validateTickers(['AAPL', 'GHOST']);

    expect(result.valid).toEqual([]);
    expect(result.invalid).toEqual(['AAPL', 'GHOST']);
    expect(circuitBreakerMocks.instance.fire).not.toHaveBeenCalled();
  });

  it('DB 查询成功但 ticker 无数据时应标记 invalid', async () => {
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });

    const result = await validateTickers(['UNKNOWN']);

    expect(result.valid).toEqual([]);
    expect(result.invalid).toEqual(['UNKNOWN']);
  });

  it('DB 查询失败时应全部标记 invalid', async () => {
    circuitBreakerMocks.instance.fire.mockRejectedValue(new Error('db down'));

    const result = await validateTickers(['BROKEN']);

    expect(result.valid).toEqual([]);
    expect(result.invalid).toEqual(['BROKEN']);
  });

  it('DB 有 ticker 记录即标记 valid', async () => {
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [{ ticker: 'AAPL' }] });

    const result = await validateTickers(['AAPL']);

    expect(result.valid).toEqual(['AAPL']);
    expect(result.invalid).toEqual([]);
  });
});
