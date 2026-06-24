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
} from '../../../src/utils/portfolioStorage.js';
import type { Portfolio, BacktestParameters } from '../../../shared/types.js';

const validPortfolios: Portfolio[] = [{
  id: 'p1',
  name: 'Test Portfolio',
  assets: [{ ticker: 'VTI', weight: 60 }, { ticker: 'BND', weight: 40 }],
  rebalanceFrequency: 'quarterly',
}];

const validParams: BacktestParameters = {
  startDate: '2010-01-01',
  endDate: '2024-12-31',
  startingValue: 10000,
  adjustForInflation: false,
  rollingWindowMonths: 12,
  benchmarkTicker: 'SPY',
};

// ===== Mock localStorage =====
function createLocalStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
}

const localStorageMock = createLocalStorageMock();

beforeEach(() => {
  vi.stubGlobal('localStorage', localStorageMock);
  localStorageMock.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // 使用假时间确保 saveNamedConfig 生成的 id（基于 Date.now()）唯一
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ===== savePortfolios / loadPortfolios =====
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
      { id: 'p1', name: 'Portfolio 1', assets: [{ ticker: 'VTI', weight: 100 }], rebalanceFrequency: 'none' },
      { id: 'p2', name: 'Portfolio 2', assets: [{ ticker: 'SPY', weight: 50 }, { ticker: 'BND', weight: 50 }], rebalanceFrequency: 'quarterly' },
      { id: 'p3', name: 'Portfolio 3', assets: [{ ticker: 'QQQ', weight: 100 }], rebalanceFrequency: 'monthly' },
    ];
    savePortfolios(portfolios);
    expect(loadPortfolios()).toEqual(portfolios);
  });

  it('覆盖保存：第二次保存替换第一次', () => {
    savePortfolios(validPortfolios);
    const newPortfolios: Portfolio[] = [{
      id: 'p2', name: 'New', assets: [{ ticker: 'SPY', weight: 100 }], rebalanceFrequency: 'none',
    }];
    savePortfolios(newPortfolios);
    expect(loadPortfolios()).toEqual(newPortfolios);
    expect(loadPortfolios()?.length).toBe(1);
  });
});

// ===== saveParameters / loadParameters =====
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
    const newParams: BacktestParameters = { ...validParams, startingValue: 50000 };
    saveParameters(newParams);
    expect(loadParameters()).toEqual(newParams);
  });
});

// ===== saveNamedConfig / loadNamedConfigs =====
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
    expect(configs[0].name).toBe('Config 1');
    expect(configs[1].name).toBe('Config 2');
    expect(configs[2].name).toBe('Config 3');
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
    const configs = loadNamedConfigs();
    const savedAt = configs[0].savedAt;
    expect(() => new Date(savedAt).toISOString()).not.toThrow();
    expect(new Date(savedAt).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('空名称也能保存', () => {
    saveNamedConfig('', validPortfolios, validParams);
    const configs = loadNamedConfigs();
    expect(configs.length).toBe(1);
    expect(configs[0].name).toBe('');
  });

  it('超长名称（1000+ 字符）也能保存', () => {
    const longName = 'A'.repeat(1000);
    saveNamedConfig(longName, validPortfolios, validParams);
    const configs = loadNamedConfigs();
    expect(configs.length).toBe(1);
    expect(configs[0].name).toBe(longName);
    expect(configs[0].name.length).toBe(1000);
  });

  it('XSS payload 在名称中仅作为字符串存储（不执行）', () => {
    const xssName = '<script>alert(1)</script>';
    saveNamedConfig(xssName, validPortfolios, validParams);
    const configs = loadNamedConfigs();
    expect(configs.length).toBe(1);
    expect(configs[0].name).toBe(xssName);
    // 确保存储的是纯字符串，不会被解析为 HTML
    const raw = localStorage.getItem('backtest-saved-configs');
    expect(raw).toContain('<script>alert(1)</script>');
  });
});

// ===== deleteNamedConfig =====
describe('deleteNamedConfig', () => {
  it('删除存在的命名方案', () => {
    saveNamedConfig('To Delete', validPortfolios, validParams);
    const configs = loadNamedConfigs();
    const id = configs[0].id;
    deleteNamedConfig(id);
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
    const configs = loadNamedConfigs();
    const idToDelete = configs[1].id;
    deleteNamedConfig(idToDelete);
    const after = loadNamedConfigs();
    expect(after.length).toBe(2);
    expect(after.find(c => c.id === idToDelete)).toBeUndefined();
    expect(after.find(c => c.name === 'Config 1')).toBeTruthy();
    expect(after.find(c => c.name === 'Config 3')).toBeTruthy();
  });

  it('空列表中删除不抛错', () => {
    expect(() => deleteNamedConfig('any-id')).not.toThrow();
  });
});

// ===== clearAllData =====
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

// ===== localStorage 不可用 - 优雅降级 =====
describe('localStorage 不可用 - 优雅降级', () => {
  it('savePortfolios 在 localStorage 不可用时不抛错', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => { throw new Error('unavailable'); }),
      removeItem: vi.fn(),
    });
    expect(() => savePortfolios(validPortfolios)).not.toThrow();
  });

  it('loadPortfolios 在 localStorage 不可用时返回 null', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => { throw new Error('unavailable'); }),
    });
    expect(loadPortfolios()).toBeNull();
  });

  it('saveParameters 在 localStorage 不可用时不抛错', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => { throw new Error('unavailable'); }),
      removeItem: vi.fn(),
    });
    expect(() => saveParameters(validParams)).not.toThrow();
  });

  it('loadParameters 在 localStorage 不可用时返回 null', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => { throw new Error('unavailable'); }),
    });
    expect(loadParameters()).toBeNull();
  });

  it('saveNamedConfig 在 localStorage 不可用时不抛错', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => { throw new Error('unavailable'); }),
      removeItem: vi.fn(),
    });
    expect(() => saveNamedConfig('Test', validPortfolios, validParams)).not.toThrow();
  });

  it('loadNamedConfigs 在 localStorage 不可用时返回空数组', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => { throw new Error('unavailable'); }),
    });
    expect(loadNamedConfigs()).toEqual([]);
  });

  it('deleteNamedConfig 在 localStorage 不可用时不抛错', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => { throw new Error('unavailable'); }),
      removeItem: vi.fn(),
    });
    expect(() => deleteNamedConfig('any-id')).not.toThrow();
  });

  it('clearAllData 在 localStorage 不可用时不抛错', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(() => { throw new Error('unavailable'); }),
    });
    expect(() => clearAllData()).not.toThrow();
  });
});

// ===== 损坏数据恢复 =====
describe('损坏数据恢复', () => {
  it('localStorage 中 JSON 损坏时 loadPortfolios 返回 null', () => {
    localStorage.setItem('backtest-portfolios', 'not valid json{{{');
    expect(loadPortfolios()).toBeNull();
  });

  it('localStorage 中 JSON 损坏时 loadParameters 返回 null', () => {
    localStorage.setItem('backtest-params', 'not valid json{{{');
    expect(loadParameters()).toBeNull();
  });

  it('localStorage 中 JSON 损坏时 loadNamedConfigs 返回空数组', () => {
    localStorage.setItem('backtest-saved-configs', 'not valid json{{{');
    expect(loadNamedConfigs()).toEqual([]);
  });

  it('loadPortfolios 在数据为 null 字符串时返回 null', () => {
    localStorage.setItem('backtest-portfolios', 'null');
    expect(loadPortfolios()).toBeNull();
  });
});
