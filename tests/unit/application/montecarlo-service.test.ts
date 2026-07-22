/**
 * montecarlo-service 单元测试 — runMonteCarlo
 *
 * 覆盖：单组合返回 results[0]、多组合返回数组、mcParams 白名单过滤、
 * 编排链路（collectTickersFromPortfolios/fetchPriceData/sanitizeMcParams/loadMacroData）、
 * 引擎错误传播、参数透传。
 *
 * Mock 策略：mock callEngineStrict + backtest-helpers + engineBodyBuilder + logger。
 * 不 mock 领域层（Portfolio.fromDTO / toEngineBody），保留真实业务逻辑。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Portfolio, BacktestParameters } from '@backtest/shared';
import { mockLogger } from '../../helpers/mockFactories.js';

const engineMocks = vi.hoisted(() => ({
  callEngineStrict: vi.fn(),
}));

const helpersMocks = vi.hoisted(() => ({
  collectTickersFromPortfolios: vi.fn(),
  fetchPriceData: vi.fn(),
  filterPriceData: vi.fn(),
  loadMacroData: vi.fn(),
  sanitizeMcParams: vi.fn(),
  translateDomainError: vi.fn(),
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

vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
  callEngineStrict: engineMocks.callEngineStrict,
}));

vi.mock('../../../packages/backend/src/application/backtest-helpers.js', () => ({
  collectTickersFromPortfolios: helpersMocks.collectTickersFromPortfolios,
  fetchPriceData: helpersMocks.fetchPriceData,
  filterPriceData: helpersMocks.filterPriceData,
  loadMacroData: helpersMocks.loadMacroData,
  sanitizeMcParams: helpersMocks.sanitizeMcParams,
  translateDomainError: helpersMocks.translateDomainError,
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

import { runMonteCarlo } from '../../../packages/backend/src/application/montecarlo-service.js';

const mockPortfolio: Portfolio = {
  id: 'p1',
  name: 'Test',
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

// translateDomainError 在源码中被以闭包形式调用：translateDomainError(() => DomainPortfolio.fromDTO(p))
// mock 时实现"直接调用 fn 并返回"，保留真实领域行为
function makeTranslateDomainError() {
  return vi.fn(<T>(fn: () => T): T => fn());
}

describe('runMonteCarlo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    helpersMocks.collectTickersFromPortfolios.mockReturnValue({
      tickers: ['AAPL', 'BND'],
      totalAssets: 2,
    });
    helpersMocks.fetchPriceData.mockResolvedValue({
      AAPL: { '2020-01-02': 100 },
      BND: { '2020-01-02': 50 },
    });
    helpersMocks.filterPriceData.mockReturnValue({
      AAPL: { '2020-01-02': 100 },
      BND: { '2020-01-02': 50 },
    });
    helpersMocks.loadMacroData.mockResolvedValue({
      cpiData: { '2020-01-01': 258.8 },
      exchangeRates: {},
    });
    helpersMocks.sanitizeMcParams.mockReturnValue({ numSimulations: 100 });
    helpersMocks.translateDomainError.mockImplementation(makeTranslateDomainError());
    engineMocks.callEngineStrict.mockResolvedValue({ simulated: true });
  });

  it('单组合应返回 results[0]（非数组）', async () => {
    const result = await runMonteCarlo([mockPortfolio], mockParameters);

    expect(result).toEqual({ simulated: true });
    expect(engineMocks.callEngineStrict).toHaveBeenCalledTimes(1);
  });

  it('多组合应返回数组结果', async () => {
    engineMocks.callEngineStrict
      .mockResolvedValueOnce({ id: 'r1' })
      .mockResolvedValueOnce({ id: 'r2' });

    const result = await runMonteCarlo(
      [mockPortfolio, { ...mockPortfolio, id: 'p2' }],
      mockParameters,
    );

    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([{ id: 'r1' }, { id: 'r2' }]);
    expect(engineMocks.callEngineStrict).toHaveBeenCalledTimes(2);
  });

  it('mcParams 透传到 sanitizeMcParams，结果作为 mcParams 字段传给引擎', async () => {
    const mcParams = { numSimulations: 500, unknownKey: 'should-be-filtered' };
    helpersMocks.sanitizeMcParams.mockReturnValue({ numSimulations: 500 });

    await runMonteCarlo([mockPortfolio], mockParameters, mcParams);

    expect(helpersMocks.sanitizeMcParams).toHaveBeenCalledWith(mcParams);
    const [, body] = engineMocks.callEngineStrict.mock.calls[0];
    expect(body.mcParams).toEqual({ numSimulations: 500 });
  });

  it('mcParams 缺省时 sanitizeMcParams 收到 undefined', async () => {
    await runMonteCarlo([mockPortfolio], mockParameters);

    expect(helpersMocks.sanitizeMcParams).toHaveBeenCalledWith(undefined);
  });

  it('编排链路：collectTickersFromPortfolios → fetchPriceData → sanitizeMcParams → loadMacroData', async () => {
    await runMonteCarlo([mockPortfolio], mockParameters);

    expect(helpersMocks.collectTickersFromPortfolios).toHaveBeenCalledWith([mockPortfolio]);
    expect(helpersMocks.fetchPriceData).toHaveBeenCalledWith(
      ['AAPL', 'BND'],
      '2020-01-02',
      '2020-12-31',
    );
    expect(helpersMocks.sanitizeMcParams).toHaveBeenCalledTimes(1);
    expect(helpersMocks.loadMacroData).toHaveBeenCalledWith(mockParameters);
  });

  it('callEngineStrict 收到正确 endpoint + 完整 body', async () => {
    await runMonteCarlo([mockPortfolio], mockParameters, { numSimulations: 200 });

    const [endpoint, body] = engineMocks.callEngineStrict.mock.calls[0];
    expect(endpoint).toBe('/api/engine/monte-carlo');
    expect(body).toMatchObject({
      priceData: { AAPL: { '2020-01-02': 100 } },
      cpiData: { '2020-01-01': 258.8 },
      exchangeRates: {},
      mcParams: { numSimulations: 100 },
    });
    // portfolio 字段来自 translateDomainError(() => DomainPortfolio.fromDTO(p)).toEngineBody()
    expect(body.portfolio).toBeDefined();
    expect(helpersMocks.translateDomainError).toHaveBeenCalled();
  });

  it('引擎抛错应向上传播（fail-closed，不静默吞错）', async () => {
    const engineErr = new Error('engine down');
    engineMocks.callEngineStrict.mockRejectedValueOnce(engineErr);

    await expect(runMonteCarlo([mockPortfolio], mockParameters)).rejects.toThrow('engine down');
  });

  it('多组合时 Promise.all 并发：任一失败则整体 reject', async () => {
    engineMocks.callEngineStrict
      .mockResolvedValueOnce({ ok: 1 })
      .mockRejectedValueOnce(new Error('second failed'));

    await expect(
      runMonteCarlo([mockPortfolio, { ...mockPortfolio, id: 'p2' }], mockParameters),
    ).rejects.toThrow('second failed');
  });
});
