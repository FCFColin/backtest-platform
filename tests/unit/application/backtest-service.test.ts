/**
 * BacktestApplicationService 单元测试（Task 9.4）
 *
 * 企业理由：应用服务是 DDD 分层中编排回测执行的核心节点，测试覆盖：
 * - 正确参数透传到引擎（确保服务不篡改入参）
 * - BacktestCompleted 领域事件被发布（确保审计链路不被遗漏）
 * - 引擎结果被正确返回（确保响应格式不变）
 *
 * 权衡：通过 mock callEngineStrict 强制触发引擎路径，
 * 使被 mock 的 runPortfolioBacktest 被实际调用，从而可验证参数透传。
 * 不测试 Rust/Go 引擎路径（属于集成测试范畴）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Portfolio, BacktestParameters, BacktestResult } from '../../../shared/types.js';
import { mockLogger } from '../../helpers/mockFactories.js';

// ===== vi.hoisted：保证 mock 引用在 vi.mock 工厂执行前就绑定 =====
const engineMocks = vi.hoisted(() => ({
  callEngineStrict: vi.fn(),
}));

const eventMocks = vi.hoisted(() => ({
  dispatch: vi.fn(async () => {}),
}));

// 事务型 outbox 写入与 DB 客户端 mock：
// 服务以 fire-and-forget 异步 IIFE 写 outbox 后再 dispatch，
// 测试需 mock getClient/writeEventInTransaction 使该异步链路可完成。
const dbMocks = vi.hoisted(() => ({
  getClient: vi.fn(async () => ({
    query: vi.fn(async () => ({ rows: [] })),
    release: vi.fn(),
  })),
}));

const outboxMocks = vi.hoisted(() => ({
  writeEventInTransaction: vi.fn(async () => {}),
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

// ===== Mock 模块 =====

// Mock 引擎调用：fail-closed（ADR-031），callEngineStrict 直接返回引擎结果
vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
  callEngineStrict: engineMocks.callEngineStrict,
}));

// Mock 事件分发器：避免加载 handlers（依赖 db 连接）
vi.mock('../../../packages/backend/src/domain/events/index.js', () => ({
  eventDispatcher: {
    dispatch: eventMocks.dispatch,
  },
}));

// Mock DB 客户端与 outbox 写入：避免真实 Postgres 连接，使异步 outbox/事件链路可完成
vi.mock('../../../packages/backend/src/db/index.js', () => ({
  getClient: dbMocks.getClient,
}));

vi.mock('../../../packages/backend/src/services/outboxWriter.js', () => ({
  writeEventInTransaction: outboxMocks.writeEventInTransaction,
}));

// Mock logger：避免 pino 初始化与 OTel 依赖
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

import { BacktestApplicationService } from '../../../packages/backend/src/application/backtest-service.js';

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
    engineMocks.callEngineStrict.mockResolvedValue(mockBacktestResult);
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

    // 引擎应被 fail-closed 调用一次，指向 Go 回测端点
    expect(engineMocks.callEngineStrict).toHaveBeenCalledTimes(1);
    const [endpoint, body] = engineMocks.callEngineStrict.mock.calls[0];
    expect(endpoint).toBe('/api/engine/backtest');
    // 请求体应包含组合、价格数据、参数与宏观数据
    expect(body).toMatchObject({
      portfolios: expect.any(Array),
      priceData: expect.objectContaining({ AAPL: expect.any(Object) }),
      cpiData: mockCpiData,
      exchangeRates: mockExchangeRates,
    });
  });

  it('runBacktest 应分发 BacktestCompleted 领域事件', async () => {
    await service.runBacktest({
      portfolios: [mockPortfolio],
      parameters: mockParameters,
      priceData: mockPriceData,
      cpiData: mockCpiData,
      exchangeRates: mockExchangeRates,
    });

    // 事件分发在 fire-and-forget 异步链路中完成（先写 outbox 再 dispatch），需等待
    await vi.waitFor(() => expect(eventMocks.dispatch).toHaveBeenCalledTimes(1));

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
    // fail-closed：成功路径来自主引擎，非降级
    expect(dispatchedEvent.payload.degraded).toBe(false);
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
    // fail-closed：引擎成功返回，degraded 为 false
    expect(result.degraded).toBe(false);
  });

  it('runBacktest 在引擎不可用时应抛出 EngineUnavailableError（fail-closed）', async () => {
    engineMocks.callEngineStrict.mockRejectedValueOnce(new Error('ENGINE_UNAVAILABLE'));
    await expect(
      service.runBacktest({
        portfolios: [mockPortfolio],
        parameters: mockParameters,
        priceData: mockPriceData,
      }),
    ).rejects.toThrow();
  });
});
