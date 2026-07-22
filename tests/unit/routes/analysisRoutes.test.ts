/**
 * analysisRoutes 合并单元测试 — ADR-042 路由整合
 *
 * 合并自 5 个原薄路由测试:letf-routes / pca-routes / goal-optimizer-routes /
 * factor-regression-routes / calculator-routes。
 *
 * 挂载方式:`app.use('/api/v1', analysisRoutes)`(与生产 app.ts 一致),
 * 子路径前缀保持与原路由一致,URL 不变。
 *
 * Mock 策略:
 *   - 中间件链(jwtAuth / resolveTenant / requirePermission / enforceQuota / auditLog)
 *     全部 mock 为透传 next(),避免触发真实 JWT/Redis/DB 调用
 *   - callEngineStrict + fetchHistoryData + logger 业务依赖按原 5 个测试 mock
 *   - 使用 startExpressApp + fetch 真实 HTTP
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';
import { mockLogger } from '../../helpers/mockFactories.js';
import { EngineUnavailableErrorStub } from '../../helpers/engineRouteMocks.js';

// --- vi.hoisted mock 占位 ----------------------------------------------------

const dataServiceMocks = vi.hoisted(() => ({
  fetchHistoryData: vi.fn(),
}));

const engineMocks = vi.hoisted(() => ({
  callEngineStrict: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// --- vi.mock 模块替换 ---------------------------------------------------------

vi.mock('../../../packages/backend/src/infrastructure/dataFacade.js', () => ({
  fetchHistoryData: dataServiceMocks.fetchHistoryData,
}));

vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
  callEngineStrict: engineMocks.callEngineStrict,
  EngineUnavailableError: EngineUnavailableErrorStub,
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

vi.mock('../../../packages/backend/src/utils/metrics.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../packages/backend/src/utils/metrics.js')>();
  return {
    ...actual,
    recordBacktestRequest: vi.fn(),
    recordDegradedResponse: vi.fn(),
  };
});

vi.mock('../../../packages/backend/src/middleware/jwtAuth.js', () => ({
  jwtAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  optionalJwtAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  assignGuestAnalyst: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../../packages/backend/src/middleware/tenantContext.js', () => ({
  resolveTenant: (_req: unknown, _res: unknown, next: () => void) => next(),
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

vi.mock('../../../packages/backend/src/middleware/auditLog.js', () => ({
  auditLog: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// --- 导入被测模块(在 mock 之后) ----------------------------------------------

import analysisRoutes from '../../../packages/backend/src/routes/analysisRoutes.js';

// --- 公共 mock 数据 ------------------------------------------------------------

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

// =============================================================================
// PCA — POST /api/v1/pca/analyze
// =============================================================================

describe('analysisRoutes - PCA: POST /api/v1/pca/analyze', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      data: {
        SPY: { '2020-01-01': 300.0, '2020-01-02': 301.0 },
        QQQ: { '2020-01-01': 200.0, '2020-01-02': 201.0 },
        IWM: { '2020-01-01': 150.0, '2020-01-02': 151.0 },
      },
      degraded: false,
    });
    engineMocks.callEngineStrict.mockResolvedValue(mockPcaResult);
    server = await startExpressApp((app) => app.use('/api/v1', analysisRoutes));
  });

  afterEach(async () => {
    await server.close();
  });

  it('有效参数应返回 PCA 分析结果', async () => {
    const res = await fetch(`${server.url}/api/v1/pca/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['SPY', 'QQQ', 'IWM'],
        startDate: '2020-01-01',
        endDate: '2024-01-01',
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.eigenvalues).toHaveLength(3);
    expect(body.data.explainedVarianceRatio[0]).toBe(0.83);
    expect(engineMocks.callEngineStrict).toHaveBeenCalledTimes(1);
  });

  it('应将 ticker 转大写并去重后调用 fetchHistoryData', async () => {
    await fetch(`${server.url}/api/v1/pca/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['spy', 'SPY', 'QQQ'],
        startDate: '2020-01-01',
        endDate: '2024-01-01',
      }),
    });

    const callArgs = dataServiceMocks.fetchHistoryData.mock.calls[0];
    expect(callArgs[0]).toEqual(['SPY', 'QQQ']);
  });

  it('tickers 少于 2 个应返回 400（zod 校验失败）', async () => {
    const res = await fetch(`${server.url}/api/v1/pca/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['SPY'],
        startDate: '2020-01-01',
        endDate: '2024-01-01',
      }),
    });

    expect(res.status).toBe(400);
    expect(engineMocks.callEngineStrict).not.toHaveBeenCalled();
  });

  it('缺少 startDate 应返回 400（zod 校验失败）', async () => {
    const res = await fetch(`${server.url}/api/v1/pca/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['SPY', 'QQQ', 'IWM'],
        endDate: '2024-01-01',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('空 tickers 数组应返回 400（zod 校验失败）', async () => {
    const res = await fetch(`${server.url}/api/v1/pca/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: [],
        startDate: '2020-01-01',
        endDate: '2024-01-01',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('重复 ticker 去重后不足 2 个应返回 422', async () => {
    const res = await fetch(`${server.url}/api/v1/pca/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['SPY', 'spy'],
        startDate: '2020-01-01',
        endDate: '2024-01-01',
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error.detail).toContain('至少需要 2 个资产');
  });

  it('部分标的价格数据缺失时应返回 404', async () => {
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      data: {
        SPY: { '2020-01-01': 300.0 },
        QQQ: {},
        IWM: { '2020-01-01': 150.0 },
      },
      degraded: false,
    });

    const res = await fetch(`${server.url}/api/v1/pca/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['SPY', 'QQQ', 'IWM'],
        startDate: '2020-01-01',
        endDate: '2024-01-01',
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.detail).toContain('QQQ');
  });

  it('引擎抛错时应返回 500', async () => {
    engineMocks.callEngineStrict.mockRejectedValueOnce(new Error('pca engine error'));

    const res = await fetch(`${server.url}/api/v1/pca/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['SPY', 'QQQ', 'IWM'],
        startDate: '2020-01-01',
        endDate: '2024-01-01',
      }),
    });

    expect(res.status).toBe(500);
  });
});

// =============================================================================
// LETF — POST /api/v1/letf/analyze
// =============================================================================

describe('analysisRoutes - LETF: POST /api/v1/letf/analyze', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      data: {
        TQQQ: { '2020-01-01': 30.0, '2020-01-02': 31.0 },
        QQQ: { '2020-01-01': 200.0, '2020-01-02': 201.0 },
      },
      degraded: false,
    });
    engineMocks.callEngineStrict.mockResolvedValue(mockLetfResult);
    server = await startExpressApp((app) => app.use('/api/v1', analysisRoutes));
  });

  afterEach(async () => {
    await server.close();
  });

  it('有效参数应返回滑点分析结果', async () => {
    const res = await fetch(`${server.url}/api/v1/letf/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        letfTicker: 'TQQQ',
        benchmarkTicker: 'QQQ',
        leverage: 3,
        startDate: '2020-01-01',
        endDate: '2024-01-01',
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.slippageCurve).toHaveLength(1);
    expect(body.data.annualDecay).toBe(0.05);
    expect(engineMocks.callEngineStrict).toHaveBeenCalledTimes(1);
  });

  it('应将 ticker 转为大写并调用 fetchHistoryData', async () => {
    await fetch(`${server.url}/api/v1/letf/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        letfTicker: 'tqqq',
        benchmarkTicker: 'qqq',
        leverage: 3,
        startDate: '2020-01-01',
        endDate: '2024-01-01',
      }),
    });

    const callArgs = dataServiceMocks.fetchHistoryData.mock.calls[0];
    expect(callArgs[0]).toEqual(['TQQQ', 'QQQ']);
    expect(callArgs[1]).toBe('2020-01-01');
    expect(callArgs[2]).toBe('2024-01-01');
  });

  it('缺少 letfTicker 应返回 400（zod 校验失败）', async () => {
    const req = {
      benchmarkTicker: 'QQQ',
      leverage: 3,
      startDate: '2020-01-01',
      endDate: '2024-01-01',
    };

    const res = await fetch(`${server.url}/api/v1/letf/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
    expect(engineMocks.callEngineStrict).not.toHaveBeenCalled();
  });

  it('leverage 为负数应返回 400（zod 校验失败）', async () => {
    const res = await fetch(`${server.url}/api/v1/letf/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        letfTicker: 'TQQQ',
        benchmarkTicker: 'QQQ',
        leverage: -1,
        startDate: '2020-01-01',
        endDate: '2024-01-01',
      }),
    });

    expect(res.status).toBe(400);
    expect(engineMocks.callEngineStrict).not.toHaveBeenCalled();
  });

  it('缺少 startDate 应返回 400（zod 校验失败）', async () => {
    const res = await fetch(`${server.url}/api/v1/letf/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        letfTicker: 'TQQQ',
        benchmarkTicker: 'QQQ',
        leverage: 3,
        endDate: '2024-01-01',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('LETF 价格数据缺失时应返回 404', async () => {
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      data: {
        TQQQ: {},
        QQQ: { '2020-01-01': 200.0 },
      },
      degraded: false,
    });

    const res = await fetch(`${server.url}/api/v1/letf/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        letfTicker: 'TQQQ',
        benchmarkTicker: 'QQQ',
        leverage: 3,
        startDate: '2020-01-01',
        endDate: '2024-01-01',
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.detail).toContain('TQQQ');
  });

  it('基准价格数据缺失时应返回 404', async () => {
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      data: {
        TQQQ: { '2020-01-01': 30.0 },
        QQQ: {},
      },
      degraded: false,
    });

    const res = await fetch(`${server.url}/api/v1/letf/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        letfTicker: 'TQQQ',
        benchmarkTicker: 'QQQ',
        leverage: 3,
        startDate: '2020-01-01',
        endDate: '2024-01-01',
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.detail).toContain('QQQ');
  });

  it('引擎抛错时应返回 500', async () => {
    engineMocks.callEngineStrict.mockRejectedValueOnce(new Error('letf engine error'));

    const res = await fetch(`${server.url}/api/v1/letf/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        letfTicker: 'TQQQ',
        benchmarkTicker: 'QQQ',
        leverage: 3,
        startDate: '2020-01-01',
        endDate: '2024-01-01',
      }),
    });

    expect(res.status).toBe(500);
  });
});

// =============================================================================
// GoalOptimizer — POST /api/v1/goal-optimizer/optimize
// =============================================================================

describe('analysisRoutes - GoalOptimizer: POST /api/v1/goal-optimizer/optimize', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      data: {
        SPY: { '2020-01-01': 300.0, '2020-01-02': 301.0 },
      },
      degraded: false,
    });
    engineMocks.callEngineStrict.mockResolvedValue(mockOptimizeResult);
    server = await startExpressApp((app) => app.use('/api/v1', analysisRoutes));
  });

  afterEach(async () => {
    await server.close();
  });

  function createValidRequest() {
    return {
      targetAmount: 1000000,
      initialAmount: 100000,
      years: 20,
      assets: [{ ticker: 'SPY', weight: 100 }],
      numSimulations: 1000,
    };
  }

  it('有效参数应返回优化结果', async () => {
    const res = await fetch(`${server.url}/api/v1/goal-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.successProbability).toBe(0.85);
    expect(body.data.probabilityCurve).toHaveLength(1);
    expect(engineMocks.callEngineStrict).toHaveBeenCalledTimes(1);
  });

  it('缺少 targetAmount 应返回 400（zod 校验失败）', async () => {
    const req = createValidRequest();
    delete (req as Record<string, unknown>).targetAmount;

    const res = await fetch(`${server.url}/api/v1/goal-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
    expect(engineMocks.callEngineStrict).not.toHaveBeenCalled();
  });

  it('targetAmount 为负数应返回 400（zod 校验失败）', async () => {
    const req = createValidRequest();
    req.targetAmount = -100;

    const res = await fetch(`${server.url}/api/v1/goal-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
    expect(engineMocks.callEngineStrict).not.toHaveBeenCalled();
  });

  it('空 assets 数组应返回 400（zod 校验失败）', async () => {
    const req = createValidRequest();
    req.assets = [];

    const res = await fetch(`${server.url}/api/v1/goal-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
    expect(engineMocks.callEngineStrict).not.toHaveBeenCalled();
  });

  it('价格数据缺失时应返回 404', async () => {
    dataServiceMocks.fetchHistoryData.mockResolvedValue({ data: {}, degraded: false });

    const res = await fetch(`${server.url}/api/v1/goal-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.detail).toContain('未找到价格数据');
    expect(engineMocks.callEngineStrict).not.toHaveBeenCalled();
  });

  it('部分标的价格数据缺失时应返回 404', async () => {
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      data: {
        SPY: {},
      },
      degraded: false,
    });

    const res = await fetch(`${server.url}/api/v1/goal-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.detail).toContain('SPY');
  });

  it('空白 ticker 应触发有效标的校验失败', async () => {
    const req = createValidRequest();
    req.assets = [{ ticker: '   ', weight: 100 }];

    const res = await fetch(`${server.url}/api/v1/goal-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error.detail).toContain('至少添加一个有效标的');
  });

  it('引擎抛错时应返回 500', async () => {
    engineMocks.callEngineStrict.mockRejectedValueOnce(new Error('engine boom'));

    const res = await fetch(`${server.url}/api/v1/goal-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });

    expect(res.status).toBe(500);
  });
});

// =============================================================================
// FactorRegression — POST /api/v1/analysis/factor-regression
// =============================================================================

describe('analysisRoutes - FactorRegression: POST /api/v1/analysis/factor-regression', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    engineMocks.callEngineStrict.mockResolvedValue({ alpha: 0.01, beta: 1.05 });
    server = await startExpressApp((app) => app.use('/api/v1', analysisRoutes));
  });

  afterEach(async () => {
    await server.close();
  });

  it('完整参数应返回 200 + 引擎结果，factors/startDate/endDate 透传', async () => {
    const payload = {
      monthlyReturns: [0.01, -0.02, 0.015],
      ffData: [{ mktRF: 0.02, smb: 0.005, hml: -0.01 }],
      factors: ['mktRF', 'smb'],
      startDate: '2020-01',
      endDate: '2020-12',
    };

    const res = await fetch(`${server.url}/api/v1/analysis/factor-regression`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ alpha: 0.01, beta: 1.05 });
    expect(engineMocks.callEngineStrict).toHaveBeenCalledWith('/api/engine/factor-regression', {
      monthlyReturns: payload.monthlyReturns,
      ffData: payload.ffData,
      factors: ['mktRF', 'smb'],
      startDate: '2020-01',
      endDate: '2020-12',
    });
  });

  it('省略 factors/startDate/endDate 时使用默认值', async () => {
    await fetch(`${server.url}/api/v1/analysis/factor-regression`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        monthlyReturns: [0.01],
        ffData: [{ mktRF: 0.02 }],
      }),
    });

    expect(engineMocks.callEngineStrict).toHaveBeenCalledWith('/api/engine/factor-regression', {
      monthlyReturns: [0.01],
      ffData: [{ mktRF: 0.02 }],
      factors: ['mktRF', 'smb', 'hml'],
      startDate: '',
      endDate: '',
    });
  });

  it('缺失 monthlyReturns 应返回 422', async () => {
    const res = await fetch(`${server.url}/api/v1/analysis/factor-regression`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ffData: [{ mktRF: 0.02 }] }),
    });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.detail).toContain('monthlyReturns');
    expect(engineMocks.callEngineStrict).not.toHaveBeenCalled();
  });

  it('monthlyReturns 为空数组应返回 422', async () => {
    const res = await fetch(`${server.url}/api/v1/analysis/factor-regression`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthlyReturns: [], ffData: [{ mktRF: 0.02 }] }),
    });

    expect(res.status).toBe(422);
    expect(engineMocks.callEngineStrict).not.toHaveBeenCalled();
  });

  it('monthlyReturns 为非数组（字符串）应返回 422', async () => {
    const res = await fetch(`${server.url}/api/v1/analysis/factor-regression`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthlyReturns: 'not-array', ffData: [{ mktRF: 0.02 }] }),
    });

    expect(res.status).toBe(422);
    expect(engineMocks.callEngineStrict).not.toHaveBeenCalled();
  });

  it('ffData 为空数组应返回 422', async () => {
    const res = await fetch(`${server.url}/api/v1/analysis/factor-regression`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthlyReturns: [0.01], ffData: [] }),
    });

    expect(res.status).toBe(422);
    expect(engineMocks.callEngineStrict).not.toHaveBeenCalled();
  });

  it('引擎抛 EngineUnavailableError 应返回 503 + Retry-After', async () => {
    engineMocks.callEngineStrict.mockRejectedValueOnce(
      new EngineUnavailableErrorStub('/api/engine/factor-regression'),
    );

    const res = await fetch(`${server.url}/api/v1/analysis/factor-regression`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthlyReturns: [0.01], ffData: [{ mktRF: 0.02 }] }),
    });

    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('30');
  });

  it('引擎抛普通 Error 应返回 500 FR_ERROR', async () => {
    engineMocks.callEngineStrict.mockRejectedValueOnce(new Error('fr boom'));

    const res = await fetch(`${server.url}/api/v1/analysis/factor-regression`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthlyReturns: [0.01], ffData: [{ mktRF: 0.02 }] }),
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.code).toBe('FR_ERROR');
  });
});

// =============================================================================
// Calculator — POST /api/v1/calculators/:type
// =============================================================================

describe('analysisRoutes - Calculator: POST /api/v1/calculators/:type', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    engineMocks.callEngineStrict.mockResolvedValue({ result: 'ok' });
    server = await startExpressApp((app) => app.use('/api/v1', analysisRoutes));
  });

  afterEach(async () => {
    await server.close();
  });

  it('cagr 类型应返回 200 + 引擎结果', async () => {
    const res = await fetch(`${server.url}/api/v1/calculators/cagr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initialAmount: 10000, years: 10, rate: 0.07 }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ result: 'ok' });
    expect(engineMocks.callEngineStrict).toHaveBeenCalledTimes(1);
    const [endpoint, payload] = engineMocks.callEngineStrict.mock.calls[0];
    expect(endpoint).toBe('/api/engine/calculators');
    expect(payload).toMatchObject({
      type: 'cagr',
      initialAmount: 10000,
      years: 10,
      rate: 0.07,
    });
  });

  it('swr 与 frontier 类型同样被接受', async () => {
    for (const type of ['swr', 'frontier']) {
      engineMocks.callEngineStrict.mockClear();
      const res = await fetch(`${server.url}/api/v1/calculators/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      expect(engineMocks.callEngineStrict).toHaveBeenCalledWith('/api/engine/calculators', {
        type,
      });
    }
  });

  it('无效 type 应返回 422 CALC_INVALID_TYPE 且不调用引擎', async () => {
    const res = await fetch(`${server.url}/api/v1/calculators/invalid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error.code).toBe('CALC_INVALID_TYPE');
    expect(body.error.detail).toContain('cagr');
    expect(engineMocks.callEngineStrict).not.toHaveBeenCalled();
  });

  it('引擎抛 EngineUnavailableError 应返回 503 + Retry-After（ADR-031 fail-closed）', async () => {
    engineMocks.callEngineStrict.mockRejectedValueOnce(
      new EngineUnavailableErrorStub('/api/engine/calculators'),
    );

    const res = await fetch(`${server.url}/api/v1/calculators/cagr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('30');
    const body = await res.json();
    expect(body.error.code).toBe('ENGINE_UNAVAILABLE');
    expect(body.degraded).toBe(true);
  });

  it('引擎抛普通 Error 应返回 500 CALC_ERROR', async () => {
    engineMocks.callEngineStrict.mockRejectedValueOnce(new Error('calc boom'));

    const res = await fetch(`${server.url}/api/v1/calculators/cagr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.code).toBe('CALC_ERROR');
  });

  it('body 为空对象时仍以 type 透传到引擎', async () => {
    await fetch(`${server.url}/api/v1/calculators/swr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(engineMocks.callEngineStrict).toHaveBeenCalledWith('/api/engine/calculators', {
      type: 'swr',
    });
  });
});
