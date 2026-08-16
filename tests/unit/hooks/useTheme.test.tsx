import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const storage = new Map<string, string>();
let matchDark = false;

async function renderTheme() {
  vi.resetModules();
  const { useTheme } = await import('../../../packages/frontend/src/hooks/miscHooks.js');
  return renderHook(() => useTheme());
}

describe('useTheme', () => {
  const toggle = (result: Awaited<ReturnType<typeof renderTheme>>['result']) =>
    act(() => result.current.toggleTheme());
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

  it('localStorage 有 theme 时应优先使用', async () => {
    storage.set('theme', 'dark');

    const { result } = await renderTheme();

    expect(result.current.theme).toBe('dark');
    expect(result.current.isDark).toBe(true);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('无 localStorage 时应以 system 跟随 prefers-color-scheme: dark', async () => {
    matchDark = true;

    const { result } = await renderTheme();

    expect(result.current.theme).toBe('system');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(result.current.isDark).toBe(true);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('无 localStorage 且 prefer-color-scheme light 时 resolvedTheme 为 light', async () => {
    matchDark = false;

    const { result } = await renderTheme();

    expect(result.current.theme).toBe('system');
    expect(result.current.resolvedTheme).toBe('light');
    expect(result.current.isDark).toBe(false);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('挂载时 light 主题应设置正确的 data-theme', async () => {
    storage.set('theme', 'light');
    await renderTheme();

    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('toggleTheme 按 light → dark → system → light 循环并写入 localStorage', async () => {
    storage.set('theme', 'light');

    const { result } = await renderTheme();

    toggle(result);
    expect(storage.get('theme')).toBe('dark');

    toggle(result);
    expect(storage.get('theme')).toBeUndefined();

    toggle(result);
    expect(storage.get('theme')).toBe('light');
  });

  it('多次 toggle 正确循环 dark → system → light', async () => {
    storage.set('theme', 'dark');
    const { result } = await renderTheme();

    toggle(result);
    expect(result.current.theme).toBe('system');

    toggle(result);
    expect(result.current.theme).toBe('light');
  });

  it('toggleTheme 应切换主题并写入 localStorage（system 不落盘）', async () => {
    storage.set('theme', 'light');

    const { result } = await renderTheme();

    toggle(result);

    expect(result.current.theme).toBe('dark');
    expect(result.current.isDark).toBe(true);
    expect(storage.get('theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');

    toggle(result);

    expect(result.current.theme).toBe('system');
    expect(storage.get('theme')).toBeUndefined();
  });

  it('setTheme(system) 时 resolvedTheme 跟随 OS 偏好', async () => {
    matchDark = true;
    storage.set('theme', 'light');

    const { result } = await renderTheme();

    act(() => {
      result.current.setTheme('system');
    });

    expect(result.current.theme).toBe('system');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(result.current.isDark).toBe(true);
    expect(storage.get('theme')).toBeUndefined();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
