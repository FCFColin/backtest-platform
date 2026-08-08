import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  saveNamedConfig,
  loadNamedConfigs,
  deleteNamedConfig,
} from '../../../packages/frontend/src/utils/portfolioStorage.js';
import type { Portfolio, BacktestParameters } from '@backtest/shared';

const validPortfolios: Portfolio[] = [
  {
    id: 'p1',
    name: 'Test Portfolio',
    assets: [
      { ticker: 'VTI', weight: 60 },
      { ticker: 'BND', weight: 40 },
    ],
    rebalanceFrequency: 'quarterly',
  },
];
const validParams: BacktestParameters = {
  startDate: '2010-01-01',
  endDate: '2024-12-31',
  startingValue: 10000,
  adjustForInflation: false,
  rollingWindowMonths: 12,
  benchmarkTicker: 'SPY',
};

function createLocalStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
}
const localStorageMock = createLocalStorageMock();
const unavailableStorage = (mode: 'throwGet' | 'throwSet' | 'throwRemove') => {
  const throwFn = () => {
    throw new Error('unavailable');
  };
  const noop = vi.fn();
  return {
    getItem: mode === 'throwGet' ? vi.fn(throwFn) : vi.fn(() => null),
    setItem: mode === 'throwSet' ? vi.fn(throwFn) : noop,
    removeItem: mode === 'throwRemove' ? vi.fn(throwFn) : noop,
  };
};

beforeEach(() => {
  vi.stubGlobal('localStorage', localStorageMock);
  localStorageMock.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('saveNamedConfig / loadNamedConfigs', () => {
  it('保存命名方案后能加载', () => {
    saveNamedConfig('My Config', validPortfolios, validParams);
    const configs = loadNamedConfigs();
    expect(configs.length).toBe(1);
    expect(configs[0].name).toBe('My Config');
    expect(configs[0].portfolios).toEqual(validPortfolios);
    expect(configs[0].parameters).toEqual(validParams);
    expect(configs[0].id).toBeTruthy();
    expect(configs[0].savedAt).toBeTruthy();
  });
  it('未保存时加载返回空数组', () => {
    expect(loadNamedConfigs()).toEqual([]);
  });
  it('保存多个命名方案', () => {
    saveNamedConfig('Config 1', validPortfolios, validParams);
    vi.advanceTimersByTime(10);
    saveNamedConfig('Config 2', validPortfolios, validParams);
    vi.advanceTimersByTime(10);
    saveNamedConfig('Config 3', validPortfolios, validParams);
    const configs = loadNamedConfigs();
    expect(configs.length).toBe(3);
    expect(configs.map((c) => c.name)).toEqual(['Config 1', 'Config 2', 'Config 3']);
  });
  it('每个命名方案有唯一 id', () => {
    saveNamedConfig('Config 1', validPortfolios, validParams);
    vi.advanceTimersByTime(10);
    saveNamedConfig('Config 2', validPortfolios, validParams);
    const configs = loadNamedConfigs();
    expect(configs[0].id).not.toBe(configs[1].id);
  });
  it('savedAt 是 ISO 格式时间字符串', () => {
    saveNamedConfig('Test', validPortfolios, validParams);
    const savedAt = loadNamedConfigs()[0].savedAt;
    expect(() => new Date(savedAt).toISOString()).not.toThrow();
    expect(new Date(savedAt).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });
  it.each([
    ['空名称', ''],
    ['超长名称（1000+ 字符）', 'A'.repeat(1000)],
    ['XSS payload', '<script>alert(1)</script>'],
  ])('%s 也能保存', async (_n, name) => {
    saveNamedConfig(name, validPortfolios, validParams);
    const configs = loadNamedConfigs();
    expect(configs.length).toBe(1);
    expect(configs[0].name).toBe(name);
  });
});

describe('deleteNamedConfig', () => {
  it('删除存在的命名方案', () => {
    saveNamedConfig('To Delete', validPortfolios, validParams);
    deleteNamedConfig(loadNamedConfigs()[0].id);
    expect(loadNamedConfigs().length).toBe(0);
  });
  it('删除不存在的 id 无影响', () => {
    saveNamedConfig('Config 1', validPortfolios, validParams);
    deleteNamedConfig('non-existent-id');
    expect(loadNamedConfigs().length).toBe(1);
  });
  it('删除一个后其他保留', () => {
    saveNamedConfig('Config 1', validPortfolios, validParams);
    vi.advanceTimersByTime(10);
    saveNamedConfig('Config 2', validPortfolios, validParams);
    vi.advanceTimersByTime(10);
    saveNamedConfig('Config 3', validPortfolios, validParams);
    const idToDelete = loadNamedConfigs()[1].id;
    deleteNamedConfig(idToDelete);
    const after = loadNamedConfigs();
    expect(after.length).toBe(2);
    expect(after.find((c) => c.id === idToDelete)).toBeUndefined();
    expect(after.find((c) => c.name === 'Config 1')).toBeTruthy();
    expect(after.find((c) => c.name === 'Config 3')).toBeTruthy();
  });
  it('空列表中删除不抛错', () => {
    expect(() => deleteNamedConfig('any-id')).not.toThrow();
  });
});

describe('localStorage 不可用 - 优雅降级', () => {
  it.each([
    ['saveNamedConfig', () => saveNamedConfig('Test', validPortfolios, validParams), 'throwSet'],
    ['deleteNamedConfig', () => deleteNamedConfig('any-id'), 'throwSet'],
  ])('%s 不抛错', (_n, fn, mode) => {
    vi.stubGlobal('localStorage', unavailableStorage(mode as string));
    expect(() => fn()).not.toThrow();
  });
  it.each([['loadNamedConfigs', () => loadNamedConfigs(), []]])(
    '%s 返回默认值',
    (_n, fn, expected) => {
      vi.stubGlobal('localStorage', unavailableStorage('throwGet'));
      expect(fn()).toEqual(expected);
    },
  );
});

describe('损坏数据恢复', () => {
  it.each([['backtest-saved-configs', () => loadNamedConfigs(), [], 'not valid json{{{']])(
    'localStorage 中 %s 应返回默认值',
    (key, fn, expected, raw) => {
      localStorage.setItem(key, raw);
      expect(fn()).toEqual(expected);
    },
  );
});
