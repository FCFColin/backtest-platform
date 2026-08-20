import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  MAX_RESPONSE_BODY_SIZE: 100,
}));

const cbMocks = vi.hoisted(() => ({
  fire: vi.fn(),
  on: vi.fn(),
  close: vi.fn(),
  opened: false,
}));

const semaphoreMetrics = vi.hoisted(() => vi.fn());
const circuitBreakerMetrics = vi.hoisted(() => vi.fn());

const cacheMocks = vi.hoisted(() => ({
  writeCache: vi.fn(),
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

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: configMocks,
}));

vi.mock('opossum', () => ({
  default: vi.fn(() => cbMocks),
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
  validateSearchQuery,
  queryPricesFromDb,
  fetchMissingFromGoService,
} from '../../../packages/backend/src/infrastructure/dataQuery.js';
import { callGoDataService } from '../../../packages/backend/src/infrastructure/goDataServiceClient.js';

beforeEach(() => {
  vi.clearAllMocks();
  cbMocks.opened = false;
  cbMocks.fire.mockReset();
  cbMocks.fire.mockResolvedValue({ rows: [] });
});

function mockFetchResponse(opts: {
  data?: string;
  statusCode?: number;
  headers?: Record<string, string>;
  chunkSize?: number;
}) {
  const { data = '', statusCode = 200, headers = {}, chunkSize } = opts;
  globalThis.fetch = vi.fn().mockImplementationOnce(async () => {
    const buf = Buffer.from(data);
    const chunks: Buffer[] = [];
    if (chunkSize) {
      for (let i = 0; i < buf.length; i += chunkSize) chunks.push(buf.subarray(i, i + chunkSize));
    } else if (buf.length > 0) {
      chunks.push(buf);
    }
    return {
      ok: statusCode >= 200 && statusCode < 300,
      status: statusCode,
      headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
      body: (async function* () {
        for (const c of chunks) yield c;
      })(),
    };
  });
}

describe('validateSearchQuery', () => {
  it.each([
    ['合法查询', 'VTI', undefined, true],
    ['含中文 market', '平安银行', 'A股', true],
    ['超过 100 字符', 'a'.repeat(101), undefined, false],
    ['含非法字符', '<script>', undefined, false],
    ['market 超过 10 字符', 'VTI', 'abcdefghijk', false],
    ['market 含非法字符', 'VTI', 'A股123', false],
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
    const r = await queryPricesFromDb(tickers, start, end, false);
    expect(r.result.SPY['2024-01-02']).toBe(400);
    expect(r.missing).toEqual([]);
    expect(r.dbDegraded).toBe(false);
  });

  it.each([
    [
      '熔断器打开',
      () => {
        cbMocks.opened = true;
      },
      true,
    ],
    ['无数据', () => cbMocks.fire.mockResolvedValueOnce({ rows: [] }), false],
    ['查询异常', () => cbMocks.fire.mockRejectedValueOnce(new Error('DB connection lost')), true],
  ])('%s', async (_n, setup, dbDegraded) => {
    setup();
    const r = await queryPricesFromDb(tickers, start, end, false);
    expect(r.missing).toEqual(tickers);
    expect(r.dbDegraded).toBe(dbDegraded);
  });
});

describe('callGoDataService', () => {
  it('成功时应返回响应体', async () => {
    mockFetchResponse({
      data: JSON.stringify({ success: true, data: [{ date: '2024-01-02', close: 400 }] }),
    });
    const r = await callGoDataService('/api/data/price/SPY?start=2024-01-01&end=2024-01-31');
    expect(r).toContain('"success":true');
  });

  it('非 2xx 状态码应抛出错误', async () => {
    mockFetchResponse({ data: 'Not Found', statusCode: 404 });
    await expect(callGoDataService('/api/data/price/SPY')).rejects.toThrow(
      'Go data service returned HTTP 404',
    );
  });
});

describe('P0-03: 响应体大小限制（MAX_RESPONSE_BODY_SIZE=100 bytes）', () => {
  it.each([
    { name: 'Content-Length 超限', data: '', headers: { 'content-length': '200' } },
    { name: '无 Content-Length 但数据超限', data: 'x'.repeat(200), headers: {} },
    { name: '分块发送时超限', data: 'x'.repeat(120), chunkSize: 30, headers: {} },
    {
      name: 'Content-Length 在限制内但实际超限',
      data: 'x'.repeat(200),
      headers: { 'content-length': '50' },
    },
  ])('$name', async ({ data, headers, chunkSize }) => {
    mockFetchResponse({ data, headers, chunkSize });
    await expect(callGoDataService('/api/data/price/SPY')).rejects.toThrow(/response too large/i);
  });
  it.each([
    { name: '正常响应在限制内', data: '{"success":true}', headers: {} },
    {
      name: '正常响应有 Content-Length',
      data: '{"success":true}',
      headers: { 'content-length': '16' },
    },
  ])('$name', async ({ data, headers }) => {
    mockFetchResponse({ data, headers });
    expect(await callGoDataService('/api/data/price/SPY')).toBe(data);
  });
});

describe('fetchMissingFromGoService', () => {
  const goBody = (items: unknown[]) => JSON.stringify({ success: true, data: items });

  it('Go 服务返回有效数据时应写入缓存', async () => {
    mockFetchResponse({ data: goBody([{ date: '2024-01-02', close: 400 }]) });
    const r = await fetchMissingFromGoService(['SPY'], '2024-01-01', '2024-01-31', 'test-key');
    expect(r.result.SPY['2024-01-02']).toBe(400);
    expect(r.degraded).toBe(false);
    expect(cacheMocks.writeCache).toHaveBeenCalledWith('test-key', r.result, 86400);
  });

  it('Go 服务返回 degraded 时应透传', async () => {
    mockFetchResponse({
      data: JSON.stringify({
        success: true,
        data: [{ date: '2024-01-02', close: 400 }],
        degraded: true,
      }),
    });
    const r = await fetchMissingFromGoService(['SPY'], '2024-01-01', '2024-01-31', 'test-key');
    expect(r.degraded).toBe(true);
  });

  it('Go 服务返回空数据时缓存不应写入', async () => {
    mockFetchResponse({ data: '{}' });
    const r = await fetchMissingFromGoService(['SPY'], '2024-01-01', '2024-01-31', 'test-key');
    expect(Object.keys(r.result)).toHaveLength(0);
    expect(cacheMocks.writeCache).not.toHaveBeenCalled();
  });

  it('部分 ticker 取到数据时缓存不应写入', async () => {
    const bodyFor = (ticker: string) =>
      Buffer.from(ticker === 'SPY' ? goBody([{ date: '2024-01-02', close: 400 }]) : '{}');
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: (async function* () {
        yield bodyFor(url.includes('/price/SPY') ? 'SPY' : 'QQQ');
      })(),
    }));
    const r = await fetchMissingFromGoService(
      ['SPY', 'QQQ'],
      '2024-01-01',
      '2024-01-31',
      'test-key',
    );
    expect(r.result.SPY).toBeDefined();
    expect(r.result.QQQ).toBeUndefined();
    expect(cacheMocks.writeCache).not.toHaveBeenCalled();
  });
});

describe('dataFetchService', () => {
  function makeMockJob(opts: {
    id?: string;
    state?: string;
    mode?: 'full' | 'incremental';
    progress?: number;
  }) {
    return {
      id: opts.id ?? 'job-update-001',
      data: { mode: opts.mode ?? 'full' },
      progress: opts.progress ?? 0,
      timestamp: Date.now(),
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
      expect(await getUpdateStatus()).toMatchObject({ running: false, mode: null });
    });
    it('有活跃任务时应返回运行中状态', async () => {
      queueMocks.getActiveUpdateJobs.mockResolvedValue([
        makeMockJob({ state: 'active', mode: 'incremental', progress: 50 }),
      ]);
      const { getUpdateStatus } =
        await import('../../../packages/backend/src/infrastructure/dataServices.js');
      expect(await getUpdateStatus()).toMatchObject({
        running: true,
        mode: 'incremental',
        completedTickers: 50,
      });
    });
  });

  describe('startUpdate', () => {
    it('已有进程运行时返回失败', async () => {
      queueMocks.getActiveUpdateJobs.mockResolvedValue([makeMockJob({ state: 'active' })]);
      const { startUpdate } =
        await import('../../../packages/backend/src/infrastructure/dataServices.js');
      expect(await startUpdate('full')).toMatchObject({ success: false });
    });
    it('增量模式应入队并返回成功', async () => {
      queueMocks.getActiveUpdateJobs.mockResolvedValue([]);
      queueMocks.add.mockResolvedValue({ id: 'job-inc-001' });
      const { startUpdate } =
        await import('../../../packages/backend/src/infrastructure/dataServices.js');
      const result = await startUpdate('incremental');
      expect(result).toMatchObject({ success: true, jobId: 'job-inc-001' });
      expect(queueMocks.add.mock.calls[0][1].mode).toBe('incremental');
    });
    it('全量模式应入队并返回成功', async () => {
      queueMocks.getActiveUpdateJobs.mockResolvedValue([]);
      const { startUpdate } =
        await import('../../../packages/backend/src/infrastructure/dataServices.js');
      expect(await startUpdate('full')).toMatchObject({ success: true });
    });
  });

  describe('stopUpdate', () => {
    it('没有运行的任务时应返回失败', async () => {
      queueMocks.getActiveUpdateJobs.mockResolvedValue([]);
      const { stopUpdate } =
        await import('../../../packages/backend/src/infrastructure/dataServices.js');
      expect(await stopUpdate()).toMatchObject({ success: false });
    });
    it('有运行任务时应停止', async () => {
      const job = makeMockJob({ id: 'job-running', state: 'active' });
      queueMocks.getActiveUpdateJobs.mockResolvedValue([job]);
      const { stopUpdate } =
        await import('../../../packages/backend/src/infrastructure/dataServices.js');
      const result = await stopUpdate();
      expect(result).toMatchObject({ success: true });
      expect(job.remove).toHaveBeenCalled();
    });
  });
});
