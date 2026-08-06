import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loggerMocks } from '../../helpers/loggerFixture.js';
import { EngineUnavailableErrorStub } from '../../helpers/backtestRoutesFixtures.js';

const mocks = vi.hoisted(() => ({
  callEngineStrict: vi.fn(),
  fetchHistoryData: vi.fn(),
}));

vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
  callEngineStrict: mocks.callEngineStrict,
  EngineUnavailableError: EngineUnavailableErrorStub,
}));

vi.mock('../../../packages/backend/src/infrastructure/dataFacade.js', () => ({
  fetchHistoryData: mocks.fetchHistoryData,
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: loggerMocks }));

vi.mock('../../../packages/backend/src/utils/misc.js', () => ({
  withTimeout: vi.fn((promise: Promise<unknown>) => promise),
  TimeoutError: class TimeoutError extends Error {},
  numericRange: (min: number, max: number, step: number, decimals = 2): number[] => {
    if (step <= 0 || min > max) return [min];
    const factor = 10 ** decimals;
    const result: number[] = [];
    for (let v = min; v <= max + 1e-9; v += step) {
      result.push(Math.round(v * factor) / factor);
    }
    return result;
  },
}));

import {
  executeOptimization,
  runOptimization,
  runEfficientFrontier,
} from '../../../packages/backend/src/application/optimize-service.js';

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    portfolio: { name: 'test', assets: [{ ticker: 'AAPL', weight: 100 }] },
    parameterSpace: {
      rebalanceFrequencies: ['monthly', 'quarterly'],
      initialCapital: { min: 10000, max: 10000, step: 0 },
    },
    parameters: {
      startDate: '2020-01-01',
      endDate: '2020-12-31',
    },
    objective: 'maxCagr',
    ...overrides,
  };
}

function mockPriceDataResponse() {
  return { data: { AAPL: { '2020-01-01': 100 } }, degraded: false };
}

const params = { startDate: '2020-01-01', endDate: '2020-12-31' };
const priceData = () => ({
  data: { AAPL: { '2020-01-02': 100 }, SPY: { '2020-01-02': 300 } },
  degraded: false,
});
describe('executeOptimization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [
      'portfolio.assets 缺失',
      validBody({ portfolio: { name: 'test' } }),
      '缺少组合配置：portfolio.assets',
    ],
    [
      '未选择再平衡频率',
      validBody({ parameterSpace: { initialCapital: { min: 10000, max: 10000, step: 0 } } }),
      '请至少选择一个再平衡频率',
    ],
    ['缺少回测日期范围', validBody({ parameters: { startDate: undefined } }), '缺少回测日期范围'],
  ])('返回错误：%s', async (_n, body, expected) => {
    const result = await executeOptimization(body);
    expect(result.success).toBe(false);
    expect(result.error).toBe(expected);
  });
  it('ticker 数据不存在时应返回错误', async () => {
    mocks.fetchHistoryData.mockResolvedValueOnce({ data: { AAPL: {} }, degraded: false });
    const result = await executeOptimization(validBody());
    expect(result.success).toBe(false);
    expect(result.error).toBe('以下标的代码无效：AAPL');
  });
  it('有效请求应返回成功并包含 results/best', async () => {
    mocks.fetchHistoryData.mockResolvedValueOnce(mockPriceDataResponse());
    mocks.callEngineStrict
      .mockResolvedValueOnce({
        portfolios: [
          {
            statistics: {
              cagr: 0.12,
              maxDrawdown: 0.15,
              sharpe: 1.5,
              sortino: 1.8,
              stdev: 0.2,
              calmar: 0.8,
            },
          },
          {
            statistics: {
              cagr: 0.1,
              maxDrawdown: 0.2,
              sharpe: 1.2,
              sortino: 1.4,
              stdev: 0.25,
              calmar: 0.5,
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        portfolios: [{ growthCurve: [{ date: '2020-01-01', value: 10000 }] }],
      });

    const result = await executeOptimization(validBody());
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(Array.isArray(data.results)).toBe(true);
    expect((data.results as unknown[]).length).toBe(2);
    expect(data.best).toBeDefined();
    expect((data.best as Record<string, unknown>).cagr).toBe(0.12);
    expect(mocks.callEngineStrict).toHaveBeenCalledTimes(2);
  });
  it('引擎不可用时抛出 EngineUnavailableError（fail-closed）', async () => {
    mocks.fetchHistoryData.mockResolvedValueOnce(mockPriceDataResponse());
    mocks.callEngineStrict.mockRejectedValueOnce(
      new EngineUnavailableErrorStub('/api/engine/backtest'),
    );

    await expect(executeOptimization(validBody())).rejects.toBeInstanceOf(
      EngineUnavailableErrorStub,
    );
    expect(mocks.callEngineStrict).toHaveBeenCalledTimes(1);
  });
});
describe('runOptimization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('正常路径：获取数据、调用引擎、返回结果', async () => {
    mocks.fetchHistoryData.mockResolvedValue(priceData());
    mocks.callEngineStrict.mockResolvedValue({
      data: { weights: { AAPL: 0.6, SPY: 0.4 }, sharpe: 1.5 },
    });

    const result = await runOptimization(
      ['AAPL', 'SPY'],
      'maxSharpe',
      { minWeight: 0, maxWeight: 1 },
      params,
    );

    expect(mocks.callEngineStrict).toHaveBeenCalledWith(
      '/api/engine/optimize',
      expect.objectContaining({
        tickers: ['AAPL', 'SPY'],
        objective: 'maxSharpe',
        constraints: { minWeight: 0, maxWeight: 1 },
        numIterations: 10000,
      }),
    );
    expect(result.data).toEqual({ weights: { AAPL: 0.6, SPY: 0.4 }, sharpe: 1.5 });
    expect(result.warnings).toEqual([]);
    expect(result.dateRange).toBeDefined();
  });

  it.each([
    [
      '数据降级时应添加 DATA_DEGRADED 警告',
      { data: { AAPL: { '2020-01-02': 100 } }, degraded: true, degradedWarning: 'Go fetcher 降级' },
      (r: { warnings: Array<{ code: string; message: string }> }) =>
        expect(r.warnings).toContainEqual({ code: 'DATA_DEGRADED', message: 'Go fetcher 降级' }),
      ['AAPL'],
      'minVolatility',
      {},
    ],
    [
      '部分 ticker 缺失时应添加 TICKER_NOT_FOUND 警告',
      { data: { AAPL: { '2020-01-02': 100 } }, degraded: false },
      (r: { warnings: Array<{ code: string; tickers: string[] }> }) =>
        expect(r.warnings).toContainEqual({ code: 'TICKER_NOT_FOUND', tickers: ['MISSING'] }),
      ['AAPL', 'MISSING'],
      'maxReturn',
      {},
    ],
    [
      'numIterations 超过 100000 时应截断为 100000',
      { data: { AAPL: { '2020-01-02': 100 } }, degraded: false },
      (_r: unknown) =>
        expect(mocks.callEngineStrict).toHaveBeenCalledWith(
          '/api/engine/optimize',
          expect.objectContaining({ numIterations: 100000 }),
        ),
      ['AAPL'],
      'maxSharpe',
      {},
    ],
  ])('%s', async (_n, fetchRes, check, tickers, objective, constraints) => {
    mocks.fetchHistoryData.mockResolvedValue(fetchRes);
    mocks.callEngineStrict.mockResolvedValue({});
    const iterations = _n.includes('100000') ? 500000 : undefined;
    const result = await runOptimization(tickers, objective, constraints, params, iterations);
    check(result);
  });
  it('引擎返回无 data 字段时应使用原始结果', async () => {
    mocks.fetchHistoryData.mockResolvedValue({
      data: { AAPL: { '2020-01-02': 100 } },
      degraded: false,
    });
    mocks.callEngineStrict.mockResolvedValue({ direct: 'result' });

    const result = await runOptimization(['AAPL'], 'maxSharpe', {}, params);

    expect(result.data).toEqual({ direct: 'result' });
  });
});
describe('runEfficientFrontier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each<[string, number | undefined, number | undefined, unknown, unknown, string[]]>([
    [
      '正常路径：默认 numPoints=20, riskFreeRate=0.02',
      undefined,
      undefined,
      expect.objectContaining({ tickers: ['AAPL', 'SPY'], numPoints: 20, riskFreeRate: 0.02 }),
      { frontier: [{ return: 0.1, risk: 0.15 }] },
      ['AAPL', 'SPY'],
    ],
    [
      '自定义 numPoints 和 riskFreeRate 应传入引擎',
      50,
      0.05,
      expect.objectContaining({ numPoints: 50, riskFreeRate: 0.05 }),
      {},
      ['AAPL'],
    ],
  ])('%s', async (_n, numPoints, riskFreeRate, engineExpect, engineRes, tickers) => {
    mocks.fetchHistoryData.mockResolvedValue(priceData());
    mocks.callEngineStrict.mockResolvedValue({ data: engineRes });
    const result = await runEfficientFrontier(tickers, params, numPoints, riskFreeRate);
    expect(mocks.callEngineStrict).toHaveBeenCalledWith(
      '/api/engine/efficient-frontier',
      engineExpect,
    );
    if (numPoints === undefined) {
      expect(result.data).toEqual(engineRes);
      expect(result.warnings).toEqual([]);
      expect(result.dateRange).toBeDefined();
    }
  });
  it('数据降级时应添加 DATA_DEGRADED 警告', async () => {
    mocks.fetchHistoryData.mockResolvedValue({
      data: { AAPL: { '2020-01-02': 100 } },
      degraded: true,
      degradedWarning: '降级警告',
    });
    mocks.callEngineStrict.mockResolvedValue({});

    const result = await runEfficientFrontier(['AAPL'], params);

    expect(result.warnings).toContainEqual({
      code: 'DATA_DEGRADED',
      message: '降级警告',
    });
  });
});
