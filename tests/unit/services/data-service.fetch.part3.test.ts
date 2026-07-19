/**
 * DataService 单元测试 - 搜索职责（拆分自 data-service.fetch.test.ts Task 5.17）
 *
 * 企业理由：searchTickers 是用户标的选择入口，覆盖全文搜索、SQL 注入防护、
 * Go 数据服务降级、磁盘缓存等关键路径。
 *
 * 拆分原因：原文件 493 行超过单文件可读性阈值。
 * - part1：fetchHistoryData
 * - part2：validateTickers + initDb + validateTickers 边界场景
 * - part3（本文件）：searchTickers
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger, createConfigMocks, createRedisMocks } from '../../helpers/mockFactories.js';
import {
  setupHttpGetSuccess as makeHttpSuccess,
  setupHttpGetError as makeHttpError,
} from '../../helpers/dataServiceFixtures.js';

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

import { searchTickers } from '../../../packages/backend/src/services/dataService.js';

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
    expect(httpMocks.request).not.toHaveBeenCalled();
  });

  it('恶意 SQL 注入式 query 应被拒绝并返回空数组', async () => {
    const result = await searchTickers("'; DROP TABLE tickers; --");

    expect(result).toEqual([]);
    expect(circuitBreakerMocks.instance.fire).not.toHaveBeenCalled();
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  // table-driven：query 长度/非法 market 校验共享相同断言
  it.each([
    {
      name: 'query 超过 100 字符',
      query: 'A'.repeat(101),
      market: undefined as string | undefined,
    },
    { name: '非法 market 参数', query: '茅台', market: 'A股;DROP' },
  ])('$name 应被拒绝并返回空数组', async ({ query, market }) => {
    const result =
      market === undefined ? await searchTickers(query) : await searchTickers(query, market);

    expect(result).toEqual([]);
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  it('DB 失败且磁盘缓存未命中时应调用 Go 数据服务', async () => {
    circuitBreakerMocks.instance.fire.mockRejectedValue(new Error('db down'));
    fsMocks.existsSync.mockReturnValue(false);
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
    expect(integrityMocks.signFile).toHaveBeenCalled();
  });

  it('DB 与 Go 数据服务均失败时应返回空数组', async () => {
    circuitBreakerMocks.instance.opened = true;
    fsMocks.existsSync.mockReturnValue(false);
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
