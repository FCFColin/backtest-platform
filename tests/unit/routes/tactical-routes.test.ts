/**
 * 战术分配路由单元测试
 *
 * 企业理由：战术分配回测、实时价格查询、告警配置是策略管理核心功能，
 * 参数校验和鉴权影响安全与正确性。测试覆盖：回测成功/失败、what-if 查询、告警配置。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';
import { mockLogger, createConfigMocks } from '../../helpers/mockFactories.js';

const dataServiceMocks = vi.hoisted(() => ({
  fetchHistoryData: vi.fn(),
}));

const portfolioMocks = vi.hoisted(() => ({
  runPortfolioBacktest: vi.fn(),
}));

const tacticalMocks = vi.hoisted(() => ({
  collectTickers: vi.fn(),
  runTacticalBacktest: vi.fn(),
  computeSimpleStatistics: vi.fn(),
  analyzeWhatIf: vi.fn(),
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

vi.mock('../../../packages/backend/src/services/dataService.js', () => ({
  fetchHistoryData: dataServiceMocks.fetchHistoryData,
}));

vi.mock('../../../packages/backend/src/engine/backtestRunner.js', () => ({
  runPortfolioBacktest: portfolioMocks.runPortfolioBacktest,
}));

vi.mock('../../../packages/backend/src/engine/tactical.js', () => ({
  collectTickers: tacticalMocks.collectTickers,
  runTacticalBacktest: tacticalMocks.runTacticalBacktest,
  computeSimpleStatistics: tacticalMocks.computeSimpleStatistics,
  analyzeWhatIf: tacticalMocks.analyzeWhatIf,
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: createConfigMocks({
    NODE_ENV: 'test',
    ADMIN_API_KEY: '',
  }),
  validateConfig: vi.fn(),
}));

vi.mock('../../../packages/backend/src/middleware/auth.js', () => ({
  jwtAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../../packages/backend/src/middleware/rbac.js', () => ({
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  Permission: { STRATEGY_MANAGE: 'strategy:manage' },
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

import tacticalRoutes from '../../../packages/backend/src/routes/tacticalRoutes.js';

function createValidStrategy() {
  return {
    id: 'strat-1',
    name: 'Test Strategy',
    signals: [
      {
        id: 'sig-1',
        name: 'SMA Signal',
        conditions: [
          {
            indicator: 'sma' as const,
            period: 20,
            operator: 'cross_above' as const,
            threshold: 0,
          },
        ],
        targetWeights: [{ ticker: 'SPY', weight: 100 }],
      },
    ],
    aggregationMethod: 'weighted_average' as const,
  };
}

function createMockPriceData() {
  return {
    SPY: { '2020-01-01': 300.0, '2020-01-02': 301.0, '2020-01-03': 302.0 },
  };
}

function createMockPortfolioResult() {
  return {
    name: 'Portfolio',
    growthCurve: [{ date: '2020-01-01', value: 10000 }],
    drawdownCurve: [],
    rollingReturns: [],
    annualReturns: [],
    monthlyReturns: [],
    statistics: {
      cagr: 0.1,
      mwrr: 0.1,
      stdev: 0.15,
      sharpe: 1.5,
      sortino: 1.8,
      maxDrawdown: 0.1,
      maxDrawdownDuration: 10,
      bestYear: 0.2,
      worstYear: -0.05,
      avgYear: 0.1,
      totalReturn: 0.2,
    },
  };
}

describe('tacticalRoutes - POST /api/tactical/backtest', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    tacticalMocks.collectTickers.mockReturnValue(['SPY']);
    dataServiceMocks.fetchHistoryData.mockResolvedValue(createMockPriceData());
    tacticalMocks.runTacticalBacktest.mockReturnValue({
      result: createMockPortfolioResult(),
      signalHistory: [
        { date: '2020-01-01', activeSignals: ['sig-1'], weights: [{ ticker: 'SPY', weight: 100 }] },
      ],
    });
    portfolioMocks.runPortfolioBacktest.mockReturnValue({
      portfolios: [createMockPortfolioResult()],
      benchmarkGrowth: [{ date: '2020-01-01', value: 10000 }],
    });
    server = await startExpressApp((app) => app.use('/api/tactical', tacticalRoutes));
  });

  afterEach(async () => {
    await server.close();
  });

  it('有效参数应返回回测结果和基准', async () => {
    const req = {
      strategy: createValidStrategy(),
      startDate: '2020-01-01',
      endDate: '2020-01-03',
      startingValue: 10000,
      rebalanceFrequency: 'monthly' as const,
    };

    const res = await fetch(`${server.url}/api/tactical/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.portfolio).toBeDefined();
    expect(body.data.benchmark).toBeDefined();
    expect(body.data.signalHistory).toHaveLength(1);
    expect(tacticalMocks.runTacticalBacktest).toHaveBeenCalledTimes(1);
    expect(portfolioMocks.runPortfolioBacktest).toHaveBeenCalledTimes(1);
  });

  it('无效标的数据应返回 422', async () => {
    dataServiceMocks.fetchHistoryData.mockResolvedValue({});

    const req = {
      strategy: createValidStrategy(),
      startDate: '2020-01-01',
      endDate: '2020-01-03',
      startingValue: 10000,
      rebalanceFrequency: 'monthly' as const,
    };

    const res = await fetch(`${server.url}/api/tactical/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error.detail).toContain('SPY');
  });

  it('缺少 strategy 应返回 400（zod 校验失败）', async () => {
    const req = {
      startDate: '2020-01-01',
      endDate: '2020-01-03',
      startingValue: 10000,
      rebalanceFrequency: 'monthly',
    };

    const res = await fetch(`${server.url}/api/tactical/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
  });

  it('空 signals 数组应返回 400（zod 校验失败）', async () => {
    const req = {
      strategy: { ...createValidStrategy(), signals: [] },
      startDate: '2020-01-01',
      endDate: '2020-01-03',
      startingValue: 10000,
      rebalanceFrequency: 'monthly',
    };

    const res = await fetch(`${server.url}/api/tactical/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
  });

  it('runTacticalBacktest 抛错时应返回 500', async () => {
    tacticalMocks.runTacticalBacktest.mockImplementation(() => {
      throw new Error('tactical engine error');
    });

    const req = {
      strategy: createValidStrategy(),
      startDate: '2020-01-01',
      endDate: '2020-01-03',
      startingValue: 10000,
      rebalanceFrequency: 'monthly',
    };

    const res = await fetch(`${server.url}/api/tactical/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(500);
  });

  it('基准回测失败时应使用空结果兜底', async () => {
    portfolioMocks.runPortfolioBacktest.mockImplementation(() => {
      throw new Error('benchmark error');
    });
    tacticalMocks.computeSimpleStatistics.mockReturnValue({
      cagr: 0,
      mwrr: 0,
      stdev: 0,
      sharpe: 0,
      sortino: 0,
      maxDrawdown: 0,
      maxDrawdownDuration: 0,
      bestYear: 0,
      worstYear: 0,
      avgYear: 0,
      totalReturn: 0,
    });

    const req = {
      strategy: createValidStrategy(),
      startDate: '2020-01-01',
      endDate: '2020-01-03',
      startingValue: 10000,
      rebalanceFrequency: 'monthly',
    };

    const res = await fetch(`${server.url}/api/tactical/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.benchmark.growthCurve).toEqual([]);
  });
});

describe('tacticalRoutes - POST /api/tactical/what-if', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    dataServiceMocks.fetchHistoryData.mockResolvedValue(createMockPriceData());
    tacticalMocks.analyzeWhatIf.mockReturnValue([
      { ticker: 'SPY', price: 302.0, signals: ['buy'] },
    ]);
    server = await startExpressApp((app) => app.use('/api/tactical', tacticalRoutes));
  });

  afterEach(async () => {
    await server.close();
  });

  it('有效参数应返回实时价格和信号状态', async () => {
    const req = {
      tickers: ['SPY'],
      strategy: createValidStrategy(),
    };

    const res = await fetch(`${server.url}/api/tactical/what-if`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data[0].ticker).toBe('SPY');
    expect(body.data[0].price).toBe(302.0);
    expect(tacticalMocks.analyzeWhatIf).toHaveBeenCalledTimes(1);
  });

  it('空 tickers 数组应返回 400（zod 校验失败）', async () => {
    const req = {
      tickers: [],
    };

    const res = await fetch(`${server.url}/api/tactical/what-if`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
  });

  it('analyzeWhatIf 抛错时应返回 500', async () => {
    tacticalMocks.analyzeWhatIf.mockImplementation(() => {
      throw new Error('what-if error');
    });

    const req = {
      tickers: ['SPY'],
    };

    const res = await fetch(`${server.url}/api/tactical/what-if`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(500);
  });
});

describe('tacticalRoutes - POST /api/tactical/alerts', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startExpressApp((app) => app.use('/api/tactical', tacticalRoutes));
  });

  afterEach(async () => {
    await server.close();
  });

  it('有效告警配置应保存成功', async () => {
    const req = {
      config: {
        enabled: true,
        email: 'test@example.com',
        triggers: ['signal_change', 'rebalance'],
      },
    };

    const res = await fetch(`${server.url}/api/tactical/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.saved).toBe(true);
    expect(body.data.config.enabled).toBe(true);
    expect(body.data.config.email).toBe('test@example.com');
  });

  it('启用告警但未填邮箱应返回 400', async () => {
    const req = {
      config: {
        enabled: true,
        triggers: ['signal_change'],
      },
    };

    const res = await fetch(`${server.url}/api/tactical/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error.detail).toContain('邮箱');
  });

  it('禁用告警时无需邮箱应保存成功', async () => {
    const req = {
      config: {
        enabled: false,
      },
    };

    const res = await fetch(`${server.url}/api/tactical/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(200);
  });

  it('缺少 config 应返回 400（zod 校验失败）', async () => {
    const res = await fetch(`${server.url}/api/tactical/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});
