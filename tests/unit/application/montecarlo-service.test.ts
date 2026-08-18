import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { engineMocks } from '../../helpers/engineFixture.js';
import {
  dataFacadeMocks,
  mockEngine,
  mockFetchHistoryData,
  resetAppServiceMocks,
} from '../../helpers/appServiceFixture.js';
import {
  mockParameters,
  mockPortfolio as portfolioFixture,
} from '../../helpers/backtestFixtures.js';

const helpersMocks = vi.hoisted(() => ({ loadMacroData: vi.fn() }));

vi.mock('../../../packages/backend/src/application/backtest-helpers.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../packages/backend/src/application/backtest-helpers.js')
    >();
  return { ...actual, loadMacroData: helpersMocks.loadMacroData };
});

import { runMonteCarlo } from '../../../packages/backend/src/application/montecarlo-service.js';

const mockPortfolio = portfolioFixture({ name: 'Test' });

describe('runMonteCarlo', () => {
  beforeEach(() => {
    resetAppServiceMocks();
    mockFetchHistoryData({
      AAPL: { '2020-01-02': 100, '2020-12-31': 200 },
      BND: { '2020-01-02': 50, '2020-12-31': 60 },
    });
    helpersMocks.loadMacroData.mockResolvedValue({
      cpiData: { '2020-01-01': 258.8 },
      exchangeRates: {},
    });
    mockEngine({ simulated: true });
  });

  it('单组合应返回 results[0]（非数组）', async () => {
    const result = await runMonteCarlo([mockPortfolio], mockParameters);

    expect(result.data).toEqual({ simulated: true });
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

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data).toEqual([{ id: 'r1' }, { id: 'r2' }]);
    expect(engineMocks.callEngineStrict).toHaveBeenCalledTimes(2);
  });

  it('mcParams 未知键被 sanitize 过滤，结果作为 mcParams 字段传给引擎', async () => {
    const mcParams = { numSimulations: 500, unknownKey: 'should-be-filtered' };

    await runMonteCarlo([mockPortfolio], mockParameters, mcParams);

    const [, body] = engineMocks.callEngineStrict.mock.calls[0];
    expect(body.mcParams).toEqual({ numSimulations: 500 });
  });

  it('mcParams 缺省时引擎收到空对象', async () => {
    await runMonteCarlo([mockPortfolio], mockParameters);

    const [, body] = engineMocks.callEngineStrict.mock.calls[0];
    expect(body.mcParams).toEqual({});
  });

  it('编排链路：fetchHistoryData 按收集 tickers 请求，loadMacroData 收到参数', async () => {
    await runMonteCarlo([mockPortfolio], mockParameters);

    expect(dataFacadeMocks.fetchHistoryData).toHaveBeenCalledWith(
      ['AAPL', 'BND', 'SPY'],
      '2020-01-02',
      '2020-12-31',
    );
  });

  it('callEngineStrict 收到正确 endpoint + 完整 body', async () => {
    await runMonteCarlo([mockPortfolio], mockParameters, { numSimulations: 200 });

    const [endpoint, body] = engineMocks.callEngineStrict.mock.calls[0];
    expect(endpoint).toBe('/api/engine/monte-carlo');
    expect(body).toMatchObject({
      priceData: {
        AAPL: { '2020-01-02': 100, '2020-12-31': 200 },
        BND: { '2020-01-02': 50, '2020-12-31': 60 },
      },
      cpiData: {},
      exchangeRates: {},
      mcParams: { numSimulations: 200 },
    });
    expect(body.portfolio).toBeDefined();
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
