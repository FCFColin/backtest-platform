import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLoggerMocks } from '../../helpers/mockFactories.js';

// P0-03：在模块加载前设置极小的响应体大小限制（100 字节），使测试无需创建大字符串
vi.hoisted(() => {
  process.env.MAX_RESPONSE_BODY_SIZE = '100';
});
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
  getCacheKey: vi.fn(
    (type: string, params: Record<string, string>) => `test-${type}-${JSON.stringify(params)}`,
  ),
  readCache: vi.fn(async () => null),
  HISTORY_CACHE_TTL_SEC: 86400,
  SEARCH_CACHE_TTL_SEC: 3600,
}));

const queueMocks = vi.hoisted(() => ({
  add: vi.fn(),
  getActiveUpdateJobs: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: createLoggerMocks(),
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

vi.mock('../../../packages/backend/src/queues/queueDefinitions.js', () => ({
  dataUpdateQueue: {
    add: queueMocks.add,
  },
  getActiveUpdateJobs: queueMocks.getActiveUpdateJobs,
  dataUpdateDlq: { add: vi.fn() },
}));

import {
  isDbAvailable,
  validateSearchQuery,
  queryPricesFromDb,
  callGoDataService,
  fetchMissingFromGoService,
  searchTickersFromDb,
} from '../../../packages/backend/src/infrastructure/dataQuery.js';

beforeEach(() => {
  vi.clearAllMocks();
  cbMocks.opened = false;
  cbMocks.fire.mockReset();
  cbMocks.fire.mockResolvedValue({ rows: [] });
});

/** 构造 http mock 响应；支持 chunkSize（分块发送）与 destroy 追踪（响应体超限场景） */
function mockHttpResponse(opts: {
  data?: string;
  statusCode?: number;
  headers?: Record<string, string>;
  chunkSize?: number;
}) {
  const { data = '', statusCode = 200, headers = {}, chunkSize } = opts;
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
            } else if (data.length > 0 && !destroyedRef.destroyed) {
              handler(Buffer.from(data));
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

describe('isDbAvailable', () => {
  it.each([
    ['熔断器关闭时应返回 true', false, true],
    ['熔断器打开时应返回 false', true, false],
  ])('%s', (_n, opened, expected) => {
    cbMocks.opened = opened;
    expect(isDbAvailable()).toBe(expected);
  });
});

describe('validateSearchQuery', () => {
  it.each([
    ['合法查询应返回 true', 'VTI', undefined, true],
    ['合法查询含中文 market 应返回 true', '平安银行', 'A股', true],
    ['超过 100 字符的查询应返回 false', 'a'.repeat(101), undefined, false],
    ['含非法字符的查询应返回 false', '<script>', undefined, false],
    ['market 超过 10 字符应返回 false', 'VTI', 'abcdefghijk', false],
    ['market 含非法字符应返回 false', 'VTI', 'A股123', false],
  ])('%s', (_n, query, market, expected) => {
    expect(validateSearchQuery(query, market)).toBe(expected);
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

  it.each([
    [
      '熔断器打开时返回全部 missing 并标记 dbDegraded',
      () => {
        cbMocks.opened = true;
      },
      true,
    ],
    [
      '无数据的 ticker 应加入 missing',
      () => cbMocks.fire.mockResolvedValueOnce({ rows: [] }),
      false,
    ],
    [
      '查询异常时应返回全部 missing 并标记 dbDegraded',
      () => cbMocks.fire.mockRejectedValueOnce(new Error('DB connection lost')),
      true,
    ],
  ])('%s', async (_n, setup, dbDegraded) => {
    setup();
    const r = await queryPricesFromDb(tickers, start, end);
    expect(r.missing).toEqual(tickers);
    expect(r.dbDegraded).toBe(dbDegraded);
    expect(Object.keys(r.result)).toHaveLength(0);
  });
});

describe('callGoDataService', () => {
  it('成功时应返回响应体', async () => {
    mockHttpResponse({
      data: JSON.stringify({ success: true, data: [{ date: '2024-01-02', close: 400 }] }),
    });
    const r = await callGoDataService('/api/data/price/SPY?start=2024-01-01&end=2024-01-31');
    expect(r).toBe(JSON.stringify({ success: true, data: [{ date: '2024-01-02', close: 400 }] }));
  });

  it('非 2xx 状态码应抛出错误', async () => {
    mockHttpResponse({ data: 'Not Found', statusCode: 404 });
    await expect(callGoDataService('/api/data/price/SPY')).rejects.toThrow(
      'Go data service returned HTTP 404',
    );
  });
});

describe('P0-03: callGoDataService 响应体大小限制（MAX_RESPONSE_BODY_SIZE=100 bytes）', () => {
  it.each([
    {
      name: 'Content-Length 超限应立即拒绝（不等数据到达）',
      data: '',
      headers: { 'content-length': '200' },
    },
    { name: '无 Content-Length 但数据超限应流式中断', data: 'x'.repeat(200), headers: {} },
    { name: '分块发送时数据超限应流式中断', data: 'x'.repeat(120), chunkSize: 30, headers: {} },
    {
      name: 'Content-Length 在限制内但实际数据超限应流式中断',
      data: 'x'.repeat(200),
      headers: { 'content-length': '50' },
    },
  ])('$name', async ({ data, headers, chunkSize }) => {
    mockHttpResponse({ data, headers, chunkSize });
    await expect(callGoDataService('/api/data/price/SPY')).rejects.toThrow(/response too large/i);
  });

  it.each([
    { name: '正常响应（在 100 字节限制内）应成功返回', data: '{"success":true}', headers: {} },
    {
      name: '正常响应有 Content-Length 且在限制内应成功',
      data: '{"success":true}',
      headers: { 'content-length': '16' },
    },
  ])('$name', async ({ data, headers }) => {
    mockHttpResponse({ data, headers });
    expect(await callGoDataService('/api/data/price/SPY')).toBe(data);
  });
});

describe('fetchMissingFromGoService', () => {
  const goBody = (items: unknown[]) => JSON.stringify({ success: true, data: items });

  it('Go 服务返回有效数据时应写入缓存', async () => {
    mockHttpResponse({ data: goBody([{ date: '2024-01-02', close: 400 }]) });
    const r = await fetchMissingFromGoService(['SPY'], '2024-01-01', '2024-01-31', 'test-key');
    expect(r.SPY).toBeDefined();
    expect(r.SPY['2024-01-02']).toBe(400);
    expect(cacheMocks.writeCache).toHaveBeenCalledWith('test-key', r, 86400);
  });

  it('Go 服务返回空数据时缓存不应写入', async () => {
    mockHttpResponse({ data: '{}' });
    const r = await fetchMissingFromGoService(['SPY'], '2024-01-01', '2024-01-31', 'test-key');
    expect(Object.keys(r)).toHaveLength(0);
    expect(cacheMocks.writeCache).not.toHaveBeenCalled();
  });
});

describe('searchTickersFromDb', () => {
  it('熔断器打开时返回 null', async () => {
    cbMocks.opened = true;
    expect(await searchTickersFromDb('VTI')).toBeNull();
  });

  it('空查询字符串返回空数组', async () => {
    expect(await searchTickersFromDb('')).toEqual([]);
  });

  it('查询异常时返回 null', async () => {
    cbMocks.fire.mockRejectedValueOnce(new Error('search failed'));
    expect(await searchTickersFromDb('VTI')).toBeNull();
  });
});

describe('dataFetchService', () => {
  function makeMockJob(opts: {
    id?: string;
    state?: string;
    mode?: 'full' | 'incremental';
    progress?: number;
    timestamp?: number;
  }): Record<string, unknown> {
    return {
      id: opts.id ?? 'job-update-001',
      data: { mode: opts.mode ?? 'full' },
      progress: opts.progress ?? 0,
      timestamp: opts.timestamp ?? Date.now(),
      getState: vi.fn().mockResolvedValue(opts.state ?? 'active'),
      remove: vi.fn().mockResolvedValue(undefined),
    };
  }

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    queueMocks.getActiveUpdateJobs.mockResolvedValue([]);
    queueMocks.add.mockResolvedValue({ id: 'job-update-001' });
  });

  describe('getUpdateStatus', () => {
    it('初始状态应为未运行', async () => {
      const { getUpdateStatus } =
        await import('../../../packages/backend/src/infrastructure/dataServices.js');
      const status = await getUpdateStatus();
      expect(status.running).toBe(false);
      expect(status.mode).toBeNull();
      expect(status.startedAt).toBeNull();
      expect(status.completedTickers).toBe(0);
      expect(status.totalTickers).toBe(0);
      expect(status.lastError).toBeNull();
    });

    it('应返回状态的深拷贝', async () => {
      const { getUpdateStatus } =
        await import('../../../packages/backend/src/infrastructure/dataServices.js');
      const status1 = await getUpdateStatus();
      status1.running = true;
      const status2 = await getUpdateStatus();
      expect(status2.running).toBe(false);
    });

    it('有活跃任务时应返回运行中状态', async () => {
      const job = makeMockJob({ state: 'active', mode: 'incremental', progress: 50 });
      queueMocks.getActiveUpdateJobs.mockResolvedValue([job]);

      const { getUpdateStatus } =
        await import('../../../packages/backend/src/infrastructure/dataServices.js');
      const status = await getUpdateStatus();
      expect(status.running).toBe(true);
      expect(status.mode).toBe('incremental');
      expect(status.completedTickers).toBe(50);
    });
  });

  describe('startUpdate', () => {
    it('已有进程运行时返回失败', async () => {
      const job = makeMockJob({ state: 'active' });
      queueMocks.getActiveUpdateJobs.mockResolvedValue([job]);

      const { startUpdate } =
        await import('../../../packages/backend/src/infrastructure/dataServices.js');
      const result = await startUpdate('full');
      expect(result.success).toBe(false);
      expect(result.message).toContain('已有');
    });

    it('增量模式应入队并返回成功', async () => {
      queueMocks.getActiveUpdateJobs.mockResolvedValue([]);
      queueMocks.add.mockResolvedValue({ id: 'job-inc-001' });

      const { startUpdate } =
        await import('../../../packages/backend/src/infrastructure/dataServices.js');
      const result = await startUpdate('incremental');
      expect(result.success).toBe(true);
      expect(result.message).toContain('增量');
      expect(result.jobId).toBe('job-inc-001');

      const [name, data] = queueMocks.add.mock.calls[0];
      expect(name).toBe('data-update');
      expect(data.mode).toBe('incremental');
    });

    it('全量模式应入队并返回成功', async () => {
      queueMocks.getActiveUpdateJobs.mockResolvedValue([]);
      queueMocks.add.mockResolvedValue({ id: 'job-full-001' });

      const { startUpdate } =
        await import('../../../packages/backend/src/infrastructure/dataServices.js');
      const result = await startUpdate('full');
      expect(result.success).toBe(true);
      expect(result.message).toContain('全量');

      const [, data] = queueMocks.add.mock.calls[0];
      expect(data.mode).toBe('full');
    });
  });

  describe('stopUpdate', () => {
    it('没有运行的任务时应返回失败', async () => {
      queueMocks.getActiveUpdateJobs.mockResolvedValue([]);

      const { stopUpdate } =
        await import('../../../packages/backend/src/infrastructure/dataServices.js');
      const result = await stopUpdate();
      expect(result.success).toBe(false);
      expect(result.message).toContain('没有');
    });

    it('有运行任务时应停止并返回成功', async () => {
      const job = makeMockJob({ id: 'job-running', state: 'active' });
      queueMocks.getActiveUpdateJobs.mockResolvedValue([job]);

      const { stopUpdate } =
        await import('../../../packages/backend/src/infrastructure/dataServices.js');
      const result = await stopUpdate();
      expect(result.success).toBe(true);
      expect(result.message).toContain('已停止');
      expect(job.remove).toHaveBeenCalled();
    });
  });
});
