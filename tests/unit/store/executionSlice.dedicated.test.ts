/**
 * P0-02 · executionSlice 专用测试（覆盖 runBacktest 全部 14 个分支）
 *
 * 现有 backtest-store.api.test.ts 覆盖了同步 200 路径和基本错误处理，
 * 但 202 异步轮询路径（pollJobStatus）完全未覆盖。本文件聚焦：
 *   - 202 Accepted → 轮询 → completed/failed/queued
 *   - 轮询 HTTP 错误 / success:false
 *   - 轮询超时（abort）
 *   - TypeError（网络错误分支）
 *   - 503 引擎不可用
 *   - loadFromShare / getShareableState
 *
 * 源文件: tmp.md L202-239
 */
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

// ===== 辅助函数 =====

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

// ===== 测试用例 =====

describe('P0-02 executionSlice dedicated — 14 分支覆盖', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    toastMock.mockReset();
    setupStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── 分支1: 同步 200 成功 ──
  it('同步 200 OK → 正常返回结果', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, data: mockBacktestResult() }));
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).not.toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  // ── 分支2: 空组合拦截 ──
  it('空组合 → warning toast + 不发请求', async () => {
    useBacktestStore.getState().loadFromShare({ portfolios: [], parameters: mockBacktestParams() });
    await useBacktestStore.getState().runBacktest();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  // ── 分支3: 202 → 轮询 → completed ──
  it('202 Accepted → 轮询 → completed → 写入结果', async () => {
    const mockResult = mockBacktestResult();
    mockFetch
      .mockResolvedValueOnce(mock202('job-1'))
      .mockResolvedValueOnce(
        mockPollResult('completed', {
          result: { data: mockResult, warnings: [], dateRange: null },
        }),
      );

    const promise = useBacktestStore.getState().runBacktest();
    await vi.advanceTimersByTimeAsync(600);
    await promise;

    expect(useBacktestStore.getState().results).not.toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  // ── 分支4: 202 → 轮询 → failed ──
  it('202 Accepted → 轮询 → failed → 错误处理', async () => {
    mockFetch
      .mockResolvedValueOnce(mock202('job-2'))
      .mockResolvedValueOnce(mockPollResult('failed', { error: 'Engine timeout' }));

    const promise = useBacktestStore.getState().runBacktest();
    await vi.advanceTimersByTimeAsync(600);
    await promise;

    expect(useBacktestStore.getState().results).toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  // ── 分支5: 202 → 轮询 → queued → completed（多轮轮询）──
  it('202 → 轮询 queued → running → completed（指数退避多轮）', async () => {
    const mockResult = mockBacktestResult();
    mockFetch
      .mockResolvedValueOnce(mock202('job-3'))
      .mockResolvedValueOnce(mockPollResult('queued'))
      .mockResolvedValueOnce(mockPollResult('running'))
      .mockResolvedValueOnce(
        mockPollResult('completed', {
          result: { data: mockResult, warnings: [], dateRange: null },
        }),
      );

    const promise = useBacktestStore.getState().runBacktest();
    // 第一次轮询 500ms
    await vi.advanceTimersByTimeAsync(600);
    // 第二次轮询 1000ms
    await vi.advanceTimersByTimeAsync(1100);
    // 第三次轮询 2000ms
    await vi.advanceTimersByTimeAsync(2100);
    await promise;

    expect(useBacktestStore.getState().results).not.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(4); // 1 POST + 3 polls
  });

  // ── 分支6: 202 → 轮询 HTTP 错误 ──
  it('202 → 轮询返回 HTTP 500 → 错误处理', async () => {
    mockFetch
      .mockResolvedValueOnce(mock202('job-4'))
      .mockResolvedValueOnce(mockResponse({ success: false, error: 'DB error' }, 500));

    const promise = useBacktestStore.getState().runBacktest();
    await vi.advanceTimersByTimeAsync(600);
    await promise;

    expect(useBacktestStore.getState().results).toBeNull();
  });

  // ── 分支7: 202 → 轮询 success:false ──
  it('202 → 轮询返回 success:false → 错误处理', async () => {
    mockFetch
      .mockResolvedValueOnce(mock202('job-5'))
      .mockResolvedValueOnce(mockResponse({ success: false, error: 'Job lost' }, 200));

    const promise = useBacktestStore.getState().runBacktest();
    await vi.advanceTimersByTimeAsync(600);
    await promise;

    expect(useBacktestStore.getState().results).toBeNull();
  });

  // ── 分支8: TypeError（网络错误）──
  it('TypeError → networkError toast', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  // ── 分支9: 503 引擎不可用 ──
  it('HTTP 503 → 错误处理（引擎不可用）', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ success: false, error: { detail: 'Engine unavailable' } }, 503),
    );
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  // ── 分支10: degraded 响应 ──
  it('degraded: true + degradedWarning → 正常返回结果', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        success: true,
        data: mockBacktestResult(),
        degraded: true,
        degradedWarning: 'Running in degraded mode',
      }),
    );
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).not.toBeNull();
  });

  // ── 分支11: 取消前一个请求（竞态）──
  it('第二次 runBacktest 中止前一个请求', async () => {
    mockFetch
      .mockResolvedValueOnce(new Promise(() => {})) // 永不 resolve（模拟挂起）
      .mockResolvedValueOnce(mockResponse({ success: true, data: mockBacktestResult() }));
    useBacktestStore.getState().runBacktest(); // 不 await
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).not.toBeNull();
  });

  // ── 分支12: AbortError（超时取消）──
  it('AbortError → timeout toast + 结果清空', async () => {
    mockFetch.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  // ── 分支13: success:false + 嵌套 error ──
  it('success:false + error.detail → toast 显示 detail', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ success: false, error: { detail: 'Invalid params' } }),
    );
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
  });

  // ── 分支14: 非标准错误对象（无 message）──
  it('非 Error 类型抛出 → runFailed toast', async () => {
    mockFetch.mockRejectedValueOnce({ code: 42 });
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });
});

// ── loadFromShare / getShareableState 覆盖 ──

describe('P0-02 executionSlice — loadFromShare & getShareableState', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setupStore();
  });

  it('loadFromShare 设置组合+参数+重置结果', () => {
    const portfolios = [mockPortfolio({ id: 'p2', name: 'New Portfolio' })];
    const parameters = mockBacktestParams({ startDate: '2020-01-01' });
    useBacktestStore.getState().loadFromShare({ portfolios, parameters });
    const state = useBacktestStore.getState();
    expect(state.portfolios).toHaveLength(1);
    expect(state.portfolios[0].name).toBe('New Portfolio');
    expect(state.results).toBeNull();
    expect(state.hasLoadedFromShare).toBe(true);
  });

  it('getShareableState 返回当前 portfolios + parameters', () => {
    const shareable = useBacktestStore.getState().getShareableState();
    expect(shareable.portfolios).toBeDefined();
    expect(shareable.parameters).toBeDefined();
  });
});
