import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { apiFetchMock, authStoreMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  authStoreMock: { logout: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('react-router', () => ({ useNavigate: vi.fn() }));
vi.mock('../../../packages/frontend/src/store/authStore', () => ({
  useAuthStore: (selector: (s: { logout: () => Promise<void> }) => unknown) =>
    selector(authStoreMock),
}));
vi.mock('../../../packages/frontend/src/utils/apiClient', () => ({
  apiFetch: apiFetchMock,
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
}));

import {
  useListState,
  usePolling,
  useNsT,
  useTickerMeta,
  useAnnouncements,
} from '../../../packages/frontend/src/hooks/miscHooks';

describe('useListState', () => {
  it('应初始化为传入数组', () => {
    const { result } = renderHook(() => useListState([1, 2], () => 0));
    expect(result.current.items).toEqual([1, 2]);
  });

  it('addItem 应追加默认值', () => {
    const { result } = renderHook(() => useListState([1], () => 42));
    act(() => result.current.addItem());
    expect(result.current.items).toEqual([1, 42]);
  });

  it('removeItem 应删除指定索引', () => {
    const { result } = renderHook(() => useListState([1, 2, 3], () => 0));
    act(() => result.current.removeItem(1));
    expect(result.current.items).toEqual([1, 3]);
  });

  it('removeItem 不应低于 minLength', () => {
    const { result } = renderHook(() => useListState([1], () => 0, 1));
    act(() => result.current.removeItem(0));
    expect(result.current.items).toEqual([1]);
  });

  it('updateItem 应更新指定索引', () => {
    const { result } = renderHook(() => useListState([{ x: 1 }], () => ({ x: 0 })));
    act(() => result.current.updateItem(0, (prev) => ({ x: prev.x + 10 })));
    expect(result.current.items[0]).toEqual({ x: 11 });
  });
});

describe('usePolling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('enabled=true 时应立即调用并按间隔轮询', () => {
    const fn = vi.fn();
    renderHook(() => usePolling(fn, 1000, { immediate: true }));
    expect(fn).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1000));
    expect(fn).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(2000));
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('immediate=false 时不立即调用', () => {
    const fn = vi.fn();
    renderHook(() => usePolling(fn, 1000, { immediate: false }));
    expect(fn).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('enabled=false 时不轮询', () => {
    const fn = vi.fn();
    renderHook(() => usePolling(fn, 1000, { enabled: false }));
    act(() => vi.advanceTimersByTime(5000));
    expect(fn).not.toHaveBeenCalled();
  });

  it('卸载时应清除定时器', () => {
    const fn = vi.fn();
    const { unmount } = renderHook(() => usePolling(fn, 1000));
    unmount();
    act(() => vi.advanceTimersByTime(5000));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('useNsT', () => {
  it('应返回翻译函数', () => {
    const { result } = renderHook(() => useNsT('common'));
    expect(typeof result.current.t).toBe('function');
  });
});

describe('useTickerMeta', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiFetchMock.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('空 ticker 时应返回 null', () => {
    const { result } = renderHook(() => useTickerMeta(''));
    expect(result.current).toBeNull();
  });

  it('应延迟请求并返回解包后的 ticker meta', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { ticker: 'AAPL', name: 'Apple', exchange: 'NASDAQ', currency: 'usd' },
      }),
    });
    const { result } = renderHook(() => useTickerMeta('AAPL'));
    expect(result.current).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/data/ticker-meta?ticker=AAPL'),
      { silent: true },
    );
    expect(result.current).toEqual({
      ticker: 'AAPL',
      name: 'Apple',
      exchange: 'NASDAQ',
      currency: 'usd',
    });
  });

  it('API 失败时应返回 null', async () => {
    apiFetchMock.mockResolvedValue({ ok: false });
    const { result } = renderHook(() => useTickerMeta('FAIL'));
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBeNull();
  });
});

describe('useAnnouncements', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
  });

  it('API 失败时应返回空列表', async () => {
    apiFetchMock.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useAnnouncements());
    await act(async () => {
      await vi.waitFor(() => expect(result.current.announcements).toEqual([]), { timeout: 2000 });
    });
  });
});
