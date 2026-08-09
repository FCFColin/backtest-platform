import { describe, it, expect, beforeEach, vi } from 'vitest';

beforeEach(() => {
  localStorage.clear();
});

async function freshStore() {
  vi.resetModules();
  const mod = await import('../../../packages/frontend/src/store/settingsStore.js');
  return mod.useSettingsStore;
}

describe('SettingsStore', () => {
  it('默认 USD，写入并持久化到 localStorage', async () => {
    const store = await freshStore();
    expect(store.getState().currency).toBe('usd');
    store.getState().setCurrency('cny');
    expect(store.getState().currency).toBe('cny');
    expect(localStorage.getItem('backtest.currency')).toBe('cny');
  });

  it('localStorage 不可用时仍更新内存状态', async () => {
    const store = await freshStore();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    store.getState().setCurrency('cny');
    expect(store.getState().currency).toBe('cny');
    spy.mockRestore();
  });

  it('持久化的 cny 在重建 store 后恢复', async () => {
    localStorage.setItem('backtest.currency', 'cny');
    const store = await freshStore();
    expect(store.getState().currency).toBe('cny');
  });

  it('localStorage 存非法值时回退 USD', async () => {
    localStorage.setItem('backtest.currency', 'eur');
    const store = await freshStore();
    expect(store.getState().currency).toBe('usd');
  });
});
