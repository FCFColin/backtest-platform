import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DomainValidationError } from '../../../packages/backend/src/domain/value-objects/index.js';
import { ValidationError } from '../../../packages/backend/src/utils/errors.js';
import {
  mockParameters,
  mockPortfolio as portfolioFixture,
} from '../../helpers/backtestFixtures.js';
import {
  translateDomainError,
  portfolioToDomain,
  preparePortfolioBacktest,
  collectInvalidTickerWarnings,
  clampParametersToDataRange,
  collectDomainTickers,
  filterPriceData,
  calculateDateRange,
  sanitizeMcParams,
  preparePriceDataAndWarnings,
  loadMacroData,
  type Warning,
} from '../../../packages/backend/src/application/backtest-helpers.js';

const dataFacadeMocks = vi.hoisted(() => ({ fetchHistoryData: vi.fn() }));
const dataServicesMocks = vi.hoisted(() => ({ loadCpiMap: vi.fn() }));
const macroDataMocks = vi.hoisted(() => ({ loadExchangeRatesFromDb: vi.fn() }));

vi.mock('../../../packages/backend/src/infrastructure/dataFacade.js', () => ({
  fetchHistoryData: dataFacadeMocks.fetchHistoryData,
}));
vi.mock('../../../packages/backend/src/infrastructure/dataServices.js', () => ({
  loadCpiMap: dataServicesMocks.loadCpiMap,
}));
vi.mock('../../../packages/backend/src/db/macroData.js', () => ({
  loadExchangeRatesFromDb: macroDataMocks.loadExchangeRatesFromDb,
}));

const portfolio = portfolioFixture();
const priceData = {
  AAPL: { '2020-01-02': 100, '2020-12-31': 200 },
  BND: { '2020-01-02': 50, '2020-12-31': 60 },
};

describe('translateDomainError', () => {
  it('DomainValidationError 翻译为 ValidationError', () => {
    const err = new DomainValidationError('bad');
    expect(() =>
      translateDomainError(() => {
        throw err;
      }),
    ).toThrow(ValidationError);
  });

  it('其他错误原样上抛', () => {
    const err = new Error('boom');
    expect(() =>
      translateDomainError(() => {
        throw err;
      }),
    ).toThrow('boom');
  });

  it('成功路径透传结果', () => {
    expect(translateDomainError(() => 42)).toBe(42);
  });
});

describe('preparePortfolioBacktest', () => {
  it('非法日期抛 ValidationError', () => {
    expect(() =>
      preparePortfolioBacktest([portfolio], { ...mockParameters, startDate: 'not-a-date' }),
    ).toThrow(ValidationError);
  });

  it('portfolio 数量超限抛 ValidationError', () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ ...portfolio, id: `p${i}` }));
    expect(() => preparePortfolioBacktest(many, mockParameters)).toThrow(/exceeds limit/);
  });

  it('收集 allTickers（含 benchmarkTicker）', () => {
    const { allTickers } = preparePortfolioBacktest([portfolio], mockParameters);
    expect([...allTickers].sort()).toEqual(['AAPL', 'BND', 'SPY']);
  });
});

describe('collectInvalidTickerWarnings', () => {
  it('缺失 ticker 返回并写入 TICKER_NOT_FOUND 警告', () => {
    const warnings: Warning[] = [];
    const invalid = collectInvalidTickerWarnings(new Set(['AAPL', 'MISSING']), priceData, warnings);
    expect(invalid).toEqual(['MISSING']);
    expect(warnings).toEqual([{ code: 'TICKER_NOT_FOUND', tickers: ['MISSING'] }]);
  });

  it('空对象序列视为无效', () => {
    const warnings: Warning[] = [];
    const invalid = collectInvalidTickerWarnings(
      new Set(['AAPL', 'EMPTY']),
      { ...priceData, EMPTY: {} },
      warnings,
    );
    expect(invalid).toEqual(['EMPTY']);
  });

  it('全部存在时不产生警告', () => {
    const warnings: Warning[] = [];
    expect(collectInvalidTickerWarnings(new Set(['AAPL', 'BND']), priceData, warnings)).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('恶意 ticker 名仍应被识别为无数据（不崩溃）', () => {
    const warnings: Warning[] = [];
    const malicious = "'; DROP TABLE prices; --";
    const invalid = collectInvalidTickerWarnings(new Set([malicious]), {}, warnings);
    expect(invalid).toEqual([malicious]);
    expect(warnings).toEqual([{ code: 'TICKER_NOT_FOUND', tickers: [malicious] }]);
  });
});

describe('clampParametersToDataRange', () => {
  it('日期被数据范围钳制时返回新对象', () => {
    const clamped = clampParametersToDataRange(mockParameters, '2020-01-02', '2020-06-30');
    expect(clamped).not.toBe(mockParameters);
    expect(clamped.startDate).toBe('2020-01-02');
    expect(clamped.endDate).toBe('2020-06-30');
  });

  it('日期未变化时原样返回（引用不变）', () => {
    expect(clampParametersToDataRange(mockParameters, '2020-01-02', '2020-12-31')).toBe(
      mockParameters,
    );
  });
});

describe('collectDomainTickers', () => {
  it('合并组合 tickers 与 benchmarkTicker', () => {
    const domainPortfolios = [portfolioToDomain(portfolio)];
    expect([...collectDomainTickers(domainPortfolios, 'SPY')].sort()).toEqual([
      'AAPL',
      'BND',
      'SPY',
    ]);
  });
});

describe('filterPriceData', () => {
  it('仅保留请求的 tickers', () => {
    expect(filterPriceData(priceData, new Set(['AAPL']))).toEqual({
      AAPL: { '2020-01-02': 100, '2020-12-31': 200 },
    });
  });
});

describe('calculateDateRange', () => {
  it('结束日期被钳制时 clamped=true', () => {
    const range = calculateDateRange('2020-01-02', '2021-12-31', '2020-01-02', '2020-12-31');
    expect(range.clamped).toBe(true);
    expect(range.actual).toEqual({ start: '2020-01-02', end: '2020-12-31' });
  });

  it('请求日期在数据范围内 clamped=false', () => {
    expect(calculateDateRange('2020-01-02', '2020-12-31', '2020-01-02', '2020-12-31').clamped).toBe(
      false,
    );
  });

  it('missingTickers 透传', () => {
    const range = calculateDateRange('', '', '2020-01-02', '2020-12-31', ['BOGUS']);
    expect(range.missingTickers).toEqual(['BOGUS']);
  });
});

describe('sanitizeMcParams', () => {
  it('undefined/非对象/数组返回空对象', () => {
    expect(sanitizeMcParams(undefined)).toEqual({});
    expect(sanitizeMcParams('nope' as never)).toEqual({});
    expect(sanitizeMcParams([1, 2] as never)).toEqual({});
  });

  it('仅保留白名单键', () => {
    expect(
      sanitizeMcParams({
        numSimulations: 1000,
        seed: 42,
        unknownKey: 'x',
        successThreshold: 0.8,
      }),
    ).toEqual({ numSimulations: 1000, seed: 42, successThreshold: 0.8 });
  });
});

describe('preparePriceDataAndWarnings', () => {
  beforeEach(() => {
    dataFacadeMocks.fetchHistoryData.mockReset();
  });

  it('从数据推断 effective 日期、无警告', async () => {
    dataFacadeMocks.fetchHistoryData.mockResolvedValue({ data: priceData, degraded: false });

    const result = await preparePriceDataAndWarnings(['AAPL', 'BND'], '2020-01-01', '2021-01-01');

    expect(result.effectiveStartDate).toBe('2020-01-02');
    expect(result.effectiveEndDate).toBe('2020-12-31');
    expect(result.invalidTickers).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(dataFacadeMocks.fetchHistoryData).toHaveBeenCalledWith(
      ['AAPL', 'BND'],
      '2020-01-01',
      '2021-01-01',
    );
  });

  it('降级时写入 DATA_DEGRADED 警告', async () => {
    dataFacadeMocks.fetchHistoryData.mockResolvedValue({
      data: priceData,
      degraded: true,
      degradedWarning: '数据缺失',
    });

    const result = await preparePriceDataAndWarnings(['AAPL', 'BND'], '2020-01-01', '2021-01-01');

    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'DATA_DEGRADED', message: '数据缺失' }),
    ]);
  });

  it('空数据保持请求日期且无效 ticker 全部标记', async () => {
    dataFacadeMocks.fetchHistoryData.mockResolvedValue({ data: {}, degraded: false });

    const result = await preparePriceDataAndWarnings(['AAPL', 'BND'], '2020-01-01', '2021-01-01');

    expect(result.effectiveStartDate).toBe('2020-01-01');
    expect(result.effectiveEndDate).toBe('2021-01-01');
    expect(result.invalidTickers.sort()).toEqual(['AAPL', 'BND']);
  });
});

describe('loadMacroData', () => {
  beforeEach(() => {
    dataServicesMocks.loadCpiMap.mockReset();
    macroDataMocks.loadExchangeRatesFromDb.mockReset();
  });

  it('usd 且不调整通胀：不加载 cpi 与汇率', async () => {
    const result = await loadMacroData({ baseCurrency: 'usd', adjustForInflation: false });
    expect(result).toEqual({ cpiData: {}, exchangeRates: {} });
    expect(dataServicesMocks.loadCpiMap).not.toHaveBeenCalled();
  });

  it('adjustForInflation 加载 cpi（us 区域）', async () => {
    dataServicesMocks.loadCpiMap.mockResolvedValue({ '2020-01-01': 258.8 });

    const result = await loadMacroData({ baseCurrency: 'usd', adjustForInflation: true });

    expect(dataServicesMocks.loadCpiMap).toHaveBeenCalledWith('us');
    expect(result.cpiData).toEqual({ '2020-01-01': 258.8 });
  });

  it('cny 基币加载 cn cpi 与汇率', async () => {
    dataServicesMocks.loadCpiMap.mockResolvedValue({ '2020-01-01': 104.2 });
    macroDataMocks.loadExchangeRatesFromDb.mockResolvedValue({ USDCNY: 7.1 });

    const result = await loadMacroData({ baseCurrency: 'cny', adjustForInflation: true });

    expect(dataServicesMocks.loadCpiMap).toHaveBeenCalledWith('cn');
    expect(result.exchangeRates).toEqual({ USDCNY: 7.1 });
  });
});
