/**
 * 回测路由单元测试（Task 11）
 *
 * 企业理由：回测路由是核心业务入口，必须保证：
 * 1. 有效参数 → 调用 Application Service 并返回 200
 * 2. 无效参数（zod 校验失败）→ 返回 400
 * 3. 缺少必填字段 → 返回 400
 * 4. Application Service 抛错 → 返回 500
 * 5. 无效 ticker（价格数据缺失）→ 返回 success: false
 *
 * 权衡：使用 Express app.listen + 真实 HTTP 请求，mock Application Service 与数据服务。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { BacktestResult } from '../../../shared/types.js';

// ===== vi.hoisted =====
const appServiceMocks = vi.hoisted(() => ({
  runBacktest: vi.fn(),
}));

const dataServiceMocks = vi.hoisted(() => ({
  fetchHistoryData: vi.fn(),
  searchTickers: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

const engineMocks = vi.hoisted(() => ({
  runAnalysis: vi.fn(),
  calculateDrag: vi.fn(),
  runMonteCarlo: vi.fn(),
  optimizePortfolio: vi.fn(),
  calcEfficientFrontier: vi.fn(),
}));

const rustFallbackMocks = vi.hoisted(() => ({
  callRustWithFallback: vi.fn(),
  unwrapFallbackResult: vi.fn(),
}));

const rustBodyBuilderMocks = vi.hoisted(() => ({
  buildRustPortfolioBody: vi.fn(),
  buildRustParams: vi.fn(),
}));

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
}));

// ===== Mock 模块 =====

vi.mock('../../../api/utils/logger.js', () => ({
  logger: {
    info: loggerMocks.info,
    warn: loggerMocks.warn,
    error: loggerMocks.error,
    debug: loggerMocks.debug,
  },
}));

vi.mock('../../../api/application/backtest-service.js', () => ({
  backtestApplicationService: {
    runBacktest: appServiceMocks.runBacktest,
  },
}));

vi.mock('../../../api/services/dataService.js', () => ({
  fetchHistoryData: dataServiceMocks.fetchHistoryData,
  searchTickers: dataServiceMocks.searchTickers,
}));

vi.mock('../../../api/engine/portfolio.js', () => ({
  runAnalysis: engineMocks.runAnalysis,
  calculateDrag: engineMocks.calculateDrag,
}));

vi.mock('../../../api/engine/monteCarlo.js', () => ({
  runMonteCarlo: engineMocks.runMonteCarlo,
}));

vi.mock('../../../api/engine/optimizer.js', () => ({
  optimizePortfolio: engineMocks.optimizePortfolio,
  calcEfficientFrontier: engineMocks.calcEfficientFrontier,
}));

vi.mock('../../../api/utils/rustFallback.js', () => ({
  callRustWithFallback: rustFallbackMocks.callRustWithFallback,
  unwrapFallbackResult: rustFallbackMocks.unwrapFallbackResult,
}));

vi.mock('../../../api/utils/rustBodyBuilder.js', () => ({
  buildRustPortfolioBody: rustBodyBuilderMocks.buildRustPortfolioBody,
  buildRustParams: rustBodyBuilderMocks.buildRustParams,
}));

vi.mock('../../../api/config/index.js', () => ({
  config: {
    NODE_ENV: 'test',
    RUST_ENGINE_URL: 'http://127.0.0.1:5002',
    GO_ENGINE_URL: 'http://127.0.0.1:5002',
    ENGINE_AUTH_TOKEN: 'test-token',
    RUST_ENGINE_TIMEOUT_MS: 5000,
  },
  DEGRADED_WARNING: {
    BASE: '降级模式',
    WITH_DRAG: '降级模式（含 drag）',
    WITHOUT_DRAG: '降级模式（无 drag）',
  },
  validateConfig: vi.fn(),
}));

// Mock fs：避免读取 CPI/汇率文件
vi.mock('fs', () => ({
  default: {
    existsSync: fsMocks.existsSync,
    readFileSync: fsMocks.readFileSync,
  },
  existsSync: fsMocks.existsSync,
  readFileSync: fsMocks.readFileSync,
}));

import backtestRoutes from '../../../api/routes/backtestRoutes.js';

/** 在随机端口启动 Express 应用 */
async function startApp(): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/backtest', backtestRoutes);
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

/** 构造有效的回测请求体 */
function createValidRequestBody() {
  return {
    portfolios: [
      {
        assets: [{ ticker: 'AAPL', weight: 60 }, { ticker: 'BND', weight: 40 }],
        rebalanceFrequency: 'monthly' as const,
      },
    ],
    parameters: {
      startDate: '2024-01-01',
      endDate: '2024-06-30',
      startingValue: 10000,
    },
  };
}

/** 构造 mock 回测结果 */
function createMockBacktestResult(): BacktestResult {
  return {
    portfolios: [
      {
        name: 'Portfolio 0',
        growthCurve: [
          { date: '2024-01-02', value: 10000 },
          { date: '2024-01-03', value: 10100 },
        ],
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
          maxDrawdown: 0.15,
          maxDrawdownDuration: 30,
          bestYear: 0.2,
          worstYear: -0.1,
          avgYear: 0.1,
          totalReturn: 0.2,
        },
      },
    ],
    correlations: [[1]],
  } as BacktestResult;
}

describe('backtestRoutes - POST /api/backtest/portfolio', () => {
  let server: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    vi.clearAllMocks();
    // 默认：fetchHistoryData 返回有效价格数据
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      AAPL: { '2024-01-02': 185.5, '2024-01-03': 186.0 },
      BND: { '2024-01-02': 72.3, '2024-01-03': 72.5 },
    });
    // 默认：runBacktest 返回成功结果
    appServiceMocks.runBacktest.mockResolvedValue({
      result: createMockBacktestResult(),
      degraded: false,
    });
    // CPI/汇率文件不存在
    fsMocks.existsSync.mockReturnValue(false);
    server = await startApp();
  });

  afterEach(async () => {
    await server.close();
  });

  it('有效参数应调用 Application Service 并返回 200', async () => {
    const body = createValidRequestBody();

    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
    // 应调用 Application Service
    expect(appServiceMocks.runBacktest).toHaveBeenCalledTimes(1);
    // 应调用 fetchHistoryData 获取价格数据
    expect(dataServiceMocks.fetchHistoryData).toHaveBeenCalledTimes(1);
  });

  it('应以正确的参数调用 fetchHistoryData（含 benchmarkTicker）', async () => {
    const body = createValidRequestBody();
    body.parameters.benchmarkTicker = 'SPY';

    // SPY 也需要返回价格数据
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      AAPL: { '2024-01-02': 185.5 },
      BND: { '2024-01-02': 72.3 },
      SPY: { '2024-01-02': 450.0 },
    });

    await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    // fetchHistoryData 应收到包含 SPY 的 ticker 列表
    const callArgs = dataServiceMocks.fetchHistoryData.mock.calls[0];
    const tickers = callArgs[0] as string[];
    expect(tickers).toContain('AAPL');
    expect(tickers).toContain('BND');
    expect(tickers).toContain('SPY');
    expect(callArgs[1]).toBe('2024-01-01'); // startDate
    expect(callArgs[2]).toBe('2024-06-30'); // endDate
  });

  it('无效日期格式应返回 400（zod 校验失败）', async () => {
    const body = createValidRequestBody();
    // 无效日期格式（zod 要求 YYYY-MM-DD）
    (body.parameters as any).startDate = 'not-a-date';

    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.status).toBe(400);
    expect(json.detail).toContain('validation failed');
    // 不应调用 Application Service
    expect(appServiceMocks.runBacktest).not.toHaveBeenCalled();
  });

  it('缺少 portfolios 字段应返回 400', async () => {
    const body = {
      parameters: { startDate: '2024-01-01', endDate: '2024-06-30' },
    };

    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(400);
    // 不应调用 Application Service
    expect(appServiceMocks.runBacktest).not.toHaveBeenCalled();
  });

  it('缺少 parameters 字段应返回 400', async () => {
    const body = {
      portfolios: [
        {
          assets: [{ ticker: 'AAPL', weight: 100 }],
          rebalanceFrequency: 'monthly',
        },
      ],
    };

    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(400);
    expect(appServiceMocks.runBacktest).not.toHaveBeenCalled();
  });

  it('空 portfolios 数组应返回 400（min(1) 校验）', async () => {
    const body = {
      portfolios: [],
      parameters: { startDate: '2024-01-01', endDate: '2024-06-30' },
    };

    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(400);
  });

  it('Application Service 抛错时应返回 500', async () => {
    appServiceMocks.runBacktest.mockRejectedValue(new Error('engine boom'));

    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequestBody()),
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.status).toBe(500);
    expect(json.code).toBe('BACKTEST_ERROR');
    // 应记录错误日志
    expect(loggerMocks.error).toHaveBeenCalled();
  });

  it('价格数据缺失（无效 ticker）时应返回 success: false', async () => {
    // fetchHistoryData 返回空数据（ticker 无数据）
    dataServiceMocks.fetchHistoryData.mockResolvedValue({});

    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequestBody()),
    });

    const json = await res.json();
    // 应返回 success: false（不运行回测）
    expect(json.success).toBe(false);
    expect(json.error).toContain('无效');
    // 不应调用 Application Service
    expect(appServiceMocks.runBacktest).not.toHaveBeenCalled();
  });

  it('降级模式（degraded=true）时应在响应中包含降级标记', async () => {
    appServiceMocks.runBacktest.mockResolvedValue({
      result: createMockBacktestResult(),
      degraded: true,
    });

    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequestBody()),
    });

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.degraded).toBe(true);
    expect(json.degradedCode).toBe('RUST_ENGINE_UNAVAILABLE');
    expect(json.degradedMessage).toBeDefined();
  });
});

describe('backtestRoutes - GET /api/backtest/search', () => {
  let server: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startApp();
  });

  afterEach(async () => {
    await server.close();
  });

  it('应返回搜索结果', async () => {
    dataServiceMocks.searchTickers.mockResolvedValue([
      { ticker: 'AAPL', name: 'Apple', market: 'US' },
    ]);

    const res = await fetch(`${server.url}/api/backtest/search?query=aapl`);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].ticker).toBe('AAPL');
  });

  it('缺少 query 参数应返回 422', async () => {
    const res = await fetch(`${server.url}/api/backtest/search`);

    expect(res.status).toBe(422);
  });
});
