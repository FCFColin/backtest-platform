/**
 * DataService 单元测试 - Fetch 职责（拆分自 data-service.fetch.test.ts Task 5.17）
 *
 * 企业理由：fetchHistoryData 是数据服务最核心入口，覆盖 PostgreSQL 查询、
 * 熔断器快速失败、参数化 SQL 注入防护等关键路径。
 *
 * 拆分原因：原文件 493 行超过单文件可读性阈值。
 * - part1（本文件）：fetchHistoryData
 * - part2：validateTickers + initDb + validateTickers 边界场景
 * - part3：searchTickers
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger, createConfigMocks, createRedisMocks } from '../../helpers/mockFactories.js';

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
  tickerValidationMocks: { validateTickerFormat: vi.fn() },
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

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));
vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: dbMocks.getPool,
  getReadPool: dbMocks.getReadPool,
}));
vi.mock('../../../packages/backend/src/db/migrations.js', () => ({
  initSchema: dbMocks.initSchema,
}));
vi.mock('../../../packages/backend/src/utils/tickerValidation.js', () => ({
  validateTickerFormat: tickerValidationMocks.validateTickerFormat,
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
vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  appRedis: createRedisMocks(
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
}));
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

import { fetchHistoryData } from '../../../packages/backend/src/services/dataService.js';

describe('fetchHistoryData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    circuitBreakerMocks.instance.opened = false;
    circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });
    tickerValidationMocks.validateTickerFormat.mockReturnValue({ valid: [], invalid: [] });
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

  it('全部 ticker 非法时应返回空结果且不查询 DB', async () => {
    tickerValidationMocks.validateTickerFormat.mockReturnValue({
      valid: [],
      invalid: ['@@@invalid@@@'],
    });

    const { data: result } = await fetchHistoryData(['@@@invalid@@@'], '2024-01-01', '2024-01-31');

    expect(result).toEqual({});
    expect(circuitBreakerMocks.instance.fire).not.toHaveBeenCalled();
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
    circuitBreakerMocks.instance.fire.mockResolvedValueOnce({
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
