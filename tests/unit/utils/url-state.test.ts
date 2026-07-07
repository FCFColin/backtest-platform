import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  encodeState,
  decodeState,
  readStateFromURL,
  writeStateToURL,
  clearStateFromURL,
  type ShareableState,
} from '../../../packages/frontend/src/utils/urlState.js';

const validState: ShareableState = {
  portfolios: [
    {
      id: 'p1',
      name: 'Test Portfolio',
      assets: [
        { ticker: 'VTI', weight: 60 },
        { ticker: 'BND', weight: 40 },
      ],
      rebalanceFrequency: 'quarterly',
    },
  ],
  parameters: {
    startDate: '2010-01-01',
    endDate: '2024-12-31',
    startingValue: 10000,
    adjustForInflation: false,
    rollingWindowMonths: 12,
    benchmarkTicker: 'SPY',
  },
};

// ===== Mock window =====
const mockWindow = {
  location: {
    href: 'https://example.com/',
    search: '',
  },
  history: {
    replaceState: vi.fn(),
  },
};

beforeEach(() => {
  vi.stubGlobal('window', mockWindow);
  mockWindow.location.href = 'https://example.com/';
  mockWindow.location.search = '';
  mockWindow.history.replaceState.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ===== 往返测试 =====
describe('encodeState / decodeState - 往返', () => {
  it('encode → decode 应保持状态一致', () => {
    const encoded = encodeState(validState);
    const decoded = decodeState(encoded);
    expect(decoded).toEqual(validState);
  });

  it('多次 encode 同一状态应得到相同结果（确定性）', () => {
    const e1 = encodeState(validState);
    const e2 = encodeState(validState);
    expect(e1).toBe(e2);
  });

  it('不同状态应产生不同编码', () => {
    const e1 = encodeState(validState);
    const state2: ShareableState = {
      ...validState,
      parameters: { ...validState.parameters, startingValue: 20000 },
    };
    const e2 = encodeState(state2);
    expect(e1).not.toBe(e2);
  });
});

// ===== encodeState =====
describe('encodeState', () => {
  it('返回非空字符串', () => {
    const encoded = encodeState(validState);
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);
  });

  it('输出是 base64url 格式（无 +, /, =）', () => {
    const encoded = encodeState(validState);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('包含中文的状态也能正确编码', () => {
    const state: ShareableState = {
      portfolios: [
        {
          id: 'p1',
          name: '我的组合',
          assets: [{ ticker: 'VTI', weight: 100 }],
          rebalanceFrequency: 'none',
        },
      ],
      parameters: validState.parameters,
    };
    const encoded = encodeState(state);
    const decoded = decodeState(encoded);
    expect(decoded).toEqual(state);
    expect(decoded?.portfolios[0].name).toBe('我的组合');
  });
});

// ===== decodeState =====
describe('decodeState', () => {
  it('空字符串返回 null', () => {
    expect(decodeState('')).toBeNull();
  });

  it('无效 base64 返回 null', () => {
    expect(decodeState('!!!invalid!!!')).toBeNull();
  });

  it('非 JSON 字符串返回 null', () => {
    // 有效的 base64url 但内容不是 JSON
    const notJson = btoa('not a json string')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(decodeState(notJson)).toBeNull();
  });

  it('portfolios 为空数组返回 null', () => {
    const state = { portfolios: [], parameters: validState.parameters };
    const encoded = encodeState(state as ShareableState);
    expect(decodeState(encoded)).toBeNull();
  });

  it('portfolios 不是数组返回 null', () => {
    const state = { portfolios: 'not-array', parameters: validState.parameters };
    const encoded = encodeState(state as unknown as ShareableState);
    expect(decodeState(encoded)).toBeNull();
  });

  it('portfolios 缺失返回 null', () => {
    const state = { parameters: validState.parameters };
    const encoded = encodeState(state as unknown as ShareableState);
    expect(decodeState(encoded)).toBeNull();
  });

  it('parameters 缺失返回 null', () => {
    const state = { portfolios: validState.portfolios };
    const encoded = encodeState(state as unknown as ShareableState);
    expect(decodeState(encoded)).toBeNull();
  });

  it('parameters 不是对象返回 null', () => {
    const state = { portfolios: validState.portfolios, parameters: 'not-object' };
    const encoded = encodeState(state as unknown as ShareableState);
    expect(decodeState(encoded)).toBeNull();
  });

  it('portfolio 的 assets 为空数组返回 null', () => {
    const state: ShareableState = {
      portfolios: [
        {
          id: 'p1',
          name: 'Empty',
          assets: [],
          rebalanceFrequency: 'none',
        },
      ],
      parameters: validState.parameters,
    };
    const encoded = encodeState(state);
    expect(decodeState(encoded)).toBeNull();
  });

  it('portfolio 的 assets 不是数组返回 null', () => {
    const state = {
      portfolios: [
        {
          id: 'p1',
          name: 'Bad',
          assets: 'not-array',
          rebalanceFrequency: 'none',
        },
      ],
      parameters: validState.parameters,
    };
    const encoded = encodeState(state as unknown as ShareableState);
    expect(decodeState(encoded)).toBeNull();
  });
});

// ===== readStateFromURL =====
describe('readStateFromURL', () => {
  it('URL 无 ?d= 参数返回 null', () => {
    mockWindow.location.search = '';
    expect(readStateFromURL()).toBeNull();
  });

  it('URL 有 ?d= 参数返回解码状态', () => {
    const encoded = encodeState(validState);
    mockWindow.location.search = `?d=${encoded}`;
    const result = readStateFromURL();
    expect(result).toEqual(validState);
  });

  it('URL 有无效 ?d= 参数返回 null', () => {
    mockWindow.location.search = '?d=invalid-base64!!!';
    expect(readStateFromURL()).toBeNull();
  });

  it('URL 有空 ?d= 参数返回 null', () => {
    mockWindow.location.search = '?d=';
    expect(readStateFromURL()).toBeNull();
  });
});

// ===== writeStateToURL =====
describe('writeStateToURL', () => {
  it('写入状态到 URL 并返回完整 URL', () => {
    const result = writeStateToURL(validState);
    expect(result).toContain('?d=');
    expect(mockWindow.history.replaceState).toHaveBeenCalledTimes(1);

    const [, , url] = mockWindow.history.replaceState.mock.calls[0];
    expect(url).toContain('?d=');
  });

  it('返回的 URL 包含正确的编码参数', () => {
    const result = writeStateToURL(validState);
    const url = new URL(result);
    const d = url.searchParams.get('d');
    expect(d).toBeTruthy();
    expect(decodeState(d!)).toEqual(validState);
  });

  it('调用 history.replaceState 进行无刷新更新', () => {
    writeStateToURL(validState);
    expect(mockWindow.history.replaceState).toHaveBeenCalledTimes(1);
    const [state, title] = mockWindow.history.replaceState.mock.calls[0];
    expect(state).toEqual({});
    expect(title).toBe('');
  });
});

// ===== clearStateFromURL =====
describe('clearStateFromURL', () => {
  it('清除 URL 中的 ?d= 参数', () => {
    // 模拟 URL 已包含 ?d= 参数
    const encoded = encodeState(validState);
    mockWindow.location.href = `https://example.com/?d=${encoded}`;

    clearStateFromURL();
    expect(mockWindow.history.replaceState).toHaveBeenCalledTimes(1);
    const [, , url] = mockWindow.history.replaceState.mock.calls[0];
    expect(url).not.toContain('?d=');
    expect(url).not.toContain('&d=');
  });

  it('URL 无 ?d= 参数时也不抛错', () => {
    mockWindow.location.href = 'https://example.com/';
    expect(() => clearStateFromURL()).not.toThrow();
  });
});

// ===== 特殊字符处理 =====
describe('特殊字符处理', () => {
  it('组合名称包含特殊字符能正确往返', () => {
    const state: ShareableState = {
      portfolios: [
        {
          id: 'p1',
          name: 'Test & <>"\'#/\\组合',
          assets: [{ ticker: 'VTI', weight: 100 }],
          rebalanceFrequency: 'none',
        },
      ],
      parameters: validState.parameters,
    };
    const encoded = encodeState(state);
    const decoded = decodeState(encoded);
    expect(decoded).toEqual(state);
  });

  it('ticker 包含特殊字符能正确往返', () => {
    const state: ShareableState = {
      portfolios: [
        {
          id: 'p1',
          name: 'Test',
          assets: [{ ticker: 'A&B=C#D', weight: 100 }],
          rebalanceFrequency: 'none',
        },
      ],
      parameters: validState.parameters,
    };
    const encoded = encodeState(state);
    const decoded = decodeState(encoded);
    expect(decoded).toEqual(state);
  });

  it('参数包含空格能正确往返', () => {
    const state: ShareableState = {
      portfolios: [
        {
          id: 'p1',
          name: 'With Spaces',
          assets: [{ ticker: 'VTI', weight: 100 }],
          rebalanceFrequency: 'none',
        },
      ],
      parameters: {
        ...validState.parameters,
        benchmarkTicker: 'SP Y',
      },
    };
    const encoded = encodeState(state);
    const decoded = decodeState(encoded);
    expect(decoded).toEqual(state);
  });

  it('多组合状态能正确往返', () => {
    const state: ShareableState = {
      portfolios: [
        {
          id: 'p1',
          name: 'Portfolio 1',
          assets: [
            { ticker: 'VTI', weight: 60 },
            { ticker: 'BND', weight: 40 },
          ],
          rebalanceFrequency: 'quarterly',
        },
        {
          id: 'p2',
          name: 'Portfolio 2',
          assets: [{ ticker: 'SPY', weight: 100 }],
          rebalanceFrequency: 'none',
        },
        {
          id: 'p3',
          name: 'Portfolio 3',
          assets: [
            { ticker: 'QQQ', weight: 50 },
            { ticker: 'GLD', weight: 50 },
          ],
          rebalanceFrequency: 'monthly',
        },
      ],
      parameters: validState.parameters,
    };
    const encoded = encodeState(state);
    const decoded = decodeState(encoded);
    expect(decoded).toEqual(state);
    expect(decoded?.portfolios.length).toBe(3);
  });
});
