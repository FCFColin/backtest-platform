import { describe, it, expect } from 'vitest';
import {
  validateAssetWeights,
  validatePortfolioCore,
} from '../../../packages/frontend/src/utils/validation';

describe('validateAssetWeights', () => {
  it('权重和为 100% 时返回 null', () => {
    expect(validateAssetWeights([{ weight: 60 }, { weight: 40 }])).toBeNull();
  });

  it('权重和不为 100% 时返回错误文案', () => {
    expect(validateAssetWeights([{ weight: 60 }, { weight: 30 }])).not.toBeNull();
  });

  it('空数组视为 0% 不通过', () => {
    expect(validateAssetWeights([])).not.toBeNull();
  });
});

describe('validatePortfolioCore', () => {
  const onError = (idx: number, key: string) => `${idx}:${key}`;

  it('全部通过时返回 null', () => {
    expect(
      validatePortfolioCore([{ assets: [{ ticker: 'AAPL', weight: 100 }] }], { onError }),
    ).toBeNull();
  });

  it('strict 模式空 ticker 报 emptyTicker', () => {
    expect(validatePortfolioCore([{ assets: [{ ticker: '  ', weight: 100 }] }], { onError })).toBe(
      '0:emptyTicker',
    );
  });

  it('lenient 模式全部空 ticker 报 emptyTicker', () => {
    expect(
      validatePortfolioCore([{ assets: [{ ticker: '', weight: 100 }] }], {
        emptyTickerMode: 'lenient',
        onError,
      }),
    ).toBe('0:emptyTicker');
  });

  it('isWeightComplete 返回 false 报 weightMismatch', () => {
    expect(
      validatePortfolioCore([{ assets: [{ ticker: 'AAPL', weight: 100 }] }], {
        isWeightComplete: () => false,
        onError,
      }),
    ).toBe('0:weightMismatch');
  });

  it('limit 截断扫描范围', () => {
    const portfolios = [
      { assets: [{ ticker: ' ', weight: 100 }] },
      { assets: [{ ticker: '', weight: 100 }] },
    ];
    expect(validatePortfolioCore(portfolios, { limit: 1, onError })).toBe('0:emptyTicker');
  });
});
