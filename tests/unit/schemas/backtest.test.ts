import { describe, it, expect } from 'vitest';
import {
  portfolioBacktestSchema,
  analysisSchema,
  monteCarloSchema,
  optimizeSchema,
  efficientFrontierSchema,
  backtestOptimizerSchema,
} from '../../../packages/backend/src/schemas/backtest.js';
import {
  goalOptimizerSchema,
  letfAnalyzeSchema,
  pcaAnalyzeSchema,
} from '../../../packages/backend/src/schemas/analysisSchemas.js';
import { set, del, mutSuite } from '../../helpers/schemaMutators.js';

const validPortfolio = () => ({
    assets: [{ ticker: 'AAPL', weight: 100 }],
    rebalanceFrequency: 'monthly' as const,
  }),
  validParams = () => ({ startDate: '2020-01-01', endDate: '2024-12-31' }),
  validBody = () => ({ portfolios: [validPortfolio()], parameters: validParams() }),
  cfLeg = (type: string, amount = 1000) => ({
    id: 'leg-1',
    amount,
    type,
    frequency: 'monthly' as const,
  }),
  otcCF = (type: string, date: string, amount = 1000) => ({ id: 'cf-1', amount, type, date });
function makeBacktestInput(): Record<string, unknown> {
  return {
    portfolio: { assets: [{ ticker: 'AAPL', weight: 100 }] },
    parameterSpace: {
      rebalanceFrequencies: ['monthly', 'quarterly'],
      initialCapital: { min: 1000, max: 10000, step: 1000 },
    },
    parameters: { startDate: '2020-01-01', endDate: '2024-12-31' },
    objective: 'maxSharpe',
  };
}
function makeOptimizerInput(): Record<string, unknown> {
  return {
    targetAmount: 1000000,
    initialAmount: 10000,
    years: 20,
    assets: [{ ticker: 'VTI', weight: 100 }],
  };
}
function makeLetfInput(): Record<string, unknown> {
  return {
    letfTicker: 'TQQQ',
    benchmarkTicker: 'QQQ',
    leverage: 3,
    startDate: '2020-01-01',
    endDate: '2024-12-31',
  };
}
function makePcaInput(): Record<string, unknown> {
  return { tickers: ['AAPL', 'MSFT', 'GOOG'], startDate: '2020-01-01', endDate: '2024-12-31' };
}

type ZodLike = { parse: (d: unknown) => unknown };

function dataSuite(
  schema: ZodLike,
  valid: Array<[string, Record<string, unknown>]>,
  invalid: Array<[string, Record<string, unknown>]>,
) {
  it.each<[string, Record<string, unknown>]>(valid)('%s 应通过校验', (_n, d) => {
    expect(() => schema.parse(d)).not.toThrow();
  });
  it.each<[string, Record<string, unknown>]>(invalid)('%s 应抛错', (_n, d) => {
    expect(() => schema.parse(d)).toThrow();
  });
}

describe('portfolioBacktestSchema', () => {
  mutSuite(portfolioBacktestSchema, validBody, [
    ['缺少 portfolios', del('portfolios')],
    ['portfolios 为空数组', set('portfolios', [])],
    ['缺少 parameters', del('parameters')],
    ['portfolio 缺少 assets', del('portfolios.0.assets')],
    ['portfolio assets 为空', set('portfolios.0.assets', [])],
    ['负数 weight', set('portfolios.0.assets.0.weight', -10)],
    ['asset 缺少 ticker', del('portfolios.0.assets.0.ticker')],
    ['asset ticker 为空字符串', set('portfolios.0.assets.0.ticker', '')],
    ['rebalanceFrequency 非法枚举', set('portfolios.0.rebalanceFrequency', 'invalid')],
    ['startDate 非日期', set('parameters.startDate', 'not-a-date')],
    ['endDate 非日期', set('parameters.endDate', '2024/12/31')],
    ['baseCurrency 非法枚举', set('parameters.baseCurrency', 'eur')],
    ['cashflowLeg type 非法枚举', set('parameters.cashflowLegs', [cfLeg('invalid')])],
    [
      'oneTimeCashflows date 非日期',
      set('parameters.oneTimeCashflows', [otcCF('withdrawal', 'not-a-date')]),
    ],
  ]);
  it.each<[string, Record<string, unknown>]>([
    ['startingValue', { startingValue: 10000 }],
    ['baseCurrency usd/cny', { baseCurrency: 'cny' }],
    ['cashflowLegs 合法', { cashflowLegs: [cfLeg('contribution')] }],
    ['cashflowLegs amount=0', { cashflowLegs: [cfLeg('contribution', 0)] }],
    ['cashflowLegs 负数 amount', { cashflowLegs: [cfLeg('withdrawal', -100)] }],
    ['oneTimeCashflows amount=0', { oneTimeCashflows: [otcCF('withdrawal', '2024-06-15', 0)] }],
  ])('可选字段 %s 应通过校验', (_n, overrides) => {
    expect(() =>
      portfolioBacktestSchema.parse({
        portfolios: [validPortfolio()],
        parameters: { ...validParams(), ...overrides },
      }),
    ).not.toThrow();
  });
});

describe('analysisSchema', () => {
  dataSuite(
    analysisSchema,
    [
      ['tickers 为数组', { tickers: ['AAPL', 'MSFT'], parameters: validParams() }],
      ['tickers 为字符串', { tickers: 'AAPL', parameters: validParams() }],
    ],
    [
      ['tickers 为空数组', { tickers: [], parameters: validParams() }],
      ['tickers 为空字符串', { tickers: '', parameters: validParams() }],
      ['缺少 tickers', { parameters: validParams() }],
    ],
  );
});

describe('monteCarloSchema', () => {
  dataSuite(
    monteCarloSchema,
    [
      ['提供 portfolio', { portfolio: validPortfolio(), parameters: validParams() }],
      ['提供 portfolios', { portfolios: [validPortfolio()], parameters: validParams() }],
      [
        'mcParams 可选字段',
        {
          portfolio: validPortfolio(),
          parameters: validParams(),
          mcParams: {
            numSimulations: 1000,
            numYears: 20,
            minBlockYears: 1,
            maxBlockYears: 3,
            successThreshold: 1.0,
            seed: 42,
          },
        },
      ],
    ],
    [['portfolio 和 portfolios 都缺失', { parameters: validParams() }]],
  );
});

describe('optimizeSchema', () => {
  dataSuite(
    optimizeSchema,
    [
      [
        '合法输入',
        { tickers: ['AAPL', 'MSFT'], objective: 'maxSharpe', parameters: validParams() },
      ],
      [
        'constraints 可选字段',
        {
          tickers: ['AAPL'],
          objective: 'minVolatility',
          constraints: { minWeight: 0, maxWeight: 1 },
          parameters: validParams(),
        },
      ],
    ],
    [
      [
        'objective 非法枚举',
        { tickers: ['AAPL'], objective: 'invalid', parameters: validParams() },
      ],
      ['tickers 为空数组', { tickers: [], objective: 'maxSharpe', parameters: validParams() }],
    ],
  );
});

describe('efficientFrontierSchema', () => {
  dataSuite(
    efficientFrontierSchema,
    [
      ['合法输入', { tickers: ['AAPL', 'MSFT', 'GOOG'], parameters: validParams() }],
      ['numPoints 可选字段', { tickers: ['AAPL'], parameters: validParams(), numPoints: 50 }],
    ],
    [['tickers 为空数组', { tickers: [], parameters: validParams() }]],
  );
});

describe('backtestOptimizerSchema', () => {
  mutSuite(
    backtestOptimizerSchema,
    makeBacktestInput,
    [
      ['portfolio.assets 为空', set('portfolio.assets', [])],
      ['asset 缺少 ticker', set('portfolio.assets', [{ weight: 100 }])],
      ['rebalanceFrequencies 为空数组', set('parameterSpace.rebalanceFrequencies', [])],
      ['rebalanceFrequencies 含非法枚举', set('parameterSpace.rebalanceFrequencies', ['invalid'])],
      ['initialCapital.step 非正数', set('parameterSpace.initialCapital.step', 0)],
      ['initialCapital.step 为负数', set('parameterSpace.initialCapital.step', -1)],
      ['objective 非法枚举', set('objective', 'invalid')],
      ['缺少 portfolio', del('portfolio')],
      ['缺少 parameterSpace', del('parameterSpace')],
      ['缺少 parameters', del('parameters')],
      ['缺少 objective', del('objective')],
      [
        'rebalanceThreshold.step 非正数',
        set('parameterSpace.rebalanceThreshold', { min: 1, max: 10, step: 0 }),
      ],
      ['parameters.startDate 为空字符串', set('parameters.startDate', '')],
      ['parameters.baseCurrency 非法枚举', set('parameters.baseCurrency', 'eur')],
    ],
    [
      ['objective 合法枚举 maxCagr', set('objective', 'maxCagr')],
      ['objective 合法枚举 minMaxDrawdown', set('objective', 'minMaxDrawdown')],
      ['objective 合法枚举 maxSortino', set('objective', 'maxSortino')],
      [
        'rebalanceThreshold 可选字段',
        set('parameterSpace.rebalanceThreshold', { min: 1, max: 10, step: 1 }),
      ],
      ['constraints 可选字段', set('constraints', { maxDrawdown: 0.2, minCagr: 0.05 })],
      ['parameters.baseCurrency 合法枚举', set('parameters.baseCurrency', 'usd')],
    ],
  );
});

describe('goalOptimizerSchema', () => {
  mutSuite(
    goalOptimizerSchema,
    makeOptimizerInput,
    [
      ['targetAmount 为 0', set('targetAmount', 0)],
      ['targetAmount 为负数', set('targetAmount', -100)],
      ['initialAmount 为 0', set('initialAmount', 0)],
      ['initialAmount 为负数', set('initialAmount', -50)],
      ['years 为 0', set('years', 0)],
      ['years 为负数', set('years', -5)],
      ['assets 为空数组', set('assets', [])],
      ['asset 缺少 ticker', set('assets', [{ weight: 100 }])],
      ['asset ticker 为空字符串', set('assets', [{ ticker: '', weight: 100 }])],
      ['缺少 targetAmount', del('targetAmount')],
      ['缺少 initialAmount', del('initialAmount')],
      ['缺少 years', del('years')],
      ['缺少 assets', del('assets')],
      ['targetAmount 类型错误（字符串）', set('targetAmount', '1000000')],
      ['numSimulations 为 0', set('numSimulations', 0)],
      ['numSimulations 为负数', set('numSimulations', -100)],
      ['numSimulations 为小数（int 约束）', set('numSimulations', 1.5)],
    ],
    [['numSimulations 合法正整数', set('numSimulations', 1000)]],
  );
  it('constraints 可选字段应通过校验', () => {
    const d = makeOptimizerInput();
    set('constraints', { maxDrawdown: 0.3, maxVolatility: 0.2 })(d);
    expect(() => goalOptimizerSchema.parse(d)).not.toThrow();
  });
});

describe('letfAnalyzeSchema', () => {
  mutSuite(
    letfAnalyzeSchema,
    makeLetfInput,
    [
      ['缺少 letfTicker', del('letfTicker')],
      ['letfTicker 为空字符串', set('letfTicker', '')],
      ['缺少 benchmarkTicker', del('benchmarkTicker')],
      ['benchmarkTicker 为空字符串', set('benchmarkTicker', '')],
      ['缺少 leverage', del('leverage')],
      ['leverage 为 0', set('leverage', 0)],
      ['leverage 为负数', set('leverage', -2)],
      ['leverage 类型错误（字符串）', set('leverage', '3')],
      ['缺少 startDate', del('startDate')],
      ['startDate 为空字符串', set('startDate', '')],
      ['缺少 endDate', del('endDate')],
      ['endDate 为空字符串', set('endDate', '')],
    ],
    [
      ['leverage 为小数（positive 约束）', set('leverage', 2.5)],
      ['leverage=1（无杠杆基准）', set('leverage', 1)],
    ],
  );
});

describe('pcaAnalyzeSchema', () => {
  mutSuite(
    pcaAnalyzeSchema,
    makePcaInput,
    [
      ['只有 1 个 ticker（min(2) 约束）', set('tickers', ['AAPL'])],
      ['tickers 为空数组', set('tickers', [])],
      ['缺少 tickers', del('tickers')],
      ['缺少 startDate', del('startDate')],
      ['startDate 为空字符串', set('startDate', '')],
      ['缺少 endDate', del('endDate')],
      ['endDate 为空字符串', set('endDate', '')],
      ['numComponents 为 0', set('numComponents', 0)],
      ['numComponents 为负数', set('numComponents', -1)],
      ['numComponents 为小数（int 约束）', set('numComponents', 1.5)],
      ['startDate 类型错误（数字）', set('startDate', 20200101)],
    ],
    [
      ['恰好 2 个 tickers（边界值）', set('tickers', ['AAPL', 'MSFT'])],
      ['numComponents 合法正整数', set('numComponents', 2)],
    ],
  );
  it('tickers 含空字符串应通过校验（min(2) 仅约束长度）', () => {
    const d = makePcaInput();
    set('tickers', ['', ''])(d);
    expect(() => pcaAnalyzeSchema.parse(d)).not.toThrow();
  });
});
