/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useEngineHealth } from '../../../src/hooks/useEngineHealth.js';

describe('useEngineHealth', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          success: true,
          data: {
            status: 'ok',
            engine: { go: true, node: true },
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
    expect(result.current.node).toBe(true);
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
    expect(result.current.node).toBe(false);
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

  it('refresh 应重新请求健康检查', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        success: true,
        data: { status: 'degraded', engine: { go: false, node: true }, dataFetcher: false },
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
});
