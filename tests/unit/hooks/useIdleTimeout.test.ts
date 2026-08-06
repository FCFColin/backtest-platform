import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIdleTimeout } from '../../../packages/frontend/src/hooks/miscHooks';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const mockLogout = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../packages/frontend/src/store/authStore', () => ({
  useAuthStore: (selector: (s: { logout: () => Promise<void> }) => unknown) =>
    selector({ logout: mockLogout }),
}));

vi.useFakeTimers();

describe('useIdleTimeout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    localStorage.clear();
    localStorage.setItem('bt_refresh_token', 'test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('用户活动时 → 不触发登出', () => {
    renderHook(() => useIdleTimeout(60_000, true));

    window.dispatchEvent(new Event('mousemove'));

    vi.advanceTimersByTime(30_000);

    window.dispatchEvent(new Event('keydown'));

    vi.advanceTimersByTime(30_000);

    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('超时后无活动 → 触发登出并跳转', async () => {
    renderHook(() => useIdleTimeout(60_000, true));

    await vi.advanceTimersByTimeAsync(60_001);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/login?reason=session_expired', { replace: true });
  });

  it('enabled=false → 不计时，不触发登出', () => {
    renderHook(() => useIdleTimeout(60_000, false));

    vi.advanceTimersByTime(120_000);
    vi.advanceTimersByTime(60_000);

    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('timeoutMs=0 → 禁用超时', () => {
    renderHook(() => useIdleTimeout(0, true));

    vi.advanceTimersByTime(120_000);
    vi.advanceTimersByTime(60_000);

    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('登出后清除 localStorage 中的 refreshToken', async () => {
    expect(localStorage.getItem('bt_refresh_token')).toBe('test-token');

    renderHook(() => useIdleTimeout(60_000, true));

    await vi.advanceTimersByTimeAsync(60_001);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('visibilitychange 切回前台时检查超时', async () => {
    renderHook(() => useIdleTimeout(60_000, true));

    await vi.advanceTimersByTimeAsync(61_000);

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));

    await vi.advanceTimersByTimeAsync(0);

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('组件卸载时清理事件监听器和定时器', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    const { unmount } = renderHook(() => useIdleTimeout(60_000, true));
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalled();
    expect(clearIntervalSpy).toHaveBeenCalled();

    removeEventListenerSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
});
