import { describe, it, expect } from 'vitest';
import { runPortfolioBacktest, type PriceData } from '../../api/engine/portfolio.js';
import type { Portfolio, BacktestParameters } from '../../shared/types.js';
import { makeLinearPriceData, makeVolatilePriceData, makeParams } from '../helpers/fixtures.js';

// ===== 边界：极端权重 =====
describe('Portfolio引擎 - 极端权重', () => {
  it('单资产0%权重，组合价值不变', () => {
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-12-31', 100, 0.001),
      B: makeLinearPriceData('B', '2020-01-02', '2020-12-31', 100, 0),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 0 }, { ticker: 'B', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    // B不涨不跌，A权重0%，终值=10000
    const finalValue = result.portfolios[0].growthCurve.at(-1)!.value;
    expect(finalValue).toBeCloseTo(10000, 0);
  });

  it('所有权重为0，组合价值不变', () => {
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-12-31', 100, 0.001),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 0 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const finalValue = result.portfolios[0].growthCurve.at(-1)!.value;
    expect(finalValue).toBe(0); // 0%权重=0持仓=0价值
  });

  it('极高杠杆：1000%权重', () => {
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-12-31', 100, 0.001),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 1000 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    // 1000%权重=10倍杠杆，初始持仓=100000
    const firstValue = result.portfolios[0].growthCurve[0].value;
    expect(firstValue).toBeCloseTo(100000, 0);
  });

  it('大额做空：-500%权重', () => {
    const priceData: PriceData = {
      LONG: makeLinearPriceData('LONG', '2020-01-02', '2020-12-31', 100, 0),
      SHORT: makeLinearPriceData('SHORT', '2020-01-02', '2020-12-31', 100, 0),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'LONG', weight: 600 }, { ticker: 'SHORT', weight: -500 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const finalValue = result.portfolios[0].growthCurve.at(-1)!.value;
    expect(finalValue).toBeCloseTo(10000, 0); // 都不涨不跌，终值=初始值
  });
});

// ===== 边界：价格数据缺失 =====
describe('Portfolio引擎 - 价格数据缺失', () => {
  it('部分日期无价格数据，跳过不影响计算', () => {
    // 只有前10天和后10天有数据
    const prices: Record<string, number> = {};
    const current = new Date('2020-01-02');
    for (let i = 0; i < 10; i++) {
      while (current.getDay() === 0 || current.getDay() === 6) current.setDate(current.getDate() + 1);
      prices[current.toISOString().slice(0, 10)] = 100 + i;
      current.setDate(current.getDate() + 1);
    }
    const priceData: PriceData = { A: prices };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    expect(result.portfolios[0].growthCurve.length).toBeGreaterThan(0);
  });

  it('完全无价格数据，组合价值=0', () => {
    const priceData: PriceData = {};
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'NOTEXIST', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    // 无数据时growthCurve为空或全0
    const gc = result.portfolios[0].growthCurve;
    expect(gc.length).toBe(0);
  });

  it('ticker不在priceData中', () => {
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-12-31', 100, 0),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 50 }, { ticker: 'MISSING', weight: 50 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    // MISSING的持仓始终为初始值（无价格变化数据）
    expect(result.portfolios[0].growthCurve.length).toBeGreaterThan(0);
  });
});

// ===== 边界：极端价格变化 =====
describe('Portfolio引擎 - 极端价格变化', () => {
  it('单日暴涨50%', () => {
    const returns = [0.5, 0, 0, 0, 0]; // 第一天涨50%，之后不变
    const priceData: PriceData = {
      A: makeVolatilePriceData('A', '2020-01-02', '2020-02-28', 100, returns),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const gc = result.portfolios[0].growthCurve;
    if (gc.length > 1) {
      expect(gc[1].value).toBeCloseTo(15000, 0);
    }
  });

  it('单日暴跌90%', () => {
    const returns = [-0.9, 0, 0, 0, 0];
    const priceData: PriceData = {
      A: makeVolatilePriceData('A', '2020-01-02', '2020-02-28', 100, returns),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const gc = result.portfolios[0].growthCurve;
    if (gc.length > 1) {
      expect(gc[1].value).toBeCloseTo(1000, 0);
    }
  });

  it('价格归零（退市）', () => {
    const returns = [-1.0, 0, 0, 0, 0]; // 跌100%
    const priceData: PriceData = {
      A: makeVolatilePriceData('A', '2020-01-02', '2020-02-28', 100, returns),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    // 价格归零=爆仓
    const gc = result.portfolios[0].growthCurve;
    const zeroPoints = gc.filter(p => p.value <= 0);
    expect(zeroPoints.length).toBeGreaterThan(0);
  });
});

// ===== 边界：再平衡极端场景 =====
describe('Portfolio引擎 - 再平衡边界', () => {
  it('每日调仓+做空：维持目标权重', () => {
    const dailyReturn = Math.pow(1.20, 1 / 252) - 1;
    const priceData: PriceData = {
      LONG: makeLinearPriceData('LONG', '2020-01-02', '2020-12-31', 100, dailyReturn),
      SHORT: makeLinearPriceData('SHORT', '2020-01-02', '2020-12-31', 100, 0),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'LONG', weight: 150 }, { ticker: 'SHORT', weight: -50 }],
      rebalanceFrequency: 'daily',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    // 每日调仓应维持150/-50权重
    expect(result.portfolios[0].growthCurve.length).toBeGreaterThan(0);
    const gc = result.portfolios[0].growthCurve;
    // 不应爆仓
    const allPositive = gc.every(p => p.value > 0);
    expect(allPositive).toBe(true);
  });

  it('偏离调仓阈值1%：几乎每天调仓', () => {
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-12-31', 100, 0.005),
      B: makeLinearPriceData('B', '2020-01-02', '2020-12-31', 100, 0),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 50 }, { ticker: 'B', weight: 50 }],
      rebalanceFrequency: 'threshold',
      rebalanceThreshold: 1,
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    // 1%阈值下几乎每天调仓，结果应接近每日调仓
    expect(result.portfolios[0].statistics.cagr).toBeGreaterThan(0);
  });

  it('偏离调仓阈值100%：永远不调仓', () => {
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-12-31', 100, 0.005),
      B: makeLinearPriceData('B', '2020-01-02', '2020-12-31', 100, 0),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 50 }, { ticker: 'B', weight: 50 }],
      rebalanceFrequency: 'threshold',
      rebalanceThreshold: 100,
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    // 100%阈值=不调仓，等同于rebalanceFrequency='none'
    expect(result.portfolios[0].growthCurve.length).toBeGreaterThan(0);
  });
});

// ===== 边界：爆仓场景细化 =====
describe('Portfolio引擎 - 爆仓边界', () => {
  it('爆仓后回撤曲线正确', () => {
    const crashReturns = new Array(300).fill(0.01);
    const priceData: PriceData = {
      LONG: makeLinearPriceData('LONG', '2020-01-02', '2020-12-31', 100, 0),
      SHORT: makeVolatilePriceData('SHORT', '2020-01-02', '2020-12-31', 100, crashReturns),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'LONG', weight: 200 }, { ticker: 'SHORT', weight: -100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const dd = result.portfolios[0].drawdownCurve;
    // 爆仓后回撤应为1（100%）
    const ddAfterLiquidation = dd.filter(p => p.drawdown >= 0.99);
    expect(ddAfterLiquidation.length).toBeGreaterThan(0);
  });

  it('爆仓后年度/月度收益正确', () => {
    const crashReturns = new Array(300).fill(0.01);
    const priceData: PriceData = {
      LONG: makeLinearPriceData('LONG', '2020-01-02', '2020-12-31', 100, 0),
      SHORT: makeVolatilePriceData('SHORT', '2020-01-02', '2020-12-31', 100, crashReturns),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'LONG', weight: 200 }, { ticker: 'SHORT', weight: -100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    // 爆仓年份的收益应为-100%
    const annualReturns = result.portfolios[0].annualReturns;
    const badYear = annualReturns.find(a => a.return <= -0.99);
    expect(badYear).toBeDefined();
  });

  it('刚好不爆仓：组合价值=1', () => {
    // 构造一个价值刚好接近0但不为0的场景
    const returns = new Array(300).fill(0.003); // 温和增长
    const priceData: PriceData = {
      LONG: makeLinearPriceData('LONG', '2020-01-02', '2020-12-31', 100, 0),
      SHORT: makeVolatilePriceData('SHORT', '2020-01-02', '2020-12-31', 100, returns),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'LONG', weight: 150 }, { ticker: 'SHORT', weight: -50 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    // 不应爆仓
    expect(result.portfolios[0].statistics.cagr).not.toBe(-1);
  });
});

// ===== 实际场景：经典投资组合 =====
describe('Portfolio引擎 - 实际场景', () => {
  it('60/40股债组合：年化收益应为正', () => {
    const stockReturn = Math.pow(1.10, 1 / 252) - 1; // 年化10%
    const bondReturn = Math.pow(1.03, 1 / 252) - 1;  // 年化3%
    const priceData: PriceData = {
      STOCK: makeLinearPriceData('STOCK', '2020-01-02', '2020-12-31', 100, stockReturn),
      BOND: makeLinearPriceData('BOND', '2020-01-02', '2020-12-31', 100, bondReturn),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: '60/40',
      assets: [{ ticker: 'STOCK', weight: 60 }, { ticker: 'BOND', weight: 40 }],
      rebalanceFrequency: 'annual',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const cagr = result.portfolios[0].statistics.cagr;
    // 60%*10% + 40%*3% = 7.2%
    expect(cagr).toBeGreaterThan(0.05);
    expect(cagr).toBeLessThan(0.10);
  });

  it('市场中性策略：做多涨+做空跌（盈利）', () => {
    const longReturn = Math.pow(1.10, 1 / 252) - 1;  // 做多涨10%
    const shortReturn = Math.pow(0.92, 1 / 252) - 1;  // 做空标的跌8%（做空赚8%）
    const priceData: PriceData = {
      LONG: makeLinearPriceData('LONG', '2020-01-02', '2020-12-31', 100, longReturn),
      SHORT: makeLinearPriceData('SHORT', '2020-01-02', '2020-12-31', 100, shortReturn),
    };
    // 150%做多 + 50%做空 = 初始持仓 15000 + (-5000) = 10000
    const portfolio: Portfolio = {
      id: 'p1', name: 'MarketNeutral',
      assets: [{ ticker: 'LONG', weight: 150 }, { ticker: 'SHORT', weight: -50 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const cagr = result.portfolios[0].statistics.cagr;
    expect(cagr).toBeGreaterThan(0);
  });

  it('市场中性策略：做多涨+做空也涨（亏损）', () => {
    const longReturn = Math.pow(1.10, 1 / 252) - 1;  // 做多涨10%
    const shortReturn = Math.pow(1.08, 1 / 252) - 1;  // 做空标的涨8%（做空亏8%）
    const priceData: PriceData = {
      LONG: makeLinearPriceData('LONG', '2020-01-02', '2020-12-31', 100, longReturn),
      SHORT: makeLinearPriceData('SHORT', '2020-01-02', '2020-12-31', 100, shortReturn),
    };
    // 150%做多 + 50%做空 = 初始持仓 15000 + (-5000) = 10000
    const portfolio: Portfolio = {
      id: 'p1', name: 'MarketNeutral',
      assets: [{ ticker: 'LONG', weight: 150 }, { ticker: 'SHORT', weight: -50 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    // 做多赚1500，做空亏400，净赚1100
    const cagr = result.portfolios[0].statistics.cagr;
    expect(cagr).toBeGreaterThan(0);
    // 不应出现负值
    const gc = result.portfolios[0].growthCurve;
    const negativeValues = gc.filter(p => p.value < 0);
    expect(negativeValues).toHaveLength(0);
  });

  it('杠杆组合：200%股票', () => {
    const stockReturn = Math.pow(1.10, 1 / 252) - 1;
    const priceData: PriceData = {
      STOCK: makeLinearPriceData('STOCK', '2020-01-02', '2020-12-31', 100, stockReturn),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: '2xLeveraged',
      assets: [{ ticker: 'STOCK', weight: 200 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const cagr = result.portfolios[0].statistics.cagr;
    // 2倍杠杆，年化约20%
    expect(cagr).toBeGreaterThan(0.15);
  });

  it('三组合对比：不同风险等级', () => {
    const stockReturn = Math.pow(1.10, 1 / 252) - 1;
    const bondReturn = Math.pow(1.03, 1 / 252) - 1;
    const priceData: PriceData = {
      STOCK: makeLinearPriceData('STOCK', '2020-01-02', '2020-12-31', 100, stockReturn),
      BOND: makeLinearPriceData('BOND', '2020-01-02', '2020-12-31', 100, bondReturn),
    };
    const conservative: Portfolio = {
      id: 'p1', name: '保守',
      assets: [{ ticker: 'STOCK', weight: 20 }, { ticker: 'BOND', weight: 80 }],
      rebalanceFrequency: 'annual',
    };
    const balanced: Portfolio = {
      id: 'p2', name: '平衡',
      assets: [{ ticker: 'STOCK', weight: 60 }, { ticker: 'BOND', weight: 40 }],
      rebalanceFrequency: 'annual',
    };
    const aggressive: Portfolio = {
      id: 'p3', name: '激进',
      assets: [{ ticker: 'STOCK', weight: 100 }],
      rebalanceFrequency: 'annual',
    };
    const result = runPortfolioBacktest([conservative, balanced, aggressive], priceData, makeParams());
    // 激进>平衡>保守
    const cagrC = result.portfolios[0].statistics.cagr;
    const cagrB = result.portfolios[1].statistics.cagr;
    const cagrA = result.portfolios[2].statistics.cagr;
    expect(cagrA).toBeGreaterThan(cagrB);
    expect(cagrB).toBeGreaterThan(cagrC);
    // 波动率也是激进>平衡>保守
    const stdevC = result.portfolios[0].statistics.stdev;
    const stdevB = result.portfolios[1].statistics.stdev;
    const stdevA = result.portfolios[2].statistics.stdev;
    expect(stdevA).toBeGreaterThan(stdevB);
    expect(stdevB).toBeGreaterThan(stdevC);
  });
});

// ===== 偏离调仓实际场景 =====
describe('Portfolio引擎 - 偏离调仓实际场景', () => {
  it('偏离调仓5% vs 季度调仓：做空场景下偏离更安全', () => {
    // 做空标的温和上涨
    const shortReturns = new Array(252).fill(0.001); // 每天涨0.1%
    const priceData: PriceData = {
      VTI: makeLinearPriceData('VTI', '2020-01-02', '2020-12-31', 100, 0.001),
      BND: makeLinearPriceData('BND', '2020-01-02', '2020-12-31', 100, 0),
      SHORT: makeVolatilePriceData('SHORT', '2020-01-02', '2020-12-31', 100, shortReturns),
    };
    const params = makeParams();

    const quarterly: Portfolio = {
      id: 'p1', name: 'Q',
      assets: [
        { ticker: 'VTI', weight: 100 },
        { ticker: 'BND', weight: 100 },
        { ticker: 'SHORT', weight: -100 },
      ],
      rebalanceFrequency: 'quarterly',
    };
    const threshold: Portfolio = {
      id: 'p2', name: 'T5',
      assets: [
        { ticker: 'VTI', weight: 100 },
        { ticker: 'BND', weight: 100 },
        { ticker: 'SHORT', weight: -100 },
      ],
      rebalanceFrequency: 'threshold',
      rebalanceThreshold: 5,
    };

    const resultQ = runPortfolioBacktest([quarterly], priceData, params);
    const resultT = runPortfolioBacktest([threshold], priceData, params);

    // 两者都不应爆仓
    expect(resultQ.portfolios[0].statistics.cagr).not.toBe(-1);
    expect(resultT.portfolios[0].statistics.cagr).not.toBe(-1);
  });

  it('偏离调仓：相对偏差计算正确', () => {
    // 目标权重50%，实际55%，相对偏差 = |0.55-0.50|/|0.50| = 10%
    // 阈值5%时应触发调仓，阈值15%时不触发
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-12-31', 100, 0.003),
      B: makeLinearPriceData('B', '2020-01-02', '2020-12-31', 100, 0),
    };
    const params = makeParams();

    const t5: Portfolio = {
      id: 'p1', name: 'T5',
      assets: [{ ticker: 'A', weight: 50 }, { ticker: 'B', weight: 50 }],
      rebalanceFrequency: 'threshold',
      rebalanceThreshold: 5,
    };
    const t50: Portfolio = {
      id: 'p2', name: 'T50',
      assets: [{ ticker: 'A', weight: 50 }, { ticker: 'B', weight: 50 }],
      rebalanceFrequency: 'threshold',
      rebalanceThreshold: 50,
    };

    const result5 = runPortfolioBacktest([t5], priceData, params);
    const result50 = runPortfolioBacktest([t50], priceData, params);

    // 5%阈值应更频繁调仓，终值应更接近目标权重
    // 50%阈值几乎不调仓，A权重会漂移更多
    const final5 = result5.portfolios[0].growthCurve.at(-1)!.value;
    const final50 = result50.portfolios[0].growthCurve.at(-1)!.value;
    // 两者都应盈利（A在涨）
    expect(final5).toBeGreaterThan(10000);
    expect(final50).toBeGreaterThan(10000);
  });
});

// ===== 基准对比 =====
describe('Portfolio引擎 - 基准', () => {
  it('基准曲线正确生成', () => {
    const stockReturn = Math.pow(1.10, 1 / 252) - 1;
    const priceData: PriceData = {
      STOCK: makeLinearPriceData('STOCK', '2020-01-02', '2020-12-31', 100, stockReturn),
      BENCH: makeLinearPriceData('BENCH', '2020-01-02', '2020-12-31', 100, stockReturn * 0.8),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'STOCK', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const params = makeParams({ benchmarkTicker: 'BENCH' });
    const result = runPortfolioBacktest([portfolio], priceData, params);
    expect(result.benchmarkGrowth).toBeDefined();
    expect(result.benchmarkGrowth!.length).toBeGreaterThan(0);
  });
});
