import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from '../../../packages/frontend/src/hooks/miscHooks.js';

describe('useTheme', () => {
  const storage = new Map<string, string>();
  let matchDark = false;

  beforeEach(() => {
    storage.clear();
    matchDark = false;
    document.documentElement.className = '';

    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });

    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('dark') ? matchDark : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('localStorage 有 theme 时应优先使用', () => {
    storage.set('theme', 'dark');

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');
    expect(result.current.isDark).toBe(true);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('无 localStorage 时应以 system 跟随 prefers-color-scheme: dark', () => {
    matchDark = true;

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('system');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(result.current.isDark).toBe(true);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('无 localStorage 且 prefer-color-scheme light 时 resolvedTheme 为 light', () => {
    matchDark = false;

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('system');
    expect(result.current.resolvedTheme).toBe('light');
    expect(result.current.isDark).toBe(false);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('挂载时 light 主题应设置正确的 data-theme', () => {
    storage.set('theme', 'light');
    renderHook(() => useTheme());

    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('toggleTheme 按 light → dark → system → light 循环并写入 localStorage', () => {
    storage.set('theme', 'light');

    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });
    expect(storage.get('theme')).toBe('dark');

    act(() => {
      result.current.toggleTheme();
    });
    expect(storage.get('theme')).toBe('system');

    act(() => {
      result.current.toggleTheme();
    });
    expect(storage.get('theme')).toBe('light');
  });

  it('多次 toggle 正确循环 dark → system → light', () => {
    storage.set('theme', 'dark');
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe('system');

    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe('light');
  });

  it('toggleTheme 应切换主题并写入 localStorage', () => {
    storage.set('theme', 'light');

    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('dark');
    expect(result.current.isDark).toBe(true);
    expect(storage.get('theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('system');
    expect(storage.get('theme')).toBe('system');
  });

  it('setTheme(system) 时 resolvedTheme 跟随 OS 偏好', () => {
    matchDark = true;
    storage.set('theme', 'light');

    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('system');
    });

    expect(result.current.theme).toBe('system');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(result.current.isDark).toBe(true);
    expect(storage.get('theme')).toBe('system');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
