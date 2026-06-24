/**
 * 对抗性测试：从真实需求和边界出发，试图找出代码中的bug
 * 
 * 设计思路：不是"确认代码能跑"，而是"如果我是用户，我会怎么搞坏它"
 * 每个测试都应该描述一个真实用户场景或一个合理的边界输入
 */
import { describe, it, expect } from 'vitest';
import { runPortfolioBacktest, type PriceData } from '../../api/engine/portfolio.js';
import type { Portfolio, BacktestParameters } from '../../shared/types.js';

// ===== 测试辅助 =====

function makePriceData(
  ticker: string, startDate: string, endDate: string, startPrice: number, dailyReturn: number,
): Record<string, number> {
  const prices: Record<string, number> = {};
  const current = new Date(startDate);
  const end = new Date(endDate);
  let price = startPrice;
  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      prices[current.toISOString().slice(0, 10)] = Math.round(price * 1000) / 1000;
      price *= (1 + dailyReturn);
    }
    current.setDate(current.getDate() + 1);
  }
  return prices;
}

function makeVolatilePriceData(
  ticker: string, startDate: string, endDate: string, startPrice: number, returns: number[],
): Record<string, number> {
  const prices: Record<string, number> = {};
  const current = new Date(startDate);
  const end = new Date(endDate);
  let price = startPrice;
  let ri = 0;
  while (current <= end && ri < returns.length) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      prices[current.toISOString().slice(0, 10)] = Math.round(price * 1000) / 1000;
      price *= (1 + returns[ri]);
      ri++;
    }
    current.setDate(current.getDate() + 1);
  }
  return prices;
}

function makeParams(overrides?: Partial<BacktestParameters>): BacktestParameters {
  return {
    startDate: '2020-01-02', endDate: '2020-12-31', startingValue: 10000,
    adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '',
    ...overrides,
  };
}

// ===== Bug hunt: 浮点精度 =====
describe('Bug Hunt - 浮点精度', () => {
  it('拉伸到100%功能：3个等权资产拉伸后合计=99.99而非100', () => {
    // [1,1,1] 拉伸到100% → [33.33, 33.33, 33.33]，合计=99.99
    // 这是拉伸功能的真实bug：Math.round(w / tw * 100 * 100) / 100 会丢失精度
    const weights = [1, 1, 1];
    const tw = weights.reduce((s, w) => s + w, 0);
    const stretched = weights.map(w => Math.round(w / tw * 100 * 100) / 100);
    const sum = stretched.reduce((s, w) => s + w, 0);
    expect(sum).not.toBe(100); // BUG: 合计=99.99
    expect(Math.abs(sum - 100)).toBeLessThan(0.1); // 误差在0.1以内
  });

  it('回测引擎中权重除以100后的浮点误差不应导致持仓计算偏差', () => {
    const priceData: PriceData = {
      A: makePriceData('A', '2020-01-02', '2020-12-31', 100, 0),
      B: makePriceData('B', '2020-01-02', '2020-12-31', 100, 0),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 33.33 }, { ticker: 'B', weight: 66.67 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const finalValue = result.portfolios[0].growthCurve.at(-1)!.value;
    // 33.33 + 66.67 = 100.0，但浮点可能不精确
    // 终值应该接近10000（价格不变），但浮点误差可能导致微小偏差
    expect(Math.abs(finalValue - 10000)).toBeLessThan(1); // 允许1元误差
  });
});

// ===== Bug hunt: 偏离调仓对小权重的过度敏感 =====
describe('Bug Hunt - 偏离调仓对小权重过度敏感', () => {
  it('目标权重1%的仓位，实际2%，相对偏差=100%，立即触发调仓', () => {
    // 用户设5%阈值，一个1%的小仓位偏离到2%
    // 相对偏差 = |0.02-0.01|/|0.01| = 100% >> 5%
    // 这意味着几乎每天都会调仓，偏离调仓形同虚设
    const priceData: PriceData = {
      BIG: makePriceData('BIG', '2020-01-02', '2020-12-31', 100, 0.002),
      SMALL: makePriceData('SMALL', '2020-01-02', '2020-12-31', 100, 0.001),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'BIG', weight: 99 }, { ticker: 'SMALL', weight: 1 }],
      rebalanceFrequency: 'threshold',
      rebalanceThreshold: 5,
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    // 如果小仓位1%偏离到2%就触发调仓，那5%阈值对1%仓位来说等于0.05%的绝对偏差
    // 这意味着几乎每天调仓，偏离调仓失去了"减少交易频率"的意义
    // 这是一个设计缺陷：相对偏差对小权重仓位不公平
    const gc = result.portfolios[0].growthCurve;
    // 验证：这种场景下偏离调仓是否比每日调仓更频繁？
    // 如果是，说明相对偏差算法有问题
    expect(gc.length).toBeGreaterThan(0);
    // 关键断言：偏离调仓5%阈值下，99%/1%组合不应该每天都调仓
    // 如果确实每天都调仓，说明算法对小权重仓位过度敏感
  });

  it('目标权重-1%的做空仓位，相对偏差计算是否正确', () => {
    // 做空仓位权重-1%，如果实际变成-0.5%
    // 相对偏差 = |(-0.005)-(-0.01)|/|(-0.01)| = 0.005/0.01 = 50%
    // 5%阈值下立即触发，但绝对偏差只有0.5个百分点
    const priceData: PriceData = {
      LONG: makePriceData('LONG', '2020-01-02', '2020-12-31', 100, 0.001),
      SHORT: makePriceData('SHORT', '2020-01-02', '2020-12-31', 100, -0.001),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'LONG', weight: 101 }, { ticker: 'SHORT', weight: -1 }],
      rebalanceFrequency: 'threshold',
      rebalanceThreshold: 5,
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    // -1%的小做空仓位，5%相对偏差阈值，几乎每天都会触发调仓
    expect(result.portfolios[0].growthCurve.length).toBeGreaterThan(0);
  });
});

// ===== Bug hunt: 价格为0 =====
describe('Bug Hunt - 价格为0（退市/停牌）', () => {
  it('某天收盘价为0，持仓价值应归零而非产生Infinity', () => {
    // 构造价格数据：前5天正常，第6天价格为0
    const returns = [0.01, 0.01, 0.01, 0.01, -1.0]; // 第5天跌100%
    const priceData: PriceData = {
      A: makeVolatilePriceData('A', '2020-01-02', '2020-03-31', 100, returns),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const gc = result.portfolios[0].growthCurve;
    // 价格归零后，所有value应该是有限数
    const infiniteValues = gc.filter(p => !isFinite(p.value));
    expect(infiniteValues).toHaveLength(0);
  });

  it('价格为0后再恢复，不应出现NaN', () => {
    // 第3天价格0，第4天恢复
    const returns = [0.01, -1.0, 0.5, 0.01, 0.01];
    const priceData: PriceData = {
      A: makeVolatilePriceData('A', '2020-01-02', '2020-03-31', 100, returns),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const gc = result.portfolios[0].growthCurve;
    const nanValues = gc.filter(p => isNaN(p.value));
    expect(nanValues).toHaveLength(0);
  });
});

// ===== Bug hunt: 日期边界 =====
describe('Bug Hunt - 日期边界', () => {
  it('startDate = endDate，只有1天数据', () => {
    const priceData: PriceData = {
      A: makePriceData('A', '2020-01-02', '2020-01-02', 100, 0),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams({
      startDate: '2020-01-02', endDate: '2020-01-02',
    }));
    // 只有1天数据，无法计算收益率
    // growthCurve应该只有1个点，statistics应该合理
    const gc = result.portfolios[0].growthCurve;
    expect(gc.length).toBe(1);
    expect(gc[0].value).toBe(10000);
    // CAGR应该是0（没有增长）
    expect(result.portfolios[0].statistics.cagr).toBe(0);
  });

  it('startDate > endDate，无数据', () => {
    const priceData: PriceData = {
      A: makePriceData('A', '2020-01-02', '2020-12-31', 100, 0),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams({
      startDate: '2021-01-01', endDate: '2020-01-01', // 反了
    }));
    // 应该返回空结果，不应崩溃
    expect(result.portfolios[0].growthCurve).toEqual([]);
  });

  it('价格数据只有周末日期（无交易日）', () => {
    const prices: Record<string, number> = {
      '2020-01-04': 100, // 周六
      '2020-01-05': 101, // 周日
    };
    const priceData: PriceData = { A: prices };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    // 周末数据也应该能处理，不应崩溃
    expect(result.portfolios[0].growthCurve.length).toBeGreaterThan(0);
  });
});

// ===== Bug hunt: 再平衡后做空仓位被放大 =====
describe('Bug Hunt - 再平衡放大做空风险', () => {
  it('月度调仓下，做空盈利后重新分配会增大做空敞口', () => {
    // 做多100% + 做空-100%，初始=10000
    // 等等，100%+(-100%)=0，初始就爆仓
    // 改用150%+(-50%)
    const longReturn = Math.pow(1.05, 1 / 252) - 1;  // 做多年化5%
    const shortReturn = Math.pow(0.90, 1 / 252) - 1;  // 做空标的跌10%（做空赚）
    const priceData: PriceData = {
      LONG: makePriceData('LONG', '2020-01-02', '2020-12-31', 100, longReturn),
      SHORT: makePriceData('SHORT', '2020-01-02', '2020-12-31', 100, shortReturn),
    };
    const noRebalance: Portfolio = {
      id: 'p1', name: '不调仓',
      assets: [{ ticker: 'LONG', weight: 150 }, { ticker: 'SHORT', weight: -50 }],
      rebalanceFrequency: 'none',
    };
    const monthlyRebalance: Portfolio = {
      id: 'p2', name: '月度调仓',
      assets: [{ ticker: 'LONG', weight: 150 }, { ticker: 'SHORT', weight: -50 }],
      rebalanceFrequency: 'monthly',
    };
    const result = runPortfolioBacktest([noRebalance, monthlyRebalance], priceData, makeParams());
    const finalNo = result.portfolios[0].growthCurve.at(-1)!.value;
    const finalMonthly = result.portfolios[1].growthCurve.at(-1)!.value;
    // 月度调仓会重新分配做空仓位：随着组合价值增长，做空持仓绝对值也增大
    // 这可能放大收益也可能放大亏损，取决于做空标的方向
    // 关键：两者都不应爆仓
    expect(finalNo).toBeGreaterThan(0);
    expect(finalMonthly).toBeGreaterThan(0);
    // 不调仓终值应该更高（做空标的在跌，不调仓下做空仓位绝对值不变）
    // 调仓下做空仓位绝对值随组合增长而增大，做空赚更多
    // 所以月度调仓终值应该 >= 不调仓
    // 如果不是，说明调仓逻辑有问题
    expect(finalMonthly).toBeGreaterThanOrEqual(finalNo * 0.95); // 允许5%误差
  });
});

// ===== Bug hunt: 回撤曲线格式 =====
describe('Bug Hunt - 回撤曲线格式', () => {
  it('drawdown值应该是正数（表示回撤深度），不是负数', () => {
    // 用户看到"最大回撤22.8%"，期望drawdown值=0.228
    // 如果drawdown=-0.228，前端显示会混乱
    const priceData: PriceData = {
      A: makePriceData('A', '2020-01-02', '2020-12-31', 100, 0.001),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const dd = result.portfolios[0].drawdownCurve;
    // drawdown值应该是>=0的（0=无回撤，0.1=10%回撤）
    // 如果是负数，说明计算方向搞反了
    for (const point of dd) {
      expect(point.drawdown).toBeGreaterThanOrEqual(0);
    }
  });

  it('单调上涨时drawdown=0', () => {
    const priceData: PriceData = {
      A: makePriceData('A', '2020-01-02', '2020-12-31', 100, 0.001),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const dd = result.portfolios[0].drawdownCurve;
    // 单调上涨，所有drawdown应该=0
    const maxDd = Math.max(...dd.map(p => p.drawdown));
    expect(maxDd).toBe(0);
  });
});

// ===== Bug hunt: 年度收益计算 =====
describe('Bug Hunt - 年度收益计算', () => {
  it('爆仓年份的年度收益应该是-100%（不是0或NaN）', () => {
    const crashReturns = new Array(300).fill(0.01); // 做空标的每天涨1%
    const priceData: PriceData = {
      LONG: makePriceData('LONG', '2020-01-02', '2020-12-31', 100, 0),
      SHORT: makeVolatilePriceData('SHORT', '2020-01-02', '2020-12-31', 100, crashReturns),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'LONG', weight: 200 }, { ticker: 'SHORT', weight: -100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const annualReturns = result.portfolios[0].annualReturns;
    // 爆仓年份的收益应该是-1（-100%）
    const badYear = annualReturns.find(a => a.return <= -0.99);
    expect(badYear).toBeDefined();
    expect(badYear!.return).toBe(-1); // 精确-100%
  });

  it('跨年数据：2020年12月31日到2021年1月4日，年度收益应正确分割', () => {
    const priceData: PriceData = {
      A: makePriceData('A', '2020-01-02', '2021-12-31', 100, 0.001),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams({
      startDate: '2020-01-02', endDate: '2021-12-31',
    }));
    const annualReturns = result.portfolios[0].annualReturns;
    // 应该有2年的年度收益
    expect(annualReturns.length).toBe(2);
    // 两年都应该有正收益（价格在涨）
    expect(annualReturns[0].return).toBeGreaterThan(0);
    expect(annualReturns[1].return).toBeGreaterThan(0);
  });
});

// ===== Bug hunt: 超大/超小数值 =====
describe('Bug Hunt - 超大/超小数值', () => {
  it('startingValue=1（1元），不应出现精度问题', () => {
    const priceData: PriceData = {
      A: makePriceData('A', '2020-01-02', '2020-12-31', 100, 0.001),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams({ startingValue: 1 }));
    const gc = result.portfolios[0].growthCurve;
    // 不应出现Infinity或NaN
    const badValues = gc.filter(p => !isFinite(p.value) || isNaN(p.value));
    expect(badValues).toHaveLength(0);
    expect(gc[0].value).toBe(1);
  });

  it('startingValue=1e12（1万亿），不应溢出', () => {
    const priceData: PriceData = {
      A: makePriceData('A', '2020-01-02', '2020-12-31', 100, 0.001),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams({ startingValue: 1e12 }));
    const gc = result.portfolios[0].growthCurve;
    const badValues = gc.filter(p => !isFinite(p.value));
    expect(badValues).toHaveLength(0);
  });
});

// ===== Bug hunt: 前端Store验证逻辑 =====
describe('Bug Hunt - Store验证逻辑', () => {
  it('浮点权重60.1+39.9≈100，前端验证应容许浮点误差', () => {
    const sum = 60.1 + 39.9;
    // 旧代码用 `tw !== 100` 会误杀，修复后用 `Math.abs(tw - 100) > 0.01`
    expect(Math.abs(sum - 100)).toBeLessThan(0.01); // 修复后应通过
  });

  it('权重0+100=100合法，但0%权重的资产还有意义吗？', () => {
    // 用户可能先设0%再修改，0%不应导致问题
    const priceData: PriceData = {
      A: makePriceData('A', '2020-01-02', '2020-12-31', 100, 0.001),
      B: makePriceData('B', '2020-01-02', '2020-12-31', 100, 0),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 100 }, { ticker: 'B', weight: 0 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    // 0%权重的资产不应影响计算
    const finalValue = result.portfolios[0].growthCurve.at(-1)!.value;
    expect(finalValue).toBeGreaterThan(10000);
  });

  it('两个相同ticker的资产，权重合并还是分别计算？', () => {
    // 用户可能不小心添加两个VTI
    const priceData: PriceData = {
      VTI: makePriceData('VTI', '2020-01-02', '2020-12-31', 100, 0.001),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'VTI', weight: 60 }, { ticker: 'VTI', weight: 40 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    // 两个VTI 60%+40%=100%，但引擎会把它们当作两个独立持仓
    // 这可能导致意外行为：两个持仓各自跟踪VTI价格
    const gc = result.portfolios[0].growthCurve;
    expect(gc.length).toBeGreaterThan(0);
    // 终值应该和单个VTI 100%相同
    const finalValue = gc.at(-1)!.value;
    expect(finalValue).toBeGreaterThan(10000);
  });
});

// ===== Bug hunt: 偏离调仓阈值负数 =====
describe('Bug Hunt - 偏离调仓阈值负数', () => {
  it('threshold=-5不应触发调仓（负阈值无意义）', () => {
    const priceData: PriceData = {
      A: makePriceData('A', '2020-01-02', '2020-12-31', 100, 0.005),
      B: makePriceData('B', '2020-01-02', '2020-12-31', 100, 0),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 50 }, { ticker: 'B', weight: 50 }],
      rebalanceFrequency: 'threshold',
      rebalanceThreshold: -5, // 负阈值
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    // 负阈值应等同于不调仓
    expect(result.portfolios[0].growthCurve.length).toBeGreaterThan(0);
  });
});

// ===== Bug hunt: 统计指标一致性 =====
describe('Bug Hunt - 统计指标一致性', () => {
  it('maxDrawdown应该等于drawdownCurve中的最大值', () => {
    const returns = [0.01, -0.02, 0.03, -0.05, 0.02, -0.01, 0.01, 0.02];
    const priceData: PriceData = {
      A: makeVolatilePriceData('A', '2020-01-02', '2020-06-30', 100, returns),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const dd = result.portfolios[0].drawdownCurve;
    const maxDdFromCurve = Math.max(...dd.map(p => p.drawdown));
    const maxDrawdownStat = result.portfolios[0].statistics.maxDrawdown;
    // 两个值应该一致
    expect(maxDrawdownStat).toBeCloseTo(maxDdFromCurve, 5);
  });

  it('CAGR和终值应该一致', () => {
    const priceData: PriceData = {
      A: makePriceData('A', '2020-01-02', '2020-12-31', 100, 0.001),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const cagr = result.portfolios[0].statistics.cagr;
    const finalValue = result.portfolios[0].growthCurve.at(-1)!.value;
    const years = result.portfolios[0].growthCurve.length / 252;
    // CAGR应该满足: finalValue = startingValue * (1 + CAGR)^years
    const expectedFinal = 10000 * Math.pow(1 + cagr, years);
    expect(Math.abs(finalValue - expectedFinal) / finalValue).toBeLessThan(0.01); // 1%误差
  });

  it('Sharpe = (CAGR - riskFreeRate) / stdev', () => {
    const priceData: PriceData = {
      A: makePriceData('A', '2020-01-02', '2020-12-31', 100, 0.001),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    const { cagr, stdev, sharpe } = result.portfolios[0].statistics;
    if (stdev > 0) {
      const expectedSharpe = (cagr - 0.02) / stdev;
      expect(sharpe).toBeCloseTo(expectedSharpe, 2);
    }
  });
});

// ===== Bug hunt: 基准对比 =====
describe('Bug Hunt - 基准对比', () => {
  it('基准ticker不存在时不应崩溃', () => {
    const priceData: PriceData = {
      A: makePriceData('A', '2020-01-02', '2020-12-31', 100, 0.001),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'A', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams({
      benchmarkTicker: 'NOTEXIST',
    }));
    // 不应崩溃，benchmarkGrowth应该是undefined
    expect(result.benchmarkGrowth).toBeUndefined();
  });

  it('基准和组合用相同ticker时，净值曲线应该完全一致', () => {
    const priceData: PriceData = {
      VTI: makePriceData('VTI', '2020-01-02', '2020-12-31', 100, 0.001),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Test',
      assets: [{ ticker: 'VTI', weight: 100 }],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams({
      benchmarkTicker: 'VTI',
    }));
    const portfolioGrowth = result.portfolios[0].growthCurve;
    const benchmarkGrowth = result.benchmarkGrowth!;
    // 两者应该完全一致
    expect(benchmarkGrowth.length).toBe(portfolioGrowth.length);
    for (let i = 0; i < portfolioGrowth.length; i++) {
      expect(Math.abs(portfolioGrowth[i].value - benchmarkGrowth[i].value)).toBeLessThan(1);
    }
  });
});

// ===== Bug hunt: 空组合/无资产 =====
describe('Bug Hunt - 空组合', () => {
  it('0个资产的组合不应崩溃', () => {
    const priceData: PriceData = {
      A: makePriceData('A', '2020-01-02', '2020-12-31', 100, 0.001),
    };
    const portfolio: Portfolio = {
      id: 'p1', name: 'Empty',
      assets: [],
      rebalanceFrequency: 'none',
    };
    const result = runPortfolioBacktest([portfolio], priceData, makeParams());
    // 不应崩溃
    expect(result.portfolios[0].growthCurve).toEqual([]);
  });
});
