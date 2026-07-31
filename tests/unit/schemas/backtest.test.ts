import { describe, it, expect } from 'vitest';
import { portfolioBacktestSchema, analysisSchema, monteCarloSchema, optimizeSchema, efficientFrontierSchema } from '../../../packages/backend/src/schemas/backtest.js';

const validPortfolio = () => ({ assets: [{ ticker: 'AAPL', weight: 100 }], rebalanceFrequency: 'monthly' as const });
const validParams = () => ({ startDate: '2020-01-01', endDate: '2024-12-31' });
const validBody = (overrides: Record<string, unknown> = {}) => ({ portfolios: [validPortfolio()], parameters: validParams(), ...overrides });

describe('portfolioBacktestSchema', () => {
  it('合法输入应通过校验', () => { expect(() => portfolioBacktestSchema.parse(validBody())).not.toThrow(); });
  it.each([
    ['缺少 portfolios', { parameters: validParams() }],
    ['portfolios 为空数组', { portfolios: [], parameters: validParams() }],
    ['缺少 parameters', { portfolios: [validPortfolio()] }],
    ['portfolio 缺少 assets', { portfolios: [{ rebalanceFrequency: 'monthly' }], parameters: validParams() }],
    ['portfolio assets 为空', { portfolios: [{ assets: [], rebalanceFrequency: 'monthly' }], parameters: validParams() }],
    ['负数 weight', { portfolios: [{ assets: [{ ticker: 'AAPL', weight: -10 }], rebalanceFrequency: 'monthly' }], parameters: validParams() }],
    ['asset 缺少 ticker', { portfolios: [{ assets: [{ weight: 100 }], rebalanceFrequency: 'monthly' }], parameters: validParams() }],
    ['asset ticker 为空字符串', { portfolios: [{ assets: [{ ticker: '', weight: 100 }], rebalanceFrequency: 'monthly' }], parameters: validParams() }],
    ['rebalanceFrequency 非法枚举', { portfolios: [{ assets: [{ ticker: 'AAPL', weight: 100 }], rebalanceFrequency: 'invalid' }], parameters: validParams() }],
    ['startDate 非日期', { portfolios: [validPortfolio()], parameters: { startDate: 'not-a-date', endDate: '2024-12-31' } }],
    ['endDate 非日期', { portfolios: [validPortfolio()], parameters: { startDate: '2020-01-01', endDate: '2024/12/31' } }],
    ['baseCurrency 非法枚举', { portfolios: [validPortfolio()], parameters: { ...validParams(), baseCurrency: 'eur' } }],
    ['cashflowLeg type 非法枚举', { portfolios: [validPortfolio()], parameters: { ...validParams(), cashflowLegs: [{ id: 'leg-1', amount: 1000, type: 'invalid', frequency: 'monthly', offset: 0 }] } }],
    ['oneTimeCashflows date 非日期', { portfolios: [validPortfolio()], parameters: { ...validParams(), oneTimeCashflows: [{ id: 'cf-1', amount: 1000, type: 'withdrawal', date: 'not-a-date' }] } }],
  ])('%s 应抛错', (_n, data) => { expect(() => portfolioBacktestSchema.parse(data)).toThrow(); });
  it.each([
    ['startingValue', { startingValue: 10000 }],
    ['baseCurrency usd/cny', { baseCurrency: 'cny' }],
    ['cashflowLegs 合法', { cashflowLegs: [{ id: 'leg-1', amount: 1000, type: 'contribution', frequency: 'monthly', offset: 0 }] }],
    ['cashflowLegs amount=0', { cashflowLegs: [{ id: 'leg-1', amount: 0, type: 'contribution', frequency: 'monthly', offset: 0 }] }],
    ['cashflowLegs 负数 amount', { cashflowLegs: [{ id: 'leg-1', amount: -100, type: 'withdrawal', frequency: 'monthly', offset: 0 }] }],
    ['oneTimeCashflows amount=0', { oneTimeCashflows: [{ id: 'cf-1', amount: 0, type: 'withdrawal', date: '2024-06-15' }] }],
  ])('可选字段 %s 应通过校验', (_n, paramOverrides) => {
    expect(() => portfolioBacktestSchema.parse({ portfolios: [validPortfolio()], parameters: { ...validParams(), ...paramOverrides } })).not.toThrow();
  });
});

describe('analysisSchema', () => {
  it.each([
    ['tickers 为数组', { tickers: ['AAPL', 'MSFT'], parameters: validParams() }],
    ['tickers 为字符串', { tickers: 'AAPL', parameters: validParams() }],
  ])('%s 应通过校验', (_n, data) => { expect(() => analysisSchema.parse(data)).not.toThrow(); });
  it.each([
    ['tickers 为空数组', { tickers: [], parameters: validParams() }],
    ['tickers 为空字符串', { tickers: '', parameters: validParams() }],
    ['缺少 tickers', { parameters: validParams() }],
  ])('%s 应抛错', (_n, data) => { expect(() => analysisSchema.parse(data)).toThrow(); });
});

describe('monteCarloSchema', () => {
  it.each([
    ['提供 portfolio', { portfolio: validPortfolio(), parameters: validParams() }],
    ['提供 portfolios', { portfolios: [validPortfolio()], parameters: validParams() }],
    ['mcParams 可选字段', { portfolio: validPortfolio(), parameters: validParams(), mcParams: { numSimulations: 1000, blockSize: 21, withReplacement: true, confidenceLevel: 0.95, seed: 42 } }],
  ])('%s 应通过校验', (_n, data) => { expect(() => monteCarloSchema.parse(data)).not.toThrow(); });
  it('portfolio 和 portfolios 都缺失时应抛错', () => { expect(() => monteCarloSchema.parse({ parameters: validParams() })).toThrow(); });
});

describe('optimizeSchema', () => {
  it('合法输入应通过校验', () => { expect(() => optimizeSchema.parse({ tickers: ['AAPL', 'MSFT'], objective: 'maxSharpe', parameters: validParams() })).not.toThrow(); });
  it.each([
    ['objective 非法枚举', { tickers: ['AAPL'], objective: 'invalid', parameters: validParams() }],
    ['tickers 为空数组', { tickers: [], objective: 'maxSharpe', parameters: validParams() }],
  ])('%s 应抛错', (_n, data) => { expect(() => optimizeSchema.parse(data)).toThrow(); });
  it('constraints 可选字段应通过校验', () => {
    expect(() => optimizeSchema.parse({ tickers: ['AAPL'], objective: 'minVolatility', constraints: { minWeight: 0, maxWeight: 1 }, parameters: validParams() })).not.toThrow();
  });
});

describe('efficientFrontierSchema', () => {
  it('合法输入应通过校验', () => { expect(() => efficientFrontierSchema.parse({ tickers: ['AAPL', 'MSFT', 'GOOG'], parameters: validParams() })).not.toThrow(); });
  it('tickers 为空数组应抛错', () => { expect(() => efficientFrontierSchema.parse({ tickers: [], parameters: validParams() })).toThrow(); });
  it('numPoints 可选字段应通过校验', () => { expect(() => efficientFrontierSchema.parse({ tickers: ['AAPL'], parameters: validParams(), numPoints: 50 })).not.toThrow(); });
});