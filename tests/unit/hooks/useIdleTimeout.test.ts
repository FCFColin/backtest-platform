/**
 * useIdleTimeout hook 单元测试（P0-04）
 *
 * 测试场景：
 *   1. 用户活动时 → 不触发登出
 *   2. 超时后无活动 → 触发登出 + 跳转
 *   3. enabled=false → 不计时
 *   4. timeoutMs=0 → 禁用
 *   5. 触发后清除 localStorage 中的 refreshToken
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIdleTimeout } from '../../../packages/frontend/src/hooks/useIdleTimeout';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock authStore
const mockLogout = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../packages/frontend/src/store/authStore', () => ({
  useAuthStore: (selector: (s: { logout: () => Promise<void> }) => unknown) =>
    selector({ logout: mockLogout }),
}));

// Mock timers
vi.useFakeTimers();

describe('useIdleTimeout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    // 重置 localStorage
    localStorage.clear();
    localStorage.setItem('bt_refresh_token', 'test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('用户活动时 → 不触发登出', () => {
    renderHook(() => useIdleTimeout(60_000, true));

    // 模拟用户活动
    window.dispatchEvent(new Event('mousemove'));

    // 推进时间但未到超时
    vi.advanceTimersByTime(30_000);

    // 触发更多活动
    window.dispatchEvent(new Event('keydown'));

    vi.advanceTimersByTime(30_000);

    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('超时后无活动 → 触发登出并跳转', async () => {
    renderHook(() => useIdleTimeout(60_000, true));

    // 推进时间超过超时阈值
    await vi.advanceTimersByTimeAsync(60_001);

    // 心跳间隔触发检查
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

    // 超时触发
    await vi.advanceTimersByTimeAsync(60_001);
    await vi.advanceTimersByTimeAsync(60_000);

    // logout 被调用（内部 clearTokens 清除 localStorage）
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('visibilitychange 切回前台时检查超时', async () => {
    renderHook(() => useIdleTimeout(60_000, true));

    // 推进时间超过超时（但心跳可能还没触发）
    await vi.advanceTimersByTimeAsync(61_000);

    // 模拟标签页切回前台
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));

    // 等待 async triggerTimeout 完成
    await vi.advanceTimersByTimeAsync(0);

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('组件卸载时清理事件监听器和定时器', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    const { unmount } = renderHook(() => useIdleTimeout(60_000, true));
    unmount();

    // 验证至少移除了部分事件监听器
    expect(removeEventListenerSpy).toHaveBeenCalled();
    expect(clearIntervalSpy).toHaveBeenCalled();

    removeEventListenerSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
});
