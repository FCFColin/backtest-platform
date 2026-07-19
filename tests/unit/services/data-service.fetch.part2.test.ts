/**
 * DataService 单元测试 - 校验与初始化（拆分自 data-service.fetch.test.ts Task 5.17）
 *
 * 企业理由：validateTickers 是数据查询前置门禁（拒绝非法/不存在标的）；
 * initDb 是服务启动 schema 初始化入口，优雅降级至关重要。
 *
 * 拆分原因：原文件 493 行超过单文件可读性阈值。
 * - part1：fetchHistoryData
 * - part2（本文件）：validateTickers + initDb + validateTickers 边界场景
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

import { validateTickers, initDb } from '../../../packages/backend/src/services/dataService.js';

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

  // table-driven：边界场景共享"调用 validateTickers + 期望 valid/invalid"结构
  it.each([
    {
      name: '熔断器 Open 时',
      setup: () => {
        circuitBreakerMocks.instance.opened = true;
      },
      input: ['AAPL', 'GHOST'],
      expected: { valid: [], invalid: ['AAPL', 'GHOST'] },
      fireNotCalled: true,
    },
    {
      name: 'DB 查询成功但 ticker 无数据时',
      setup: () => {
        circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [] });
      },
      input: ['UNKNOWN'],
      expected: { valid: [], invalid: ['UNKNOWN'] },
      fireNotCalled: false,
    },
    {
      name: 'DB 查询失败时',
      setup: () => {
        circuitBreakerMocks.instance.fire.mockRejectedValue(new Error('db down'));
      },
      input: ['BROKEN'],
      expected: { valid: [], invalid: ['BROKEN'] },
      fireNotCalled: false,
    },
    {
      name: 'DB 有 ticker 记录时',
      setup: () => {
        circuitBreakerMocks.instance.fire.mockResolvedValue({ rows: [{ ticker: 'AAPL' }] });
      },
      input: ['AAPL'],
      expected: { valid: ['AAPL'], invalid: [] },
      fireNotCalled: false,
    },
  ])('$name应返回正确结果', async ({ setup, input, expected, fireNotCalled }) => {
    setup();
    const result = await validateTickers(input);
    expect(result).toEqual(expected);
    if (fireNotCalled) {
      expect(circuitBreakerMocks.instance.fire).not.toHaveBeenCalled();
    }
  });
});
