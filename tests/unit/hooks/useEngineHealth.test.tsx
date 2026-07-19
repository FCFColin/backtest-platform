/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../../packages/frontend/src/utils/apiClient.js', () => ({
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
}));

import { useEngineHealth } from '../../../packages/frontend/src/hooks/useEngineHealth.js';

describe('useEngineHealth', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          success: true,
          data: {
            status: 'ok',
            engine: { go: true },
            dataFetcher: true,
            dataFreshness: '2024-01-01',
          },
        }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('挂载时应拉取健康状态并解析字段', async () => {
    const { result } = renderHook(() => useEngineHealth());

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });

    expect(result.current.go).toBe(true);
    expect(result.current.dataFetcher).toBe(true);
    expect(result.current.dataFreshness).toBe('2024-01-01');
  });

  it('fetch 失败时应标记 error 状态', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const { result } = renderHook(() => useEngineHealth());

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(result.current.go).toBe(false);
  });

  it('success=false 时不应更新为 ok（保持 loading 或先前状态）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ success: false }),
      }),
    );

    const { result } = renderHook(() => useEngineHealth());

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    expect(result.current.status).toBe('loading');
  });

  it('初始状态应为 loading', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    ); // 永不 resolve
    const { result } = renderHook(() => useEngineHealth());
    expect(result.current.status).toBe('loading');
  });

  it('degraded 状态应正确解析', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          success: true,
          data: {
            status: 'degraded',
            engine: { go: false },
            dataFetcher: true,
            dataFreshness: '2024-06-01',
          },
        }),
      }),
    );

    const { result } = renderHook(() => useEngineHealth());

    await waitFor(() => {
      expect(result.current.status).toBe('degraded');
    });

    expect(result.current.go).toBe(false);
    expect(result.current.dataFetcher).toBe(true);
    expect(result.current.dataFreshness).toBe('2024-06-01');
  });

  it('缺少 engine 字段时 go 应为 false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          success: true,
          data: { status: 'ok', dataFetcher: true },
        }),
      }),
    );

    const { result } = renderHook(() => useEngineHealth());

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });

    expect(result.current.go).toBe(false);
  });

  it('dataFreshness 为 null 时应正确解析', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          success: true,
          data: {
            status: 'ok',
            engine: { go: true },
            dataFetcher: true,
            dataFreshness: null,
          },
        }),
      }),
    );

    const { result } = renderHook(() => useEngineHealth());

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });

    expect(result.current.dataFreshness).toBeNull();
  });

  it('refresh 应重新请求健康检查', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        success: true,
        data: { status: 'degraded', engine: { go: false }, dataFetcher: false },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useEngineHealth());

    await waitFor(() => expect(result.current.status).toBe('degraded'));

    fetchMock.mockClear();
    await act(async () => {
      result.current.refresh();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('卸载时应清除轮询定时器', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        success: true,
        data: { status: 'ok', engine: { go: true }, dataFetcher: true },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = renderHook(() => useEngineHealth());
    // 等待初始 fetch 完成
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fetchMock.mockClear();

    unmount();

    // 推进 30 秒，但此时已卸载，不应再调用 fetch
    vi.advanceTimersByTime(30000);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
