/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from '../../../src/hooks/useTheme.js';

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
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('无 localStorage 时应跟随 prefers-color-scheme: dark', () => {
    matchDark = true;

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('无 localStorage 且 prefer-color-scheme light 时默认 light', () => {
    matchDark = false;

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('light');
    expect(result.current.isDark).toBe(false);
  });

  it('挂载时 light 主题应设置正确的 document class', () => {
    storage.set('theme', 'light');
    renderHook(() => useTheme());

    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('切换主题后 localStorage 应更新', () => {
    storage.set('theme', 'light');

    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });
    expect(storage.get('theme')).toBe('dark');

    act(() => {
      result.current.toggleTheme();
    });
    expect(storage.get('theme')).toBe('light');
  });

  it('多次 toggle 正确循环 dark → light → dark', () => {
    storage.set('theme', 'dark');
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe('light');

    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe('dark');
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
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('light');
    expect(storage.get('theme')).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });
});
