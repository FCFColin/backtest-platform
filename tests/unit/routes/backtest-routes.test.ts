import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp } from '../../helpers/expressApp.js';
import { m, loggerMocks, MockEngineUnavailableError } from './backtestRoutes.shared.js';
import backtestRoutes from '../../../packages/backend/src/routes/backtestRoutes.js';
import {
  createValidParameters,
  createValidPortfolio,
  startEngineRouteServer,
} from '../../helpers/backtestRoutesFixtures.js';

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { res, json: await res.json() };
}
type Server = { url: string; close: () => Promise<void> };

interface EngineCase {
  name: string;
  path: string;
  enginePath: string;
  errorCode: string;
  logOnError: boolean;
  result: Record<string, unknown>;
  validBody: () => Record<string, unknown>;
  invalidBodies: Array<[string, Record<string, unknown>]>;
  specials: Array<[string, (url: string) => Promise<void> | void]>;
}

const engineCases: EngineCase[] = [
  {
    name: 'analysis',
    path: '/api/backtest/analysis',
    enginePath: '/api/engine/analysis',
    errorCode: 'ANALYSIS_ERROR',
    logOnError: true,
    result: { tickers: [{ ticker: 'AAPL', cagr: 0.1 }], correlations: [[1]] },
    validBody: () => ({ tickers: ['AAPL', 'BND'], parameters: createValidParameters() }),
    invalidBodies: [
      ['缺失 tickers（zod 校验）', { parameters: createValidParameters() }],
      [
        'ticker 数量超限（schema refine）',
        {
          tickers: Array.from({ length: 51 }, (_, i) => `T${i}`),
          parameters: createValidParameters(),
        },
      ],
    ],
    specials: [
      [
        'tickers 为空格分隔字符串时应正常处理',
        async (url) => {
          m.callEngineStrict.mockResolvedValue({
            tickers: [{ ticker: 'AAPL' }, { ticker: 'BND' }],
            correlations: [[1]],
          });
          const { res } = await postJson(url, {
            tickers: 'AAPL BND',
            parameters: createValidParameters(),
          });
          expect(res.status).toBe(200);
          expect((m.callEngineStrict.mock.calls[0][1] as { tickers: string[] }).tickers).toEqual([
            'AAPL',
            'BND',
          ]);
        },
      ],
      [
        '引擎返回 assets 字段时应映射为 tickers',
        async (url) => {
          m.callEngineStrict.mockResolvedValue({
            success: true,
            data: { assets: [{ ticker: 'AAPL', cagr: 0.1 }], correlations: [[1]] },
          });
          const { res, json } = await postJson(url, {
            tickers: ['AAPL'],
            parameters: createValidParameters(),
          });
          expect(res.status).toBe(200);
          expect(json.data.tickers).toBeDefined();
          expect(json.data.correlations).toBeDefined();
        },
      ],
      [
        '有效请求应拉取历史数据',
        async (url) => {
          await postJson(url, { tickers: ['AAPL', 'BND'], parameters: createValidParameters() });
          expect(m.fetchHistoryData).toHaveBeenCalledTimes(1);
        },
      ],
    ],
  },
  {
    name: 'monte-carlo',
    path: '/api/backtest/monte-carlo',
    enginePath: '/api/engine/monte-carlo',
    errorCode: 'MONTE_CARLO_ERROR',
    logOnError: false,
    result: { paths: [], statistics: {} },
    validBody: () => ({
      portfolio: createValidPortfolio(),
      parameters: createValidParameters(),
      mcParams: { numSimulations: 100, seed: 42 },
    }),
    invalidBodies: [['缺少 portfolio（zod refine）', { parameters: createValidParameters() }]],
    specials: [
      [
        'mcParams 应透传到引擎',
        async (url) => {
          await postJson(url, {
            portfolio: createValidPortfolio(),
            parameters: createValidParameters(),
            mcParams: { numSimulations: 100, seed: 42 },
          });
          expect((m.callEngineStrict.mock.calls[0][1] as { mcParams: unknown }).mcParams).toEqual({
            numSimulations: 100,
            seed: 42,
          });
        },
      ],
      [
        '恶意 mcParams 键应被剥离',
        async (url) => {
          await postJson(url, {
            portfolio: createValidPortfolio(),
            parameters: createValidParameters(),
            mcParams: {
              numSimulations: 50,
              __proto__: { polluted: true },
              constructor: 'evil',
              maliciousKey: 'strip-me',
            },
          });
          const mcParamsArg = (
            m.callEngineStrict.mock.calls[0][1] as { mcParams: Record<string, unknown> }
          ).mcParams;
          expect(mcParamsArg).toEqual({ numSimulations: 50 });
          expect(mcParamsArg).not.toHaveProperty('maliciousKey');
          expect(mcParamsArg).not.toHaveProperty('constructor');
        },
      ],
      [
        '多组合应返回数组结果',
        async (url) => {
          m.callEngineStrict
            .mockResolvedValueOnce({ portfolio: 0 })
            .mockResolvedValueOnce({ portfolio: 1 });
          const { res, json } = await postJson(url, {
            portfolios: [createValidPortfolio(), createValidPortfolio()],
            parameters: createValidParameters(),
          });
          expect(res.status).toBe(200);
          expect(json.success).toBe(true);
          expect(Array.isArray(json.data)).toBe(true);
          expect(json.data).toHaveLength(2);
          expect(m.callEngineStrict).toHaveBeenCalledTimes(2);
        },
      ],
    ],
  },
  {
    name: 'optimize',
    path: '/api/backtest/optimize',
    enginePath: '/api/engine/optimize',
    errorCode: 'OPTIMIZATION_ERROR',
    logOnError: false,
    result: {
      optimalWeights: { AAPL: 0.6, BND: 0.4 },
      expectedReturn: 0.1,
      expectedVolatility: 0.15,
      sharpeRatio: 1.2,
    },
    validBody: () => ({
      tickers: ['AAPL', 'BND'],
      objective: 'maxSharpe',
      parameters: createValidParameters(),
    }),
    invalidBodies: [
      [
        '无效 objective（zod 校验）',
        { tickers: ['AAPL'], objective: 'invalidObjective', parameters: createValidParameters() },
      ],
      [
        'ticker 数量超限（schema refine）',
        {
          tickers: Array.from({ length: 51 }, (_, i) => `T${i}`),
          objective: 'maxSharpe',
          parameters: createValidParameters(),
        },
      ],
    ],
    specials: [
      [
        'numIterations 应被正确上限截断',
        async (url) => {
          const { res } = await postJson(url, {
            tickers: ['AAPL', 'BND'],
            objective: 'minVolatility',
            parameters: createValidParameters(),
            numIterations: 50000,
          });
          expect(res.status).toBe(200);
          expect(
            (m.callEngineStrict.mock.calls[0][1] as { numIterations: number }).numIterations,
          ).toBe(50000);
        },
      ],
    ],
  },
  {
    name: 'efficient-frontier',
    path: '/api/backtest/efficient-frontier',
    enginePath: '/api/engine/efficient-frontier',
    errorCode: 'EFFICIENT_FRONTIER_ERROR',
    logOnError: false,
    result: {
      frontier: [
        { weights: { AAPL: 1 }, expectedReturn: 0.1, expectedVolatility: 0.2, sharpeRatio: 0.5 },
      ],
    },
    validBody: () => ({
      tickers: ['AAPL', 'BND'],
      parameters: createValidParameters(),
      numPoints: 10,
    }),
    invalidBodies: [
      ['空 tickers 数组', { tickers: [], parameters: createValidParameters() }],
      [
        'ticker 数量超限',
        {
          tickers: Array.from({ length: 51 }, (_, i) => `T${i}`),
          parameters: createValidParameters(),
        },
      ],
    ],
    specials: [],
  },
];

describe.each(engineCases)('backtestRoutes - POST $path', (c) => {
  let server: Server;
  beforeEach(async () => {
    server = await startEngineRouteServer(backtestRoutes, m);
    m.callEngineStrict.mockResolvedValue(c.result);
  });
  afterEach(() => server.close());
  it('有效参数应调用引擎并返回 200', async () => {
    const { res, json } = await postJson(`${server.url}${c.path}`, c.validBody());
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(m.callEngineStrict).toHaveBeenCalledTimes(1);
    expect(m.callEngineStrict.mock.calls[0][0]).toBe(c.enginePath);
  });
  it('引擎抛错应返回 500', async () => {
    m.callEngineStrict.mockRejectedValue(new Error('engine boom'));
    const { res, json } = await postJson(`${server.url}${c.path}`, c.validBody());
    expect(res.status).toBe(500);
    expect(json.error.code).toBe(c.errorCode);
    if (c.logOnError) expect(loggerMocks.error).toHaveBeenCalled();
  });
  it('引擎不可用应 fail-closed 返回 503', async () => {
    m.callEngineStrict.mockRejectedValue(new MockEngineUnavailableError());
    const { res, json } = await postJson(`${server.url}${c.path}`, c.validBody());
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('30');
    expect(json.error.code).toBe('ENGINE_UNAVAILABLE');
  });
  it.each(c.invalidBodies)('%s 应返回 400 且不调用引擎', async (_n, body) => {
    const { res } = await postJson(`${server.url}${c.path}`, body);
    expect(res.status).toBe(400);
    expect(m.callEngineStrict).not.toHaveBeenCalled();
  });
  it.each(c.specials)('%s', async (_n, fn) => {
    await fn(`${server.url}${c.path}`);
  });
});

import analysisRoutes from '../../../packages/backend/src/routes/analysisRoutes.js';

function createSignalConfig(ticker = 'SPY') {
  return {
    ticker,
    indicator: 'sma',
    period: 20,
    threshold: 0,
    startDate: '2020-01-01',
    endDate: '2024-01-01',
    signalType: 'both' as const,
  };
}

const mockSignalResult = {
  signals: [{ date: '2020-01-02', type: 'buy', price: 301.0 }],
  statistics: { totalSignals: 1, winRate: 1.0, avgReturn: 0.01, maxDrawdown: 0, sharpe: 2.0 },
  equityCurve: [{ date: '2020-01-01', value: 10000 }],
};

async function apiPost(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { res, body: await res.json().catch(() => null) };
}

describe.each([
  {
    path: '/api/v1/signal/analyze',
    data: { SPY: { '2020-01-01': 300.0, '2020-01-02': 301.0 } },
    engineResult: mockSignalResult,
    validReq: () => createSignalConfig(),
    validation: [
      [
        '缺少 ticker',
        () => {
          const r = createSignalConfig();
          delete (r as Record<string, unknown>).ticker;
          return r;
        },
      ],
      ['无效 signalType', () => ({ ...createSignalConfig(), signalType: 'invalid' })],
    ],
  },
  {
    path: '/api/v1/signal/dual',
    data: { SPY: { '2020-01-01': 300.0 }, QQQ: { '2020-01-01': 200.0 } },
    engineResult: { ...mockSignalResult, equityCurve: [] },
    validReq: () => ({
      signal1: createSignalConfig('SPY'),
      signal2: createSignalConfig('QQQ'),
      combinationMethod: 'and',
    }),
    validation: [
      [
        '缺少 combinationMethod',
        () => ({ signal1: createSignalConfig('SPY'), signal2: createSignalConfig('QQQ') }),
      ],
    ],
  },
  {
    path: '/api/v1/signal/multi',
    data: { SPY: { '2020-01-01': 300.0, '2020-01-02': 301.0 } },
    engineResult: { ...mockSignalResult, equityCurve: [] },
    validReq: () => ({
      signals: [
        createSignalConfig('SPY'),
        { ...createSignalConfig('SPY'), indicator: 'rsi', period: 14, threshold: 30 },
      ],
      aggregationMethod: 'voting',
    }),
    validation: [
      ['空 signals 数组', () => ({ signals: [], aggregationMethod: 'voting' })],
      ['缺少 aggregationMethod', () => ({ signals: [createSignalConfig('SPY')] })],
    ],
  },
])('signalRoutes - POST $path', (c) => {
  let server: Server;
  beforeEach(async () => {
    vi.clearAllMocks();
    m.fetchHistoryData.mockResolvedValue({ data: c.data, degraded: false });
    m.callEngineStrict.mockResolvedValue(c.engineResult);
    server = await startExpressApp((app) => app.use('/api/v1', analysisRoutes));
  });
  afterEach(() => server.close());

  it('有效参数应返回分析结果', async () => {
    const { res, body } = await apiPost(`${server.url}${c.path}`, c.validReq());
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.signals).toHaveLength(1);
    expect(m.callEngineStrict).toHaveBeenCalledTimes(1);
  });
  it.each(c.validation)('%s 应返回 400（zod 校验失败）', async (_n, getReq) => {
    const { res } = await apiPost(`${server.url}${c.path}`, getReq());
    expect(res.status).toBe(400);
    expect(m.callEngineStrict).not.toHaveBeenCalled();
  });
  it('价格数据缺失时应返回 404', async () => {
    m.fetchHistoryData.mockResolvedValue({ data: { SPY: {} }, degraded: false });
    const { res, body } = await apiPost(`${server.url}${c.path}`, c.validReq());
    expect(res.status).toBe(404);
    expect(body.error.code).toBe('DATA_NOT_FOUND');
  });
  it('引擎抛错时应返回 500', async () => {
    m.callEngineStrict.mockRejectedValueOnce(new Error('signal engine error'));
    const { res } = await apiPost(`${server.url}${c.path}`, c.validReq());
    expect(res.status).toBe(500);
  });
});
