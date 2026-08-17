import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mockParameters,
  mockPortfolio as portfolioFixture,
} from '../../helpers/backtestFixtures.js';
import {
  mockBacktestResult as mockBacktestResultFixture,
  mockPortfolioResult,
  mockBacktestStats,
} from '../../helpers/storeFixtures.js';

vi.mock('../../../packages/backend/src/utils/engineClient.js', () => engineMocks);
import { engineMocks } from '../../helpers/engineFixture.js';
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
