/**
 * P0-03 单元测试：HTTP 响应体大小限制
 *
 * 企业理由：Go 数据服务返回的行情数据可能很大（全量历史价格），无限制地累加响应体
 * 会导致内存溢出（OOM）。必须限制响应体大小，超限时销毁请求并拒绝。
 *
 * 测试策略：
 *   - 通过 vi.hoisted 设置极小的 MAX_RESPONSE_BODY_SIZE=100 字节，避免创建大字符串
 *   - 正常响应（在限制内）→ 成功返回
 *   - Content-Length 超限 → 立即拒绝，不等数据到达
 *   - 无 Content-Length 但数据超限 → 流式接收时中断
 *   - Content-Length 在限制内但实际数据超限 → 流式中断
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// 在模块加载前设置极小的响应体大小限制（100 字节），使测试无需创建大字符串
vi.hoisted(() => {
  process.env.MAX_RESPONSE_BODY_SIZE = '100';
});

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

const configMocks = vi.hoisted(() => ({
  GO_DATA_SERVICE_URL: 'http://127.0.0.1:15003',
  GO_DATA_SERVICE_TIMEOUT_MS: 5000,
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
  setPriceCache: vi.fn(),
  getCacheKey: vi.fn(),
  readCache: vi.fn(async () => null),
  HISTORY_CACHE_TTL_SEC: 86400,
  SEARCH_CACHE_TTL_SEC: 3600,
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
  Agent: vi.fn(() => ({ sockets: {}, destroy: vi.fn() })),
}));

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getReadPool: vi.fn(),
}));

vi.mock('../../../packages/backend/src/utils/metrics.js', () => ({
  registerSemaphoreMetrics: semaphoreMetrics,
  registerCircuitBreakerMetrics: circuitBreakerMetrics,
}));

vi.mock('../../../packages/backend/src/infrastructure/dataCache.js', () => cacheMocks);

import { callGoDataService } from '../../../packages/backend/src/infrastructure/dataQuery.js';

beforeEach(() => {
  vi.clearAllMocks();
  cbMocks.opened = false;
  cbMocks.fire.mockReset();
});

describe('P0-03: callGoDataService 响应体大小限制（MAX_RESPONSE_BODY_SIZE=100 bytes）', () => {
  function mockHttpResponse(opts: {
    data?: string;
    statusCode?: number;
    headers?: Record<string, string>;
    chunkSize?: number;
  }) {
    const {
      data = '',
      statusCode = 200,
      headers = {},
      chunkSize,
    } = opts;

    const destroyedRef = { destroyed: false };

    httpMocks.request.mockImplementationOnce(
      (_url: string, _opts: object, cb: (res: object) => void) => {
        const res = {
          on: vi.fn((event: string, handler: (chunk?: Buffer) => void) => {
            if (event === 'data') {
              if (chunkSize) {
                for (let i = 0; i < data.length && !destroyedRef.destroyed; i += chunkSize) {
                  handler(Buffer.from(data.slice(i, i + chunkSize)));
                }
              } else {
                if (data.length > 0 && !destroyedRef.destroyed) {
                  handler(Buffer.from(data));
                }
              }
            }
            if (event === 'end') {
              if (!destroyedRef.destroyed) handler();
            }
          }),
          statusCode,
          headers,
          destroy: vi.fn(() => {
            destroyedRef.destroyed = true;
          }),
        };
        cb(res);
        return {
          on: vi.fn(),
          end: vi.fn(),
          destroy: vi.fn(() => {
            destroyedRef.destroyed = true;
          }),
        };
      },
    );

    return destroyedRef;
  }

  it('正常响应（在 100 字节限制内）应成功返回', async () => {
    const testData = '{"success":true}'; // 16 bytes < 100 bytes
    mockHttpResponse({ data: testData });

    const result = await callGoDataService('/api/data/price/SPY');
    expect(result).toBe(testData);
  });

  it('Content-Length 超限应立即拒绝（不等数据到达）', async () => {
    mockHttpResponse({
      data: '',
      headers: { 'content-length': '200' }, // 200 > 100 limit
    });

    await expect(callGoDataService('/api/data/price/SPY')).rejects.toThrow(
      /response too large/i,
    );
  });

  it('无 Content-Length 但数据超限应流式中断', async () => {
    const hugeData = 'x'.repeat(200); // 200 bytes > 100 bytes limit, no Content-Length
    mockHttpResponse({
      data: hugeData,
      headers: {}, // 无 Content-Length
    });

    await expect(callGoDataService('/api/data/price/SPY')).rejects.toThrow(
      /response too large/i,
    );
  });

  it('分块发送时数据超限应流式中断', async () => {
    // 每块 30 字节，4 块 = 120 字节 > 100 字节限制
    const chunkData = 'x'.repeat(120);
    mockHttpResponse({
      data: chunkData,
      chunkSize: 30,
      headers: {},
    });

    await expect(callGoDataService('/api/data/price/SPY')).rejects.toThrow(
      /response too large/i,
    );
  });

  it('Content-Length 在限制内但实际数据超限应流式中断', async () => {
    // Content-Length 声明 50 字节（在限制内），但实际发送 200 字节
    mockHttpResponse({
      data: 'x'.repeat(200),
      headers: { 'content-length': '50' },
    });

    await expect(callGoDataService('/api/data/price/SPY')).rejects.toThrow(
      /response too large/i,
    );
  });

  it('正常响应有 Content-Length 且在限制内应成功', async () => {
    const testData = '{"success":true}'; // 16 bytes
    mockHttpResponse({
      data: testData,
      headers: { 'content-length': String(testData.length) },
    });

    const result = await callGoDataService('/api/data/price/SPY');
    expect(result).toBe(testData);
  });
});
