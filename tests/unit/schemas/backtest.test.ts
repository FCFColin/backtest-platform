import { describe, it, expect } from 'vitest';
import {
  portfolioBacktestSchema,
  analysisSchema,
  monteCarloSchema,
  optimizeSchema,
  efficientFrontierSchema,
} from '../../../packages/backend/src/schemas/backtest.js';

const validPortfolio = () => ({
  assets: [{ ticker: 'AAPL', weight: 100 }],
  rebalanceFrequency: 'monthly' as const,
});
const validParams = () => ({ startDate: '2020-01-01', endDate: '2024-12-31' });
const validBody = (overrides: Record<string, unknown> = {}) => ({
  portfolios: [validPortfolio()],
  parameters: validParams(),
  ...overrides,
});

describe('portfolioBacktestSchema', () => {
  it('合法输入应通过校验', () => {
    expect(() => portfolioBacktestSchema.parse(validBody())).not.toThrow();
  });
  it.each([
    ['缺少 portfolios', { parameters: validParams() }],
    ['portfolios 为空数组', { portfolios: [], parameters: validParams() }],
    ['缺少 parameters', { portfolios: [validPortfolio()] }],
    [
      'portfolio 缺少 assets',
      { portfolios: [{ rebalanceFrequency: 'monthly' }], parameters: validParams() },
    ],
    [
      'portfolio assets 为空',
      { portfolios: [{ assets: [], rebalanceFrequency: 'monthly' }], parameters: validParams() },
    ],
    [
      '负数 weight',
      {
        portfolios: [{ assets: [{ ticker: 'AAPL', weight: -10 }], rebalanceFrequency: 'monthly' }],
        parameters: validParams(),
      },
    ],
    [
      'asset 缺少 ticker',
      {
        portfolios: [{ assets: [{ weight: 100 }], rebalanceFrequency: 'monthly' }],
        parameters: validParams(),
      },
    ],
    [
      'asset ticker 为空字符串',
      {
        portfolios: [{ assets: [{ ticker: '', weight: 100 }], rebalanceFrequency: 'monthly' }],
        parameters: validParams(),
      },
    ],
    [
      'rebalanceFrequency 非法枚举',
      {
        portfolios: [{ assets: [{ ticker: 'AAPL', weight: 100 }], rebalanceFrequency: 'invalid' }],
        parameters: validParams(),
      },
    ],
    [
      'startDate 非日期',
      {
        portfolios: [validPortfolio()],
        parameters: { startDate: 'not-a-date', endDate: '2024-12-31' },
      },
    ],
    [
      'endDate 非日期',
      {
        portfolios: [validPortfolio()],
        parameters: { startDate: '2020-01-01', endDate: '2024/12/31' },
      },
    ],
    [
      'baseCurrency 非法枚举',
      { portfolios: [validPortfolio()], parameters: { ...validParams(), baseCurrency: 'eur' } },
    ],
    [
      'cashflowLeg type 非法枚举',
      {
        portfolios: [validPortfolio()],
        parameters: {
          ...validParams(),
          cashflowLegs: [
            { id: 'leg-1', amount: 1000, type: 'invalid', frequency: 'monthly', offset: 0 },
          ],
        },
      },
    ],
    [
      'oneTimeCashflows date 非日期',
      {
        portfolios: [validPortfolio()],
        parameters: {
          ...validParams(),
          oneTimeCashflows: [{ id: 'cf-1', amount: 1000, type: 'withdrawal', date: 'not-a-date' }],
        },
      },
    ],
  ])('%s 应抛错', (_n, data) => {
    expect(() => portfolioBacktestSchema.parse(data)).toThrow();
  });
  it.each([
    ['startingValue', { startingValue: 10000 }],
    ['baseCurrency usd/cny', { baseCurrency: 'cny' }],
    [
      'cashflowLegs 合法',
      {
        cashflowLegs: [
          { id: 'leg-1', amount: 1000, type: 'contribution', frequency: 'monthly', offset: 0 },
        ],
      },
    ],
    [
      'cashflowLegs amount=0',
      {
        cashflowLegs: [
          { id: 'leg-1', amount: 0, type: 'contribution', frequency: 'monthly', offset: 0 },
        ],
      },
    ],
    [
      'cashflowLegs 负数 amount',
      {
        cashflowLegs: [
          { id: 'leg-1', amount: -100, type: 'withdrawal', frequency: 'monthly', offset: 0 },
        ],
      },
    ],
    [
      'oneTimeCashflows amount=0',
      { oneTimeCashflows: [{ id: 'cf-1', amount: 0, type: 'withdrawal', date: '2024-06-15' }] },
    ],
  ])('可选字段 %s 应通过校验', (_n, paramOverrides) => {
    expect(() =>
      portfolioBacktestSchema.parse({
        portfolios: [validPortfolio()],
        parameters: { ...validParams(), ...paramOverrides },
      }),
    ).not.toThrow();
  });
});

describe('analysisSchema', () => {
  it.each([
    ['tickers 为数组', { tickers: ['AAPL', 'MSFT'], parameters: validParams() }],
    ['tickers 为字符串', { tickers: 'AAPL', parameters: validParams() }],
  ])('%s 应通过校验', (_n, data) => {
    expect(() => analysisSchema.parse(data)).not.toThrow();
  });
  it.each([
    ['tickers 为空数组', { tickers: [], parameters: validParams() }],
    ['tickers 为空字符串', { tickers: '', parameters: validParams() }],
    ['缺少 tickers', { parameters: validParams() }],
  ])('%s 应抛错', (_n, data) => {
    expect(() => analysisSchema.parse(data)).toThrow();
  });
});

describe('monteCarloSchema', () => {
  it.each([
    ['提供 portfolio', { portfolio: validPortfolio(), parameters: validParams() }],
    ['提供 portfolios', { portfolios: [validPortfolio()], parameters: validParams() }],
    [
      'mcParams 可选字段',
      {
        portfolio: validPortfolio(),
        parameters: validParams(),
        mcParams: {
          numSimulations: 1000,
          blockSize: 21,
          withReplacement: true,
          confidenceLevel: 0.95,
          seed: 42,
        },
      },
    ],
  ])('%s 应通过校验', (_n, data) => {
    expect(() => monteCarloSchema.parse(data)).not.toThrow();
  });
  it('portfolio 和 portfolios 都缺失时应抛错', () => {
    expect(() => monteCarloSchema.parse({ parameters: validParams() })).toThrow();
  });
});

describe('optimizeSchema', () => {
  it('合法输入应通过校验', () => {
    expect(() =>
      optimizeSchema.parse({
        tickers: ['AAPL', 'MSFT'],
        objective: 'maxSharpe',
        parameters: validParams(),
      }),
    ).not.toThrow();
  });
  it.each([
    ['objective 非法枚举', { tickers: ['AAPL'], objective: 'invalid', parameters: validParams() }],
    ['tickers 为空数组', { tickers: [], objective: 'maxSharpe', parameters: validParams() }],
  ])('%s 应抛错', (_n, data) => {
    expect(() => optimizeSchema.parse(data)).toThrow();
  });
  it('constraints 可选字段应通过校验', () => {
    expect(() =>
      optimizeSchema.parse({
        tickers: ['AAPL'],
        objective: 'minVolatility',
        constraints: { minWeight: 0, maxWeight: 1 },
        parameters: validParams(),
      }),
    ).not.toThrow();
  });
});

describe('efficientFrontierSchema', () => {
  it('合法输入应通过校验', () => {
    expect(() =>
      efficientFrontierSchema.parse({
        tickers: ['AAPL', 'MSFT', 'GOOG'],
        parameters: validParams(),
      }),
    ).not.toThrow();
  });
  it('tickers 为空数组应抛错', () => {
    expect(() =>
      efficientFrontierSchema.parse({ tickers: [], parameters: validParams() }),
    ).toThrow();
  });
  it('numPoints 可选字段应通过校验', () => {
    expect(() =>
      efficientFrontierSchema.parse({
        tickers: ['AAPL'],
        parameters: validParams(),
        numPoints: 50,
      }),
    ).not.toThrow();
  });
});

import { describe, it, expect } from 'vitest';
import { backtestOptimizerSchema } from '../../../packages/backend/src/schemas/backtest.js';

function makeBacktestInput() {
  return {
    portfolio: {
      assets: [{ ticker: 'AAPL', weight: 100 }],
    },
    parameterSpace: {
      rebalanceFrequencies: ['monthly', 'quarterly'],
      initialCapital: { min: 1000, max: 10000, step: 1000 },
    },
    parameters: {
      startDate: '2020-01-01',
      endDate: '2024-12-31',
    },
    objective: 'maxSharpe',
  };
}

describe('backtestOptimizerSchema', () => {
  it('合法输入应通过校验', () => {
    expect(() => backtestOptimizerSchema.parse(makeBacktestInput())).not.toThrow();
  });

  it.each([
    [
      'portfolio.assets 为空',
      (d: Record<string, unknown>) => {
        (d.portfolio as Record<string, unknown>).assets = [];
      },
    ],
    [
      'asset 缺少 ticker',
      (d: Record<string, unknown>) => {
        (d.portfolio as Record<string, unknown>).assets = [{ weight: 100 }];
      },
    ],
    [
      'rebalanceFrequencies 为空数组',
      (d: Record<string, unknown>) => {
        (d.parameterSpace as Record<string, unknown>).rebalanceFrequencies = [];
      },
    ],
    [
      'rebalanceFrequencies 含非法枚举',
      (d: Record<string, unknown>) => {
        (d.parameterSpace as Record<string, unknown>).rebalanceFrequencies = ['invalid'];
      },
    ],
    [
      'initialCapital.step 非正数',
      (d: Record<string, unknown>) => {
        (
          (d.parameterSpace as Record<string, unknown>).initialCapital as Record<string, unknown>
        ).step = 0;
      },
    ],
    [
      'initialCapital.step 为负数',
      (d: Record<string, unknown>) => {
        (
          (d.parameterSpace as Record<string, unknown>).initialCapital as Record<string, unknown>
        ).step = -1;
      },
    ],
    [
      'objective 非法枚举',
      (d: Record<string, unknown>) => {
        d.objective = 'invalid';
      },
    ],
    [
      '缺少 portfolio',
      (d: Record<string, unknown>) => {
        delete d.portfolio;
      },
    ],
    [
      '缺少 parameterSpace',
      (d: Record<string, unknown>) => {
        delete d.parameterSpace;
      },
    ],
    [
      '缺少 parameters',
      (d: Record<string, unknown>) => {
        delete d.parameters;
      },
    ],
    [
      '缺少 objective',
      (d: Record<string, unknown>) => {
        delete d.objective;
      },
    ],
    [
      'rebalanceThreshold.step 非正数',
      (d: Record<string, unknown>) => {
        (d.parameterSpace as Record<string, unknown>).rebalanceThreshold = {
          min: 1,
          max: 10,
          step: 0,
        };
      },
    ],
    [
      'parameters.startDate 为空字符串',
      (d: Record<string, unknown>) => {
        (d.parameters as Record<string, unknown>).startDate = '';
      },
    ],
    [
      'parameters.baseCurrency 非法枚举',
      (d: Record<string, unknown>) => {
        (d.parameters as Record<string, unknown>).baseCurrency = 'eur';
      },
    ],
  ])('%s 应抛错', (_name, mutate) => {
    const data = makeBacktestInput() as Record<string, unknown>;
    mutate(data);
    expect(() => backtestOptimizerSchema.parse(data)).toThrow();
  });

  it.each([
    [
      'objective 合法枚举 maxCagr',
      (d: Record<string, unknown>) => {
        d.objective = 'maxCagr';
      },
    ],
    [
      'objective 合法枚举 minMaxDrawdown',
      (d: Record<string, unknown>) => {
        d.objective = 'minMaxDrawdown';
      },
    ],
    [
      'objective 合法枚举 maxSortino',
      (d: Record<string, unknown>) => {
        d.objective = 'maxSortino';
      },
    ],
    [
      'rebalanceThreshold 可选字段',
      (d: Record<string, unknown>) => {
        (d.parameterSpace as Record<string, unknown>).rebalanceThreshold = {
          min: 1,
          max: 10,
          step: 1,
        };
      },
    ],
    [
      'constraints 可选字段',
      (d: Record<string, unknown>) => {
        d.constraints = { maxDrawdown: 0.2, minCagr: 0.05 };
      },
    ],
    [
      'parameters.baseCurrency 合法枚举',
      (d: Record<string, unknown>) => {
        (d.parameters as Record<string, unknown>).baseCurrency = 'usd';
      },
    ],
  ])('%s 应通过校验', (_name, mutate) => {
    const data = makeBacktestInput() as Record<string, unknown>;
    mutate(data);
    expect(() => backtestOptimizerSchema.parse(data)).not.toThrow();
  });
});

import { describe, it, expect } from 'vitest';
import { goalOptimizerSchema } from '../../../packages/backend/src/schemas/analysisSchemas.js';

function makeOptimizerInput() {
  return {
    targetAmount: 1000000,
    initialAmount: 10000,
    years: 20,
    assets: [{ ticker: 'VTI', weight: 100 }],
  };
}

describe('goalOptimizerSchema', () => {
  it('合法输入应通过校验', () => {
    expect(() => goalOptimizerSchema.parse(makeOptimizerInput())).not.toThrow();
  });

  it.each([
    [
      'targetAmount 为 0',
      (d: Record<string, unknown>) => {
        d.targetAmount = 0;
      },
    ],
    [
      'targetAmount 为负数',
      (d: Record<string, unknown>) => {
        d.targetAmount = -100;
      },
    ],
    [
      'initialAmount 为 0',
      (d: Record<string, unknown>) => {
        d.initialAmount = 0;
      },
    ],
    [
      'initialAmount 为负数',
      (d: Record<string, unknown>) => {
        d.initialAmount = -50;
      },
    ],
    [
      'years 为 0',
      (d: Record<string, unknown>) => {
        d.years = 0;
      },
    ],
    [
      'years 为负数',
      (d: Record<string, unknown>) => {
        d.years = -5;
      },
    ],
    [
      'assets 为空数组',
      (d: Record<string, unknown>) => {
        d.assets = [];
      },
    ],
    [
      'asset 缺少 ticker',
      (d: Record<string, unknown>) => {
        d.assets = [{ weight: 100 }];
      },
    ],
    [
      'asset ticker 为空字符串',
      (d: Record<string, unknown>) => {
        d.assets = [{ ticker: '', weight: 100 }];
      },
    ],
    [
      '缺少 targetAmount',
      (d: Record<string, unknown>) => {
        delete d.targetAmount;
      },
    ],
    [
      '缺少 initialAmount',
      (d: Record<string, unknown>) => {
        delete d.initialAmount;
      },
    ],
    [
      '缺少 years',
      (d: Record<string, unknown>) => {
        delete d.years;
      },
    ],
    [
      '缺少 assets',
      (d: Record<string, unknown>) => {
        delete d.assets;
      },
    ],
    [
      'targetAmount 类型错误（字符串）',
      (d: Record<string, unknown>) => {
        d.targetAmount = '1000000';
      },
    ],
    [
      'numSimulations 为 0',
      (d: Record<string, unknown>) => {
        d.numSimulations = 0;
      },
    ],
    [
      'numSimulations 为负数',
      (d: Record<string, unknown>) => {
        d.numSimulations = -100;
      },
    ],
    [
      'numSimulations 为小数（int 约束）',
      (d: Record<string, unknown>) => {
        d.numSimulations = 1.5;
      },
    ],
  ])('%s 应抛错', (_name, mutate) => {
    const data = makeOptimizerInput() as Record<string, unknown>;
    mutate(data);
    expect(() => goalOptimizerSchema.parse(data)).toThrow();
  });

  it.each([
    [
      'numSimulations 合法正整数',
      (d: Record<string, unknown>) => {
        d.numSimulations = 1000;
      },
    ],
  ])('%s 应通过校验', (_name, mutate) => {
    const data = makeOptimizerInput() as Record<string, unknown>;
    mutate(data);
    expect(() => goalOptimizerSchema.parse(data)).not.toThrow();
  });

  it('constraints 可选字段应通过校验', () => {
    const data = makeOptimizerInput() as Record<string, unknown>;
    data.constraints = { maxDrawdown: 0.3, minSuccessRate: 0.9, maxVolatility: 0.2 };
    expect(() => goalOptimizerSchema.parse(data)).not.toThrow();
  });
});

import { describe, it, expect } from 'vitest';
import { letfAnalyzeSchema } from '../../../packages/backend/src/schemas/analysisSchemas.js';

function makeLetfInput() {
  return {
    letfTicker: 'TQQQ',
    benchmarkTicker: 'QQQ',
    leverage: 3,
    startDate: '2020-01-01',
    endDate: '2024-12-31',
  };
}

describe('letfAnalyzeSchema', () => {
  it('合法输入应通过校验', () => {
    expect(() => letfAnalyzeSchema.parse(makeLetfInput())).not.toThrow();
  });

  it.each([
    [
      '缺少 letfTicker',
      (d: Record<string, unknown>) => {
        delete d.letfTicker;
      },
    ],
    [
      'letfTicker 为空字符串',
      (d: Record<string, unknown>) => {
        d.letfTicker = '';
      },
    ],
    [
      '缺少 benchmarkTicker',
      (d: Record<string, unknown>) => {
        delete d.benchmarkTicker;
      },
    ],
    [
      'benchmarkTicker 为空字符串',
      (d: Record<string, unknown>) => {
        d.benchmarkTicker = '';
      },
    ],
    [
      '缺少 leverage',
      (d: Record<string, unknown>) => {
        delete d.leverage;
      },
    ],
    [
      'leverage 为 0',
      (d: Record<string, unknown>) => {
        d.leverage = 0;
      },
    ],
    [
      'leverage 为负数',
      (d: Record<string, unknown>) => {
        d.leverage = -2;
      },
    ],
    [
      'leverage 类型错误（字符串）',
      (d: Record<string, unknown>) => {
        d.leverage = '3';
      },
    ],
    [
      '缺少 startDate',
      (d: Record<string, unknown>) => {
        delete d.startDate;
      },
    ],
    [
      'startDate 为空字符串',
      (d: Record<string, unknown>) => {
        d.startDate = '';
      },
    ],
    [
      '缺少 endDate',
      (d: Record<string, unknown>) => {
        delete d.endDate;
      },
    ],
    [
      'endDate 为空字符串',
      (d: Record<string, unknown>) => {
        d.endDate = '';
      },
    ],
  ])('%s 应抛错', (_name, mutate) => {
    const data = makeLetfInput() as Record<string, unknown>;
    mutate(data);
    expect(() => letfAnalyzeSchema.parse(data)).toThrow();
  });

  it.each([
    [
      'leverage 为小数（positive 约束）',
      (d: Record<string, unknown>) => {
        d.leverage = 2.5;
      },
    ],
    [
      'leverage=1（无杠杆基准）',
      (d: Record<string, unknown>) => {
        d.leverage = 1;
      },
    ],
  ])('%s 应通过校验', (_name, mutate) => {
    const data = makeLetfInput() as Record<string, unknown>;
    mutate(data);
    expect(() => letfAnalyzeSchema.parse(data)).not.toThrow();
  });
});

import { describe, it, expect } from 'vitest';
import { pcaAnalyzeSchema } from '../../../packages/backend/src/schemas/analysisSchemas.js';

function makePcaInput() {
  return {
    tickers: ['AAPL', 'MSFT', 'GOOG'],
    startDate: '2020-01-01',
    endDate: '2024-12-31',
  };
}

describe('pcaAnalyzeSchema', () => {
  it('合法输入应通过校验', () => {
    expect(() => pcaAnalyzeSchema.parse(makePcaInput())).not.toThrow();
  });

  it.each([
    [
      '只有 1 个 ticker（min(2) 约束）',
      (d: Record<string, unknown>) => {
        d.tickers = ['AAPL'];
      },
    ],
    [
      'tickers 为空数组',
      (d: Record<string, unknown>) => {
        d.tickers = [];
      },
    ],
    [
      '缺少 tickers',
      (d: Record<string, unknown>) => {
        delete d.tickers;
      },
    ],
    [
      '缺少 startDate',
      (d: Record<string, unknown>) => {
        delete d.startDate;
      },
    ],
    [
      'startDate 为空字符串',
      (d: Record<string, unknown>) => {
        d.startDate = '';
      },
    ],
    [
      '缺少 endDate',
      (d: Record<string, unknown>) => {
        delete d.endDate;
      },
    ],
    [
      'endDate 为空字符串',
      (d: Record<string, unknown>) => {
        d.endDate = '';
      },
    ],
    [
      'numComponents 为 0',
      (d: Record<string, unknown>) => {
        d.numComponents = 0;
      },
    ],
    [
      'numComponents 为负数',
      (d: Record<string, unknown>) => {
        d.numComponents = -1;
      },
    ],
    [
      'numComponents 为小数（int 约束）',
      (d: Record<string, unknown>) => {
        d.numComponents = 1.5;
      },
    ],
    [
      'startDate 类型错误（数字）',
      (d: Record<string, unknown>) => {
        d.startDate = 20200101;
      },
    ],
  ])('%s 应抛错', (_name, mutate) => {
    const data = makePcaInput() as Record<string, unknown>;
    mutate(data);
    expect(() => pcaAnalyzeSchema.parse(data)).toThrow();
  });

  it.each([
    [
      '恰好 2 个 tickers（边界值）',
      (d: Record<string, unknown>) => {
        d.tickers = ['AAPL', 'MSFT'];
      },
    ],
    [
      'numComponents 合法正整数',
      (d: Record<string, unknown>) => {
        d.numComponents = 2;
      },
    ],
  ])('%s 应通过校验', (_name, mutate) => {
    const data = makePcaInput() as Record<string, unknown>;
    mutate(data);
    expect(() => pcaAnalyzeSchema.parse(data)).not.toThrow();
  });

  // 注：当前 schema 未对单个 ticker 做 min(1) 约束，仅约束数组长度
  it('tickers 含空字符串应通过校验（min(2) 仅约束长度）', () => {
    const data = makePcaInput() as Record<string, unknown>;
    data.tickers = ['', ''];
    expect(() => pcaAnalyzeSchema.parse(data)).not.toThrow();
  });
});
