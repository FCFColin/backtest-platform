/**
 * optimize-service 单元测试
 *
 * 合并后覆盖：回测优化器参数搜索（executeOptimization）。
 * 所有计算逻辑已迁移到 Go 引擎，测试通过 mock callEngineStrict 验证编排逻辑。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLoggerMocks } from '../../helpers/mockFactories.js';
import { EngineUnavailableErrorStub } from '../../helpers/engineRouteMocks.js';

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

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

vi.mock('../../../packages/backend/src/utils/timeout.js', () => ({
  withTimeout: vi.fn((promise: Promise<unknown>) => promise),
  TimeoutError: class TimeoutError extends Error {},
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

describe('executeOptimization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when portfolio assets is missing', async () => {
    const result = await executeOptimization(validBody({ portfolio: { name: 'test' } }));
    expect(result.success).toBe(false);
    expect(result.error).toBe('缺少组合配置：portfolio.assets');
  });

  it('returns error when no rebalance frequencies', async () => {
    const result = await executeOptimization(
      validBody({ parameterSpace: { initialCapital: { min: 10000, max: 10000, step: 0 } } }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('请至少选择一个再平衡频率');
  });

  it('returns error when startDate or endDate missing', async () => {
    const result = await executeOptimization(validBody({ parameters: { startDate: undefined } }));
    expect(result.success).toBe(false);
    expect(result.error).toBe('缺少回测日期范围');
  });

  it('returns error when ticker data not found', async () => {
    mocks.fetchHistoryData.mockResolvedValueOnce({ data: { AAPL: {} }, degraded: false });
    const result = await executeOptimization(validBody());
    expect(result.success).toBe(false);
    expect(result.error).toBe('以下标的代码无效：AAPL');
  });

  it('returns success on valid optimization', async () => {
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
    expect(result.data).toBeDefined();
    const data = result.data as Record<string, unknown>;
    expect(Array.isArray(data.results)).toBe(true);
    expect((data.results as unknown[]).length).toBe(2);
    expect(data.best).toBeDefined();
    expect((data.best as Record<string, unknown>).cagr).toBe(0.12);
    expect(mocks.callEngineStrict).toHaveBeenCalledTimes(2);
  });

  it('throws EngineUnavailableError when engine is unavailable (fail-closed)', async () => {
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
  const parameters = { startDate: '2020-01-01', endDate: '2020-12-31' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('正常路径：获取数据、调用引擎、返回结果', async () => {
    mocks.fetchHistoryData.mockResolvedValue({
      data: { AAPL: { '2020-01-02': 100 }, SPY: { '2020-01-02': 300 } },
      degraded: false,
    });
    mocks.callEngineStrict.mockResolvedValue({
      data: { weights: { AAPL: 0.6, SPY: 0.4 }, sharpe: 1.5 },
    });

    const result = await runOptimization(
      ['AAPL', 'SPY'],
      'maxSharpe',
      { minWeight: 0, maxWeight: 1 },
      parameters,
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

  it('数据降级时应添加 DATA_DEGRADED 警告', async () => {
    mocks.fetchHistoryData.mockResolvedValue({
      data: { AAPL: { '2020-01-02': 100 } },
      degraded: true,
      degradedWarning: 'Go fetcher 降级',
    });
    mocks.callEngineStrict.mockResolvedValue({ foo: 'bar' });

    const result = await runOptimization(['AAPL'], 'minVolatility', {}, parameters);

    expect(result.warnings).toContainEqual({
      code: 'DATA_DEGRADED',
      message: 'Go fetcher 降级',
    });
  });

  it('部分 ticker 缺失时应添加 TICKER_NOT_FOUND 警告', async () => {
    mocks.fetchHistoryData.mockResolvedValue({
      data: { AAPL: { '2020-01-02': 100 } },
      degraded: false,
    });
    mocks.callEngineStrict.mockResolvedValue({});

    const result = await runOptimization(['AAPL', 'MISSING'], 'maxReturn', {}, parameters);

    expect(result.warnings).toContainEqual({
      code: 'TICKER_NOT_FOUND',
      tickers: ['MISSING'],
    });
  });

  it('numIterations 超过 100000 时应截断为 100000', async () => {
    mocks.fetchHistoryData.mockResolvedValue({
      data: { AAPL: { '2020-01-02': 100 } },
      degraded: false,
    });
    mocks.callEngineStrict.mockResolvedValue({});

    await runOptimization(['AAPL'], 'maxSharpe', {}, parameters, 500000);

    expect(mocks.callEngineStrict).toHaveBeenCalledWith(
      '/api/engine/optimize',
      expect.objectContaining({ numIterations: 100000 }),
    );
  });

  it('引擎返回无 data 字段时应使用原始结果', async () => {
    mocks.fetchHistoryData.mockResolvedValue({
      data: { AAPL: { '2020-01-02': 100 } },
      degraded: false,
    });
    mocks.callEngineStrict.mockResolvedValue({ direct: 'result' });

    const result = await runOptimization(['AAPL'], 'maxSharpe', {}, parameters);

    expect(result.data).toEqual({ direct: 'result' });
  });
});

describe('runEfficientFrontier', () => {
  const parameters = { startDate: '2020-01-01', endDate: '2020-12-31' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('正常路径：获取数据、调用引擎、返回结果（默认 numPoints=20, riskFreeRate=0.02）', async () => {
    mocks.fetchHistoryData.mockResolvedValue({
      data: { AAPL: { '2020-01-02': 100 }, SPY: { '2020-01-02': 300 } },
      degraded: false,
    });
    mocks.callEngineStrict.mockResolvedValue({
      data: { frontier: [{ return: 0.1, risk: 0.15 }] },
    });

    const result = await runEfficientFrontier(['AAPL', 'SPY'], parameters);

    expect(mocks.callEngineStrict).toHaveBeenCalledWith(
      '/api/engine/efficient-frontier',
      expect.objectContaining({
        tickers: ['AAPL', 'SPY'],
        numPoints: 20,
        riskFreeRate: 0.02,
      }),
    );
    expect(result.data).toEqual({ frontier: [{ return: 0.1, risk: 0.15 }] });
    expect(result.warnings).toEqual([]);
    expect(result.dateRange).toBeDefined();
  });

  it('自定义 numPoints 和 riskFreeRate 应传入引擎', async () => {
    mocks.fetchHistoryData.mockResolvedValue({
      data: { AAPL: { '2020-01-02': 100 } },
      degraded: false,
    });
    mocks.callEngineStrict.mockResolvedValue({});

    await runEfficientFrontier(['AAPL'], parameters, 50, 0.05);

    expect(mocks.callEngineStrict).toHaveBeenCalledWith(
      '/api/engine/efficient-frontier',
      expect.objectContaining({ numPoints: 50, riskFreeRate: 0.05 }),
    );
  });

  it('数据降级时应添加 DATA_DEGRADED 警告', async () => {
    mocks.fetchHistoryData.mockResolvedValue({
      data: { AAPL: { '2020-01-02': 100 } },
      degraded: true,
      degradedWarning: '降级警告',
    });
    mocks.callEngineStrict.mockResolvedValue({});

    const result = await runEfficientFrontier(['AAPL'], parameters);

    expect(result.warnings).toContainEqual({
      code: 'DATA_DEGRADED',
      message: '降级警告',
    });
  });
});
