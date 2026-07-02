import { describe, it, expect } from 'vitest';
import {
  SIM_TICKERS,
  ETF_PRESETS,
  ALL_TICKER_PRESETS,
  filterTickers,
} from '../../../src/utils/tickerPresets.js';

// ===== 数据完整性 =====
describe('TickerPresets - 数据完整性', () => {
  it('SIM_TICKERS 所有预设都有必需字段（ticker/name/category）', () => {
    for (const preset of SIM_TICKERS) {
      expect(preset.ticker).toBeTruthy();
      expect(typeof preset.ticker).toBe('string');
      expect(preset.name).toBeTruthy();
      expect(typeof preset.name).toBe('string');
      expect(preset.category).toBeTruthy();
      expect(typeof preset.category).toBe('string');
    }
  });

  it('ETF_PRESETS 所有预设都有必需字段（ticker/name/category）', () => {
    for (const preset of ETF_PRESETS) {
      expect(preset.ticker).toBeTruthy();
      expect(typeof preset.ticker).toBe('string');
      expect(preset.name).toBeTruthy();
      expect(typeof preset.name).toBe('string');
      expect(preset.category).toBeTruthy();
      expect(typeof preset.category).toBe('string');
    }
  });

  it('ALL_TICKER_PRESETS 是 SIM_TICKERS 与 ETF_PRESETS 的合并', () => {
    expect(ALL_TICKER_PRESETS.length).toBe(SIM_TICKERS.length + ETF_PRESETS.length);
    // SIM_TICKERS 在前
    for (let i = 0; i < SIM_TICKERS.length; i++) {
      expect(ALL_TICKER_PRESETS[i]).toEqual(SIM_TICKERS[i]);
    }
    // ETF_PRESETS 在后
    for (let i = 0; i < ETF_PRESETS.length; i++) {
      expect(ALL_TICKER_PRESETS[SIM_TICKERS.length + i]).toEqual(ETF_PRESETS[i]);
    }
  });

  it('SIM_TICKERS 非空', () => {
    expect(SIM_TICKERS.length).toBeGreaterThan(0);
  });

  it('ETF_PRESETS 非空', () => {
    expect(ETF_PRESETS.length).toBeGreaterThan(0);
  });
});

// ===== 无重复 ticker =====
describe('TickerPresets - 无重复', () => {
  it('SIM_TICKERS 内无重复 ticker', () => {
    const tickers = SIM_TICKERS.map((p) => p.ticker);
    const unique = new Set(tickers);
    expect(unique.size).toBe(tickers.length);
  });

  it('ETF_PRESETS 内无重复 ticker', () => {
    const tickers = ETF_PRESETS.map((p) => p.ticker);
    const unique = new Set(tickers);
    expect(unique.size).toBe(tickers.length);
  });

  it('ALL_TICKER_PRESETS 内无重复 ticker', () => {
    const tickers = ALL_TICKER_PRESETS.map((p) => p.ticker);
    const unique = new Set(tickers);
    expect(unique.size).toBe(tickers.length);
  });
});

// ===== 分类非空 =====
describe('TickerPresets - 分类非空', () => {
  it('SIM_TICKERS 所有分类非空', () => {
    for (const preset of SIM_TICKERS) {
      expect(preset.category.length).toBeGreaterThan(0);
    }
  });

  it('ETF_PRESETS 所有分类非空', () => {
    for (const preset of ETF_PRESETS) {
      expect(preset.category.length).toBeGreaterThan(0);
    }
  });

  it('SIM_TICKERS 所有分类为 SIM', () => {
    for (const preset of SIM_TICKERS) {
      expect(preset.category).toBe('SIM');
    }
  });
});

// ===== ticker 格式 =====
describe('TickerPresets - ticker 格式', () => {
  it('SIM_TICKERS 所有 ticker 以 SIM 结尾', () => {
    for (const preset of SIM_TICKERS) {
      expect(preset.ticker.endsWith('SIM')).toBe(true);
    }
  });

  it('ETF_PRESETS 所有 ticker 为大写字母', () => {
    for (const preset of ETF_PRESETS) {
      expect(preset.ticker).toMatch(/^[A-Z]+$/);
    }
  });

  it('所有 ticker 长度在 1-10 之间', () => {
    for (const preset of ALL_TICKER_PRESETS) {
      expect(preset.ticker.length).toBeGreaterThanOrEqual(1);
      expect(preset.ticker.length).toBeLessThanOrEqual(10);
    }
  });

  it('所有 name 非空字符串', () => {
    for (const preset of ALL_TICKER_PRESETS) {
      expect(preset.name.length).toBeGreaterThan(0);
    }
  });
});

// ===== filterTickers =====
describe('filterTickers', () => {
  it('空输入返回空数组', () => {
    expect(filterTickers('')).toEqual([]);
  });

  it('null 输入返回空数组', () => {
    expect(filterTickers(null as unknown as string)).toEqual([]);
  });

  it('undefined 输入返回空数组', () => {
    expect(filterTickers(undefined as unknown as string)).toEqual([]);
  });

  it('按 ticker 前缀匹配（大写输入）', () => {
    const result = filterTickers('SPY');
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((p) => p.ticker === 'SPYSIM')).toBe(true);
    expect(result.some((p) => p.ticker === 'SPY')).toBe(true);
  });

  it('按 ticker 前缀匹配（小写自动转大写）', () => {
    const result = filterTickers('spy');
    expect(result.some((p) => p.ticker === 'SPYSIM')).toBe(true);
    expect(result.some((p) => p.ticker === 'SPY')).toBe(true);
  });

  it('按 name 包含匹配（中文）', () => {
    const result = filterTickers('债券');
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((p) => p.name.includes('债券'))).toBe(true);
  });

  it('按 name 包含匹配（英文）', () => {
    const result = filterTickers('ETF');
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((p) => p.name.includes('ETF'))).toBe(true);
  });

  it('limit 参数限制返回数量', () => {
    const result = filterTickers('S', 3);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('默认 limit 为 8', () => {
    const result = filterTickers('S');
    expect(result.length).toBeLessThanOrEqual(8);
  });

  it('无匹配时返回空数组', () => {
    expect(filterTickers('ZZZZZZ')).toEqual([]);
  });

  it('单字符输入也能匹配', () => {
    const result = filterTickers('V');
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((p) => p.ticker.startsWith('V'))).toBe(true);
  });

  it('limit=0 返回空数组', () => {
    const result = filterTickers('S', 0);
    expect(result.length).toBe(0);
  });

  it('同时按 ticker 和 name 匹配的结果合并', () => {
    // 'Bond' 匹配 name，'BND' 匹配 ticker
    const result = filterTickers('BND');
    expect(result.some((p) => p.ticker === 'BND')).toBe(true);
    expect(result.some((p) => p.ticker === 'BNDSIM')).toBe(true);
  });
});
