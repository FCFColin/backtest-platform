import '../../helpers/loggerMock.js';
import { describe, it, expect } from 'vitest';
import { Portfolio } from '../../../packages/backend/src/domain/aggregates/portfolio.js';
import { Ticker, Weight } from '../../../packages/backend/src/domain/value-objects/index.js';

function makeHolding(ticker: string, weight: number) {
  return { ticker: Ticker.create(ticker), weight: Weight.create(weight) };
}

describe('Portfolio Aggregate', () => {
  it('权重和为 100 时创建成功', () => {
    const p = Portfolio.create('Test', [makeHolding('AAPL', 60), makeHolding('SPY', 40)]);
    expect(p.holdingCount).toBe(2);
  });
  it('权重和偏差超过容差时抛出错误', () => {
    expect(() => Portfolio.create('Test', [makeHolding('AAPL', 50)])).toThrow(
      'weights must sum to ~100',
    );
  });
  it('重复 ticker 应抛出错误（持仓权重歧义）', () => {
    expect(() =>
      Portfolio.create('Test', [makeHolding('AAPL', 60), makeHolding('AAPL', 40)]),
    ).toThrow('duplicate ticker: AAPL');
  });
  describe('properties', () => {
    const p = Portfolio.create('Test', [makeHolding('AAPL', 60), makeHolding('SPY', 40)]);
    it.each([
      ['tickers 返回所有 ticker 值列表', (x: Portfolio) => x.tickers, ['AAPL', 'SPY']],
      ['totalWeight 返回权重总和', (x: Portfolio) => x.totalWeight, 100],
    ])('%s', (_n, getter, expected) => {
      expect(getter(p)).toEqual(expected);
    });
  });
});

describe('Weight.create', () => {
  it.each([
    [0, '下边界 0%'],
    [100, '上边界 100%'],
    [50, '一半'],
  ])('应接受 %s（%s）', (value) => {
    expect(Weight.create(value).value).toBe(value);
  });
  it.each([
    [-1, '负数'],
    [101, '大于 100'],
  ])('应拒绝%s（%s）', (value) => {
    expect(() => Weight.create(value)).toThrow(/between 0 and 100/);
  });
});

describe('Ticker.create', () => {
  it.each([
    ['AAPL', 'AAPL', '美股代码'],
    ['VTI', 'VTI', 'ETF 代码'],
    ['A', 'A', '单字符'],
    ['ABCDE', 'ABCDE', '5 字符'],
    ['ABCDEFGHIJ', 'ABCDEFGHIJ', '10 字符（上限）'],
    ['123', '123', '数字代码'],
    ['A1B2', 'A1B2', '字母数字混合'],
    ['510300.SS', '510300.SS', 'A 股带后缀'],
    ['aapl', 'AAPL', '小写转大写（归一化）'],
    ['  AAPL  ', 'AAPL', '去除首尾空格'],
    ['510300.ss', '510300.SS', '小写带后缀'],
    ['AAPL.BCD', 'AAPL.BCD', '后缀超 2 字符（与 isValidTicker 同一口径）'],
    ['AAPL.', 'AAPL.', '后缀为空'],
    ['.SS', '.SS', '主体为空'],
    ['AAPL-SZ', 'AAPL-SZ', '连字符'],
    ['BRK-B', 'BRK-B', '带连字符合法标的'],
    ['ABCDEFGHIJK', 'ABCDEFGHIJK', '11 字符（上限放宽至 20）'],
  ])('应接受 %s（%s）', (input, expected) => {
    expect(Ticker.create(input).value).toBe(expected);
  });
  it.each([
    ['AAPL!', '感叹号'],
    ['AA PL', '中间空格'],
    ['中证500', '非 ASCII 字符'],
    ['ABCDEFGHIJKLMNOPQRSTUV', '超过 20 字符'],
    ['', '空字符串'],
    ['   ', '仅含空格（trim 后为空）'],
  ])('应拒绝 %s（%s）', (input) => {
    expect(() => Ticker.create(input)).toThrow(/Invalid ticker/);
  });
});

describe('Ticker.toString', () => {
  it.each([
    ['应返回 value 字符串', 'AAPL', 'AAPL'],
    ['带后缀的 ticker 应返回完整字符串', '510300.SS', '510300.SS'],
    ['小写输入应返回大写字符串', 'msft', 'MSFT'],
  ])('%s', (_n, input, expected) => {
    expect(Ticker.create(input).toString()).toBe(expected);
  });
});
