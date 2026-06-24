/**
 * BacktestApplicationService 单元测试（Task 9.4）
 *
 * 企业理由：应用服务是 DDD 分层中编排回测执行的核心节点，测试覆盖：
 * - 正确参数透传到引擎（确保服务不篡改入参）
 * - BacktestCompleted 领域事件被发布（确保审计链路不被遗漏）
 * - 引擎结果被正确返回（确保响应格式不变）
 *
 * 权衡：通过 mock callRustWithFallback 强制触发 Node.js 降级路径，
 * 使被 mock 的 runPortfolioBacktest 被实际调用，从而可验证参数透传。
 * 不测试 Rust/Go 引擎路径（属于集成测试范畴）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Portfolio, BacktestParameters, BacktestResult } from '../../../shared/types.js';

// ===== vi.hoisted：保证 mock 引用在 vi.mock 工厂执行前就绑定 =====
const engineMocks = vi.hoisted(() => ({
  runPortfolioBacktest: vi.fn(),
}));

const eventMocks = vi.hoisted(() => ({
  dispatch: vi.fn(async () => {}),
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

// ===== Mock 模块 =====

// Mock 引擎模块：仅 mock runPortfolioBacktest（服务调用的引擎入口）
vi.mock('../../../api/engine/portfolio.js', () => ({
  runPortfolioBacktest: engineMocks.runPortfolioBacktest,
}));

// Mock Rust 降级工具：模拟引擎不可用，强制触发 fallback（调用被 mock 的引擎）
// unwrapFallbackResult 镜像真实逻辑，正确解包 DegradedResponse
vi.mock('../../../api/utils/rustFallback.js', () => ({
  callRustWithFallback: vi.fn(async (_endpoint: string, _body: unknown, fallbackFn: () => unknown) => {
    const data = fallbackFn();
    return { data, degraded: true, degradedCode: 'ENGINE_UNAVAILABLE', degradedMessage: 'test degraded' };
  }),
  unwrapFallbackResult: vi.fn((result: { data?: unknown; degraded?: boolean; degradedCode?: string; degradedMessage?: string }) => {
    if (result && typeof result === 'object' && 'degraded' in result && result.degraded === true) {
      return { data: result.data, degraded: true, degradedCode: result.degradedCode, degradedMessage: result.degradedMessage };
    }
    return { data: result, degraded: false };
  }),
}));

// Mock 事件分发器：避免加载 handlers（依赖 db 连接）
vi.mock('../../../api/domain/events/index.js', () => ({
  eventDispatcher: {
    dispatch: eventMocks.dispatch,
  },
}));

// Mock logger：避免 pino 初始化与 OTel 依赖
vi.mock('../../../api/utils/logger.js', () => ({
  logger: {
    info: loggerMocks.info,
    warn: loggerMocks.warn,
    error: loggerMocks.error,
    debug: loggerMocks.debug,
  },
}));

import { BacktestApplicationService } from '../../../api/application/backtest-service.js';

// ===== 测试数据 =====

const mockPortfolio: Portfolio = {
  id: 'p1',
  name: 'Test Portfolio',
  assets: [
    { ticker: 'AAPL', weight: 60 },
    { ticker: 'BND', weight: 40 },
  ],
  rebalanceFrequency: 'monthly',
};

const mockParameters: BacktestParameters = {
  startDate: '2020-01-02',
  endDate: '2020-12-31',
  startingValue: 10000,
  adjustForInflation: false,
  rollingWindowMonths: 12,
  benchmarkTicker: 'SPY',
};

const mockPriceData = {
  AAPL: { '2020-01-02': 100, '2020-01-03': 101 },
  BND: { '2020-01-02': 50, '2020-01-03': 51 },
  SPY: { '2020-01-02': 300, '2020-01-03': 302 },
};

const mockCpiData = { '2020-01-01': 258.8 };
const mockExchangeRates = { '2020-01-01': 6.96 };

const mockBacktestResult: BacktestResult = {
  portfolios: [
    {
      name: 'Test Portfolio',
      growthCurve: [
        { date: '2020-01-02', value: 10000 },
        { date: '2020-01-03', value: 10100 },
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
};

// ===== 测试用例 =====

describe('BacktestApplicationService', () => {
  let service: BacktestApplicationService;

  beforeEach(() => {
    vi.clearAllMocks();
    engineMocks.runPortfolioBacktest.mockReturnValue(mockBacktestResult);
    service = new BacktestApplicationService();
  });

  it('runBacktest 应以正确参数调用引擎', async () => {
    await service.runBacktest({
      portfolios: [mockPortfolio],
      parameters: mockParameters,
      priceData: mockPriceData,
      cpiData: mockCpiData,
      exchangeRates: mockExchangeRates,
    });

    // 引擎应被调用一次（通过 callRustWithFallback 的 fallback 路径）
    expect(engineMocks.runPortfolioBacktest).toHaveBeenCalledTimes(1);
    // 参数应原样透传：portfolios, priceData, parameters, cpiData, exchangeRates
    expect(engineMocks.runPortfolioBacktest).toHaveBeenCalledWith(
      [mockPortfolio],
      mockPriceData,
      mockParameters,
      mockCpiData,
      mockExchangeRates,
    );
  });

  it('runBacktest 应分发 BacktestCompleted 领域事件', async () => {
    await service.runBacktest({
      portfolios: [mockPortfolio],
      parameters: mockParameters,
      priceData: mockPriceData,
      cpiData: mockCpiData,
      exchangeRates: mockExchangeRates,
    });

    // 事件分发器应被调用一次
    expect(eventMocks.dispatch).toHaveBeenCalledTimes(1);

    const dispatchedEvent = eventMocks.dispatch.mock.calls[0][0];
    // 事件类型与聚合信息
    expect(dispatchedEvent.eventType).toBe('BacktestCompleted');
    expect(dispatchedEvent.aggregateType).toBe('BacktestSession');
    expect(dispatchedEvent.aggregateId).toMatch(/^backtest-\d+$/);
    expect(dispatchedEvent.occurredAt).toBeInstanceOf(Date);
    // 事件负载应包含关键指标摘要
    expect(dispatchedEvent.payload.startingValue).toBe(10000);
    expect(dispatchedEvent.payload.portfolioCount).toBe(1);
    expect(dispatchedEvent.payload.totalReturn).toBe(0.2);
    expect(dispatchedEvent.payload.maxDrawdown).toBe(0.15);
    expect(dispatchedEvent.payload.sharpeRatio).toBe(1.5);
    expect(dispatchedEvent.payload.degraded).toBe(true);
  });

  it('runBacktest 应返回引擎结果', async () => {
    const result = await service.runBacktest({
      portfolios: [mockPortfolio],
      parameters: mockParameters,
      priceData: mockPriceData,
      cpiData: mockCpiData,
      exchangeRates: mockExchangeRates,
    });

    // 返回的 result 应为引擎返回的同一对象（原样透传）
    expect(result.result).toBe(mockBacktestResult);
    // degraded 标记应反映降级状态
    expect(result.degraded).toBe(true);
  });
});
