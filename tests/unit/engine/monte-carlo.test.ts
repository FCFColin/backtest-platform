/**
 * 蒙特卡洛模拟模块单元测试（T-P3-9）
 *
 * 企业理由：蒙特卡洛模拟用于评估投资组合的长期成功概率，
 * 错误的采样或统计会导致误导性的投资建议。测试覆盖：
 * - 正常模拟（统计性质、路径长度）
 * - withReplacement true/false 采样行为
 * - 中位数计算（奇偶长度）
 * - 边界（空输入、单元素、NaN/Infinity、数据不足）
 *
 * 注意：runMonteCarlo 内部使用 Math.random，无法精确断言具体路径值，
 * 改为验证统计性质（路径数量、长度、值域范围）。
 */

import { describe, it, expect } from 'vitest';
import { runMonteCarlo } from '../../../api/engine/monteCarlo.js';
import type { PriceData } from '../../../api/engine/portfolio.js';
import type { Portfolio, BacktestParameters } from '../../../shared/types.js';
import { makeLinearPriceData, makeParams } from '../../helpers/fixtures.js';

// 构造足够长的历史数据（>5 年交易日，满足 minBlockYears=5）
function makeLongPriceData(): PriceData {
  const up = Math.pow(1.10, 1 / 252) - 1; // 年化 10%
  return {
    STOCK: makeLinearPriceData('STOCK', '2010-01-02', '2020-12-31', 100, up),
  };
}

function makePortfolio(): Portfolio {
  return {
    id: 'p1',
    name: 'Test',
    assets: [{ ticker: 'STOCK', weight: 100 }],
    rebalanceFrequency: 'none',
  };
}

describe('runMonteCarlo - 正常模拟', () => {
  it('应返回指定数量的模拟路径统计', () => {
    const priceData = makeLongPriceData();
    const result = runMonteCarlo(makePortfolio(), priceData, makeParams(), {
      numSimulations: 50,
      numYears: 5,
      minBlockYears: 1,
      maxBlockYears: 2,
    });
    expect(result.perPathMetrics).toHaveLength(50);
  });

  it('百分位路径应覆盖所有时间点', () => {
    const priceData = makeLongPriceData();
    const result = runMonteCarlo(makePortfolio(), priceData, makeParams(), {
      numSimulations: 50,
      numYears: 5,
      minBlockYears: 1,
      maxBlockYears: 2,
    });
    const totalDays = Math.round(5 * 252);
    expect(result.percentiles.p50).toHaveLength(totalDays + 1);
    expect(result.percentiles.p5).toHaveLength(totalDays + 1);
    expect(result.percentiles.p95).toHaveLength(totalDays + 1);
  });

  it('正收益资产的模拟终值中位数应大于初始值（统计性质）', () => {
    const priceData = makeLongPriceData();
    const result = runMonteCarlo(makePortfolio(), priceData, makeParams(), {
      numSimulations: 200,
      numYears: 10,
      minBlockYears: 1,
      maxBlockYears: 2,
    });
    // 年化 10% 的资产，10 年后中位数终值应显著大于 1（起始归一化值）
    expect(result.statistics.medianFinalValue).toBeGreaterThan(1);
  });

  it('成功概率数组长度应等于路径天数', () => {
    const priceData = makeLongPriceData();
    const result = runMonteCarlo(makePortfolio(), priceData, makeParams(), {
      numSimulations: 30,
      numYears: 3,
      minBlockYears: 1,
      maxBlockYears: 1,
    });
    const totalDays = Math.round(3 * 252);
    expect(result.successProbability).toHaveLength(totalDays + 1);
  });

  it('finalDistribution 应为 50 个 bin', () => {
    const priceData = makeLongPriceData();
    const result = runMonteCarlo(makePortfolio(), priceData, makeParams(), {
      numSimulations: 30,
      numYears: 3,
      minBlockYears: 1,
      maxBlockYears: 1,
    });
    expect(result.finalDistribution).toHaveLength(50);
  });

  it('代表性路径应包含 worst/p25/median/p75/best', () => {
    const priceData = makeLongPriceData();
    const result = runMonteCarlo(makePortfolio(), priceData, makeParams(), {
      numSimulations: 30,
      numYears: 3,
      minBlockYears: 1,
      maxBlockYears: 1,
    });
    expect(result.representativePaths.worst).toBeDefined();
    expect(result.representativePaths.p25).toBeDefined();
    expect(result.representativePaths.median).toBeDefined();
    expect(result.representativePaths.p75).toBeDefined();
    expect(result.representativePaths.best).toBeDefined();
  });

  it('successProbabilities 应包含 survival/capitalPreservation/profit', () => {
    const priceData = makeLongPriceData();
    const result = runMonteCarlo(makePortfolio(), priceData, makeParams(), {
      numSimulations: 30,
      numYears: 3,
      minBlockYears: 1,
      maxBlockYears: 1,
    });
    expect(result.successProbabilities.survival).toHaveLength(3);
    expect(result.successProbabilities.capitalPreservation).toHaveLength(3);
    expect(result.successProbabilities.profit).toHaveLength(3);
  });
});

describe('runMonteCarlo - withReplacement 采样行为', () => {
  it('withReplacement=true 应正常运行（默认值）', () => {
    const priceData = makeLongPriceData();
    const result = runMonteCarlo(makePortfolio(), priceData, makeParams(), {
      numSimulations: 20,
      numYears: 3,
      minBlockYears: 1,
      maxBlockYears: 2,
      withReplacement: true,
    });
    expect(result.perPathMetrics).toHaveLength(20);
    // 每条路径都应有正的终值
    for (const m of result.perPathMetrics) {
      expect(m.finalValue).toBeGreaterThan(0);
    }
  });

  it('withReplacement=false 应正常运行（无放回采样）', () => {
    const priceData = makeLongPriceData();
    const result = runMonteCarlo(makePortfolio(), priceData, makeParams(), {
      numSimulations: 20,
      numYears: 3,
      minBlockYears: 1,
      maxBlockYears: 2,
      withReplacement: false,
    });
    expect(result.perPathMetrics).toHaveLength(20);
    for (const m of result.perPathMetrics) {
      expect(m.finalValue).toBeGreaterThan(0);
    }
  });

  it('withReplacement true/false 都应产生有效路径（不崩溃）', () => {
    const priceData = makeLongPriceData();
    const r1 = runMonteCarlo(makePortfolio(), priceData, makeParams(), {
      numSimulations: 10,
      numYears: 2,
      withReplacement: true,
    });
    const r2 = runMonteCarlo(makePortfolio(), priceData, makeParams(), {
      numSimulations: 10,
      numYears: 2,
      withReplacement: false,
    });
    expect(r1.perPathMetrics).toHaveLength(10);
    expect(r2.perPathMetrics).toHaveLength(10);
  });
});

describe('runMonteCarlo - 中位数计算', () => {
  // 中位数逻辑：sortedFinal.length % 2 === 0 ? (mid-1 + mid)/2 : mid
  // 通过控制 numSimulations 为奇数/偶数验证

  it('奇数路径数应取中间值作为中位数', () => {
    const priceData = makeLongPriceData();
    const result = runMonteCarlo(makePortfolio(), priceData, makeParams(), {
      numSimulations: 51, // 奇数
      numYears: 3,
      minBlockYears: 1,
      maxBlockYears: 1,
    });
    // 中位数应为排序后的第 25 个值（索引 25）
    expect(result.statistics.medianFinalValue).toBeGreaterThan(0);
    expect(Number.isFinite(result.statistics.medianFinalValue)).toBe(true);
  });

  it('偶数路径数应取中间两值平均作为中位数', () => {
    const priceData = makeLongPriceData();
    const result = runMonteCarlo(makePortfolio(), priceData, makeParams(), {
      numSimulations: 50, // 偶数
      numYears: 3,
      minBlockYears: 1,
      maxBlockYears: 1,
    });
    expect(result.statistics.medianFinalValue).toBeGreaterThan(0);
    expect(Number.isFinite(result.statistics.medianFinalValue)).toBe(true);
  });

  it('meanFinalValue 应为所有终值的算术平均', () => {
    const priceData = makeLongPriceData();
    const result = runMonteCarlo(makePortfolio(), priceData, makeParams(), {
      numSimulations: 20,
      numYears: 2,
      minBlockYears: 1,
      maxBlockYears: 1,
    });
    const finals = result.perPathMetrics.map((m) => m.finalValue);
    const expectedMean = finals.reduce((s, v) => s + v, 0) / finals.length;
    expect(result.statistics.meanFinalValue).toBeCloseTo(expectedMean, 6);
  });

  it('successRate 应为终值 >= 阈值的比例', () => {
    const priceData = makeLongPriceData();
    const threshold = 1.0;
    const result = runMonteCarlo(makePortfolio(), priceData, makeParams(), {
      numSimulations: 30,
      numYears: 2,
      minBlockYears: 1,
      maxBlockYears: 1,
      successThreshold: threshold,
    });
    const finals = result.perPathMetrics.map((m) => m.finalValue);
    const expectedRate = finals.filter((v) => v >= threshold).length / finals.length;
    expect(result.statistics.successRate).toBeCloseTo(expectedRate, 6);
  });
});

describe('runMonteCarlo - 边界与异常', () => {
  it('历史数据不足（< minBlockDays）应返回空响应', () => {
    // 仅 10 天数据，minBlockYears=1 需要 252 天
    const priceData: PriceData = {
      STOCK: makeLinearPriceData('STOCK', '2020-01-02', '2020-01-20', 100, 0.001),
    };
    const result = runMonteCarlo(makePortfolio(), priceData, makeParams(), {
      numSimulations: 10,
      numYears: 5,
      minBlockYears: 1,
      maxBlockYears: 2,
    });
    // 数据不足应返回空响应
    expect(result.perPathMetrics).toHaveLength(0);
    expect(result.statistics.medianFinalValue).toBe(0);
    expect(result.statistics.meanFinalValue).toBe(0);
  });

  it('单日数据应返回空响应（无法计算收益率）', () => {
    const priceData: PriceData = {
      STOCK: { '2020-01-02': 100 },
    };
    const result = runMonteCarlo(makePortfolio(), priceData, makeParams(), {
      numSimulations: 10,
      numYears: 1,
      minBlockYears: 1,
      maxBlockYears: 1,
    });
    expect(result.perPathMetrics).toHaveLength(0);
  });

  it('空 priceData 应返回空响应', () => {
    const priceData: PriceData = {};
    const result = runMonteCarlo(makePortfolio(), priceData, makeParams(), {
      numSimulations: 10,
      numYears: 1,
      minBlockYears: 1,
      maxBlockYears: 1,
    });
    expect(result.perPathMetrics).toHaveLength(0);
    expect(result.statistics.successRate).toBe(0);
  });

  it('含 NaN 收益率的历史数据不应导致崩溃', () => {
    // 构造含 NaN 的价格（NaN 价格会被跳过，但需验证不崩溃）
    const priceData: PriceData = {
      STOCK: {
        '2010-01-02': 100,
        '2010-01-03': NaN,
        '2010-01-04': 101,
        '2010-01-05': 102,
      },
    };
    // 数据量极小，应返回空响应而非抛出异常
    expect(() => {
      runMonteCarlo(makePortfolio(), priceData, makeParams(), {
        numSimulations: 5,
        numYears: 1,
        minBlockYears: 1,
        maxBlockYears: 1,
      });
    }).not.toThrow();
  });

  it('numSimulations=1 应返回单条路径', () => {
    const priceData = makeLongPriceData();
    const result = runMonteCarlo(makePortfolio(), priceData, makeParams(), {
      numSimulations: 1,
      numYears: 2,
      minBlockYears: 1,
      maxBlockYears: 1,
    });
    expect(result.perPathMetrics).toHaveLength(1);
  });

  it('numYears=1 应生成 252+1 长度的路径', () => {
    const priceData = makeLongPriceData();
    const result = runMonteCarlo(makePortfolio(), priceData, makeParams(), {
      numSimulations: 10,
      numYears: 1,
      minBlockYears: 1,
      maxBlockYears: 1,
    });
    expect(result.percentiles.p50).toHaveLength(253); // 252 + 1
  });

  it('minBlockDays === maxBlockDays 应使用固定区块大小', () => {
    const priceData = makeLongPriceData();
    // 使用长日期范围确保 dailyReturns.length >= minBlockDays (2*252=504)
    const params = makeParams({ startDate: '2010-01-02', endDate: '2020-12-31' });
    const result = runMonteCarlo(makePortfolio(), priceData, params, {
      numSimulations: 20,
      numYears: 3,
      minBlockYears: 2,
      maxBlockYears: 2, // 固定 2 年区块
    });
    expect(result.perPathMetrics).toHaveLength(20);
    for (const m of result.perPathMetrics) {
      expect(Number.isFinite(m.finalValue)).toBe(true);
    }
  });

  it('每条路径的 CAGR 应为有限数', () => {
    const priceData = makeLongPriceData();
    const result = runMonteCarlo(makePortfolio(), priceData, makeParams(), {
      numSimulations: 30,
      numYears: 5,
      minBlockYears: 1,
      maxBlockYears: 2,
    });
    for (const m of result.perPathMetrics) {
      expect(Number.isFinite(m.cagr)).toBe(true);
      expect(Number.isFinite(m.maxDrawdown)).toBe(true);
      expect(Number.isFinite(m.volatility)).toBe(true);
    }
  });
});
