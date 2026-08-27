/* eslint-disable @typescript-eslint/no-explicit-any -- test mock */
import '../../helpers/loggerMock.js';
import { describe, expect, it, vi } from 'vitest';
// verbatimModuleSyntax off：单行放得下，省 5 行（printWidth 100 内）
import { reqJson, startExpressApp, useTestServer, TestServer } from '../../helpers/expressApp.js';
import { withServer } from '../../helpers/serverLifecycle.js';
import { mockBacktestQueue, mockConfigModule } from '../../helpers/mockFactories.js';
import { engineMocks } from '../../helpers/engineFixture.js';
import { createMockPriceData, mockPortfolioResult } from '../../helpers/storeFixtures.js';
const dataServiceMocks = vi.hoisted(() => ({ fetchHistoryData: vi.fn() }));
const queueMocks = vi.hoisted(() => ({ add: vi.fn() }));
vi.hoisted(() => (process.env.SYNC_COMPUTE_TIMEOUT_MS = '500'));
vi.mock('../../../packages/backend/src/infrastructure/dataFacade.js', () => ({
  fetchHistoryData: dataServiceMocks.fetchHistoryData,
}));
vi.mock('../../../packages/backend/src/queues/backtestQueue.js', () =>
  mockBacktestQueue(queueMocks.add),
);
vi.mock('../../../packages/backend/src/utils/engineClient.js', () => engineMocks);
vi.mock('../../../packages/backend/src/config/index.js', () =>
  mockConfigModule({ NODE_ENV: 'test', SYNC_COMPUTE_TIMEOUT_MS: 500 }),
);
import '../../helpers/middlewareMocks.js';
vi.mock('../../../packages/backend/src/utils/metrics.js', async (o) => {
  const a = await o<typeof import('../../../packages/backend/src/utils/metrics.js')>();
  return { ...a, recordBacktestRequest: vi.fn(), recordDegradedResponse: vi.fn() };
});
import analysisRoutes from '../../../packages/backend/src/routes/analysisRoutes.js';
import { jobRoutes } from '../../../packages/backend/src/routes/jobRoutes.js';
import * as schemas from '../../../packages/backend/src/schemas/engineSchemas.js';
const fh = dataServiceMocks.fetchHistoryData;
const ce = engineMocks.callEngineStrict;
const rng = (s = '2020-01-01', e = '2024-01-01') => ({ startDate: s, endDate: e });
const md = (data: unknown) => ({ data, degraded: false });
const wts = [{ ticker: 'SPY', weight: 100 }];
const sigHist = [{ date: '2020-01-01', activeSignals: ['sig-1'], weights: wts }];
const post = (s: TestServer, p: string, b: unknown) => reqJson(`${s.url}${p}`, 'POST', b);
const setup = async (e: unknown, d?: unknown) => {
  vi.clearAllMocks();
  if (d !== void 0) fh.mockResolvedValue(md(d));
  ce.mockResolvedValue(e);
  return startExpressApp((a) => a.use('/api/v1', analysisRoutes));
};
const pcaRes = { eigenvalues: [2.5, 0.3, 0.2], eigenvectors: [[0.5, 0.5, 0.5]], explainedVarianceRatio: [0.83, 0.1, 0.07], principalComponents: [[1, 2, 3]] };
const letfRes = { slippageCurve: [{ date: '2020-01-01', slippage: 0.01 }], annualDecay: 0.05 };
const optRes = { successProbability: 0.85, probabilityCurve: [{ year: 1, probability: 0.95 }], optimalPath: [], requiredContribution: 20000 };
const goalBase = { initialAmount: 1e5, years: 20, assets: [{ ticker: 'SPY', weight: 100 }], numSimulations: 1000 }, goalValid = { targetAmount: 1e6, ...goalBase };
const CASES: any[] = [
  { name: 'PCA', path: '/api/v1/pca/analyze', validBody: { tickers: ['SPY', 'QQQ', 'IWM'], ...rng() }, engineResult: pcaRes, data: { SPY: { '2020-01-01': 300 }, QQQ: { '2020-01-01': 200 }, IWM: { '2020-01-01': 150 } }, expectSuccess: (b: any) => { expect((b.data.eigenvalues as unknown[]).length).toBe(3); expect((b.data.explainedVarianceRatio as number[])[0]).toBe(0.83); }, tickerBody: { tickers: ['spy', 'SPY', 'QQQ'], ...rng() }, expectTickerArgs: (a: any) => expect(a[0]).toEqual(['SPY', 'QQQ']), validationCases: [['tickers 少于 2 个', { tickers: ['SPY'], ...rng() }], ['缺少 startDate', { tickers: ['SPY', 'QQQ', 'IWM'], endDate: '2024-01-01' }]], notFoundCases: [['部分标的价格数据缺失', { SPY: { '2020-01-01': 300 }, QQQ: {}, IWM: {} }]], extraCases: [['重复 ticker 去重后不足 2 个应返回 422', { tickers: ['SPY', 'spy'], ...rng() }, 422, 'VALIDATION_ERROR']] },
  { name: 'LETF', path: '/api/v1/letf/analyze', validBody: { letfTicker: 'TQQQ', benchmarkTicker: 'QQQ', leverage: 3, ...rng() }, engineResult: letfRes, data: { TQQQ: { '2020-01-01': 30 }, QQQ: { '2020-01-01': 200 } }, expectSuccess: (b: any) => { expect((b.data.slippageCurve as unknown[]).length).toBe(1); expect(b.data.annualDecay).toBe(0.05); }, tickerBody: { letfTicker: 'tqqq', benchmarkTicker: 'qqq', leverage: 3, ...rng() }, expectTickerArgs: (a: any) => { expect(a[0]).toEqual(['TQQQ', 'QQQ']); expect(a[1]).toBe('2020-01-01'); expect(a[2]).toBe('2024-01-01'); }, validationCases: [['缺少 letfTicker', { benchmarkTicker: 'QQQ', leverage: 3, ...rng() }], ['leverage 为负数', { letfTicker: 'TQQQ', benchmarkTicker: 'QQQ', leverage: -1, ...rng() }]], notFoundCases: [['LETF 价格数据缺失', { TQQQ: {}, QQQ: { '2020-01-01': 200 } }], ['基准价格数据缺失', { TQQQ: { '2020-01-01': 30 }, QQQ: {} }]] },
  { name: 'GoalOptimizer', path: '/api/v1/goal-optimizer/optimize', validBody: goalValid, engineResult: optRes, data: { SPY: { '2020-01-01': 300 } }, expectSuccess: (b: any) => { expect(b.data.successProbability).toBe(0.85); expect((b.data.probabilityCurve as unknown[]).length).toBe(1); }, validationCases: [['缺少 targetAmount', goalBase], ['targetAmount 为负数', { ...goalValid, targetAmount: -100 }], ['空 assets 数组', { ...goalValid, assets: [] }]], notFoundCases: [['价格数据缺失', {}]] },
];
describe.each(CASES)('analysisRoutes - %s: POST %s', (c) => {
  const s = withServer(() => setup(c.engineResult, c.data));
  it('有效参数应返回分析结果', async () => {
    const { res, body } = await post(s(), c.path, c.validBody);
    expect(res.status).toBe(200);
    expect(ce).toHaveBeenCalledTimes(1);
    c.expectSuccess(body as { data: Record<string, unknown> });
  });
  if (c.tickerBody && c.expectTickerArgs)
    it('应将 ticker 转大写并去重后调用 fetchHistoryData', async () => {
      await post(s(), c.path, c.tickerBody);
      c.expectTickerArgs!(fh.mock.calls[0]);
    });
  (it.each as any)(c.validationCases)('%s 应返回 400', async (_n: any, b: any) => {
    expect((await post(s(), c.path, b)).res.status).toBe(400);
  });
  (it.each as any)(c.notFoundCases)('%s 应返回 404', async (_n: any, d: any) => {
    fh.mockResolvedValue(md(d));
    expect((await post(s(), c.path, c.validBody)).res.status).toBe(404);
  });
  (it.each as any)(c.extraCases ?? [])('%s', async (_n: any, b: any, sc: any, code: any) => {
    const { res, body: j } = await post(s(), c.path, b);
    expect(res.status).toBe(sc);
    expect(j.error.code).toBe(code);
  });
  it('引擎抛错时应返回 500', async () => {
    ce.mockRejectedValueOnce(new Error(`${c.name} engine error`));
    expect((await post(s(), c.path, c.validBody)).res.status).toBe(500);
  });
});
describe('FactorRegression', () => {
  const s = withServer(() => setup({ alpha: 0.01, beta: 1.05 }));
  const v = {
    monthlyReturns: [0.01, -0.02, 0.015],
    ffData: [{ mktRF: 0.02, smb: 0.005, hml: -0.01 }],
    factors: ['mktRF', 'smb'],
    startDate: '2020-01',
    endDate: '2020-12',
  };
  const m = { monthlyReturns: [0.01], ffData: [{ mktRF: 0.02 }] };
  const FR = '/api/v1/analysis/factor-regression';
  it('完整参数应返回 200 + 引擎结果', async () => {
    const { res, body } = await post(s(), FR, v);
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ alpha: 0.01, beta: 1.05 });
  });
  it('省略 factors/startDate/endDate 时使用默认值', async () => {
    await post(s(), FR, m);
    expect(ce).toHaveBeenCalledWith(
      '/api/engine/factor-regression',
      {
        monthlyReturns: [0.01],
        ffData: [{ mktRF: 0.02 }],
        factors: ['mktRF', 'smb', 'hml'],
        startDate: '',
        endDate: '',
      },
      schemas.factorRegressionResultSchema,
    );
  });
  it.each([
    ['缺失 monthlyReturns', { ffData: [{ mktRF: 0.02 }] }],
    ['monthlyReturns 为空数组', { monthlyReturns: [], ffData: [{ mktRF: 0.02 }] }],
    ['ffData 为空数组', { monthlyReturns: [0.01], ffData: [] }],
  ])('%s 应返回 400', async (_n, b) => {
    expect((await post(s(), FR, b)).res.status).toBe(400);
  });
  it('引擎抛错应返回 500', async () => {
    ce.mockRejectedValueOnce(new Error('fr boom'));
    expect((await post(s(), FR, m)).res.status).toBe(500);
  });
});
describe('Calculator', () => {
  const s = withServer(() => setup({ result: 'ok' }));
  it.each([
    ['cagr', { initialAmount: 10000, years: 10, rate: 0.07 }],
    ['swr', {}],
    ['frontier', {}],
  ])('%s 类型应返回 200 且透传 payload 到引擎', async (t, b) => {
    expect((await post(s(), `/api/v1/calculators/${t}`, b)).res.status).toBe(200);
    expect(ce).toHaveBeenCalledWith(
      '/api/engine/calculators',
      { type: t, ...b },
      schemas.calculatorResultSchema[t as keyof typeof schemas.calculatorResultSchema],
    );
  });
  it('无效 type 应返回 422', async () => {
    expect((await post(s(), '/api/v1/calculators/invalid', {})).res.status).toBe(422);
  });
  it('引擎不可用应返回 503', async () => {
    ce.mockRejectedValueOnce(new engineMocks.EngineUnavailableError('/api/engine/calculators'));
    const { res, body } = await post(s(), '/api/v1/calculators/cagr', {});
    expect(res.status).toBe(503);
    expect(body.error.code).toBe('ENGINE_UNAVAILABLE');
  });
  it('引擎抛错应返回 500', async () => {
    ce.mockRejectedValueOnce(new Error('calc boom'));
    expect((await post(s(), '/api/v1/calculators/cagr', {})).res.status).toBe(500);
  });
});
const sig = { id: 'sig-1', name: 'SMA Signal', conditions: [{ indicator: 'sma', period: 20, operator: 'cross_above', threshold: 0 }], targetWeights: wts }, mkStrat = () => ({ id: 'strat-1', name: 'Test Strategy', signals: [sig], aggregationMethod: 'weighted_average' }), baseReq = { startDate: '2020-01-01', endDate: '2020-01-03', startingValue: 10000, rebalanceFrequency: 'monthly' }, mkReq = (o?: Record<string, unknown>) => ({ strategy: o ?? mkStrat(), ...baseReq });
const tacSetup = (engine: (m: typeof ce) => void) =>
  withServer(() => {
    vi.clearAllMocks();
    fh.mockResolvedValue(md(createMockPriceData({ numDays: 3, startPrice: 300 })));
    engine(ce);
    return startExpressApp((a) => a.use('/api/v1', analysisRoutes));
  });
describe('tacticalRoutes - POST /api/tactical/backtest', () => {
  const s = tacSetup((m) =>
    m
      .mockResolvedValueOnce({
        portfolio: mockPortfolioResult({ name: 'Portfolio' }),
        signalHistory: sigHist,
      })
      .mockResolvedValueOnce({ portfolios: [mockPortfolioResult({ name: 'Portfolio' })] }),
  );
  it('有效参数应返回回测结果和基准', async () => {
    const { res, body } = await post(s(), '/api/v1/tactical/backtest', mkReq());
    expect(res.status).toBe(200);
    expect(body.data.signalHistory).toHaveLength(1);
  });
  it('无效标的数据应返回 404', async () => {
    fh.mockResolvedValue(md({}));
    expect((await post(s(), '/api/v1/tactical/backtest', mkReq())).res.status).toBe(404);
  });
  it.each([
    ['缺少 strategy', baseReq],
    ['空 signals 数组', mkReq({ ...mkStrat(), signals: [] })],
  ])('%s 应返回 400', async (_n, r) => {
    expect((await post(s(), '/api/v1/tactical/backtest', r)).res.status).toBe(400);
  });
  it('引擎抛错时应返回 500', async () => {
    ce.mockReset().mockRejectedValueOnce(new Error('tactical engine error'));
    expect((await post(s(), '/api/v1/tactical/backtest', mkReq())).res.status).toBe(500);
  });
  it('基准回测失败应 fail-closed', async () => {
    ce.mockReset()
      .mockResolvedValueOnce({
        portfolio: mockPortfolioResult({ name: 'P' }),
        signalHistory: sigHist,
      })
      .mockRejectedValueOnce(new Error('benchmark error'));
    expect((await post(s(), '/api/v1/tactical/backtest', mkReq())).res.status).toBe(500);
  });
});
describe('tacticalRoutes - POST /api/tactical/what-if', () => {
  const hist = { date: '2020-01-03', activeSignals: ['SMA Signal'], weights: wts };
  const s = tacSetup((m) => m.mockResolvedValue({ signalHistory: [hist] }));
  const wiReq = { tickers: ['SPY'], strategy: mkStrat() };
  it('有效参数应返回信号状态', async () => {
    const { res, body } = await post(s(), '/api/v1/tactical/what-if', wiReq);
    expect(res.status).toBe(200);
    expect(body.data[0]).toMatchObject({ ticker: 'SPY', signalType: 'buy' });
  });
  it('空 tickers 应返回 400', async () => {
    expect((await post(s(), '/api/v1/tactical/what-if', { tickers: [] })).res.status).toBe(400);
  });
  it('引擎抛错应返回 500', async () => {
    ce.mockRejectedValueOnce(new Error('what-if error'));
    expect((await post(s(), '/api/v1/tactical/what-if', wiReq)).res.status).toBe(500);
  });
});
const mkGridReq = () => ({ indicator: 'sma', param1: { min: 10, max: 20, step: 10 }, param2: { min: 10, max: 20, step: 10 }, tickers: ['SPY'], ...baseReq, endDate: '2024-01-01', objective: 'maxCAGR' });
const gridRes = { results: [{ param1: 10, param2: 10, cagr: 0.1, maxDrawdown: 0.05, sharpe: 1.5 }], heatmap: { param1Values: [10, 20], param2Values: [10, 20], matrix: [[0.1, 0.08], [0.09, 0.07]] }, best: { param1: 10, param2: 10, cagr: 0.1 } };
describe('tacticalGridRoutes - POST /api/tactical-grid/search', () => {
  const s = withServer(() => {
    vi.clearAllMocks();
    queueMocks.add.mockResolvedValue({ id: 'grid-job-123' });
    fh.mockResolvedValue(md(createMockPriceData({ numDays: 30, startPrice: 301 })));
    ce.mockResolvedValue(gridRes);
    return startExpressApp((a) => a.use('/api/v1', jobRoutes));
  });
  const g = (b: unknown) => post(s(), '/api/v1/tactical-grid/search', b);
  it('异步提交成功时应返回 202', async () => {
    const { res, body } = await g(mkGridReq());
    expect(res.status).toBe(202);
    expect(body).toMatchObject({ success: true, data: { jobId: 'grid-job-123' } });
  });
  it.each([
    ['缺少 indicator', { indicator: undefined }],
    ['空 tickers 数组', { tickers: [] }],
    ['无效日期格式', { startDate: 'not-a-date' }],
  ])('%s应返回 400', async (_n, patch: Record<string, unknown>) => {
    expect((await g({ ...mkGridReq(), ...patch })).res.status).toBe(400);
  });
  it('参数组合超过上限应返回 422', async () => {
    const wide = { min: 1, max: 100, step: 1 };
    expect((await g({ ...mkGridReq(), param1: wide, param2: wide })).res.status).toBe(422);
  });
  it('BullMQ 不可用时应回退到同步执行', async () => {
    queueMocks.add.mockRejectedValue(new Error('Redis unavailable'));
    const { res, body } = await g(mkGridReq());
    expect(res.status).toBe(200);
    expect(body.data.results).toHaveLength(1);
  });
  (it.each as any)([
    ['同步回退时价格数据缺失应返回 400', () => fh.mockResolvedValue(md({})), 400],
    ['同步回退引擎抛错应返回 500', () => ce.mockRejectedValue(new Error('grid engine error')), 500],
    ['BullMQ 回退同步执行超时应返回 503', () => fh.mockReturnValue(new Promise(() => {})), 503],
  ])('%s', async (_n: any, arrange: any, sc: any) => {
    queueMocks.add.mockRejectedValue(new Error('Redis unavailable'));
    arrange();
    expect((await g(mkGridReq())).res.status).toBe(sc);
  });
});
describe('认证用户请求', () => {
  const server = useTestServer('/api/v1', jobRoutes, {
    clearMocks: true,
    auth: { user: { sub: 'user-123', role: 'admin' }, tenantId: 'tenant-456' },
    configure: () => queueMocks.add.mockResolvedValue({ id: 'grid-job-auth-789' }),
  });
  it('应设置 ownerUserId 为实际用户 ID', async () => {
    await server.post('/tactical-grid/search', mkGridReq());
    expect(queueMocks.add).toHaveBeenCalledWith(
      'grid-search',
      expect.objectContaining({ ownerUserId: 'user-123', tenantId: 'tenant-456' }),
      expect.objectContaining({ jobId: expect.any(String) }),
    );
  });
});
