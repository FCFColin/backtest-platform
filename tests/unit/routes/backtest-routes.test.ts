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
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';
import type { BacktestResult } from '../../../shared/types.js';
import { mockLogger, createConfigMocks } from '../../helpers/mockFactories.js';

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
  child: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

const engineClientMocks = vi.hoisted(() => ({
  callEngineStrict: vi.fn(),
}));

// fail-closed（ADR-031）：EngineUnavailableError 需为真实类，路由用 instanceof 判定以返回 503。
// 通过 vi.hoisted 提升，确保 vi.mock 工厂可安全引用。
const MockEngineUnavailableError = vi.hoisted(() => {
  class MockEngineUnavailableError extends Error {
    readonly retryAfterSeconds = 30;
    readonly code = 'ENGINE_UNAVAILABLE';
    constructor(message = '计算引擎暂不可用') {
      super(message);
      this.name = 'EngineUnavailableError';
    }
  }
  return MockEngineUnavailableError;
});

const engineBodyBuilderMocks = vi.hoisted(() => ({
  buildEnginePortfolioBody: vi.fn(),
  buildEngineParams: vi.fn(),
}));

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
}));

// ===== Mock 模块 =====

vi.mock('../../../api/utils/logger.js', () => ({ logger: mockLogger(loggerMocks) }));

vi.mock('../../../api/application/backtest-service.js', () => ({
  backtestApplicationService: {
    runBacktest: appServiceMocks.runBacktest,
  },
}));

vi.mock('../../../api/services/dataService.js', () => ({
  fetchHistoryData: dataServiceMocks.fetchHistoryData,
  searchTickers: dataServiceMocks.searchTickers,
}));

vi.mock('../../../api/application/backtest-query-service.js', () => ({
  preparePortfolioBacktest: vi.fn((portfolios, parameters: { benchmarkTicker?: string }) => {
    const allTickers = new Set(
      portfolios.flatMap((p: { assets: { ticker: string }[] }) => p.assets.map((a) => a.ticker)),
    );
    if (parameters?.benchmarkTicker) {
      allTickers.add(parameters.benchmarkTicker);
    }
    return { allTickers, warnings: [] };
  }),
  collectInvalidTickerWarnings: vi.fn((_tickers, _data, warnings) => warnings),
}));

vi.mock('../../../api/utils/engineClient.js', () => ({
  callEngineStrict: engineClientMocks.callEngineStrict,
  EngineUnavailableError: MockEngineUnavailableError,
}));

vi.mock('../../../api/utils/engineBodyBuilder.js', () => ({
  buildEnginePortfolioBody: engineBodyBuilderMocks.buildEnginePortfolioBody,
  buildEngineParams: engineBodyBuilderMocks.buildEngineParams,
}));

vi.mock('../../../api/config/index.js', () => ({
  config: createConfigMocks({
    NODE_ENV: 'test',
    GO_ENGINE_URL: 'http://127.0.0.1:5004',
    ENGINE_AUTH_TOKEN: 'test-token',
    ENGINE_TIMEOUT_MS: 5000,
  }),
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
import { clearBacktestResultCache } from '../../../api/utils/backtestResultCache.js';
import { TimeoutError } from '../../../api/utils/timeout.js';
import { preparePortfolioBacktest } from '../../../api/application/backtest-query-service.js';

/** 在随机端口启动 Express 应用 */
async function startApp(): Promise<TestServer> {
  return startExpressApp((app) => app.use('/api/backtest', backtestRoutes), { bodyLimit: '10mb' });
}

/** 构造有效的回测请求体 */
function createValidRequestBody() {
  return {
    portfolios: [
      {
        assets: [
          { ticker: 'AAPL', weight: 60 },
          { ticker: 'BND', weight: 40 },
        ],
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
    clearBacktestResultCache();
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

  it('sync 响应应省略 rollingReturns（由 /portfolio/series 补全）', async () => {
    const body = createValidRequestBody();
    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    expect(json.data.portfolios[0].rollingReturns).toBeUndefined();
  });
});

describe('backtestRoutes - POST /api/backtest/portfolio/series', () => {
  let server: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    vi.clearAllMocks();
    clearBacktestResultCache();
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      AAPL: { '2024-01-02': 185.5, '2024-01-03': 186.0 },
      BND: { '2024-01-02': 72.3, '2024-01-03': 72.5 },
    });
    appServiceMocks.runBacktest.mockResolvedValue({
      result: createMockBacktestResult(),
      degraded: false,
    });
    fsMocks.existsSync.mockReturnValue(false);
    server = await startApp();
  });

  afterEach(async () => {
    await server.close();
  });

  it('缓存命中时应返回请求的序列字段', async () => {
    const body = createValidRequestBody();

    await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const res = await fetch(`${server.url}/api/backtest/portfolio/series`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, series: ['rollingReturns'] }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.portfolios[0].rollingReturns).toEqual([]);
  });

  it('缓存未命中时应返回 404', async () => {
    const body = createValidRequestBody();
    const res = await fetch(`${server.url}/api/backtest/portfolio/series`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, series: ['rollingReturns'] }),
    });
    expect(res.status).toBe(404);
  });
});

describe('backtestRoutes - POST /api/backtest/portfolio (continued)', () => {
  let server: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    vi.clearAllMocks();
    clearBacktestResultCache();
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      AAPL: { '2024-01-02': 185.5, '2024-01-03': 186.0 },
      BND: { '2024-01-02': 72.3, '2024-01-03': 72.5 },
    });
    appServiceMocks.runBacktest.mockResolvedValue({
      result: createMockBacktestResult(),
      degraded: false,
    });
    fsMocks.existsSync.mockReturnValue(false);
    server = await startApp();
  });

  afterEach(async () => {
    await server.close();
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
    (body.parameters as Record<string, unknown>).startDate = 'not-a-date';

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

  it('preparePortfolioBacktest 抛错时应返回 422', async () => {
    preparePortfolioBacktest.mockImplementationOnce(() => {
      throw new Error('组合资产权重之和应约为 100');
    });

    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequestBody()),
    });

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.code).toBe('VALIDATION_ERROR');
  });

  it('存在警告时应包含 warnings 字段', async () => {
    preparePortfolioBacktest.mockImplementationOnce((portfolios, parameters) => {
      const allTickers = new Set(
        portfolios.flatMap((p: { assets: { ticker: string }[] }) => p.assets.map((a) => a.ticker)),
      );
      if (parameters?.benchmarkTicker) allTickers.add(parameters.benchmarkTicker);
      return { allTickers, warnings: ['AAPL: 部分数据缺失'] };
    });

    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequestBody()),
    });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.warnings).toBeDefined();
    expect(json.warnings).toContain('AAPL: 部分数据缺失');
  });

  it('回测超时应返回 503 Gateway Timeout', async () => {
    appServiceMocks.runBacktest.mockRejectedValue(new TimeoutError('回测超时（30000ms）'));

    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequestBody()),
    });
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe('BACKTEST_TIMEOUT');
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
    expect(res.status).toBe(422);
    expect(json.code).toBe('INVALID_TICKERS');
    expect(appServiceMocks.runBacktest).not.toHaveBeenCalled();
  });

  it('引擎不可用时应 fail-closed 返回 503 + Retry-After（ADR-031）', async () => {
    appServiceMocks.runBacktest.mockRejectedValue(new MockEngineUnavailableError());

    const res = await fetch(`${server.url}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequestBody()),
    });

    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('30');
    const json = await res.json();
    expect(json.code).toBe('ENGINE_UNAVAILABLE');
    // fail-closed：绝不返回降级的 Node 计算结果
    expect(json.degraded).toBeUndefined();
  });
});

describe('backtestRoutes - GET /api/backtest/search', () => {
  let server: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    vi.clearAllMocks();
    clearBacktestResultCache();
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

  it('搜索服务抛错时应返回 500', async () => {
    dataServiceMocks.searchTickers.mockRejectedValue(new Error('search failed'));

    const res = await fetch(`${server.url}/api/backtest/search?query=aapl`);
    expect(res.status).toBe(500);
  });
});

// ===== 共享辅助：analysis / monte-carlo / optimize / efficient-frontier =====

function createValidParameters() {
  return {
    startDate: '2024-01-01',
    endDate: '2024-06-30',
    startingValue: 10000,
  };
}

function createValidPortfolio() {
  return {
    assets: [
      { ticker: 'AAPL', weight: 60 },
      { ticker: 'BND', weight: 40 },
    ],
    rebalanceFrequency: 'monthly' as const,
  };
}

function setupEngineRouteMocks() {
  dataServiceMocks.fetchHistoryData.mockResolvedValue({
    AAPL: { '2024-01-02': 185.5, '2024-01-03': 186.0 },
    BND: { '2024-01-02': 72.3, '2024-01-03': 72.5 },
  });
  engineBodyBuilderMocks.buildEngineParams.mockReturnValue({
    startDate: '2024-01-01',
    endDate: '2024-06-30',
  });
  engineBodyBuilderMocks.buildEnginePortfolioBody.mockImplementation(
    (p: { assets: { ticker: string; weight: number }[] }) => p,
  );
  engineClientMocks.callEngineStrict.mockResolvedValue({});
}

async function startEngineRouteServer() {
  vi.clearAllMocks();
  setupEngineRouteMocks();
  fsMocks.existsSync.mockReturnValue(false);
  return startApp();
}

describe('backtestRoutes - POST /api/backtest/analysis', () => {
  let server: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    server = await startEngineRouteServer();
    engineClientMocks.callEngineStrict.mockResolvedValue({
      tickers: [{ ticker: 'AAPL', cagr: 0.1 }],
      correlations: [[1]],
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it('有效参数应调用引擎并返回 200', async () => {
    const res = await fetch(`${server.url}/api/backtest/analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['AAPL', 'BND'],
        parameters: createValidParameters(),
      }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
    expect(engineClientMocks.callEngineStrict).toHaveBeenCalledTimes(1);
    expect(engineClientMocks.callEngineStrict.mock.calls[0][0]).toBe('/api/engine/analysis');
    expect(dataServiceMocks.fetchHistoryData).toHaveBeenCalledTimes(1);
  });

  it('无效 objective 缺失 tickers 应返回 422（zod 校验）', async () => {
    const res = await fetch(`${server.url}/api/backtest/analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameters: createValidParameters() }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.detail).toContain('validation failed');
    expect(engineClientMocks.callEngineStrict).not.toHaveBeenCalled();
  });

  it('ticker 数量超限应返回 422', async () => {
    const tickers = Array.from({ length: 51 }, (_, i) => `T${i}`);
    const res = await fetch(`${server.url}/api/backtest/analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers, parameters: createValidParameters() }),
    });

    expect(res.status).toBe(422);
    expect(engineClientMocks.callEngineStrict).not.toHaveBeenCalled();
  });

  it('引擎抛错应返回 500', async () => {
    engineClientMocks.callEngineStrict.mockRejectedValue(new Error('analysis engine boom'));

    const res = await fetch(`${server.url}/api/backtest/analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['AAPL'],
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.code).toBe('ANALYSIS_ERROR');
    expect(loggerMocks.error).toHaveBeenCalled();
  });

  it('tickers 为空格分隔字符串时应正常处理', async () => {
    engineClientMocks.callEngineStrict.mockResolvedValue({
      tickers: [{ ticker: 'AAPL' }, { ticker: 'BND' }],
      correlations: [[1]],
    });

    const res = await fetch(`${server.url}/api/backtest/analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: 'AAPL BND',
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(200);
    expect(engineClientMocks.callEngineStrict).toHaveBeenCalledTimes(1);
    const callArg = engineClientMocks.callEngineStrict.mock.calls[0][1] as { tickers: string[] };
    expect(callArg.tickers).toEqual(['AAPL', 'BND']);
  });

  it('引擎返回 assets 字段时应映射为 tickers', async () => {
    engineClientMocks.callEngineStrict.mockResolvedValue({
      assets: [{ ticker: 'AAPL', cagr: 0.1 }],
      correlations: [[1]],
    });

    const res = await fetch(`${server.url}/api/backtest/analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['AAPL'],
        parameters: createValidParameters(),
      }),
    });

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.tickers).toBeDefined();
    expect(json.data.correlations).toBeDefined();
  });

  it('引擎不可用应 fail-closed 返回 503', async () => {
    engineClientMocks.callEngineStrict.mockRejectedValue(new MockEngineUnavailableError());

    const res = await fetch(`${server.url}/api/backtest/analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['AAPL'],
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('30');
    const json = await res.json();
    expect(json.code).toBe('ENGINE_UNAVAILABLE');
  });
});

describe('backtestRoutes - POST /api/backtest/monte-carlo', () => {
  let server: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    server = await startEngineRouteServer();
    engineClientMocks.callEngineStrict.mockResolvedValue({ paths: [], statistics: {} });
  });

  afterEach(async () => {
    await server.close();
  });

  it('有效参数应调用引擎并返回 200', async () => {
    const res = await fetch(`${server.url}/api/backtest/monte-carlo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolio: createValidPortfolio(),
        parameters: createValidParameters(),
        mcParams: { numSimulations: 100, seed: 42 },
      }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(engineClientMocks.callEngineStrict).toHaveBeenCalledTimes(1);
    expect(engineClientMocks.callEngineStrict.mock.calls[0][0]).toBe('/api/engine/monte-carlo');
    expect(
      (engineClientMocks.callEngineStrict.mock.calls[0][1] as { mcParams: unknown }).mcParams,
    ).toEqual({
      numSimulations: 100,
      seed: 42,
    });
  });

  it('缺少 portfolio 应返回 422（zod refine）', async () => {
    const res = await fetch(`${server.url}/api/backtest/monte-carlo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameters: createValidParameters() }),
    });

    expect(res.status).toBe(400);
    expect(engineClientMocks.callEngineStrict).not.toHaveBeenCalled();
  });

  it('恶意 mcParams 键应被剥离', async () => {
    await fetch(`${server.url}/api/backtest/monte-carlo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolio: createValidPortfolio(),
        parameters: createValidParameters(),
        mcParams: {
          numSimulations: 50,
          __proto__: { polluted: true },
          constructor: 'evil',
          maliciousKey: 'strip-me',
        },
      }),
    });

    const mcParamsArg = (
      engineClientMocks.callEngineStrict.mock.calls[0][1] as { mcParams: Record<string, unknown> }
    ).mcParams;
    expect(mcParamsArg).toEqual({ numSimulations: 50 });
    expect(mcParamsArg).not.toHaveProperty('maliciousKey');
    expect(mcParamsArg).not.toHaveProperty('constructor');
  });

  it('多组合应返回数组结果', async () => {
    engineClientMocks.callEngineStrict
      .mockResolvedValueOnce({ portfolio: 0 })
      .mockResolvedValueOnce({ portfolio: 1 });

    const res = await fetch(`${server.url}/api/backtest/monte-carlo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolios: [createValidPortfolio(), createValidPortfolio()],
        parameters: createValidParameters(),
      }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data).toHaveLength(2);
    expect(engineClientMocks.callEngineStrict).toHaveBeenCalledTimes(2);
  });

  it('引擎抛错应返回 500', async () => {
    engineClientMocks.callEngineStrict.mockRejectedValue(new Error('mc engine boom'));

    const res = await fetch(`${server.url}/api/backtest/monte-carlo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolio: createValidPortfolio(),
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe('MONTE_CARLO_ERROR');
  });

  it('引擎不可用应 fail-closed 返回 503', async () => {
    engineClientMocks.callEngineStrict.mockRejectedValue(new MockEngineUnavailableError());

    const res = await fetch(`${server.url}/api/backtest/monte-carlo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolio: createValidPortfolio(),
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('30');
    const json = await res.json();
    expect(json.code).toBe('ENGINE_UNAVAILABLE');
  });
});

describe('backtestRoutes - POST /api/backtest/optimize', () => {
  let server: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    server = await startEngineRouteServer();
    engineClientMocks.callEngineStrict.mockResolvedValue({
      optimalWeights: { AAPL: 0.6, BND: 0.4 },
      expectedReturn: 0.1,
      expectedVolatility: 0.15,
      sharpeRatio: 1.2,
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it('有效参数应调用引擎并返回 200', async () => {
    const res = await fetch(`${server.url}/api/backtest/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['AAPL', 'BND'],
        objective: 'maxSharpe',
        parameters: createValidParameters(),
      }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(engineClientMocks.callEngineStrict).toHaveBeenCalledTimes(1);
    expect(engineClientMocks.callEngineStrict.mock.calls[0][0]).toBe('/api/engine/optimize');
  });

  it('无效 objective 应返回 422（zod 校验）', async () => {
    const res = await fetch(`${server.url}/api/backtest/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['AAPL'],
        objective: 'invalidObjective',
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(400);
    expect(engineClientMocks.callEngineStrict).not.toHaveBeenCalled();
  });

  it('ticker 数量超限应返回 422', async () => {
    const res = await fetch(`${server.url}/api/backtest/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: Array.from({ length: 51 }, (_, i) => `T${i}`),
        objective: 'maxSharpe',
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(422);
    expect(engineClientMocks.callEngineStrict).not.toHaveBeenCalled();
  });

  it('引擎抛错应返回 500', async () => {
    engineClientMocks.callEngineStrict.mockRejectedValue(new Error('optimize boom'));

    const res = await fetch(`${server.url}/api/backtest/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['AAPL', 'BND'],
        objective: 'minVolatility',
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe('OPTIMIZATION_ERROR');
  });

  it('numIterations 应被正确上限截断', async () => {
    const res = await fetch(`${server.url}/api/backtest/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['AAPL', 'BND'],
        objective: 'maxSharpe',
        parameters: createValidParameters(),
        numIterations: 50000,
      }),
    });

    expect(res.status).toBe(200);
    const callArg = engineClientMocks.callEngineStrict.mock.calls[0][1] as {
      numIterations: number;
    };
    expect(callArg.numIterations).toBe(50000);
  });

  it('引擎不可用应 fail-closed 返回 503', async () => {
    engineClientMocks.callEngineStrict.mockRejectedValue(new MockEngineUnavailableError());

    const res = await fetch(`${server.url}/api/backtest/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['AAPL', 'BND'],
        objective: 'maxSharpe',
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('30');
    const json = await res.json();
    expect(json.code).toBe('ENGINE_UNAVAILABLE');
  });
});

describe('backtestRoutes - POST /api/backtest/efficient-frontier', () => {
  let server: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    server = await startEngineRouteServer();
    engineClientMocks.callEngineStrict.mockResolvedValue({
      frontier: [
        { weights: { AAPL: 1 }, expectedReturn: 0.1, expectedVolatility: 0.2, sharpeRatio: 0.5 },
      ],
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it('有效参数应调用引擎并返回 200', async () => {
    const res = await fetch(`${server.url}/api/backtest/efficient-frontier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['AAPL', 'BND'],
        numPoints: 10,
        parameters: createValidParameters(),
      }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(engineClientMocks.callEngineStrict).toHaveBeenCalledTimes(1);
    expect(engineClientMocks.callEngineStrict.mock.calls[0][0]).toBe(
      '/api/engine/efficient-frontier',
    );
  });

  it('空 tickers 数组应返回 422（zod min(1)）', async () => {
    const res = await fetch(`${server.url}/api/backtest/efficient-frontier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: [],
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(400);
    expect(engineClientMocks.callEngineStrict).not.toHaveBeenCalled();
  });

  it('ticker 数量超限应返回 422', async () => {
    const res = await fetch(`${server.url}/api/backtest/efficient-frontier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: Array.from({ length: 51 }, (_, i) => `T${i}`),
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(422);
    expect(engineClientMocks.callEngineStrict).not.toHaveBeenCalled();
  });

  it('引擎抛错应返回 500', async () => {
    engineClientMocks.callEngineStrict.mockRejectedValue(new Error('frontier boom'));

    const res = await fetch(`${server.url}/api/backtest/efficient-frontier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['AAPL', 'BND'],
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe('EFFICIENT_FRONTIER_ERROR');
  });

  it('引擎不可用应 fail-closed 返回 503', async () => {
    engineClientMocks.callEngineStrict.mockRejectedValue(new MockEngineUnavailableError());

    const res = await fetch(`${server.url}/api/backtest/efficient-frontier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['AAPL', 'BND'],
        parameters: createValidParameters(),
      }),
    });

    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('30');
    const json = await res.json();
    expect(json.code).toBe('ENGINE_UNAVAILABLE');
  });
});
