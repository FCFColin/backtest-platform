import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Portfolio, BacktestParameters, BacktestResult } from '@backtest/shared';
import { mockLogger } from '../../helpers/mockFactories.js';
import {
  preparePortfolioBacktest,
  collectInvalidTickerWarnings,
} from '../../../packages/backend/src/application/backtest-helpers.js';
import type { Warning } from '../../../packages/backend/src/application/backtest-helpers.js';
import { MAX_TICKERS } from '../../../packages/shared/constants.js';

const engineMocks = vi.hoisted(() => ({ callEngineStrict: vi.fn() }));
const eventMocks = vi.hoisted(() => ({ dispatch: vi.fn(async () => {}) }));
// 事务型 outbox 写入与 DB 客户端 mock：服务以 fire-and-forget 异步 IIFE 写 outbox 后再 dispatch
const dbMocks = vi.hoisted(() => ({
  getClient: vi.fn(async () => ({ query: vi.fn(async () => ({ rows: [] })), release: vi.fn() })),
}));
const outboxMocks = vi.hoisted(() => ({ writeEventInTransaction: vi.fn(async () => {}) }));
const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

// Mock 引擎调用：fail-closed（ADR-031），callEngineStrict 直接返回引擎结果
vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
  callEngineStrict: engineMocks.callEngineStrict,
}));
// Mock 事件分发器：避免加载 handlers（依赖 db 连接）
vi.mock('../../../packages/backend/src/domain/events/events.js', () => ({
  eventDispatcher: { dispatch: eventMocks.dispatch },
}));
// Mock DB 客户端与 outbox 写入：避免真实 Postgres 连接
vi.mock('../../../packages/backend/src/db/pool.js', () => ({ getClient: dbMocks.getClient }));
vi.mock('../../../packages/backend/src/infrastructure/outboxWriter.js', () => ({
  writeEventInTransaction: outboxMocks.writeEventInTransaction,
}));
// Mock logger：避免 pino 初始化与 OTel 依赖
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

import { runBacktest } from '../../../packages/backend/src/application/backtest-service.js';

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
const executeRun = () =>
  runBacktest({
    portfolios: [mockPortfolio],
    parameters: mockParameters,
    priceData: mockPriceData,
    cpiData: mockCpiData,
    exchangeRates: mockExchangeRates,
  });
describe('runBacktest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    engineMocks.callEngineStrict.mockResolvedValue(mockBacktestResult);
  });
  it('应以正确参数调用引擎并返回同一结果对象', async () => {
    const result = await executeRun();
    expect(engineMocks.callEngineStrict).toHaveBeenCalledTimes(1);
    const [endpoint, body] = engineMocks.callEngineStrict.mock.calls[0];
    expect(endpoint).toBe('/api/engine/backtest');
    expect(body).toMatchObject({
      portfolios: expect.any(Array),
      priceData: expect.objectContaining({ AAPL: expect.any(Object) }),
      cpiData: mockCpiData,
      exchangeRates: mockExchangeRates,
    });
    expect(result.result).toBe(mockBacktestResult);
  });
  it('runBacktest 应将 BacktestCompleted 事件写入 outbox', async () => {
    await executeRun();
    // 事件写入 outbox 是异步 fire-and-forget，需等待
    await vi.waitFor(() => expect(outboxMocks.writeEventInTransaction).toHaveBeenCalledTimes(1));
    const outboxCall = outboxMocks.writeEventInTransaction.mock.calls[0][1];
    expect(outboxCall.eventType).toBe('BacktestCompleted');
    expect(outboxCall.aggregateType).toBe('BacktestSession');
    expect(outboxCall.aggregateId).toMatch(/^backtest-\d+$/);
    expect(outboxCall.eventId).toBeDefined();
    expect(outboxCall.payload.startingValue).toBe(10000);
    expect(outboxCall.payload.portfolioCount).toBe(1);
    expect(outboxCall.payload.totalReturn).toBe(0.2);
    expect(outboxCall.payload.maxDrawdown).toBe(0.15);
    expect(outboxCall.payload.sharpeRatio).toBe(1.5);
  });
  it('runBacktest 在引擎不可用时应抛出错误（fail-closed）', async () => {
    engineMocks.callEngineStrict.mockRejectedValueOnce(new Error('ENGINE_UNAVAILABLE'));
    await expect(
      runBacktest({
        portfolios: [mockPortfolio],
        parameters: mockParameters,
        priceData: mockPriceData,
      }),
    ).rejects.toThrow();
  });
  it('eventDispatcher.dispatch 失败时应记录错误但不影响主流程', async () => {
    eventMocks.dispatch.mockRejectedValue(new Error('dispatch failed'));
    const result = await executeRun();
    expect(result.result).toBe(mockBacktestResult);
    await vi.waitFor(() =>
      expect(loggerMocks.error).toHaveBeenCalledWith(
        expect.objectContaining({ aggregateId: expect.any(String) }),
        expect.stringContaining('Failed to dispatch'),
      ),
    );
  });
  it('writeEventInTransaction 失败时应回滚事务并记录 outbox 错误', async () => {
    const queryMock = vi.fn(async () => ({ rows: [] }));
    dbMocks.getClient.mockResolvedValueOnce({ query: queryMock, release: vi.fn() });
    outboxMocks.writeEventInTransaction.mockRejectedValueOnce(new Error('write failed'));
    const result = await executeRun();
    expect(result.result).toBe(mockBacktestResult);
    await vi.waitFor(() =>
      expect(loggerMocks.error).toHaveBeenCalledWith(
        expect.objectContaining({ aggregateId: expect.any(String) }),
        'Failed to write BacktestCompleted event to outbox',
      ),
    );
    const queries = queryMock.mock.calls.map((c) => c[0]);
    expect(queries).toContain('BEGIN');
    expect(queries).toContain('ROLLBACK');
    expect(queries).not.toContain('COMMIT');
  });
  it('引擎返回空 portfolios 时事件负载统计字段应为 undefined', async () => {
    engineMocks.callEngineStrict.mockResolvedValueOnce({
      portfolios: [],
      correlations: [],
    } as BacktestResult);
    await executeRun();
    await vi.waitFor(() => expect(outboxMocks.writeEventInTransaction).toHaveBeenCalledTimes(1));
    const outboxCall = outboxMocks.writeEventInTransaction.mock.calls[0][1];
    expect(outboxCall.payload.totalReturn).toBeUndefined();
    expect(outboxCall.payload.maxDrawdown).toBeUndefined();
    expect(outboxCall.payload.sharpeRatio).toBeUndefined();
  });
});

function makePortfolio(id: string, tickers: string[]): Portfolio {
  return {
    id,
    name: id,
    assets: tickers.map((t) => ({ ticker: t, weight: 100 / tickers.length })),
    rebalanceFrequency: 'none',
  };
}
const baseParams: BacktestParameters = {
  startDate: '2020-01-02',
  endDate: '2020-12-31',
  startingValue: 10000,
  benchmarkTicker: '',
  adjustForInflation: false,
  rollingWindowMonths: 12,
};
describe('preparePortfolioBacktest', () => {
  it('合法输入应收集全部 ticker 并包含 benchmark', () => {
    const { allTickers, warnings } = preparePortfolioBacktest(
      [makePortfolio('p1', ['AAPL', 'MSFT'])],
      { ...baseParams, benchmarkTicker: 'SPY' },
    );
    expect(allTickers.has('AAPL')).toBe(true);
    expect(allTickers.has('MSFT')).toBe(true);
    expect(allTickers.has('SPY')).toBe(true);
    expect(warnings).toEqual([]);
  });

  it.each<[keyof BacktestParameters, string]>([
    ['startDate', '2020/01/02'],
    ['endDate', 'not-a-date'],
  ])('%s 非法日期应抛出 422 可映射错误', (field, value) => {
    expect(() =>
      preparePortfolioBacktest([makePortfolio('p1', ['AAPL'])], {
        ...baseParams,
        [field]: value,
      } as BacktestParameters),
    ).toThrow('Invalid date format');
  });

  it.each<[string, Portfolio[]]>([
    [
      `组合数超过 ${MAX_TICKERS} 应拒绝`,
      Array.from({ length: MAX_TICKERS + 1 }, (_, i) => makePortfolio(`p${i}`, ['AAPL'])),
    ],
    [
      `资产总数超过 ${MAX_TICKERS} 应拒绝（单组合多标的）`,
      [
        makePortfolio(
          'p1',
          Array.from({ length: MAX_TICKERS + 1 }, (_, i) => `T${i}`),
        ),
      ],
    ],
  ])('%s', (_title, portfolios) => {
    expect(() => preparePortfolioBacktest(portfolios, baseParams)).toThrow(`max ${MAX_TICKERS}`);
  });
  it('空组合列表应返回空 ticker 集合', () => {
    expect(preparePortfolioBacktest([], baseParams).allTickers.size).toBe(0);
  });
});
describe('collectInvalidTickerWarnings', () => {
  it.each([
    [
      '缺失价格序列应写入 warnings',
      new Set(['AAPL', 'GHOST']),
      { AAPL: { '2020-01-02': 100 } },
      ['GHOST'],
      { code: 'TICKER_NOT_FOUND', tickers: ['GHOST'] },
    ],
    [
      '空对象序列应视为无效 ticker',
      new Set(['EMPTY']),
      { EMPTY: {} },
      ['EMPTY'],
      { code: 'TICKER_NOT_FOUND', tickers: ['EMPTY'] },
    ],
    [
      '全部有效时不应追加 warning',
      new Set(['AAPL']),
      { AAPL: { '2020-01-02': 150.5 } },
      [],
      undefined,
    ],
    [
      '恶意 ticker 名仍应被识别为无数据（不崩溃）',
      new Set(["'; DROP TABLE prices; --"]),
      {},
      ["'; DROP TABLE prices; --"],
      { code: 'TICKER_NOT_FOUND', tickers: ["'; DROP TABLE prices; --"] },
    ],
  ])('%s', (_n, tickers, priceData, expectedList, expectedWarning) => {
    const warnings: Warning[] = [];
    const result = collectInvalidTickerWarnings(tickers, priceData, warnings);
    expect(result).toEqual(expectedList);
    if (expectedWarning) expect(warnings[0]).toEqual(expectedWarning);
  });
});
