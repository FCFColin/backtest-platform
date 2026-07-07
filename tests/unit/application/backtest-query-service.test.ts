/**
 * backtest-query-service 单元测试（CQRS Query 侧）
 *
 * 覆盖 preparePortfolioBacktest / collectInvalidTickerWarnings 的
 * 常见用例、边界与恶意输入（超长组合、非法日期、空价格序列）。
 */
import { describe, it, expect } from 'vitest';
import {
  preparePortfolioBacktest,
  collectInvalidTickerWarnings,
} from '../../../packages/backend/src/application/backtest-query-service.js';
import type { Portfolio, BacktestParameters } from '../../../packages/shared/types/index.js';
import { MAX_TICKERS } from '../../../packages/shared/constants.js';

function makePortfolio(id: string, tickers: string[]): Portfolio {
  return {
    id,
    name: id,
    assets: tickers.map((t) => ({ ticker: t, weight: 100 / tickers.length })),
    rebalanceFrequency: 'none',
  };
}

const baseParams: BacktestParameters = {
  startDate: '2020-01-02',
  endDate: '2020-12-31',
  startingValue: 10000,
  benchmarkTicker: '',
  adjustForInflation: false,
  rollingWindowMonths: 12,
};

describe('preparePortfolioBacktest', () => {
  it('合法输入应收集全部 ticker 并包含 benchmark', () => {
    const portfolios = [makePortfolio('p1', ['AAPL', 'MSFT'])];
    const params = { ...baseParams, benchmarkTicker: 'SPY' };

    const { allTickers, warnings } = preparePortfolioBacktest(portfolios, params);

    expect(allTickers.has('AAPL')).toBe(true);
    expect(allTickers.has('MSFT')).toBe(true);
    expect(allTickers.has('SPY')).toBe(true);
    expect(warnings).toEqual([]);
  });

  it('非法日期格式应抛出 422 可映射错误', () => {
    expect(() =>
      preparePortfolioBacktest([makePortfolio('p1', ['AAPL'])], {
        ...baseParams,
        startDate: '2020/01/02',
      }),
    ).toThrow('Invalid date format');
  });

  it('结束日期非法应抛出', () => {
    expect(() =>
      preparePortfolioBacktest([makePortfolio('p1', ['AAPL'])], {
        ...baseParams,
        endDate: 'not-a-date',
      }),
    ).toThrow('Invalid date format');
  });

  it(`组合数超过 ${MAX_TICKERS} 应拒绝`, () => {
    const portfolios = Array.from({ length: MAX_TICKERS + 1 }, (_, i) =>
      makePortfolio(`p${i}`, ['AAPL']),
    );
    expect(() => preparePortfolioBacktest(portfolios, baseParams)).toThrow(`max ${MAX_TICKERS}`);
  });

  it(`资产总数超过 ${MAX_TICKERS} 应拒绝（单组合多标的）`, () => {
    const tickers = Array.from({ length: MAX_TICKERS + 1 }, (_, i) => `T${i}`);
    expect(() => preparePortfolioBacktest([makePortfolio('p1', tickers)], baseParams)).toThrow(
      `max ${MAX_TICKERS}`,
    );
  });

  it('空组合列表应返回空 ticker 集合', () => {
    const { allTickers } = preparePortfolioBacktest([], baseParams);
    expect(allTickers.size).toBe(0);
  });
});

describe('collectInvalidTickerWarnings', () => {
  it('缺失价格序列应写入 warnings', () => {
    const tickers = new Set(['AAPL', 'GHOST']);
    const warnings: string[] = [];

    const result = collectInvalidTickerWarnings(tickers, { AAPL: { '2020-01-02': 100 } }, warnings);

    expect(result).toHaveLength(1);
    expect(result[0]).toContain('GHOST');
    expect(result[0]).toContain('无价格数据');
  });

  it('空对象序列应视为无效 ticker', () => {
    const tickers = new Set(['EMPTY']);
    const warnings: string[] = [];

    collectInvalidTickerWarnings(tickers, { EMPTY: {} }, warnings);

    expect(warnings[0]).toContain('EMPTY');
  });

  it('全部有效时不应追加 warning', () => {
    const tickers = new Set(['AAPL']);
    const warnings: string[] = [];

    const result = collectInvalidTickerWarnings(
      tickers,
      { AAPL: { '2020-01-02': 150.5 } },
      warnings,
    );

    expect(result).toEqual([]);
  });

  it('恶意 ticker 名仍应被识别为无数据（不崩溃）', () => {
    const evil = "'; DROP TABLE prices; --";
    const tickers = new Set([evil]);
    const warnings: string[] = [];

    expect(() => collectInvalidTickerWarnings(tickers, {}, warnings)).not.toThrow();
    expect(warnings[0]).toContain(evil);
  });
});
