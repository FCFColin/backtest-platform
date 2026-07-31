import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mockPortfolio,
  mockBacktestParams,
  mockBacktestResult,
} from '../../helpers/storeFixtures.js';

vi.mock('react', () => ({ startTransition: vi.fn((cb) => cb()) }));

const mockFetch = vi.fn();

vi.mock('../../../packages/frontend/src/utils/apiClient.js', () => ({
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => mockFetch(input, init),
  notifyIfDegraded: vi.fn(),
}));

const toastMock = vi.fn();
vi.mock('../../../packages/frontend/src/store/toastStore.js', () => ({
  useToastStore: { getState: () => ({ addToast: toastMock }) },
}));

import { useBacktestStore } from '../../../packages/frontend/src/store/backtestStore.js';

function mockResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function mock202(jobId: string): Response {
  return mockResponse(
    {
      success: true,
      data: { jobId, status: 'queued', statusUrl: `/api/v1/backtest/runs/${jobId}` },
    },
    202,
  );
}

function mockPollResult(status: string, extra: Record<string, unknown> = {}): Response {
  return mockResponse({
    success: true,
    data: { status, progress: status === 'completed' ? 100 : 50, ...extra },
  });
}

function setupStore(): void {
  useBacktestStore.getState().loadFromShare({
    portfolios: [mockPortfolio()],
    parameters: mockBacktestParams(),
  });
}

const store = () => useBacktestStore.getState();

describe('P0-02 executionSlice dedicated — 分支覆盖', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    toastMock.mockReset();
    setupStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const pollRun = async (jobId: string, ...responses: Response[]) => {
    mockFetch.mockResolvedValueOnce(mock202(jobId));
    for (const r of responses) mockFetch.mockResolvedValueOnce(r);
    const promise = store().runBacktest();
    for (let i = 0; i < responses.length; i++) await vi.advanceTimersByTimeAsync(600 * (i + 1));
    await promise;
  };

  it('同步 200 OK → 正常返回结果', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, data: mockBacktestResult() }));
    await store().runBacktest();
    expect(store().results).not.toBeNull();
    expect(store().isLoading).toBe(false);
  });

  it('degraded: true + degradedWarning → 正常返回结果', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        success: true,
        data: mockBacktestResult(),
        degraded: true,
        degradedWarning: 'Running in degraded mode',
      }),
    );
    await store().runBacktest();
    expect(store().results).not.toBeNull();
  });

  it('空组合 → warning toast + 不发请求', async () => {
    store().loadFromShare({ portfolios: [], parameters: mockBacktestParams() });
    await store().runBacktest();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(store().isLoading).toBe(false);
  });

  it('202 Accepted → 轮询 completed → 写入结果', async () => {
    await pollRun(
      'job-1',
      mockPollResult('completed', {
        result: { data: mockBacktestResult(), warnings: [], dateRange: null },
      }),
    );
    expect(store().results).not.toBeNull();
    expect(store().isLoading).toBe(false);
  });

  it('202 → 轮询 queued → running → completed（指数退避多轮）', async () => {
    await pollRun(
      'job-3',
      mockPollResult('queued'),
      mockPollResult('running'),
      mockPollResult('completed', {
        result: { data: mockBacktestResult(), warnings: [], dateRange: null },
      }),
    );
    expect(store().results).not.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(4); // 1 POST + 3 polls
  });

  it.each([
    ['轮询返回 HTTP 500', mockResponse({ success: false, error: 'DB error' }, 500)],
    ['轮询返回 success:false', mockResponse({ success: false, error: 'Job lost' }, 200)],
    ['轮询返回 failed 状态', mockPollResult('failed', { error: 'Engine timeout' })],
  ])('202 → %s → 错误处理', async (_n, pollRes) => {
    await pollRun('job-x', pollRes);
    expect(store().results).toBeNull();
    expect(store().isLoading).toBe(false);
  });

  it.each([
    [
      'TypeError（网络错误）',
      () => mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch')),
    ],
    [
      'HTTP 503 引擎不可用',
      () =>
        mockFetch.mockResolvedValueOnce(
          mockResponse({ success: false, error: { detail: 'Engine unavailable' } }, 503),
        ),
    ],
    [
      'AbortError（超时取消）',
      () => mockFetch.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError')),
    ],
    [
      'success:false + 嵌套 error.detail',
      () =>
        mockFetch.mockResolvedValueOnce(
          mockResponse({ success: false, error: { detail: 'Invalid params' } }),
        ),
    ],
    ['非 Error 类型抛出', () => mockFetch.mockRejectedValueOnce({ code: 42 })],
  ])('%s → 错误处理', async (_n, setup) => {
    setup();
    await store().runBacktest();
    expect(store().results).toBeNull();
    expect(store().isLoading).toBe(false);
  });

  it('第二次 runBacktest 中止前一个请求', async () => {
    mockFetch
      .mockResolvedValueOnce(new Promise(() => {})) // 永不 resolve（模拟挂起）
      .mockResolvedValueOnce(mockResponse({ success: true, data: mockBacktestResult() }));
    store().runBacktest(); // 不 await
    await store().runBacktest();
    expect(store().results).not.toBeNull();
  });
});

describe('P0-02 executionSlice — loadFromShare & getShareableState', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setupStore();
  });

  it('loadFromShare 设置组合+参数+重置结果', () => {
    const portfolios = [mockPortfolio({ id: 'p2', name: 'New Portfolio' })];
    const parameters = mockBacktestParams({ startDate: '2020-01-01' });
    store().loadFromShare({ portfolios, parameters });
    const state = store();
    expect(state.portfolios).toHaveLength(1);
    expect(state.portfolios[0].name).toBe('New Portfolio');
    expect(state.results).toBeNull();
    expect(state.hasLoadedFromShare).toBe(true);
  });

  it('getShareableState 返回当前 portfolios + parameters', () => {
    const shareable = store().getShareableState();
    expect(shareable.portfolios).toBeDefined();
    expect(shareable.parameters).toBeDefined();
  });
});
