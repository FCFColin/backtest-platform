/**
 * 核心统计计算性能基准测试
 *
 * 企业理由：统计指标是回测引擎的核心路径，性能退化直接影响用户体验。
 * 基准测试可在 CI 中捕获性能回归，避免优化在不知不觉中被破坏。
 * 权衡：基准测试依赖硬件环境，绝对值无意义，但相对变化可检测回归。
 * 数据量选择 1000 个数据点，对应约 4 年日频数据，是典型使用场景。
 */

import { describe, bench } from 'vitest';
import {
  calcAnnualizedStdev,
  calcSharpe,
  calcMaxDrawdown,
  calcDailyReturns,
} from '../../api/engine/statistics.js';

// 企业理由：使用确定性随机数生成测试数据，确保基准测试可重现。
// 权衡：确定性数据不代表真实市场分布，但基准测试关注的是计算性能而非统计准确性。
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const DATA_POINTS = 1000;
const rng = seededRandom(42);

// 生成 1000 个模拟日价格（从 100 开始，日收益率约 ±2%）
const prices: number[] = [100];
for (let i = 1; i < DATA_POINTS; i++) {
  const dailyReturn = (rng() - 0.48) * 0.04; // 微弱正偏
  prices.push(prices[i - 1] * (1 + dailyReturn));
}

const dailyReturns = calcDailyReturns(prices);
const cagr = 0.08; // 模拟年化收益率
const stdev = calcAnnualizedStdev(dailyReturns);

describe('statistics benchmarks', () => {
  bench(
    'calcAnnualizedStdev - 1000 data points',
    () => {
      calcAnnualizedStdev(dailyReturns);
    },
    { iterations: 1000 },
  );

  bench(
    'calcSharpe - 1000 data points',
    () => {
      calcSharpe(cagr, stdev);
    },
    { iterations: 1000 },
  );

  bench(
    'calcMaxDrawdown - 1000 data points',
    () => {
      calcMaxDrawdown(prices);
    },
    { iterations: 1000 },
  );

  bench(
    'calcDailyReturns - 1000 data points',
    () => {
      calcDailyReturns(prices);
    },
    { iterations: 1000 },
  );
});
