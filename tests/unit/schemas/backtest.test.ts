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

type Mut = (d: Record<string, unknown>) => void;

const set = (d: Record<string, unknown>, path: string, val: unknown) => {
  const ks = path.split('.');
  let cur: Record<string, unknown> = d;
  for (let i = 0; i < ks.length - 1; i++) cur = cur[ks[i]] as Record<string, unknown>;
  cur[ks.at(-1)!] = val;
};
const del = (d: Record<string, unknown>, path: string) => {
  const ks = path.split('.');
  let cur: Record<string, unknown> = d;
  for (let i = 0; i < ks.length - 1; i++) cur = cur[ks[i]] as Record<string, unknown>;
  delete cur[ks.at(-1)!];
};

const validPortfolio = () => ({
  assets: [{ ticker: 'AAPL', weight: 100 }],
  rebalanceFrequency: 'monthly' as const,
});
const validParams = () => ({ startDate: '2020-01-01', endDate: '2024-12-31' });
const validBody = () => ({ portfolios: [validPortfolio()], parameters: validParams() });
const cfLeg = (type: string, amount = 1000) => ({
  id: 'leg-1',
  amount,
  type,
  frequency: 'monthly' as const,
  offset: 0,
});
const otcCF = (type: string, date: string, amount = 1000) => ({ id: 'cf-1', amount, type, date });

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

describe('portfolioBacktestSchema', () => {
  it('合法输入应通过校验', () => {
    expect(() => portfolioBacktestSchema.parse(validBody())).not.toThrow();
  });
  it.each<[string, Mut]>([
    ['缺少 portfolios', (b) => del(b, 'portfolios')],
    ['portfolios 为空数组', (b) => set(b, 'portfolios', [])],
    ['缺少 parameters', (b) => del(b, 'parameters')],
    ['portfolio 缺少 assets', (b) => del(b, 'portfolios.0.assets')],
    ['portfolio assets 为空', (b) => set(b, 'portfolios.0.assets', [])],
    ['负数 weight', (b) => set(b, 'portfolios.0.assets.0.weight', -10)],
    ['asset 缺少 ticker', (b) => del(b, 'portfolios.0.assets.0.ticker')],
    ['asset ticker 为空字符串', (b) => set(b, 'portfolios.0.assets.0.ticker', '')],
    ['rebalanceFrequency 非法枚举', (b) => set(b, 'portfolios.0.rebalanceFrequency', 'invalid')],
    ['startDate 非日期', (b) => set(b, 'parameters.startDate', 'not-a-date')],
    ['endDate 非日期', (b) => set(b, 'parameters.endDate', '2024/12/31')],
    ['baseCurrency 非法枚举', (b) => set(b, 'parameters.baseCurrency', 'eur')],
    ['cashflowLeg type 非法枚举', (b) => set(b, 'parameters.cashflowLegs', [cfLeg('invalid')])],
    [
      'oneTimeCashflows date 非日期',
      (b) => set(b, 'parameters.oneTimeCashflows', [otcCF('withdrawal', 'not-a-date')]),
    ],
  ])('%s 应抛错', (_n, mutate) => {
    const b = validBody();
    mutate(b);
    expect(() => portfolioBacktestSchema.parse(b)).toThrow();
  });
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

describe('backtestOptimizerSchema', () => {
  it('合法输入应通过校验', () => {
    expect(() => backtestOptimizerSchema.parse(makeBacktestInput())).not.toThrow();
  });
  it.each<[string, Mut]>([
    ['portfolio.assets 为空', (d) => set(d, 'portfolio.assets', [])],
    ['asset 缺少 ticker', (d) => set(d, 'portfolio.assets', [{ weight: 100 }])],
    ['rebalanceFrequencies 为空数组', (d) => set(d, 'parameterSpace.rebalanceFrequencies', [])],
    [
      'rebalanceFrequencies 含非法枚举',
      (d) => set(d, 'parameterSpace.rebalanceFrequencies', ['invalid']),
    ],
    ['initialCapital.step 非正数', (d) => set(d, 'parameterSpace.initialCapital.step', 0)],
    ['initialCapital.step 为负数', (d) => set(d, 'parameterSpace.initialCapital.step', -1)],
    ['objective 非法枚举', (d) => set(d, 'objective', 'invalid')],
    ['缺少 portfolio', (d) => del(d, 'portfolio')],
    ['缺少 parameterSpace', (d) => del(d, 'parameterSpace')],
    ['缺少 parameters', (d) => del(d, 'parameters')],
    ['缺少 objective', (d) => del(d, 'objective')],
    [
      'rebalanceThreshold.step 非正数',
      (d) => set(d, 'parameterSpace.rebalanceThreshold', { min: 1, max: 10, step: 0 }),
    ],
    ['parameters.startDate 为空字符串', (d) => set(d, 'parameters.startDate', '')],
    ['parameters.baseCurrency 非法枚举', (d) => set(d, 'parameters.baseCurrency', 'eur')],
  ])('%s 应抛错', (_n, mutate) => {
    const d = makeBacktestInput();
    mutate(d);
    expect(() => backtestOptimizerSchema.parse(d)).toThrow();
  });
  it.each<[string, Mut]>([
    ['objective 合法枚举 maxCagr', (d) => set(d, 'objective', 'maxCagr')],
    ['objective 合法枚举 minMaxDrawdown', (d) => set(d, 'objective', 'minMaxDrawdown')],
    ['objective 合法枚举 maxSortino', (d) => set(d, 'objective', 'maxSortino')],
    [
      'rebalanceThreshold 可选字段',
      (d) => set(d, 'parameterSpace.rebalanceThreshold', { min: 1, max: 10, step: 1 }),
    ],
    ['constraints 可选字段', (d) => set(d, 'constraints', { maxDrawdown: 0.2, minCagr: 0.05 })],
    ['parameters.baseCurrency 合法枚举', (d) => set(d, 'parameters.baseCurrency', 'usd')],
  ])('%s 应通过校验', (_n, mutate) => {
    const d = makeBacktestInput();
    mutate(d);
    expect(() => backtestOptimizerSchema.parse(d)).not.toThrow();
  });
});

describe('goalOptimizerSchema', () => {
  it('合法输入应通过校验', () => {
    expect(() => goalOptimizerSchema.parse(makeOptimizerInput())).not.toThrow();
  });
  it.each<[string, Mut]>([
    ['targetAmount 为 0', (d) => set(d, 'targetAmount', 0)],
    ['targetAmount 为负数', (d) => set(d, 'targetAmount', -100)],
    ['initialAmount 为 0', (d) => set(d, 'initialAmount', 0)],
    ['initialAmount 为负数', (d) => set(d, 'initialAmount', -50)],
    ['years 为 0', (d) => set(d, 'years', 0)],
    ['years 为负数', (d) => set(d, 'years', -5)],
    ['assets 为空数组', (d) => set(d, 'assets', [])],
    ['asset 缺少 ticker', (d) => set(d, 'assets', [{ weight: 100 }])],
    ['asset ticker 为空字符串', (d) => set(d, 'assets', [{ ticker: '', weight: 100 }])],
    ['缺少 targetAmount', (d) => del(d, 'targetAmount')],
    ['缺少 initialAmount', (d) => del(d, 'initialAmount')],
    ['缺少 years', (d) => del(d, 'years')],
    ['缺少 assets', (d) => del(d, 'assets')],
    ['targetAmount 类型错误（字符串）', (d) => set(d, 'targetAmount', '1000000')],
    ['numSimulations 为 0', (d) => set(d, 'numSimulations', 0)],
    ['numSimulations 为负数', (d) => set(d, 'numSimulations', -100)],
    ['numSimulations 为小数（int 约束）', (d) => set(d, 'numSimulations', 1.5)],
  ])('%s 应抛错', (_n, mutate) => {
    const d = makeOptimizerInput();
    mutate(d);
    expect(() => goalOptimizerSchema.parse(d)).toThrow();
  });
  it.each<[string, Mut]>([['numSimulations 合法正整数', (d) => set(d, 'numSimulations', 1000)]])(
    '%s 应通过校验',
    (_n, mutate) => {
      const d = makeOptimizerInput();
      mutate(d);
      expect(() => goalOptimizerSchema.parse(d)).not.toThrow();
    },
  );
  it('constraints 可选字段应通过校验', () => {
    const d = makeOptimizerInput();
    set(d, 'constraints', { maxDrawdown: 0.3, minSuccessRate: 0.9, maxVolatility: 0.2 });
    expect(() => goalOptimizerSchema.parse(d)).not.toThrow();
  });
});

describe('letfAnalyzeSchema', () => {
  it('合法输入应通过校验', () => {
    expect(() => letfAnalyzeSchema.parse(makeLetfInput())).not.toThrow();
  });
  it.each<[string, Mut]>([
    ['缺少 letfTicker', (d) => del(d, 'letfTicker')],
    ['letfTicker 为空字符串', (d) => set(d, 'letfTicker', '')],
    ['缺少 benchmarkTicker', (d) => del(d, 'benchmarkTicker')],
    ['benchmarkTicker 为空字符串', (d) => set(d, 'benchmarkTicker', '')],
    ['缺少 leverage', (d) => del(d, 'leverage')],
    ['leverage 为 0', (d) => set(d, 'leverage', 0)],
    ['leverage 为负数', (d) => set(d, 'leverage', -2)],
    ['leverage 类型错误（字符串）', (d) => set(d, 'leverage', '3')],
    ['缺少 startDate', (d) => del(d, 'startDate')],
    ['startDate 为空字符串', (d) => set(d, 'startDate', '')],
    ['缺少 endDate', (d) => del(d, 'endDate')],
    ['endDate 为空字符串', (d) => set(d, 'endDate', '')],
  ])('%s 应抛错', (_n, mutate) => {
    const d = makeLetfInput();
    mutate(d);
    expect(() => letfAnalyzeSchema.parse(d)).toThrow();
  });
  it.each<[string, Mut]>([
    ['leverage 为小数（positive 约束）', (d) => set(d, 'leverage', 2.5)],
    ['leverage=1（无杠杆基准）', (d) => set(d, 'leverage', 1)],
  ])('%s 应通过校验', (_n, mutate) => {
    const d = makeLetfInput();
    mutate(d);
    expect(() => letfAnalyzeSchema.parse(d)).not.toThrow();
  });
});

describe('pcaAnalyzeSchema', () => {
  it('合法输入应通过校验', () => {
    expect(() => pcaAnalyzeSchema.parse(makePcaInput())).not.toThrow();
  });
  it.each<[string, Mut]>([
    ['只有 1 个 ticker（min(2) 约束）', (d) => set(d, 'tickers', ['AAPL'])],
    ['tickers 为空数组', (d) => set(d, 'tickers', [])],
    ['缺少 tickers', (d) => del(d, 'tickers')],
    ['缺少 startDate', (d) => del(d, 'startDate')],
    ['startDate 为空字符串', (d) => set(d, 'startDate', '')],
    ['缺少 endDate', (d) => del(d, 'endDate')],
    ['endDate 为空字符串', (d) => set(d, 'endDate', '')],
    ['numComponents 为 0', (d) => set(d, 'numComponents', 0)],
    ['numComponents 为负数', (d) => set(d, 'numComponents', -1)],
    ['numComponents 为小数（int 约束）', (d) => set(d, 'numComponents', 1.5)],
    ['startDate 类型错误（数字）', (d) => set(d, 'startDate', 20200101)],
  ])('%s 应抛错', (_n, mutate) => {
    const d = makePcaInput();
    mutate(d);
    expect(() => pcaAnalyzeSchema.parse(d)).toThrow();
  });
  it.each<[string, Mut]>([
    ['恰好 2 个 tickers（边界值）', (d) => set(d, 'tickers', ['AAPL', 'MSFT'])],
    ['numComponents 合法正整数', (d) => set(d, 'numComponents', 2)],
  ])('%s 应通过校验', (_n, mutate) => {
    const d = makePcaInput();
    mutate(d);
    expect(() => pcaAnalyzeSchema.parse(d)).not.toThrow();
  });
  it('tickers 含空字符串应通过校验（min(2) 仅约束长度）', () => {
    const d = makePcaInput();
    set(d, 'tickers', ['', '']);
    expect(() => pcaAnalyzeSchema.parse(d)).not.toThrow();
  });
});
