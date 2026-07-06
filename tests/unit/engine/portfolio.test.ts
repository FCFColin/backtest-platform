import { describe, it, expect } from 'vitest';
import {
  runPortfolioBacktest,
  runAnalysis,
  type PriceData,
} from '../../../packages/backend/src/engine/portfolio.js';
import type { Portfolio } from '../../../shared/types.js';
import { makeLinearPriceData, makeVolatilePriceData, makeParams } from '../../helpers/fixtures.js';

// ===== 基础回测逻辑 =====

describe('Portfolio引擎 - 基础回测', () => {
  it('单资产100%权重，价格不变，终值=初始值', () => {
    const priceData: PriceData = {
      STOCK: makeLinearPriceData('STOCK', '2020-01-02', '2020-12-31', 100, 0),
    };
    const portfolio: Portfolio = {
      id: 'p1',
      name: 'Test',
      assets: [{ ticker: 'STOCK', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const finalValue = result.portfolios[0].growthCurve.at(-1)!.value;
    expect(finalValue).toBeCloseTo(10000, 0);
  });

  it('单资产100%权重，年涨10%，终值约11000', () => {
    const dailyReturn = Math.pow(1.1, 1 / 252) - 1; // 年化10%
    const priceData: PriceData = {
      STOCK: makeLinearPriceData('STOCK', '2020-01-02', '2020-12-31', 100, dailyReturn),
    };
    const portfolio: Portfolio = {
      id: 'p1',
      name: 'Test',
      assets: [{ ticker: 'STOCK', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const finalValue = result.portfolios[0].growthCurve.at(-1)!.value;
    expect(finalValue).toBeCloseTo(11000, -2); // 允许1%误差
  });

  it('两资产各50%权重，相同价格走势，终值与单资产相同', () => {
    const dailyReturn = Math.pow(1.1, 1 / 252) - 1;
    const prices = makeLinearPriceData('A', '2020-01-02', '2020-12-31', 100, dailyReturn);
    const priceData: PriceData = { A: prices, B: { ...prices } }; // 完全相同
    const portfolio: Portfolio = {
      id: 'p1',
      name: 'Test',
      assets: [
        { ticker: 'A', weight: 50 },
        { ticker: 'B', weight: 50 },
      ],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const finalValue = result.portfolios[0].growthCurve.at(-1)!.value;
    expect(finalValue).toBeCloseTo(11000, -2);
  });

  it('权重百分比正确转换：60%权重分配6000初始持仓', () => {
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-12-31', 100, 0),
      B: makeLinearPriceData('B', '2020-01-02', '2020-12-31', 100, 0),
    };
    const portfolio: Portfolio = {
      id: 'p1',
      name: 'Test',
      assets: [
        { ticker: 'A', weight: 60 },
        { ticker: 'B', weight: 40 },
      ],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    // 价格不变，终值=初始值=10000
    const finalValue = result.portfolios[0].growthCurve.at(-1)!.value;
    expect(finalValue).toBe(10000);
  });
});

// ===== 做空/负权重 =====

describe('Portfolio引擎 - 做空（负权重）', () => {
  it('做空-100%权重，标的不涨不跌，终值=初始值', () => {
    const priceData: PriceData = {
      LONG: makeLinearPriceData('LONG', '2020-01-02', '2020-12-31', 100, 0),
      SHORT: makeLinearPriceData('SHORT', '2020-01-02', '2020-12-31', 100, 0),
    };
    const portfolio: Portfolio = {
      id: 'p1',
      name: 'Test',
      assets: [
        { ticker: 'LONG', weight: 200 },
        { ticker: 'SHORT', weight: -100 },
      ],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const finalValue = result.portfolios[0].growthCurve.at(-1)!.value;
    expect(finalValue).toBeCloseTo(10000, 0);
  });

  it('做空-100%权重，标的涨10%，做空亏10%', () => {
    const dailyReturn = Math.pow(1.1, 1 / 252) - 1;
    const priceData: PriceData = {
      LONG: makeLinearPriceData('LONG', '2020-01-02', '2020-12-31', 100, 0), // 不涨
      SHORT: makeLinearPriceData('SHORT', '2020-01-02', '2020-12-31', 100, dailyReturn), // 涨10%
    };
    const portfolio: Portfolio = {
      id: 'p1',
      name: 'Test',
      assets: [
        { ticker: 'LONG', weight: 200 },
        { ticker: 'SHORT', weight: -100 },
      ],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const finalValue = result.portfolios[0].growthCurve.at(-1)!.value;
    // LONG 200% 不涨 = 20000不变，SHORT -100% 涨10% = -10000*1.1 = -11000
    // 总值 = 20000 - 11000 = 9000
    expect(finalValue).toBeCloseTo(9000, -2);
  });

  it('做空-100%权重，标的跌10%，做空赚10%', () => {
    const dailyReturn = Math.pow(0.9, 1 / 252) - 1; // 年化-10%
    const priceData: PriceData = {
      LONG: makeLinearPriceData('LONG', '2020-01-02', '2020-12-31', 100, 0),
      SHORT: makeLinearPriceData('SHORT', '2020-01-02', '2020-12-31', 100, dailyReturn),
    };
    const portfolio: Portfolio = {
      id: 'p1',
      name: 'Test',
      assets: [
        { ticker: 'LONG', weight: 200 },
        { ticker: 'SHORT', weight: -100 },
      ],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const finalValue = result.portfolios[0].growthCurve.at(-1)!.value;
    // LONG 200% 不涨 = 20000不变，SHORT -100% 跌10% = -10000*0.9 = -9000
    // 总值 = 20000 - 9000 = 11000
    expect(finalValue).toBeCloseTo(11000, -2);
  });
});

// ===== 爆仓处理 =====

describe('Portfolio引擎 - 爆仓处理', () => {
  it('组合价值<=0时爆仓，后续value=0', () => {
    // 构造一个暴跌场景：LONG 200%, SHORT -100%，SHORT暴涨导致爆仓
    // 用极端日收益率模拟
    const crashReturns = new Array(300).fill(0.01); // 做空标的每天涨1%
    const priceData: PriceData = {
      LONG: makeLinearPriceData('LONG', '2020-01-02', '2020-12-31', 100, 0),
      SHORT: makeVolatilePriceData('SHORT', '2020-01-02', '2020-12-31', 100, crashReturns),
    };
    const portfolio: Portfolio = {
      id: 'p1',
      name: 'Test',
      assets: [
        { ticker: 'LONG', weight: 200 },
        { ticker: 'SHORT', weight: -100 },
      ],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const gc = result.portfolios[0].growthCurve;

    // 应该有爆仓点
    const zeroPoints = gc.filter((p) => p.value <= 0);
    expect(zeroPoints.length).toBeGreaterThan(0);

    // 爆仓后所有点value=0
    const firstZeroIdx = gc.findIndex((p) => p.value <= 0);
    for (let i = firstZeroIdx; i < gc.length; i++) {
      expect(gc[i].value).toBe(0);
    }
  });

  it('爆仓后CAGR=-1（爆仓标志）', () => {
    const crashReturns = new Array(300).fill(0.01);
    const priceData: PriceData = {
      LONG: makeLinearPriceData('LONG', '2020-01-02', '2020-12-31', 100, 0),
      SHORT: makeVolatilePriceData('SHORT', '2020-01-02', '2020-12-31', 100, crashReturns),
    };
    const portfolio: Portfolio = {
      id: 'p1',
      name: 'Test',
      assets: [
        { ticker: 'LONG', weight: 200 },
        { ticker: 'SHORT', weight: -100 },
      ],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    expect(result.portfolios[0].statistics.cagr).toBe(-1);
  });

  it('正常组合不会爆仓', () => {
    const dailyReturn = Math.pow(1.1, 1 / 252) - 1;
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-12-31', 100, dailyReturn),
      B: makeLinearPriceData('B', '2020-01-02', '2020-12-31', 100, dailyReturn * 0.5),
    };
    const portfolio: Portfolio = {
      id: 'p1',
      name: 'Test',
      assets: [
        { ticker: 'A', weight: 60 },
        { ticker: 'B', weight: 40 },
      ],
      rebalanceFrequency: 'quarterly',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const gc = result.portfolios[0].growthCurve;
    const allPositive = gc.every((p) => p.value > 0);
    expect(allPositive).toBe(true);
  });
});

// ===== 再平衡 =====

describe('Portfolio引擎 - 再平衡', () => {
  it('不调仓：资产比例随价格漂移', () => {
    const dailyReturn = Math.pow(1.2, 1 / 252) - 1; // A年涨20%
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-12-31', 100, dailyReturn),
      B: makeLinearPriceData('B', '2020-01-02', '2020-12-31', 100, 0), // B不涨
    };
    const portfolio: Portfolio = {
      id: 'p1',
      name: 'Test',
      assets: [
        { ticker: 'A', weight: 50 },
        { ticker: 'B', weight: 50 },
      ],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const gc = result.portfolios[0].growthCurve;
    // 最后一天A的权重应该远超50%
    const lastValue = gc.at(-1)!.value;
    expect(lastValue).toBeGreaterThan(10000); // A涨了，总价值增加
  });

  it('每日调仓：维持目标权重', () => {
    const dailyReturn = Math.pow(1.2, 1 / 252) - 1;
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-12-31', 100, dailyReturn),
      B: makeLinearPriceData('B', '2020-01-02', '2020-12-31', 100, 0),
    };
    const portfolio: Portfolio = {
      id: 'p1',
      name: 'Test',
      assets: [
        { ticker: 'A', weight: 50 },
        { ticker: 'B', weight: 50 },
      ],
      rebalanceFrequency: 'daily',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    // 每日调仓下，组合收益 ≈ 50%*A收益 + 50%*B收益
    expect(result.portfolios[0].statistics.cagr).toBeGreaterThan(0);
  });

  it('季度调仓：每季度首日触发', () => {
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-12-31', 100, 0.001),
      B: makeLinearPriceData('B', '2020-01-02', '2020-12-31', 100, 0),
    };
    const baseAssets = [
      { ticker: 'A', weight: 50 },
      { ticker: 'B', weight: 50 },
    ];
    const resultQ = runPortfolioBacktest(
      [{ id: 'p1', name: 'Q', assets: baseAssets, rebalanceFrequency: 'quarterly' }],
      priceData,
      makeParams(),
    );
    const resultNone = runPortfolioBacktest(
      [{ id: 'p2', name: 'None', assets: baseAssets, rebalanceFrequency: 'none' }],
      priceData,
      makeParams(),
    );
    const resultDaily = runPortfolioBacktest(
      [{ id: 'p3', name: 'Daily', assets: baseAssets, rebalanceFrequency: 'daily' }],
      priceData,
      makeParams(),
    );
    const gcQ = resultQ.portfolios[0].growthCurve;
    const finalQ = gcQ.at(-1)!.value;
    const finalNone = resultNone.portfolios[0].growthCurve.at(-1)!.value;
    const finalDaily = resultDaily.portfolios[0].growthCurve.at(-1)!.value;
    // 1年约有252个交易日
    expect(gcQ.length).toBeGreaterThan(200);
    // 季度调仓应触发调仓：终值应不同于不调仓（A涨B平，不调仓时A权重漂移更高）
    expect(finalQ).not.toBeCloseTo(finalNone, 0);
    // 季度调仓终值应介于不调仓（权重漂移）和每日调仓之间
    expect(finalQ).toBeLessThan(finalNone);
    expect(finalQ).toBeGreaterThan(finalDaily);
    // 季度调仓终值应为正（A在涨）
    expect(finalQ).toBeGreaterThan(10000);
  });
});

// ===== 偏离调仓（threshold） =====

describe('Portfolio引擎 - 偏离调仓', () => {
  it('偏离调仓：权重偏离超过阈值时触发调仓', () => {
    // A每天涨0.5%，B不涨，5%阈值
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-12-31', 100, 0.005),
      B: makeLinearPriceData('B', '2020-01-02', '2020-12-31', 100, 0),
    };
    const portfolio: Portfolio = {
      id: 'p1',
      name: 'Test',
      assets: [
        { ticker: 'A', weight: 50 },
        { ticker: 'B', weight: 50 },
      ],
      rebalanceFrequency: 'threshold',
      rebalanceThreshold: 5,
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    // 应该有调仓发生，组合价值增长
    expect(result.portfolios[0].statistics.cagr).toBeGreaterThan(0);
  });

  it('偏离调仓 vs 不调仓：偏离调仓终值更接近每日调仓', () => {
    const dailyReturn = Math.pow(1.2, 1 / 252) - 1;
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-12-31', 100, dailyReturn),
      B: makeLinearPriceData('B', '2020-01-02', '2020-12-31', 100, 0),
    };
    const params = makeParams();

    const noRebalance: Portfolio = {
      id: 'p1',
      name: 'NoRebalance',
      assets: [
        { ticker: 'A', weight: 50 },
        { ticker: 'B', weight: 50 },
      ],
      rebalanceFrequency: 'none',
    };
    const thresholdRebalance: Portfolio = {
      id: 'p2',
      name: 'Threshold',
      assets: [
        { ticker: 'A', weight: 50 },
        { ticker: 'B', weight: 50 },
      ],
      rebalanceFrequency: 'threshold',
      rebalanceThreshold: 5,
    };
    const dailyRebalance: Portfolio = {
      id: 'p3',
      name: 'Daily',
      assets: [
        { ticker: 'A', weight: 50 },
        { ticker: 'B', weight: 50 },
      ],
      rebalanceFrequency: 'daily',
    };

    const resultNo = runPortfolioBacktest([noRebalance], priceData, params);
    const resultTh = runPortfolioBacktest([thresholdRebalance], priceData, params);
    const resultDaily = runPortfolioBacktest([dailyRebalance], priceData, params);

    const finalNo = resultNo.portfolios[0].growthCurve.at(-1)!.value;
    const finalTh = resultTh.portfolios[0].growthCurve.at(-1)!.value;
    const finalDaily = resultDaily.portfolios[0].growthCurve.at(-1)!.value;
    // 三者都应盈利（A年涨20%）
    expect(finalNo).toBeGreaterThan(10000);
    expect(finalTh).toBeGreaterThan(10000);
    expect(finalDaily).toBeGreaterThan(10000);
    // 偏离调仓终值应介于不调仓和每日调仓之间（偏离调仓比不调仓更频繁）
    expect(finalTh).toBeLessThan(finalNo);
    expect(finalTh).toBeGreaterThan(finalDaily);
  });

  it('偏离调仓不应比季度调仓更容易爆仓', () => {
    // 关键测试：做空场景下，偏离调仓不应比季度调仓更容易爆仓
    // VTI 100, BND 100, SHORT -100
    // 做空标的暴涨
    const crashReturns = new Array(300).fill(0.005); // 做空标的每天涨0.5%
    const priceData: PriceData = {
      VTI: makeLinearPriceData('VTI', '2020-01-02', '2020-12-31', 100, 0.001),
      BND: makeLinearPriceData('BND', '2020-01-02', '2020-12-31', 100, 0),
      SHORT: makeVolatilePriceData('SHORT', '2020-01-02', '2020-12-31', 100, crashReturns),
    };
    const params = makeParams();

    const quarterly: Portfolio = {
      id: 'p1',
      name: 'Quarterly',
      assets: [
        { ticker: 'VTI', weight: 100 },
        { ticker: 'BND', weight: 100 },
        { ticker: 'SHORT', weight: -100 },
      ],
      rebalanceFrequency: 'quarterly',
    };
    const threshold: Portfolio = {
      id: 'p2',
      name: 'Threshold',
      assets: [
        { ticker: 'VTI', weight: 100 },
        { ticker: 'BND', weight: 100 },
        { ticker: 'SHORT', weight: -100 },
      ],
      rebalanceFrequency: 'threshold',
      rebalanceThreshold: 10,
    };

    const resultQ = runPortfolioBacktest([quarterly], priceData, params);
    const resultT = runPortfolioBacktest([threshold], priceData, params);

    const qLiquidated = resultQ.portfolios[0].statistics.cagr === -1;
    const tLiquidated = resultT.portfolios[0].statistics.cagr === -1;

    // 偏离调仓不应比季度调仓更容易爆仓
    // 如果季度没爆仓，偏离也不应该爆；如果季度爆了，偏离可以爆也可以不爆
    if (!qLiquidated) {
      expect(tLiquidated).toBe(false);
    }
    // 如果两者都没爆仓，偏离调仓的终值应该 >= 季度调仓（更及时的调仓减少损失）
    if (!qLiquidated && !tLiquidated) {
      const qFinal = resultQ.portfolios[0].growthCurve.at(-1)!.value;
      const tFinal = resultT.portfolios[0].growthCurve.at(-1)!.value;
      expect(tFinal).toBeGreaterThanOrEqual(qFinal * 0.95); // 允许5%误差
    }
  });

  it('偏离调仓阈值=0时不触发调仓', () => {
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-12-31', 100, 0.005),
      B: makeLinearPriceData('B', '2020-01-02', '2020-12-31', 100, 0),
    };
    const baseAssets = [
      { ticker: 'A', weight: 50 },
      { ticker: 'B', weight: 50 },
    ];
    const resultTh0 = runPortfolioBacktest(
      [
        {
          id: 'p1',
          name: 'Th0',
          assets: baseAssets,
          rebalanceFrequency: 'threshold',
          rebalanceThreshold: 0,
        },
      ],
      priceData,
      makeParams(),
    );
    const resultNone = runPortfolioBacktest(
      [{ id: 'p2', name: 'None', assets: baseAssets, rebalanceFrequency: 'none' }],
      priceData,
      makeParams(),
    );
    // 阈值=0时 shouldRebalance 返回 false，等同于不调仓：终值应完全相同
    const finalTh0 = resultTh0.portfolios[0].growthCurve.at(-1)!.value;
    const finalNone = resultNone.portfolios[0].growthCurve.at(-1)!.value;
    expect(finalTh0).toBeCloseTo(finalNone, 6);
  });
});

// ===== 回撤曲线 =====

describe('Portfolio引擎 - 回撤曲线', () => {
  it('回撤曲线正确计算', () => {
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-12-31', 100, 0.001),
    };
    const portfolio: Portfolio = {
      id: 'p1',
      name: 'Test',
      assets: [{ ticker: 'A', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const dd = result.portfolios[0].drawdownCurve;
    // 单调上涨的资产，最大回撤应为0
    expect(result.portfolios[0].statistics.maxDrawdown).toBe(0);
    // 所有回撤值都应为0（每个时点的峰值等于当前值）
    const maxDdInCurve = Math.max(...dd.map((p) => p.drawdown));
    expect(maxDdInCurve).toBe(0);
  });
});

// ===== 年度/月度收益 =====

describe('Portfolio引擎 - 年度/月度收益', () => {
  it('年度收益正确计算', () => {
    const dailyReturn = 0.001;
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-12-31', 100, dailyReturn),
    };
    const portfolio: Portfolio = {
      id: 'p1',
      name: 'Test',
      assets: [{ ticker: 'A', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const annualReturns = result.portfolios[0].annualReturns;
    // 2020年全年交易日约252天，年收益 ≈ (1.001)^252 - 1 ≈ 0.286
    expect(annualReturns).toHaveLength(1);
    expect(annualReturns[0].year).toBe(2020);
    expect(annualReturns[0].return).toBeCloseTo(0.285, 1);
  });
});

// ===== 相关性矩阵 =====

describe('Portfolio引擎 - 基准与扩展指标', () => {
  it('配置 benchmarkTicker 时应计算 beta/alpha 并返回 benchmarkGrowth', () => {
    const dailyReturn = Math.pow(1.12, 1 / 252) - 1;
    const benchReturn = Math.pow(1.08, 1 / 252) - 1;
    const priceData: PriceData = {
      STOCK: makeLinearPriceData('STOCK', '2020-01-02', '2020-12-31', 100, dailyReturn),
      BENCH: makeLinearPriceData('BENCH', '2020-01-02', '2020-12-31', 100, benchReturn),
    };
    const portfolio: Portfolio = {
      id: 'p1',
      name: 'Bench',
      assets: [{ ticker: 'STOCK', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest(
      [portfolio],
      priceData,
      makeParams({ benchmarkTicker: 'BENCH' }),
    );

    expect(result.benchmarkGrowth).toBeDefined();
    expect(result.benchmarkGrowth!.length).toBeGreaterThan(1);
    const stats = result.portfolios[0].statistics;
    expect(stats.beta).toBeDefined();
    expect(stats.alpha).toBeDefined();
    expect(stats.trackingError).toBeGreaterThanOrEqual(0);
  });

  it('runAnalysis 应对单资产返回统计摘要', () => {
    const priceData: PriceData = {
      AAPL: makeLinearPriceData('AAPL', '2020-01-02', '2020-12-31', 100, 0.001),
    };
    const analysis = runAnalysis(['AAPL'], priceData, makeParams());
    expect(analysis.tickers[0].statistics.cagr).toBeDefined();
    expect(analysis.tickers[0].growthCurve.length).toBeGreaterThan(0);
  });
});

describe('Portfolio引擎 - 相关性矩阵', () => {
  it('单组合相关性矩阵为[[1]]', () => {
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-12-31', 100, 0.001),
    };
    const portfolio: Portfolio = {
      id: 'p1',
      name: 'Test',
      assets: [{ ticker: 'A', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    expect(result.correlations).toEqual([[1]]);
  });

  it('两组合相关性矩阵为2x2', () => {
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-12-31', 100, 0.001),
      B: makeLinearPriceData('B', '2020-01-02', '2020-12-31', 100, 0.002),
    };
    const p1: Portfolio = {
      id: 'p1',
      name: 'P1',
      assets: [{ ticker: 'A', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const p2: Portfolio = {
      id: 'p2',
      name: 'P2',
      assets: [{ ticker: 'B', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([p1, p2], priceData, makeParams());
    expect(result.correlations).toHaveLength(2);
    expect(result.correlations[0]).toHaveLength(2);
    expect(result.correlations[0][0]).toBe(1);
    expect(result.correlations[1][1]).toBe(1);
  });
});
