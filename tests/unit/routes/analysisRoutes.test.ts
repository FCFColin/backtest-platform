import { describe, it, expect, vi } from 'vitest';
import { startExpressApp, reqJson } from '../../helpers/expressApp.js';
import { withServer } from '../../helpers/serverLifecycle.js';
import { createConfigMocks } from '../../helpers/mockFactories.js';
import { loggerMocks } from '../../helpers/loggerFixture.js';
import { EngineUnavailableErrorStub } from '../../helpers/backtestRoutesFixtures.js';
import { createMockPriceData, mockPortfolioResult } from '../../helpers/storeFixtures.js';

const dataServiceMocks = vi.hoisted(() => ({ fetchHistoryData: vi.fn() }));
const engineMocks = vi.hoisted(() => ({ callEngineStrict: vi.fn() }));
const queueMocks = vi.hoisted(() => ({ add: vi.fn() }));
vi.hoisted(() => {
  process.env.SYNC_COMPUTE_TIMEOUT_MS = '500';
});

vi.mock('../../../packages/backend/src/infrastructure/dataFacade.js', () => ({
  fetchHistoryData: dataServiceMocks.fetchHistoryData,
}));
vi.mock('../../../packages/backend/src/queues/backtestQueue.js', () => ({
  backtestQueue: { add: queueMocks.add },
}));
vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
  callEngineStrict: engineMocks.callEngineStrict,
  EngineUnavailableError: EngineUnavailableErrorStub,
  unwrapEngineData: <T>(r: unknown): T => ((r as { data?: T })?.data ?? r) as T,
}));
vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: createConfigMocks({ NODE_ENV: 'test', SYNC_COMPUTE_TIMEOUT_MS: 500 }),
  validateConfig: vi.fn(),
  USAGE_METRIC: { BACKTEST: 'backtest' },
}));
import '../../helpers/middlewareMocks.js';
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: loggerMocks,
  sanitizeLog: (s: string) => s.replace(/[\n\r]/g, '').substring(0, 50),
}));
vi.mock('../../../packages/backend/src/utils/metrics.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../packages/backend/src/utils/metrics.js')>();
  return { ...actual, recordBacktestRequest: vi.fn(), recordDegradedResponse: vi.fn() };
});

import analysisRoutes from '../../../packages/backend/src/routes/analysisRoutes.js';
import { jobRoutes } from '../../../packages/backend/src/routes/jobRoutes.js';

const mockPcaResult = {
  eigenvalues: [2.5, 0.3, 0.2],
  eigenvectors: [[0.5, 0.5, 0.5]],
  explainedVarianceRatio: [0.83, 0.1, 0.07],
  principalComponents: [[1, 2, 3]],
};
const mockLetfResult = {
  slippageCurve: [{ date: '2020-01-01', slippage: 0.01 }],
  annualDecay: 0.05,
};
const mockOptimizeResult = {
  successProbability: 0.85,
  probabilityCurve: [{ year: 1, probability: 0.95 }],
  optimalPath: [],
  requiredContribution: 20000,
};

const post = (server: TestServer, path: string, body: unknown) =>
  reqJson(`${server.url}${path}`, 'POST', body);
async function setupServer(engineResult: unknown, dataResult?: unknown): Promise<TestServer> {
  vi.clearAllMocks();
  if (dataResult !== undefined) dataServiceMocks.fetchHistoryData.mockResolvedValue(dataResult);
  engineMocks.callEngineStrict.mockResolvedValue(engineResult);
  return startExpressApp((app) => app.use('/api/v1', analysisRoutes));
}

const pcaValidBody = {
  tickers: ['SPY', 'QQQ', 'IWM'],
  startDate: '2020-01-01',
  endDate: '2024-01-01',
};
const letfValidBody = {
  letfTicker: 'TQQQ',
  benchmarkTicker: 'QQQ',
  leverage: 3,
  startDate: '2020-01-01',
  endDate: '2024-01-01',
};
const goalValidBody = {
  targetAmount: 1000000,
  initialAmount: 100000,
  years: 20,
  assets: [{ ticker: 'SPY', weight: 100 }],
  numSimulations: 1000,
};

type AnalysisCase = {
  name: string;
  path: string;
  validBody: Record<string, unknown>;
  engineResult: unknown;
  data: Record<string, unknown>;
  expectSuccess: (body: { data: Record<string, unknown> }) => void;
  tickerBody?: Record<string, unknown>;
  expectTickerArgs?: (args: unknown[]) => void;
  validationCases: [string, Record<string, unknown>][];
  notFoundCases: [string, Record<string, unknown>][];
  strictNotFound?: boolean;
  extraCases: [string, Record<string, unknown>, number, string][];
};

const ANALYSIS_CASES: AnalysisCase[] = [
  {
    name: 'PCA',
    path: '/api/v1/pca/analyze',
    validBody: pcaValidBody,
    engineResult: mockPcaResult,
    data: {
      data: {
        SPY: { '2020-01-01': 300.0 },
        QQQ: { '2020-01-01': 200.0 },
        IWM: { '2020-01-01': 150.0 },
      },
      degraded: false,
    },
    expectSuccess: (body) => {
      expect((body.data.eigenvalues as unknown[]).length).toBe(3);
      expect((body.data.explainedVarianceRatio as number[])[0]).toBe(0.83);
    },
    tickerBody: { tickers: ['spy', 'SPY', 'QQQ'], startDate: '2020-01-01', endDate: '2024-01-01' },
    expectTickerArgs: (args) => expect(args[0]).toEqual(['SPY', 'QQQ']),
    validationCases: [
      ['tickers 少于 2 个', { tickers: ['SPY'], startDate: '2020-01-01', endDate: '2024-01-01' }],
      ['缺少 startDate', { tickers: ['SPY', 'QQQ', 'IWM'], endDate: '2024-01-01' }],
      ['空 tickers 数组', { tickers: [], startDate: '2020-01-01', endDate: '2024-01-01' }],
    ],
    notFoundCases: [
      [
        '部分标的价格数据缺失',
        {
          data: { SPY: { '2020-01-01': 300.0 }, QQQ: {}, IWM: { '2020-01-01': 150.0 } },
          degraded: false,
        },
      ],
    ],
    extraCases: [
      [
        '重复 ticker 去重后不足 2 个应返回 422',
        { tickers: ['SPY', 'spy'], startDate: '2020-01-01', endDate: '2024-01-01' },
        422,
        'VALIDATION_ERROR',
      ],
    ],
  },
  {
    name: 'LETF',
    path: '/api/v1/letf/analyze',
    validBody: letfValidBody,
    engineResult: mockLetfResult,
    data: {
      data: { TQQQ: { '2020-01-01': 30.0 }, QQQ: { '2020-01-01': 200.0 } },
      degraded: false,
    },
    expectSuccess: (body) => {
      expect((body.data.slippageCurve as unknown[]).length).toBe(1);
      expect(body.data.annualDecay).toBe(0.05);
    },
    tickerBody: {
      letfTicker: 'tqqq',
      benchmarkTicker: 'qqq',
      leverage: 3,
      startDate: '2020-01-01',
      endDate: '2024-01-01',
    },
    expectTickerArgs: (args) => {
      expect(args[0]).toEqual(['TQQQ', 'QQQ']);
      expect(args[1]).toBe('2020-01-01');
      expect(args[2]).toBe('2024-01-01');
    },
    validationCases: [
      [
        '缺少 letfTicker',
        { benchmarkTicker: 'QQQ', leverage: 3, startDate: '2020-01-01', endDate: '2024-01-01' },
      ],
      [
        'leverage 为负数',
        {
          letfTicker: 'TQQQ',
          benchmarkTicker: 'QQQ',
          leverage: -1,
          startDate: '2020-01-01',
          endDate: '2024-01-01',
        },
      ],
      [
        '缺少 startDate',
        { letfTicker: 'TQQQ', benchmarkTicker: 'QQQ', leverage: 3, endDate: '2024-01-01' },
      ],
    ],
    notFoundCases: [
      ['LETF 价格数据缺失', { data: { TQQQ: {}, QQQ: { '2020-01-01': 200.0 } }, degraded: false }],
      ['基准价格数据缺失', { data: { TQQQ: { '2020-01-01': 30.0 }, QQQ: {} }, degraded: false }],
    ],
    extraCases: [],
  },
  {
    name: 'GoalOptimizer',
    path: '/api/v1/goal-optimizer/optimize',
    validBody: goalValidBody,
    engineResult: mockOptimizeResult,
    data: { data: { SPY: { '2020-01-01': 300.0 } }, degraded: false },
    expectSuccess: (body) => {
      expect(body.data.successProbability).toBe(0.85);
      expect((body.data.probabilityCurve as unknown[]).length).toBe(1);
    },
    validationCases: [
      [
        '缺少 targetAmount',
        {
          initialAmount: 100000,
          years: 20,
          assets: [{ ticker: 'SPY', weight: 100 }],
          numSimulations: 1000,
        },
      ],
      ['targetAmount 为负数', { ...goalValidBody, targetAmount: -100 }],
      ['空 assets 数组', { ...goalValidBody, assets: [] }],
    ],
    notFoundCases: [
      ['价格数据缺失', { data: {}, degraded: false }],
      ['部分标的数据缺失', { data: { SPY: {} }, degraded: false }],
    ],
    strictNotFound: true,
    extraCases: [
      [
        '空白 ticker 应触发有效标的校验失败',
        { ...goalValidBody, assets: [{ ticker: '   ', weight: 100 }] },
        422,
        'VALIDATION_ERROR',
      ],
    ],
  },
];

describe.each(ANALYSIS_CASES)('analysisRoutes - %s: POST %s', (c) => {
  const getServer = withServer(() => setupServer(c.engineResult, c.data));
  it('有效参数应返回分析结果', async () => {
    const { res, body } = await post(getServer(), c.path, c.validBody);
    expect(res.status).toBe(200);
    expect(engineMocks.callEngineStrict).toHaveBeenCalledTimes(1);
    c.expectSuccess(body as { data: Record<string, unknown> });
  });
  if (c.tickerBody && c.expectTickerArgs) {
    it('应将 ticker 转大写并去重后调用 fetchHistoryData', async () => {
      await post(getServer(), c.path, c.tickerBody);
      c.expectTickerArgs(dataServiceMocks.fetchHistoryData.mock.calls[0]);
    });
  }
  it.each(c.validationCases)('%s 应返回 400（zod 校验失败）', async (_n, body) => {
    const { res } = await post(getServer(), c.path, body);
    expect(res.status).toBe(400);
    expect(engineMocks.callEngineStrict).not.toHaveBeenCalled();
  });
  it.each(c.notFoundCases)('%s 应返回 404', async (_n, data) => {
    dataServiceMocks.fetchHistoryData.mockResolvedValue(data);
    const { res, body } = await post(getServer(), c.path, c.validBody);
    expect(res.status).toBe(404);
    expect(body.error.code).toBe('DATA_NOT_FOUND');
    if (c.strictNotFound) expect(engineMocks.callEngineStrict).not.toHaveBeenCalled();
  });
  it.each(c.extraCases)('%s', async (_n, body, status, code) => {
    const { res, body: json } = await post(getServer(), c.path, body);
    expect(res.status).toBe(status);
    expect(json.error.code).toBe(code);
  });
  it('引擎抛错时应返回 500', async () => {
    engineMocks.callEngineStrict.mockRejectedValueOnce(new Error(`${c.name} engine error`));
    const { res } = await post(getServer(), c.path, c.validBody);
    expect(res.status).toBe(500);
  });
});

describe('analysisRoutes - FactorRegression: POST /api/v1/analysis/factor-regression', () => {
  const getServer = withServer(() => setupServer({ alpha: 0.01, beta: 1.05 }));
  const validBody = {
    monthlyReturns: [0.01, -0.02, 0.015],
    ffData: [{ mktRF: 0.02, smb: 0.005, hml: -0.01 }],
    factors: ['mktRF', 'smb'],
    startDate: '2020-01',
    endDate: '2020-12',
  };
  const minimalBody = { monthlyReturns: [0.01], ffData: [{ mktRF: 0.02 }] };
  it('完整参数应返回 200 + 引擎结果，factors/startDate/endDate 透传', async () => {
    const { res, body } = await post(getServer(), '/api/v1/analysis/factor-regression', validBody);
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ alpha: 0.01, beta: 1.05 });
    expect(engineMocks.callEngineStrict).toHaveBeenCalledWith(
      '/api/engine/factor-regression',
      validBody,
    );
  });
  it('省略 factors/startDate/endDate 时使用默认值', async () => {
    await post(getServer(), '/api/v1/analysis/factor-regression', minimalBody);
    expect(engineMocks.callEngineStrict).toHaveBeenCalledWith('/api/engine/factor-regression', {
      monthlyReturns: [0.01],
      ffData: [{ mktRF: 0.02 }],
      factors: ['mktRF', 'smb', 'hml'],
      startDate: '',
      endDate: '',
    });
  });
  it.each([
    ['缺失 monthlyReturns', { ffData: [{ mktRF: 0.02 }] }],
    ['monthlyReturns 为空数组', { monthlyReturns: [], ffData: [{ mktRF: 0.02 }] }],
    ['monthlyReturns 为非数组', { monthlyReturns: 'not-array', ffData: [{ mktRF: 0.02 }] }],
    ['ffData 为空数组', { monthlyReturns: [0.01], ffData: [] }],
  ])('%s 应返回 400', async (_n, body) => {
    const { res, body: resBody } = await post(
      getServer(),
      '/api/v1/analysis/factor-regression',
      body,
    );
    expect(res.status).toBe(400);
    expect(resBody.error.code).toBe('VALIDATION_ERROR');
    expect(engineMocks.callEngineStrict).not.toHaveBeenCalled();
  });
  it('引擎抛普通 Error 应返回 500 FR_ERROR', async () => {
    engineMocks.callEngineStrict.mockRejectedValueOnce(new Error('fr boom'));
    const { res, body } = await post(
      getServer(),
      '/api/v1/analysis/factor-regression',
      minimalBody,
    );
    expect(res.status).toBe(500);
    expect(body.error.code).toBe('FR_ERROR');
  });
});

describe('analysisRoutes - Calculator: POST /api/v1/calculators/:type', () => {
  const getServer = withServer(() => setupServer({ result: 'ok' }));
  it.each([
    [
      'cagr',
      { initialAmount: 10000, years: 10, rate: 0.07 },
      { type: 'cagr', initialAmount: 10000, years: 10, rate: 0.07 },
    ],
    ['swr', {}, { type: 'swr' }],
    ['frontier', {}, { type: 'frontier' }],
  ])('%s 类型应返回 200 且透传 payload 到引擎', async (type, body, expected) => {
    const { res, body: json } = await post(getServer(), `/api/v1/calculators/${type}`, body);
    expect(res.status).toBe(200);
    expect(json.data).toEqual({ result: 'ok' });
    expect(engineMocks.callEngineStrict).toHaveBeenCalledWith('/api/engine/calculators', expected);
  });
  it('无效 type 应返回 422 CALC_INVALID_TYPE 且不调用引擎', async () => {
    const { res, body } = await post(getServer(), '/api/v1/calculators/invalid', {});
    expect(res.status).toBe(422);
    expect(body.error.code).toBe('CALC_INVALID_TYPE');
    expect(engineMocks.callEngineStrict).not.toHaveBeenCalled();
  });
  it('引擎抛 EngineUnavailableError 应返回 503 + Retry-After（ADR-031 fail-closed）', async () => {
    engineMocks.callEngineStrict.mockRejectedValueOnce(
      new EngineUnavailableErrorStub('/api/engine/calculators'),
    );
    const { res, body } = await post(getServer(), '/api/v1/calculators/cagr', {});
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('30');
    expect(body.error.code).toBe('ENGINE_UNAVAILABLE');
    expect(body.degraded).toBeUndefined();
  });
  it('引擎抛普通 Error 应返回 500 CALC_ERROR', async () => {
    engineMocks.callEngineStrict.mockRejectedValueOnce(new Error('calc boom'));
    const { res, body } = await post(getServer(), '/api/v1/calculators/cagr', {});
    expect(res.status).toBe(500);
    expect(body.error.code).toBe('CALC_ERROR');
  });
});

function createValidStrategy() {
  return {
    id: 'strat-1',
    name: 'Test Strategy',
    signals: [
      {
        id: 'sig-1',
        name: 'SMA Signal',
        conditions: [
          { indicator: 'sma' as const, period: 20, operator: 'cross_above' as const, threshold: 0 },
        ],
        targetWeights: [{ ticker: 'SPY', weight: 100 }],
      },
    ],
    aggregationMethod: 'weighted_average' as const,
  };
}
function createMockPortfolioResult() {
  return mockPortfolioResult({ name: 'Portfolio' });
}
const validBacktestReq = (strategyOverride?: Record<string, unknown>) => ({
  strategy: strategyOverride ?? createValidStrategy(),
  startDate: '2020-01-01',
  endDate: '2020-01-03',
  startingValue: 10000,
  rebalanceFrequency: 'monthly' as const,
});

describe('tacticalRoutes - POST /api/tactical/backtest', () => {
  const getServer = withServer(() => {
    vi.clearAllMocks();
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      data: createMockPriceData({ numDays: 3, startPrice: 300 }),
      degraded: false,
    });
    engineMocks.callEngineStrict
      .mockResolvedValueOnce({
        portfolio: createMockPortfolioResult(),
        signalHistory: [
          {
            date: '2020-01-01',
            activeSignals: ['sig-1'],
            weights: [{ ticker: 'SPY', weight: 100 }],
          },
        ],
      })
      .mockResolvedValueOnce({ portfolios: [createMockPortfolioResult()] });
    return startExpressApp((app) => app.use('/api/v1', analysisRoutes));
  });
  it('有效参数应返回回测结果和基准', async () => {
    const { res, body } = await post(getServer(), '/api/v1/tactical/backtest', validBacktestReq());
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.portfolio).toBeDefined();
    expect(body.data.benchmark).toBeDefined();
    expect(body.data.signalHistory).toHaveLength(1);
    expect(engineMocks.callEngineStrict).toHaveBeenCalledTimes(2);
  });
  it('无效标的数据应返回 404', async () => {
    dataServiceMocks.fetchHistoryData.mockResolvedValue({ data: {}, degraded: false });
    const { res, body } = await post(getServer(), '/api/v1/tactical/backtest', validBacktestReq());
    expect(res.status).toBe(404);
    expect(body.error.code).toBe('DATA_NOT_FOUND');
  });
  it.each([
    [
      '缺少 strategy',
      {
        startDate: '2020-01-01',
        endDate: '2020-01-03',
        startingValue: 10000,
        rebalanceFrequency: 'monthly',
      },
    ],
    ['空 signals 数组', validBacktestReq({ ...createValidStrategy(), signals: [] })],
  ])('%s 应返回 400（zod 校验失败）', async (_n, req) => {
    const { res } = await post(getServer(), '/api/v1/tactical/backtest', req);
    expect(res.status).toBe(400);
  });
  it('引擎抛错时应返回 500', async () => {
    engineMocks.callEngineStrict
      .mockReset()
      .mockRejectedValueOnce(new Error('tactical engine error'));
    const { res } = await post(getServer(), '/api/v1/tactical/backtest', validBacktestReq());
    expect(res.status).toBe(500);
  });
  it('基准回测失败时应使用空结果兜底', async () => {
    engineMocks.callEngineStrict
      .mockReset()
      .mockResolvedValueOnce({
        portfolio: createMockPortfolioResult(),
        signalHistory: [
          {
            date: '2020-01-01',
            activeSignals: ['sig-1'],
            weights: [{ ticker: 'SPY', weight: 100 }],
          },
        ],
      })
      .mockRejectedValueOnce(new Error('benchmark error'));
    const { res, body } = await post(getServer(), '/api/v1/tactical/backtest', validBacktestReq());
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.benchmark.growthCurve).toEqual([]);
  });
});

describe('tacticalRoutes - POST /api/tactical/what-if', () => {
  const getServer = withServer(() => {
    vi.clearAllMocks();
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      data: createMockPriceData({ numDays: 3, startPrice: 300 }),
      degraded: false,
    });
    engineMocks.callEngineStrict.mockResolvedValue({
      signalHistory: [
        { date: '2020-01-03', activeSignals: ['sig-1'], weights: [{ ticker: 'SPY', weight: 100 }] },
      ],
    });
    return startExpressApp((app) => app.use('/api/v1', analysisRoutes));
  });
  it('有效参数应返回信号状态', async () => {
    const { res, body } = await post(getServer(), '/api/v1/tactical/what-if', {
      tickers: ['SPY'],
      strategy: createValidStrategy(),
    });
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data[0].ticker).toBe('SPY');
    expect(body.data[0].weight).toBe(100);
  });
  it('空 tickers 数组应返回 400（zod 校验失败）', async () => {
    const { res } = await post(getServer(), '/api/v1/tactical/what-if', { tickers: [] });
    expect(res.status).toBe(400);
  });
  it('引擎抛错时应返回 500', async () => {
    engineMocks.callEngineStrict.mockRejectedValueOnce(new Error('what-if error'));
    const { res } = await post(getServer(), '/api/v1/tactical/what-if', {
      tickers: ['SPY'],
      strategy: createValidStrategy(),
    });
    expect(res.status).toBe(500);
  });
});

function createValidGridRequest() {
  return {
    indicator: 'sma' as const,
    param1: { min: 10, max: 20, step: 10 },
    param2: { min: 10, max: 20, step: 10 },
    tickers: ['SPY'],
    startDate: '2020-01-01',
    endDate: '2024-01-01',
    startingValue: 10000,
    rebalanceFrequency: 'monthly' as const,
    objective: 'maxCAGR' as const,
  };
}
const mockGridResult = {
  results: [{ param1: 10, param2: 10, cagr: 0.1, maxDrawdown: 0.05, sharpe: 1.5 }],
  heatmap: {
    param1Values: [10, 20],
    param2Values: [10, 20],
    matrix: [
      [0.1, 0.08],
      [0.09, 0.07],
    ],
  },
  best: { param1: 10, param2: 10, cagr: 0.1 },
};

describe('tacticalGridRoutes - POST /api/tactical-grid/search', () => {
  const getServer = withServer(() => {
    vi.clearAllMocks();
    queueMocks.add.mockResolvedValue({ id: 'grid-job-123' });
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      data: createMockPriceData({ numDays: 30, startPrice: 301 }),
      degraded: false,
    });
    engineMocks.callEngineStrict.mockResolvedValue(mockGridResult);
    return startExpressApp((app) => app.use('/api/v1', jobRoutes));
  });
  async function postGrid(body: unknown) {
    return post(getServer(), '/api/v1/tactical-grid/search', body);
  }
  it('异步提交成功时应返回 202 和 jobId', async () => {
    const { res, body } = await postGrid(createValidGridRequest());
    expect(res.status).toBe(202);
    expect(body.status).toBe(202);
    expect(body.jobId).toBe('grid-job-123');
    expect(body.statusUrl).toContain('/api/v1/jobs/grid-job-123');
    expect(queueMocks.add).toHaveBeenCalledTimes(1);
  });
  it.each([
    [
      '缺少 indicator',
      (r: Record<string, unknown>) => {
        delete r.indicator;
      },
    ],
    [
      '空 tickers 数组',
      (r: Record<string, unknown>) => {
        r.tickers = [];
      },
    ],
    [
      '无效日期格式',
      (r: Record<string, unknown>) => {
        r.startDate = 'not-a-date';
      },
    ],
  ])('%s 应返回 400（zod 校验失败）', async (_n, mutate) => {
    const req = createValidGridRequest() as unknown as Record<string, unknown>;
    mutate(req);
    const { res } = await postGrid(req);
    expect(res.status).toBe(400);
  });
  it('参数组合超过上限应返回 422', async () => {
    const req = createValidGridRequest();
    req.param1 = { min: 1, max: 100, step: 1 };
    req.param2 = { min: 1, max: 100, step: 1 };
    const { res, body } = await postGrid(req);
    expect(res.status).toBe(422);
    expect(body.error.code).toBe('GRID_TOO_MANY_COMBINATIONS');
    expect(queueMocks.add).not.toHaveBeenCalled();
  });
  it('BullMQ 不可用时应回退到同步执行并返回 200', async () => {
    queueMocks.add.mockRejectedValue(new Error('Redis unavailable'));
    const { res, body } = await postGrid(createValidGridRequest());
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.results).toHaveLength(1);
    expect(engineMocks.callEngineStrict).toHaveBeenCalledTimes(1);
  });
  it('同步回退时价格数据缺失应返回 400', async () => {
    queueMocks.add.mockRejectedValue(new Error('Redis unavailable'));
    dataServiceMocks.fetchHistoryData.mockResolvedValue({ data: {}, degraded: false });
    const { res, body } = await postGrid(createValidGridRequest());
    expect(res.status).toBe(400);
    expect(body.error.code).toBe('GRID_BAD_REQUEST');
  });
  it.each([new Error('grid engine error'), new Error('')])(
    '同步回退引擎抛错（%s）应返回 500',
    async (err) => {
      queueMocks.add.mockRejectedValue(new Error('Redis unavailable'));
      engineMocks.callEngineStrict.mockRejectedValue(err);
      const { res } = await postGrid(createValidGridRequest());
      expect(res.status).toBe(500);
    },
  );
  it('BullMQ 回退同步执行超时应返回 503', async () => {
    queueMocks.add.mockRejectedValue(new Error('Redis unavailable'));
    dataServiceMocks.fetchHistoryData.mockImplementation(() => new Promise(() => {}));
    const { res } = await postGrid(createValidGridRequest());
    expect(res.status).toBe(503);
  });
});

describe('认证用户请求', () => {
  const getServer = withServer(() => {
    vi.clearAllMocks();
    queueMocks.add.mockResolvedValue({ id: 'grid-job-auth-789' });
    return startExpressApp((app) => {
      app.use((req, _res, next) => {
        (req as Record<string, unknown>).user = { sub: 'user-123', role: 'admin' };
        (req as Record<string, unknown>).tenantId = 'tenant-456';
        next();
      });
      app.use('/api/v1', jobRoutes);
    });
  });
  it('应设置 ownerUserId 为实际用户 ID', async () => {
    await post(getServer(), '/api/v1/tactical-grid/search', createValidGridRequest());
    expect(queueMocks.add).toHaveBeenCalledWith(
      'grid-search',
      expect.objectContaining({
        userId: 'user-123',
        ownerUserId: 'user-123',
        tenantId: 'tenant-456',
      }),
    );
  });
});
