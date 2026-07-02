/**
 * backtest schema 单元测试
 *
 * 企业理由：Zod schema 是运行时类型校验的最后一道防线，校验失败
 * 会导致非法请求进入业务逻辑。测试覆盖：
 * - 合法输入通过校验
 * - 缺少必填字段抛 ZodError
 * - 类型错误抛 ZodError
 * - 枚举值非法抛 ZodError
 * - 数组为空抛 ZodError（min(1) 约束）
 */

import { describe, it, expect } from 'vitest';
import {
  portfolioBacktestSchema,
  analysisSchema,
  monteCarloSchema,
  optimizeSchema,
  efficientFrontierSchema,
} from '../../../api/schemas/backtest.js';

function makeValidPortfolio() {
  return {
    assets: [{ ticker: 'AAPL', weight: 100 }],
    rebalanceFrequency: 'monthly',
  };
}

function makeValidParameters() {
  return {
    startDate: '2020-01-01',
    endDate: '2024-12-31',
  };
}

describe('portfolioBacktestSchema', () => {
  it('合法输入应通过校验', () => {
    const data = {
      portfolios: [makeValidPortfolio()],
      parameters: makeValidParameters(),
    };
    expect(() => portfolioBacktestSchema.parse(data)).not.toThrow();
  });

  it('缺少 portfolios 应抛错', () => {
    expect(() => portfolioBacktestSchema.parse({ parameters: makeValidParameters() })).toThrow();
  });

  it('portfolios 为空数组应抛错（min(1)）', () => {
    expect(() =>
      portfolioBacktestSchema.parse({ portfolios: [], parameters: makeValidParameters() }),
    ).toThrow();
  });

  it('缺少 parameters 应抛错', () => {
    expect(() => portfolioBacktestSchema.parse({ portfolios: [makeValidPortfolio()] })).toThrow();
  });

  it('portfolio 缺少 assets 应抛错', () => {
    expect(() =>
      portfolioBacktestSchema.parse({
        portfolios: [{ rebalanceFrequency: 'monthly' }],
        parameters: makeValidParameters(),
      }),
    ).toThrow();
  });

  it('portfolio assets 为空应抛错', () => {
    expect(() =>
      portfolioBacktestSchema.parse({
        portfolios: [{ assets: [], rebalanceFrequency: 'monthly' }],
        parameters: makeValidParameters(),
      }),
    ).toThrow();
  });

  it('负数 weight 应抛错（T-33）', () => {
    expect(() =>
      portfolioBacktestSchema.parse({
        portfolios: [{ assets: [{ ticker: 'AAPL', weight: -10 }], rebalanceFrequency: 'monthly' }],
        parameters: makeValidParameters(),
      }),
    ).toThrow();
  });

  it('asset 缺少 ticker 应抛错', () => {
    expect(() =>
      portfolioBacktestSchema.parse({
        portfolios: [{ assets: [{ weight: 100 }], rebalanceFrequency: 'monthly' }],
        parameters: makeValidParameters(),
      }),
    ).toThrow();
  });

  it('asset ticker 为空字符串应抛错', () => {
    expect(() =>
      portfolioBacktestSchema.parse({
        portfolios: [{ assets: [{ ticker: '', weight: 100 }], rebalanceFrequency: 'monthly' }],
        parameters: makeValidParameters(),
      }),
    ).toThrow();
  });

  it('rebalanceFrequency 非法枚举值应抛错', () => {
    expect(() =>
      portfolioBacktestSchema.parse({
        portfolios: [{ assets: [{ ticker: 'AAPL', weight: 100 }], rebalanceFrequency: 'invalid' }],
        parameters: makeValidParameters(),
      }),
    ).toThrow();
  });

  it('parameters startDate 非日期格式应抛错', () => {
    expect(() =>
      portfolioBacktestSchema.parse({
        portfolios: [makeValidPortfolio()],
        parameters: { startDate: 'not-a-date', endDate: '2024-12-31' },
      }),
    ).toThrow();
  });

  it('parameters endDate 非日期格式应抛错', () => {
    expect(() =>
      portfolioBacktestSchema.parse({
        portfolios: [makeValidPortfolio()],
        parameters: { startDate: '2020-01-01', endDate: '2024/12/31' },
      }),
    ).toThrow();
  });

  it('可选字段 startingValue 应接受数字', () => {
    const data = {
      portfolios: [makeValidPortfolio()],
      parameters: { ...makeValidParameters(), startingValue: 10000 },
    };
    expect(() => portfolioBacktestSchema.parse(data)).not.toThrow();
  });

  it('可选字段 baseCurrency 应接受 usd/cny 枚举', () => {
    const data = {
      portfolios: [makeValidPortfolio()],
      parameters: { ...makeValidParameters(), baseCurrency: 'cny' },
    };
    expect(() => portfolioBacktestSchema.parse(data)).not.toThrow();
  });

  it('baseCurrency 非法枚举值应抛错', () => {
    expect(() =>
      portfolioBacktestSchema.parse({
        portfolios: [makeValidPortfolio()],
        parameters: { ...makeValidParameters(), baseCurrency: 'eur' },
      }),
    ).toThrow();
  });

  it('cashflowLegs 合法时应通过校验', () => {
    const data = {
      portfolios: [makeValidPortfolio()],
      parameters: {
        ...makeValidParameters(),
        cashflowLegs: [
          {
            id: 'leg-1',
            amount: 1000,
            type: 'contribution',
            frequency: 'monthly',
            offset: 0,
          },
        ],
      },
    };
    expect(() => portfolioBacktestSchema.parse(data)).not.toThrow();
  });

  it('cashflowLeg type 非法枚举应抛错', () => {
    expect(() =>
      portfolioBacktestSchema.parse({
        portfolios: [makeValidPortfolio()],
        parameters: {
          ...makeValidParameters(),
          cashflowLegs: [
            { id: 'leg-1', amount: 1000, type: 'invalid', frequency: 'monthly', offset: 0 },
          ],
        },
      }),
    ).toThrow();
  });

  it('oneTimeCashflows date 非日期格式应抛错', () => {
    expect(() =>
      portfolioBacktestSchema.parse({
        portfolios: [makeValidPortfolio()],
        parameters: {
          ...makeValidParameters(),
          oneTimeCashflows: [{ id: 'cf-1', amount: 1000, type: 'withdrawal', date: 'not-a-date' }],
        },
      }),
    ).toThrow();
  });
});

describe('analysisSchema', () => {
  it('tickers 为数组时应通过校验', () => {
    const data = {
      tickers: ['AAPL', 'MSFT'],
      parameters: makeValidParameters(),
    };
    expect(() => analysisSchema.parse(data)).not.toThrow();
  });

  it('tickers 为字符串时应通过校验', () => {
    const data = {
      tickers: 'AAPL',
      parameters: makeValidParameters(),
    };
    expect(() => analysisSchema.parse(data)).not.toThrow();
  });

  it('tickers 为空数组应抛错', () => {
    expect(() =>
      analysisSchema.parse({ tickers: [], parameters: makeValidParameters() }),
    ).toThrow();
  });

  it('tickers 为空字符串应抛错', () => {
    expect(() =>
      analysisSchema.parse({ tickers: '', parameters: makeValidParameters() }),
    ).toThrow();
  });

  it('缺少 tickers 应抛错', () => {
    expect(() => analysisSchema.parse({ parameters: makeValidParameters() })).toThrow();
  });
});

describe('monteCarloSchema', () => {
  it('提供 portfolio 时应通过校验', () => {
    const data = {
      portfolio: makeValidPortfolio(),
      parameters: makeValidParameters(),
    };
    expect(() => monteCarloSchema.parse(data)).not.toThrow();
  });

  it('提供 portfolios 时应通过校验', () => {
    const data = {
      portfolios: [makeValidPortfolio()],
      parameters: makeValidParameters(),
    };
    expect(() => monteCarloSchema.parse(data)).not.toThrow();
  });

  it('portfolio 和 portfolios 都缺失时应抛错（refine 约束）', () => {
    expect(() => monteCarloSchema.parse({ parameters: makeValidParameters() })).toThrow();
  });

  it('mcParams 可选字段应通过校验', () => {
    const data = {
      portfolio: makeValidPortfolio(),
      parameters: makeValidParameters(),
      mcParams: {
        numSimulations: 1000,
        blockSize: 21,
        withReplacement: true,
        confidenceLevel: 0.95,
        seed: 42,
      },
    };
    expect(() => monteCarloSchema.parse(data)).not.toThrow();
  });
});

describe('optimizeSchema', () => {
  it('合法输入应通过校验', () => {
    const data = {
      tickers: ['AAPL', 'MSFT'],
      objective: 'maxSharpe',
      parameters: makeValidParameters(),
    };
    expect(() => optimizeSchema.parse(data)).not.toThrow();
  });

  it('objective 非法枚举应抛错', () => {
    expect(() =>
      optimizeSchema.parse({
        tickers: ['AAPL'],
        objective: 'invalid',
        parameters: makeValidParameters(),
      }),
    ).toThrow();
  });

  it('tickers 为空数组应抛错', () => {
    expect(() =>
      optimizeSchema.parse({
        tickers: [],
        objective: 'maxSharpe',
        parameters: makeValidParameters(),
      }),
    ).toThrow();
  });

  it('constraints 可选字段应通过校验', () => {
    const data = {
      tickers: ['AAPL'],
      objective: 'minVolatility',
      constraints: { minWeight: 0, maxWeight: 1 },
      parameters: makeValidParameters(),
    };
    expect(() => optimizeSchema.parse(data)).not.toThrow();
  });
});

describe('efficientFrontierSchema', () => {
  it('合法输入应通过校验', () => {
    const data = {
      tickers: ['AAPL', 'MSFT', 'GOOG'],
      parameters: makeValidParameters(),
    };
    expect(() => efficientFrontierSchema.parse(data)).not.toThrow();
  });

  it('tickers 为空数组应抛错', () => {
    expect(() =>
      efficientFrontierSchema.parse({
        tickers: [],
        parameters: makeValidParameters(),
      }),
    ).toThrow();
  });

  it('numPoints 可选字段应通过校验', () => {
    const data = {
      tickers: ['AAPL'],
      parameters: makeValidParameters(),
      numPoints: 50,
    };
    expect(() => efficientFrontierSchema.parse(data)).not.toThrow();
  });
});
