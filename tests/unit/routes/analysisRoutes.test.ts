import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';
import { loggerMocks } from '../../helpers/loggerFixture.js';
import { EngineUnavailableErrorStub } from '../../helpers/backtestRoutesFixtures.js';

const dataServiceMocks = vi.hoisted(() => ({ fetchHistoryData: vi.fn() }));
const engineMocks = vi.hoisted(() => ({ callEngineStrict: vi.fn() }));
vi.mock('../../../packages/backend/src/infrastructure/dataFacade.js', () => ({
  fetchHistoryData: dataServiceMocks.fetchHistoryData,
}));
vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
  callEngineStrict: engineMocks.callEngineStrict,
  EngineUnavailableError: EngineUnavailableErrorStub,
  unwrapEngineData: <T>(r: unknown): T => ((r as { data?: T })?.data ?? r) as T,
}));
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: loggerMocks,
  sanitizeLog: (s: string) => s,
}));
vi.mock('../../../packages/backend/src/utils/metrics.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../packages/backend/src/utils/metrics.js')>();
  return { ...actual, recordBacktestRequest: vi.fn(), recordDegradedResponse: vi.fn() };
});
vi.mock('../../../packages/backend/src/middleware/jwtAuth.js', () => ({
  jwtAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  optionalJwtAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  assignGuestReadonly: (_req: unknown, _res: unknown, next: () => void) => next(),
  auditLog: (_req: unknown, _res: unknown, next: () => void) => next(),
  idempotencyKey: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../../packages/backend/src/middleware/tenantContext.js', () => ({
  resolveTenant: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireTenant: (_req: unknown, _res: unknown, next: () => void) => next(),
  hasTenant: vi.fn(() => true),
}));
vi.mock('../../../packages/backend/src/middleware/rbac.js', () => ({
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  Permission: {
    BACKTEST_RUN: 'backtest:run',
    STRATEGY_MANAGE: 'strategy:manage',
    SIGNAL_READ: 'signal:read',
  },
}));
vi.mock('../../../packages/backend/src/middleware/quota.js', () => ({
  enforceQuota: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import analysisRoutes from '../../../packages/backend/src/routes/analysisRoutes.js';

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

async function apiPost(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { res, body: await res.json().catch(() => null) };
}
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
  let server: TestServer;
  beforeEach(async () => {
    server = await setupServer(c.engineResult, c.data);
  });
  afterEach(async () => {
    await server.close();
  });
  it('有效参数应返回分析结果', async () => {
    const { res, body } = await apiPost(`${server.url}${c.path}`, c.validBody);
    expect(res.status).toBe(200);
    expect(engineMocks.callEngineStrict).toHaveBeenCalledTimes(1);
    c.expectSuccess(body as { data: Record<string, unknown> });
  });
  if (c.tickerBody && c.expectTickerArgs) {
    it('应将 ticker 转大写并去重后调用 fetchHistoryData', async () => {
      await apiPost(`${server.url}${c.path}`, c.tickerBody);
      c.expectTickerArgs(dataServiceMocks.fetchHistoryData.mock.calls[0]);
    });
  }
  it.each(c.validationCases)('%s 应返回 400（zod 校验失败）', async (_n, body) => {
    const { res } = await apiPost(`${server.url}${c.path}`, body);
    expect(res.status).toBe(400);
    expect(engineMocks.callEngineStrict).not.toHaveBeenCalled();
  });
  it.each(c.notFoundCases)('%s 应返回 404', async (_n, data) => {
    dataServiceMocks.fetchHistoryData.mockResolvedValue(data);
    const { res, body } = await apiPost(`${server.url}${c.path}`, c.validBody);
    expect(res.status).toBe(404);
    expect(body.error.code).toBe('DATA_NOT_FOUND');
    if (c.strictNotFound) expect(engineMocks.callEngineStrict).not.toHaveBeenCalled();
  });
  it.each(c.extraCases)('%s', async (_n, body, status, code) => {
    const { res, body: json } = await apiPost(`${server.url}${c.path}`, body);
    expect(res.status).toBe(status);
    expect(json.error.code).toBe(code);
  });
  it('引擎抛错时应返回 500', async () => {
    engineMocks.callEngineStrict.mockRejectedValueOnce(new Error(`${c.name} engine error`));
    const { res } = await apiPost(`${server.url}${c.path}`, c.validBody);
    expect(res.status).toBe(500);
  });
});

describe('analysisRoutes - FactorRegression: POST /api/v1/analysis/factor-regression', () => {
  let server: TestServer;
  const validBody = {
    monthlyReturns: [0.01, -0.02, 0.015],
    ffData: [{ mktRF: 0.02, smb: 0.005, hml: -0.01 }],
    factors: ['mktRF', 'smb'],
    startDate: '2020-01',
    endDate: '2020-12',
  };
  const minimalBody = { monthlyReturns: [0.01], ffData: [{ mktRF: 0.02 }] };
  beforeEach(async () => {
    server = await setupServer({ alpha: 0.01, beta: 1.05 });
  });
  afterEach(async () => {
    await server.close();
  });
  it('完整参数应返回 200 + 引擎结果，factors/startDate/endDate 透传', async () => {
    const { res, body } = await apiPost(
      `${server.url}/api/v1/analysis/factor-regression`,
      validBody,
    );
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ alpha: 0.01, beta: 1.05 });
    expect(engineMocks.callEngineStrict).toHaveBeenCalledWith(
      '/api/engine/factor-regression',
      validBody,
    );
  });
  it('省略 factors/startDate/endDate 时使用默认值', async () => {
    await apiPost(`${server.url}/api/v1/analysis/factor-regression`, minimalBody);
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
    const { res, body: resBody } = await apiPost(
      `${server.url}/api/v1/analysis/factor-regression`,
      body,
    );
    expect(res.status).toBe(400);
    expect(resBody.error.code).toBe('VALIDATION_ERROR');
    expect(engineMocks.callEngineStrict).not.toHaveBeenCalled();
  });
  it('引擎抛普通 Error 应返回 500 FR_ERROR', async () => {
    engineMocks.callEngineStrict.mockRejectedValueOnce(new Error('fr boom'));
    const { res, body } = await apiPost(
      `${server.url}/api/v1/analysis/factor-regression`,
      minimalBody,
    );
    expect(res.status).toBe(500);
    expect(body.error.code).toBe('FR_ERROR');
  });
});

describe('analysisRoutes - Calculator: POST /api/v1/calculators/:type', () => {
  let server: TestServer;
  beforeEach(async () => {
    server = await setupServer({ result: 'ok' });
  });
  afterEach(async () => {
    await server.close();
  });
  it.each([
    [
      'cagr',
      { initialAmount: 10000, years: 10, rate: 0.07 },
      { type: 'cagr', initialAmount: 10000, years: 10, rate: 0.07 },
    ],
    ['swr', {}, { type: 'swr' }],
    ['frontier', {}, { type: 'frontier' }],
  ])('%s 类型应返回 200 且透传 payload 到引擎', async (type, body, expected) => {
    const { res, body: json } = await apiPost(`${server.url}/api/v1/calculators/${type}`, body);
    expect(res.status).toBe(200);
    expect(json.data).toEqual({ result: 'ok' });
    expect(engineMocks.callEngineStrict).toHaveBeenCalledWith('/api/engine/calculators', expected);
  });
  it('无效 type 应返回 422 CALC_INVALID_TYPE 且不调用引擎', async () => {
    const { res, body } = await apiPost(`${server.url}/api/v1/calculators/invalid`, {});
    expect(res.status).toBe(422);
    expect(body.error.code).toBe('CALC_INVALID_TYPE');
    expect(engineMocks.callEngineStrict).not.toHaveBeenCalled();
  });
  it('引擎抛 EngineUnavailableError 应返回 503 + Retry-After（ADR-031 fail-closed）', async () => {
    engineMocks.callEngineStrict.mockRejectedValueOnce(
      new EngineUnavailableErrorStub('/api/engine/calculators'),
    );
    const { res, body } = await apiPost(`${server.url}/api/v1/calculators/cagr`, {});
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('30');
    expect(body.error.code).toBe('ENGINE_UNAVAILABLE');
    expect(body.degraded).toBeUndefined();
  });
  it('引擎抛普通 Error 应返回 500 CALC_ERROR', async () => {
    engineMocks.callEngineStrict.mockRejectedValueOnce(new Error('calc boom'));
    const { res, body } = await apiPost(`${server.url}/api/v1/calculators/cagr`, {});
    expect(res.status).toBe(500);
    expect(body.error.code).toBe('CALC_ERROR');
  });
});
