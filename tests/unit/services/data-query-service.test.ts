import { describe, it, expect, vi, beforeEach } from 'vitest';

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

const configMocks = vi.hoisted(() => ({
  GO_DATA_SERVICE_URL: 'http://127.0.0.1:5003',
  DATA_SERVICE_AUTH_TOKEN: 'dev-token',
  COMPUTE_RATE_LIMIT_MAX: 10,
  NODE_ENV: 'test',
  REDIS_URL: 'redis://localhost:6379',
}));

const cbMocks = vi.hoisted(() => ({
  fire: vi.fn(),
  on: vi.fn(),
  close: vi.fn(),
  opened: false,
}));

const httpMocks = vi.hoisted(() => ({
  request: vi.fn(),
}));

const semaphoreMetrics = vi.hoisted(() => vi.fn());
const circuitBreakerMetrics = vi.hoisted(() => vi.fn());

const cacheMocks = vi.hoisted(() => ({
  writeCache: vi.fn(),
  incrementCacheVersion: vi.fn(),
  setPriceCache: vi.fn(),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: loggerMocks,
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: configMocks,
}));

vi.mock('opossum', () => ({
  default: vi.fn(() => cbMocks),
}));

vi.mock('http', () => ({
  default: { request: httpMocks.request },
  request: httpMocks.request,
}));

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getReadPool: vi.fn(),
}));

vi.mock('../../../packages/backend/src/utils/metrics.js', () => ({
  registerSemaphoreMetrics: semaphoreMetrics,
  registerCircuitBreakerMetrics: circuitBreakerMetrics,
}));

vi.mock('../../../packages/backend/src/infrastructure/dataCacheService.js', () => cacheMocks);

import {
  isDbAvailable,
  validateSearchQuery,
  queryPricesFromDb,
  callGoDataService,
  fetchMissingFromGoService,
  searchTickersFromDb,
} from '../../../packages/backend/src/infrastructure/dataQueryService.js';

beforeEach(() => {
  vi.clearAllMocks();
  cbMocks.opened = false;
  cbMocks.fire.mockReset();
  cbMocks.fire.mockResolvedValue({ rows: [] });
});

describe('isDbAvailable', () => {
  it('熔断器关闭时应返回 true', () => {
    cbMocks.opened = false;
    expect(isDbAvailable()).toBe(true);
  });

  it('熔断器打开时应返回 false', () => {
    cbMocks.opened = true;
    expect(isDbAvailable()).toBe(false);
  });
});

describe('validateSearchQuery', () => {
  it('合法查询应返回 true', () => {
    expect(validateSearchQuery('VTI')).toBe(true);
  });

  it('合法查询含中文 market 应返回 true', () => {
    expect(validateSearchQuery('平安银行', 'A股')).toBe(true);
  });

  it('超过 100 字符的查询应返回 false', () => {
    expect(validateSearchQuery('a'.repeat(101))).toBe(false);
  });

  it('含非法字符的查询应返回 false', () => {
    expect(validateSearchQuery('<script>')).toBe(false);
  });

  it('market 超过 10 字符应返回 false', () => {
    expect(validateSearchQuery('VTI', 'abcdefghijk')).toBe(false);
  });

  it('market 含非法字符应返回 false', () => {
    expect(validateSearchQuery('VTI', 'A股123')).toBe(false);
  });
});

describe('queryPricesFromDb', () => {
  const tickers = ['SPY', 'VTI'];
  const start = '2024-01-01';
  const end = '2024-01-31';

  it('应返回查询结果', async () => {
    cbMocks.fire.mockResolvedValueOnce({
      rows: [
        { ticker: 'SPY', date: new Date('2024-01-02'), close: 400 },
        { ticker: 'VTI', date: new Date('2024-01-02'), close: 200 },
      ],
    });
    const r = await queryPricesFromDb(tickers, start, end);
    expect(r.result.SPY).toBeDefined();
    expect(r.result.SPY['2024-01-02']).toBe(400);
    expect(r.missing).toEqual([]);
    expect(r.dbDegraded).toBe(false);
  });

  it('熔断器打开时返回全部 missing 并标记 dbDegraded', async () => {
    cbMocks.opened = true;
    const r = await queryPricesFromDb(tickers, start, end);
    expect(r.missing).toEqual(tickers);
    expect(r.dbDegraded).toBe(true);
    expect(Object.keys(r.result)).toHaveLength(0);
  });

  it('无数据的 ticker 应加入 missing', async () => {
    cbMocks.fire.mockResolvedValueOnce({ rows: [] });
    const r = await queryPricesFromDb(tickers, start, end);
    expect(r.missing).toEqual(tickers);
    expect(r.dbDegraded).toBe(false);
  });

  it('查询异常时应返回全部 missing 并标记 dbDegraded', async () => {
    cbMocks.fire.mockRejectedValueOnce(new Error('DB connection lost'));
    const r = await queryPricesFromDb(tickers, start, end);
    expect(r.missing).toEqual(tickers);
    expect(r.dbDegraded).toBe(true);
  });
});

describe('callGoDataService', () => {
  function mockHttpResponse(data: string, statusCode = 200) {
    httpMocks.request.mockImplementationOnce(
      (_url: string, _opts: object, cb: (res: object) => void) => {
        const res = {
          on: vi.fn((event: string, handler: (chunk?: Buffer) => void) => {
            if (event === 'data') handler(Buffer.from(data));
            if (event === 'end') handler();
          }),
          statusCode,
        };
        cb(res);
        return { on: vi.fn(), end: vi.fn() };
      },
    );
  }

  it('成功时应返回响应体', async () => {
    mockHttpResponse(JSON.stringify({ success: true, data: [{ date: '2024-01-02', close: 400 }] }));
    const r = await callGoDataService('/api/data/price/SPY?start=2024-01-01&end=2024-01-31');
    expect(r).toBe(JSON.stringify({ success: true, data: [{ date: '2024-01-02', close: 400 }] }));
  });

  it('非 2xx 状态码应抛出错误', async () => {
    mockHttpResponse('Not Found', 404);
    await expect(callGoDataService('/api/data/price/SPY')).rejects.toThrow(
      'Go data service returned HTTP 404',
    );
  });
});

describe('fetchMissingFromGoService', () => {
  it('Go 服务返回有效数据时应写入缓存', async () => {
    httpMocks.request.mockImplementationOnce(
      (_url: string, _opts: object, cb: (res: object) => void) => {
        const res = {
          on: vi.fn((event: string, handler: (chunk?: Buffer) => void) => {
            if (event === 'data')
              handler(
                Buffer.from(
                  JSON.stringify({
                    success: true,
                    data: [{ date: '2024-01-02', close: 400 }],
                  }),
                ),
              );
            if (event === 'end') handler();
          }),
          statusCode: 200,
        };
        cb(res);
        return { on: vi.fn(), end: vi.fn() };
      },
    );

    const r = await fetchMissingFromGoService(['SPY'], '2024-01-01', '2024-01-31', 'test-key');
    expect(r.SPY).toBeDefined();
    expect(r.SPY['2024-01-02']).toBe(400);
    expect(cacheMocks.writeCache).toHaveBeenCalledWith('test-key', r);
    expect(cacheMocks.incrementCacheVersion).toHaveBeenCalled();
  });

  it('Go 服务返回空数据时缓存不应写入', async () => {
    httpMocks.request.mockImplementationOnce(
      (_url: string, _opts: object, cb: (res: object) => void) => {
        const res = {
          on: vi.fn((event: string, handler: (chunk?: Buffer) => void) => {
            if (event === 'data') handler(Buffer.from('{}'));
            if (event === 'end') handler();
          }),
          statusCode: 200,
        };
        cb(res);
        return { on: vi.fn(), end: vi.fn() };
      },
    );

    const r = await fetchMissingFromGoService(['SPY'], '2024-01-01', '2024-01-31', 'test-key');
    expect(Object.keys(r)).toHaveLength(0);
    expect(cacheMocks.writeCache).not.toHaveBeenCalled();
  });
});

describe('searchTickersFromDb', () => {
  it('熔断器打开时返回 null', async () => {
    cbMocks.opened = true;
    const r = await searchTickersFromDb('VTI');
    expect(r).toBeNull();
  });

  it('空查询字符串返回空数组', async () => {
    const r = await searchTickersFromDb('');
    expect(r).toEqual([]);
  });

  it('查询异常时返回 null', async () => {
    cbMocks.fire.mockRejectedValueOnce(new Error('search failed'));
    const r = await searchTickersFromDb('VTI');
    expect(r).toBeNull();
  });
});
