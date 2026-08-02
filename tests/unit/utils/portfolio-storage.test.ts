import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  savePortfolios,
  loadPortfolios,
  saveParameters,
  loadParameters,
  saveNamedConfig,
  loadNamedConfigs,
  deleteNamedConfig,
  clearAllData,
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

describe('savePortfolios / loadPortfolios', () => {
  it('保存后能正确加载', () => {
    savePortfolios(validPortfolios);
    expect(loadPortfolios()).toEqual(validPortfolios);
  });
  it('未保存时加载返回 null', () => {
    expect(loadPortfolios()).toBeNull();
  });
  it('保存空数组也能正确加载', () => {
    savePortfolios([]);
    expect(loadPortfolios()).toEqual([]);
  });
  it('保存多个组合', () => {
    const portfolios: Portfolio[] = [
      {
        id: 'p1',
        name: 'Portfolio 1',
        assets: [{ ticker: 'VTI', weight: 100 }],
        rebalanceFrequency: 'none',
      },
      {
        id: 'p2',
        name: 'Portfolio 2',
        assets: [
          { ticker: 'SPY', weight: 50 },
          { ticker: 'BND', weight: 50 },
        ],
        rebalanceFrequency: 'quarterly',
      },
      {
        id: 'p3',
        name: 'Portfolio 3',
        assets: [{ ticker: 'QQQ', weight: 100 }],
        rebalanceFrequency: 'monthly',
      },
    ];
    savePortfolios(portfolios);
    expect(loadPortfolios()).toEqual(portfolios);
  });
  it('覆盖保存：第二次保存替换第一次', () => {
    savePortfolios(validPortfolios);
    const np: Portfolio[] = [
      {
        id: 'p2',
        name: 'New',
        assets: [{ ticker: 'SPY', weight: 100 }],
        rebalanceFrequency: 'none',
      },
    ];
    savePortfolios(np);
    expect(loadPortfolios()).toEqual(np);
    expect(loadPortfolios()?.length).toBe(1);
  });
});

describe('saveParameters / loadParameters', () => {
  it('保存后能正确加载', () => {
    saveParameters(validParams);
    expect(loadParameters()).toEqual(validParams);
  });
  it('未保存时加载返回 null', () => {
    expect(loadParameters()).toBeNull();
  });
  it('覆盖保存', () => {
    saveParameters(validParams);
    const np: BacktestParameters = { ...validParams, startingValue: 50000 };
    saveParameters(np);
    expect(loadParameters()).toEqual(np);
  });
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

describe('clearAllData', () => {
  it('清除所有存储数据', () => {
    savePortfolios(validPortfolios);
    saveParameters(validParams);
    saveNamedConfig('Test', validPortfolios, validParams);
    clearAllData();
    expect(loadPortfolios()).toBeNull();
    expect(loadParameters()).toBeNull();
    expect(loadNamedConfigs()).toEqual([]);
  });
  it('无数据时清除不抛错', () => {
    expect(() => clearAllData()).not.toThrow();
  });
});

describe('localStorage 不可用 - 优雅降级', () => {
  it.each([
    ['savePortfolios', () => savePortfolios(validPortfolios), 'throwSet'],
    ['saveParameters', () => saveParameters(validParams), 'throwSet'],
    ['saveNamedConfig', () => saveNamedConfig('Test', validPortfolios, validParams), 'throwSet'],
    ['deleteNamedConfig', () => deleteNamedConfig('any-id'), 'throwSet'],
    ['clearAllData', () => clearAllData(), 'throwRemove'],
  ])('%s 不抛错', (_n, fn, mode) => {
    vi.stubGlobal('localStorage', unavailableStorage(mode as string));
    expect(() => fn()).not.toThrow();
  });
  it.each([
    ['loadPortfolios', () => loadPortfolios(), null],
    ['loadParameters', () => loadParameters(), null],
    ['loadNamedConfigs', () => loadNamedConfigs(), []],
  ])('%s 返回默认值', (_n, fn, expected) => {
    vi.stubGlobal('localStorage', unavailableStorage('throwGet'));
    expect(fn()).toEqual(expected);
  });
});

describe('损坏数据恢复', () => {
  it.each([
    ['backtest-portfolios', () => loadPortfolios(), null],
    ['backtest-params', () => loadParameters(), null],
    ['backtest-saved-configs', () => loadNamedConfigs(), []],
  ])('localStorage 中 %s JSON 损坏时返回默认值', (key, fn, expected) => {
    localStorage.setItem(key, 'not valid json{{{');
    expect(fn()).toEqual(expected);
  });
  it('loadPortfolios 在数据为 null 字符串时返回 null', () => {
    localStorage.setItem('backtest-portfolios', 'null');
    expect(loadPortfolios()).toBeNull();
  });
});
