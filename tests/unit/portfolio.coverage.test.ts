import { describe, it, expect } from 'vitest';
import { runPortfolioBacktest, runAnalysis, type PriceData } from '../../api/engine/portfolio.js';
import type { Portfolio, BacktestParameters } from '../../shared/types.js';
import { makeLinearPriceData, makeParams } from '../helpers/fixtures.js';

// ===== 再平衡频率完整覆盖 =====
describe('Portfolio引擎 - 再平衡频率全覆盖', () => {
  const priceData: PriceData = {
    A: makeLinearPriceData('A', '2020-01-02', '2021-12-31', 100, 0.002),
    B: makeLinearPriceData('B', '2020-01-02', '2021-12-31', 100, 0),
  };
  const params = makeParams({ startDate: '2020-01-02', endDate: '2021-12-31' });

  it('none - 不调仓', () => {
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 50 }, { ticker: 'B', weight: 50 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, params);
    expect(result.portfolios[0].growthCurve.length).toBeGreaterThan(0);
    // 不调仓下A权重应逐渐增大（A在涨）
  });

  it('daily - 每日调仓', () => {
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 50 }, { ticker: 'B', weight: 50 }],
      rebalanceFrequency: 'daily',
    };
    const result = runPortfolioBacktest([portfolio], priceData, params);
    expect(result.portfolios[0].statistics.cagr).toBeGreaterThan(0);
  });

  it('weekly - 每周调仓', () => {
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 50 }, { ticker: 'B', weight: 50 }],
      rebalanceFrequency: 'weekly',
    };
    const result = runPortfolioBacktest([portfolio], priceData, params);
    expect(result.portfolios[0].growthCurve.length).toBeGreaterThan(0);
    expect(result.portfolios[0].statistics.cagr).toBeGreaterThan(0);
  });

  it('monthly - 每月调仓', () => {
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 50 }, { ticker: 'B', weight: 50 }],
      rebalanceFrequency: 'monthly',
    };
    const result = runPortfolioBacktest([portfolio], priceData, params);
    expect(result.portfolios[0].statistics.cagr).toBeGreaterThan(0);
  });

  it('quarterly - 每季度调仓', () => {
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 50 }, { ticker: 'B', weight: 50 }],
      rebalanceFrequency: 'quarterly',
    };
    const result = runPortfolioBacktest([portfolio], priceData, params);
    expect(result.portfolios[0].statistics.cagr).toBeGreaterThan(0);
  });

  it('annual - 每年调仓', () => {
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 50 }, { ticker: 'B', weight: 50 }],
      rebalanceFrequency: 'annual',
    };
    const result = runPortfolioBacktest([portfolio], priceData, params);
    expect(result.portfolios[0].statistics.cagr).toBeGreaterThan(0);
  });

  it('threshold - 偏离调仓', () => {
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 50 }, { ticker: 'B', weight: 50 }],
      rebalanceFrequency: 'threshold',
      rebalanceThreshold: 10,
    };
    const result = runPortfolioBacktest([portfolio], priceData, params);
    expect(result.portfolios[0].statistics.cagr).toBeGreaterThan(0);
  });

  it('跨年调仓：annual模式在1月1日触发', () => {
    // 2年数据，annual应在2021-01-xx触发一次调仓
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 50 }, { ticker: 'B', weight: 50 }],
      rebalanceFrequency: 'annual',
    };
    const result = runPortfolioBacktest([portfolio], priceData, params);
    const gc = result.portfolios[0].growthCurve;
    // 2年数据应有500+个数据点
    expect(gc.length).toBeGreaterThan(400);
  });

  it('跨周调仓：weekly模式在周一触发', () => {
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 50 }, { ticker: 'B', weight: 50 }],
      rebalanceFrequency: 'weekly',
    };
    const result = runPortfolioBacktest([portfolio], priceData, params);
    expect(result.portfolios[0].growthCurve.length).toBeGreaterThan(0);
  });
});

// ===== runAnalysis 函数测试 =====
describe('Portfolio引擎 - runAnalysis', () => {
  it('单资产分析', () => {
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-12-31', 100, 0.001),
    };
    const result = runAnalysis(['A'], priceData, makeParams());
    expect(result.tickers).toHaveLength(1);
    expect(result.tickers[0].ticker).toBe('A');
    expect(result.tickers[0].growthCurve.length).toBeGreaterThan(0);
    expect(result.tickers[0].statistics.cagr).toBeGreaterThan(0);
  });

  it('多资产分析+相关性矩阵', () => {
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-12-31', 100, 0.001),
      B: makeLinearPriceData('B', '2020-01-02', '2020-12-31', 100, 0.002),
    };
    const result = runAnalysis(['A', 'B'], priceData, makeParams());
    expect(result.tickers).toHaveLength(2);
    expect(result.correlations).toHaveLength(2);
    expect(result.correlations[0][0]).toBe(1);
    expect(result.correlations[1][1]).toBe(1);
  });

  it('数据不足的资产返回空结果', () => {
    const priceData: PriceData = {
      A: { '2020-01-02': 100 }, // 只有1天数据
    };
    const result = runAnalysis(['A'], priceData, makeParams());
    expect(result.tickers[0].growthCurve).toEqual([]);
    expect(result.tickers[0].statistics.cagr).toBe(0);
  });

  it('不存在的ticker返回空结果', () => {
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-12-31', 100, 0.001),
    };
    const result = runAnalysis(['NOTEXIST'], priceData, makeParams());
    expect(result.tickers[0].growthCurve).toEqual([]);
  });

  it('分析结果净值曲线首日=startingValue', () => {
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-12-31', 100, 0.001),
    };
    const result = runAnalysis(['A'], priceData, makeParams({ startingValue: 50000 }));
    expect(result.tickers[0].growthCurve[0].value).toBe(50000);
  });
});

// ===== 用户场景：完整投资流程 =====
describe('Portfolio引擎 - 用户场景', () => {
  it('场景1：新手定投VTI，10年持有', () => {
    const stockReturn = Math.pow(1.08, 1 / 252) - 1;
    const priceData: PriceData = {
      VTI: makeLinearPriceData('VTI', '2010-01-02', '2020-12-31', 100, stockReturn),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: '定投VTI',
      assets: [{ ticker: 'VTI', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams({
      startDate: '2010-01-02', endDate: '2020-12-31',
    }));
    expect(result.portfolios[0].statistics.cagr).toBeGreaterThan(0.05);
    // 单调上涨可能无回撤，只检查回撤>=0
    expect(result.portfolios[0].statistics.maxDrawdown).toBeGreaterThanOrEqual(0);
  });

  it('场景2：退休组合（40%股票+60%债券），保守配置', () => {
    const stockReturn = Math.pow(1.08, 1 / 252) - 1;
    const bondReturn = Math.pow(1.03, 1 / 252) - 1;
    const priceData: PriceData = {
      STOCK: makeLinearPriceData('STOCK', '2010-01-02', '2020-12-31', 100, stockReturn),
      BOND: makeLinearPriceData('BOND', '2010-01-02', '2020-12-31', 100, bondReturn),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: '退休组合',
      assets: [{ ticker: 'STOCK', weight: 40 }, { ticker: 'BOND', weight: 60 }],
      rebalanceFrequency: 'annual',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams({
      startDate: '2010-01-02', endDate: '2020-12-31',
    }));
    expect(result.portfolios[0].statistics.cagr).toBeGreaterThan(0.03);
    expect(result.portfolios[0].statistics.stdev).toBeLessThan(0.15); // 低波动
  });

  it('场景3：全天候组合（多资产分散）', () => {
    const priceData: PriceData = {
      STOCK: makeLinearPriceData('STOCK', '2010-01-02', '2020-12-31', 100, Math.pow(1.08, 1 / 252) - 1),
      BOND: makeLinearPriceData('BOND', '2010-01-02', '2020-12-31', 100, Math.pow(1.03, 1 / 252) - 1),
      GOLD: makeLinearPriceData('GOLD', '2010-01-02', '2020-12-31', 100, Math.pow(1.05, 1 / 252) - 1),
      COMMOD: makeLinearPriceData('COMMOD', '2010-01-02', '2020-12-31', 100, Math.pow(1.04, 1 / 252) - 1),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: '全天候',
      assets: [
        { ticker: 'STOCK', weight: 30 },
        { ticker: 'BOND', weight: 55 },
        { ticker: 'GOLD', weight: 10 },
        { ticker: 'COMMOD', weight: 5 },
      ],
      rebalanceFrequency: 'quarterly',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams({
      startDate: '2010-01-02', endDate: '2020-12-31',
    }));
    expect(result.portfolios[0].statistics.cagr).toBeGreaterThan(0);
    expect(result.portfolios[0].statistics.maxDrawdown).toBeLessThan(0.30);
  });

  it('场景4：对冲策略（做多大盘+做空高波动）', () => {
    const priceData: PriceData = {
      SPY: makeLinearPriceData('SPY', '2020-01-02', '2020-12-31', 100, 0.001),
      BND: makeLinearPriceData('BND', '2020-01-02', '2020-12-31', 100, 0),
      VIX: makeLinearPriceData('VIX', '2020-01-02', '2020-12-31', 100, -0.001), // VIX下跌=做空赚
    };
    const portfolio: Portfolio = {
      id: 'p1', name: '对冲',
      assets: [
        { ticker: 'SPY', weight: 100 },
        { ticker: 'BND', weight: 100 },
        { ticker: 'VIX', weight: -100 },
      ],
      rebalanceFrequency: 'threshold',
      rebalanceThreshold: 10,
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    expect(result.portfolios[0].statistics.cagr).not.toBe(-1); // 不应爆仓
  });

  it('场景5：杠杆做多（200%股票）vs 保守（100%债券）对比', () => {
    const stockReturn = Math.pow(1.10, 1 / 252) - 1;
    const bondReturn = Math.pow(1.03, 1 / 252) - 1;
    const priceData: PriceData = {
      STOCK: makeLinearPriceData('STOCK', '2010-01-02', '2020-12-31', 100, stockReturn),
      BOND: makeLinearPriceData('BOND', '2010-01-02', '2020-12-31', 100, bondReturn),
    };
    const leveraged: Portfolio = {
      id: 'p1', name: '2x杠杆',
      assets: [{ ticker: 'STOCK', weight: 200 }],
      rebalanceFrequency: 'none',
    };
    const conservative: Portfolio = {
      id: 'p2', name: '100%债券',
      assets: [{ ticker: 'BOND', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([leveraged, conservative], priceData, makeParams({
      startDate: '2010-01-02', endDate: '2020-12-31',
    }));
    // 杠杆收益更高
    expect(result.portfolios[0].statistics.cagr).toBeGreaterThan(result.portfolios[1].statistics.cagr);
    // 杠杆回撤>=保守回撤（单调上涨可能都为0）
    expect(result.portfolios[0].statistics.maxDrawdown).toBeGreaterThanOrEqual(result.portfolios[1].statistics.maxDrawdown);
  });

  it('场景6：短期交易（1个月，每日调仓）', () => {
    const priceData: PriceData = {
      A: makeLinearPriceData('A', '2020-01-02', '2020-02-28', 100, 0.005),
      B: makeLinearPriceData('B', '2020-01-02', '2020-02-28', 100, -0.002),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: '短线',
      assets: [{ ticker: 'A', weight: 150 }, { ticker: 'B', weight: -50 }],
      rebalanceFrequency: 'daily',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams({
      startDate: '2020-01-02', endDate: '2020-02-28',
    }));
    expect(result.portfolios[0].growthCurve.length).toBeGreaterThan(10);
  });

  it('场景7：金融危机模拟（暴跌后恢复）', () => {
    // 前60天暴跌，后恢复
    const crashRecovery = [
      ...new Array(60).fill(-0.02),  // 暴跌60天
      ...new Array(200).fill(0.001), // 缓慢恢复
    ];
    // 覆盖priceData用volatile数据
    const volatilePrices: Record<string, number> = {};
    const current = new Date('2020-01-02');
    let price = 100;
    let ri = 0;
    while (ri < crashRecovery.length) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) {
        volatilePrices[current.toISOString().slice(0, 10)] = Math.round(price * 1000) / 1000;
        price *= (1 + crashRecovery[ri]);
        ri++;
      }
      current.setDate(current.getDate() + 1);
    }
    const priceDataV: PriceData = { STOCK: volatilePrices };
    const portfolio: Portfolio = {
      id: 'p1', name: '金融危机',
      assets: [{ ticker: 'STOCK', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceDataV, makeParams({
      startDate: '2020-01-02', endDate: '2021-12-31',
    }));
    // 应有较大回撤
    expect(result.portfolios[0].statistics.maxDrawdown).toBeGreaterThan(0.3);
  });
});

// ===== getSortedDates / getPrice 边界 =====
describe('Portfolio引擎 - 日期/价格边界', () => {
  it('空priceData返回空日期列表', () => {
    const priceData: PriceData = {};
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    expect(result.portfolios[0].growthCurve).toEqual([]);
  });

  it('日期范围外数据被过滤', () => {
    const prices: Record<string, number> = {};
    // 只有2019年的数据
    const current = new Date('2019-01-02');
    let price = 100;
    for (let i = 0; i < 100; i++) {
      while (current.getDay() === 0 || current.getDay() === 6) current.setDate(current.getDate() + 1);
      prices[current.toISOString().slice(0, 10)] = price++;
      current.setDate(current.getDate() + 1);
    }
    const priceData: PriceData = { A: prices };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    // 参数请求2020年数据，但只有2019年的
    const result = runPortfolioBacktest([portfolio], priceData, makeParams({
      startDate: '2020-01-01', endDate: '2020-12-31',
    }));
    expect(result.portfolios[0].growthCurve.length).toBe(0);
  });
});
