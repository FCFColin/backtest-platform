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
}));

const configMocks = vi.hoisted(() => ({
  GO_DATA_SERVICE_URL: 'http://127.0.0.1:5003',
}));

const redisMocks = vi.hoisted(() => ({
  ping: vi.fn().mockRejectedValue(new Error('redis unavailable')),
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  scan: vi.fn().mockResolvedValue(['0', []]),
  on: vi.fn(),
}));

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

// ===== Mock 模块 =====

vi.mock('../../../api/utils/logger.js', () => ({
  logger: {
    info: loggerMocks.info,
    warn: loggerMocks.warn,
    error: loggerMocks.error,
    debug: loggerMocks.debug,
  },
}));

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
  config: configMocks,
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

import { fetchHistoryData, validateTickers, initDb } from '../../../api/services/dataService.js';

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

  it('DB 查询失败时应降级到 JSON 文件回退', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({
      valid: ['AAPL'],
      invalid: [],
    });
    // DB 查询抛错
    circuitBreakerMocks.instance.fire.mockRejectedValue(new Error('connection lost'));

    // JSON 文件回退：模拟文件存在
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.statSync.mockReturnValue({ mtimeMs: 1000 });
    fsMocks.readFileSync.mockReturnValue(JSON.stringify({
      prices: [
        { date: '2024-01-02', close: 185.5 },
        { date: '2024-01-03', close: 186.0 },
      ],
    }));
    // Redis 不可用（使用内存缓存）
    redisMocks.ping.mockRejectedValue(new Error('redis unavailable'));

    const result = await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');

    // 应从 JSON 文件回退获取数据
    expect(result.AAPL).toEqual({
      '2024-01-02': 185.5,
      '2024-01-03': 186.0,
    });
    // 应记录降级日志
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  it('熔断器 Open 状态时应跳过 DB 直接走 JSON 回退', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({
      valid: ['AAPL'],
      invalid: [],
    });
    // 熔断器打开（DB 不可用）
    circuitBreakerMocks.instance.opened = true;

    // JSON 文件回退
    fsMocks.existsSync.mockReturnValue(true);
    // statSync 抛错以跳过内存缓存（避免前序测试缓存的旧数据干扰）
    fsMocks.statSync.mockImplementation(() => { throw new Error('stat skipped'); });
    fsMocks.readFileSync.mockReturnValue(JSON.stringify({
      prices: [{ date: '2024-01-02', close: 185.5 }],
    }));
    redisMocks.ping.mockRejectedValue(new Error('redis unavailable'));

    const result = await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');

    // 熔断器打开时不应调用 fire
    expect(circuitBreakerMocks.instance.fire).not.toHaveBeenCalled();
    // 应从 JSON 获取数据
    expect(result.AAPL).toEqual({ '2024-01-02': 185.5 });
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
      rows: [
        { ticker: 'AAPL', date: new Date('2024-01-02'), close: NaN },
      ],
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
      rows: [
        { ticker: 'AAPL', date: '2024-01-02', close: 185.5 },
      ],
    });

    const result = await fetchHistoryData(['AAPL'], '2024-01-01', '2024-01-31');

    expect(result.AAPL).toEqual({ '2024-01-02': 185.5 });
  });

  it('部分 ticker 在 DB 中有数据、部分缺失时，缺失的走 JSON 回退', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({
      valid: ['AAPL', 'MISSING'],
      invalid: [],
    });
    // 第一次 fire：主查询只返回 AAPL 的数据
    // 第二次 fire：loadFromBatchCache('MISSING') 的 DB 查询失败，触发 JSON 回退
    circuitBreakerMocks.instance.fire
      .mockResolvedValueOnce({ rows: [{ ticker: 'AAPL', date: new Date('2024-01-02'), close: 185.5 }] })
      .mockRejectedValueOnce(new Error('db query failed for MISSING'));
    // JSON 回退为 MISSING 提供数据
    fsMocks.existsSync.mockReturnValue(true);
    // statSync 抛错以跳过内存缓存
    fsMocks.statSync.mockImplementation(() => { throw new Error('stat skipped'); });
    fsMocks.readFileSync.mockReturnValue(JSON.stringify({
      prices: [{ date: '2024-01-02', close: 50.0 }],
    }));
    redisMocks.ping.mockRejectedValue(new Error('redis unavailable'));

    const result = await fetchHistoryData(['AAPL', 'MISSING'], '2024-01-01', '2024-01-31');

    expect(result.AAPL).toEqual({ '2024-01-02': 185.5 });
    expect(result.MISSING).toEqual({ '2024-01-02': 50.0 });
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

  it('DB 失败时应降级到 JSON 文件验证', async () => {
    circuitBreakerMocks.instance.fire.mockRejectedValue(new Error('db down'));
    // JSON 文件存在
    fsMocks.existsSync.mockReturnValue(true);
    // statSync 抛错以跳过内存缓存（避免前序 fetchHistoryData 测试缓存的旧数据干扰）
    fsMocks.statSync.mockImplementation(() => { throw new Error('stat skipped'); });
    // readFileSync 按 ticker 区分：AAPL 有数据，UNKNOWN 无数据
    fsMocks.readFileSync.mockImplementation((p: string) => {
      if (String(p).includes('UNKNOWN')) {
        return JSON.stringify({}); // UNKNOWN 没有价格数据
      }
      return JSON.stringify({
        prices: [{ date: '2024-01-02', close: 185.5 }],
      });
    });
    redisMocks.ping.mockRejectedValue(new Error('redis unavailable'));

    const result = await validateTickers(['AAPL', 'UNKNOWN']);

    expect(result.valid).toEqual(['AAPL']);
    expect(result.invalid).toEqual(['UNKNOWN']);
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
    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.stringContaining('initDb'),
    );
  });

  it('initSchema 失败时应记录 warn 日志且不抛出（优雅降级）', async () => {
    dbMocks.initSchema.mockRejectedValue(new Error('db unavailable'));

    await expect(initDb()).resolves.toBeUndefined();
    expect(loggerMocks.warn).toHaveBeenCalled();
  });
});
