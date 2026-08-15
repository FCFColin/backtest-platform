import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Portfolio, BacktestParameters } from '@backtest/shared';
import { engineMocks } from '../../helpers/engineFixture.js';
import {
  mockParameters,
  mockPortfolio as portfolioFixture,
} from '../../helpers/backtestFixtures.js';
import {
  mockBacktestResult as mockBacktestResultFixture,
  mockPortfolioResult,
  mockBacktestStats,
} from '../../helpers/storeFixtures.js';
import {
  preparePortfolioBacktest,
  collectInvalidTickerWarnings,
} from '../../../packages/backend/src/application/backtest-helpers.js';
import type { Warning } from '../../../packages/backend/src/application/backtest-helpers.js';
import { MAX_TICKERS } from '../../../packages/shared/constants.js';

vi.mock('../../../packages/backend/src/utils/engineClient.js', () => engineMocks);
import { runBacktest } from '../../../packages/backend/src/application/backtest-service.js';

const mockPortfolio = portfolioFixture();
const mockPriceData = {
  AAPL: { '2020-01-02': 100, '2020-01-03': 101 },
  BND: { '2020-01-02': 50, '2020-01-03': 51 },
  SPY: { '2020-01-02': 300, '2020-01-03': 302 },
};
const mockCpiData = { '2020-01-01': 258.8 };
const mockExchangeRates = { '2020-01-01': 6.96 };
const mockBacktestResult = mockBacktestResultFixture({
  portfolios: [
    mockPortfolioResult({
      name: 'Test Portfolio',
      growthCurve: [
        { date: '2020-01-02', value: 10000 },
        { date: '2020-01-03', value: 10100 },
      ],
      statistics: mockBacktestStats,
    }),
  ],
});
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
    const { allTickers } = preparePortfolioBacktest([makePortfolio('p1', ['AAPL', 'MSFT'])], {
      ...baseParams,
      benchmarkTicker: 'SPY',
    });
    expect(allTickers.has('AAPL')).toBe(true);
    expect(allTickers.has('MSFT')).toBe(true);
    expect(allTickers.has('SPY')).toBe(true);
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
