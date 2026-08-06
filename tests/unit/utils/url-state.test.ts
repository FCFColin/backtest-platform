import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  encodeState,
  decodeState,
  readStateFromURL,
  writeStateToURL,
  clearStateFromURL,
  type ShareableState,
} from '../../../packages/frontend/src/utils/portfolioStorage.js';

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

const mockWindow = {
  location: { href: 'https://example.com/', search: '' },
  history: { replaceState: vi.fn() },
};

beforeEach(() => {
  vi.stubGlobal('window', mockWindow);
  mockWindow.location.href = 'https://example.com/';
  mockWindow.location.search = '';
  mockWindow.history.replaceState.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

function makeState(
  name: string,
  ticker: string,
  params?: Partial<typeof validState.parameters>,
): ShareableState {
  return {
    portfolios: [{ id: 'p1', name, assets: [{ ticker, weight: 100 }], rebalanceFrequency: 'none' }],
    parameters: { ...validState.parameters, ...params },
  };
}

function encodeInvalid(state: unknown): string {
  return encodeState(state as ShareableState);
}

describe('encodeState / decodeState - 往返', () => {
  it('encode → decode 应保持状态一致', () => {
    const encoded = encodeState(validState);
    expect(decodeState(encoded)).toEqual(validState);
  });
  it('多次 encode 同一状态应得到相同结果（确定性）', () => {
    expect(encodeState(validState)).toBe(encodeState(validState));
  });
  it('不同状态应产生不同编码', () => {
    const e1 = encodeState(validState);
    const e2 = encodeState({
      ...validState,
      parameters: { ...validState.parameters, startingValue: 20000 },
    });
    expect(e1).not.toBe(e2);
  });
});

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
    const state = makeState('我的组合', 'VTI');
    const decoded = decodeState(encodeState(state));
    expect(decoded).toEqual(state);
    expect(decoded?.portfolios[0].name).toBe('我的组合');
  });
});

describe('decodeState', () => {
  it.each([
    ['空字符串', ''],
    ['无效 base64', '!!!invalid!!!'],
    [
      '非 JSON',
      btoa('not a json string').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    ],
  ])('%s 返回 null', (_label, input) => {
    expect(decodeState(input)).toBeNull();
  });
  it.each([
    ['portfolios 为空数组', { portfolios: [], parameters: validState.parameters }],
    ['portfolios 不是数组', { portfolios: 'not-array', parameters: validState.parameters }],
    ['portfolios 缺失', { parameters: validState.parameters }],
    ['parameters 缺失', { portfolios: validState.portfolios }],
    ['parameters 不是对象', { portfolios: validState.portfolios, parameters: 'not-object' }],
    [
      'portfolio 的 assets 为空数组',
      {
        portfolios: [{ id: 'p1', name: 'Empty', assets: [], rebalanceFrequency: 'none' }],
        parameters: validState.parameters,
      },
    ],
    [
      'portfolio 的 assets 不是数组',
      {
        portfolios: [{ id: 'p1', name: 'Bad', assets: 'not-array', rebalanceFrequency: 'none' }],
        parameters: validState.parameters,
      },
    ],
  ])('%s 返回 null', (_n, state) => {
    expect(decodeState(encodeInvalid(state))).toBeNull();
  });
});

describe('readStateFromURL', () => {
  it.each([
    ['URL 无 ?d= 参数返回 null', '', null],
    ['URL 有 ?d= 参数返回解码状态', `?d=${encodeState(validState)}`, validState],
    ['URL 有无效 ?d= 参数返回 null', '?d=invalid-base64!!!', null],
    ['URL 有空 ?d= 参数返回 null', '?d=', null],
  ] as const)('%s', (_n, search, expected) => {
    mockWindow.location.search = search;
    expect(readStateFromURL()).toEqual(expected);
  });
});

describe('writeStateToURL', () => {
  it('写入状态到 URL 并返回完整 URL', () => {
    const result = writeStateToURL(validState);
    expect(result).toContain('?d=');
    expect(mockWindow.history.replaceState).toHaveBeenCalledTimes(1);
    expect(mockWindow.history.replaceState.mock.calls[0][2]).toContain('?d=');
  });
  it('返回的 URL 包含正确的编码参数', () => {
    const d = new URL(writeStateToURL(validState)).searchParams.get('d');
    expect(d).toBeTruthy();
    expect(decodeState(d!)).toEqual(validState);
  });
  it('调用 history.replaceState 进行无刷新更新', () => {
    writeStateToURL(validState);
    const [state, title] = mockWindow.history.replaceState.mock.calls[0];
    expect(state).toEqual({});
    expect(title).toBe('');
  });
});

describe('clearStateFromURL', () => {
  it('清除 URL 中的 ?d= 参数', () => {
    mockWindow.location.href = `https://example.com/?d=${encodeState(validState)}`;
    clearStateFromURL();
    expect(mockWindow.history.replaceState).toHaveBeenCalledTimes(1);
    const url = mockWindow.history.replaceState.mock.calls[0][2] as string;
    expect(url).not.toContain('?d=');
    expect(url).not.toContain('&d=');
  });
  it('URL 无 ?d= 参数时也不抛错', () => {
    mockWindow.location.href = 'https://example.com/';
    expect(() => clearStateFromURL()).not.toThrow();
  });
});

describe('特殊字符处理', () => {
  it.each([
    ['组合名称', 'Test & <>"\'#/\\组合', 'VTI'],
    ['ticker', 'Test', 'A&B=C#D'],
    ['空格', 'With Spaces', 'VTI', { benchmarkTicker: 'SP Y' }],
  ])('%s包含特殊字符能正确往返', (_n, name, ticker, params) => {
    const state = makeState(name, ticker, params);
    expect(decodeState(encodeState(state))).toEqual(state);
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
    const decoded = decodeState(encodeState(state));
    expect(decoded).toEqual(state);
    expect(decoded?.portfolios.length).toBe(3);
  });
});
