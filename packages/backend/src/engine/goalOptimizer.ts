/**
 * 目标优化（Goal Optimizer）核心算法
 *
 * Architecture: 目标优化算法，从路由文件外迁
 * 企业为何需要：业务逻辑与HTTP处理耦合导致无法单元测试、无法复用、路由文件过长
 * 权衡：增加一层间接调用，但可测试性和可维护性大幅提升
 *
 * 计算流程：
 *   1. 通过 calcPortfolioDailyReturns 计算组合日收益率统计（均值、标准差）
 *   2. 基于历史统计特征（正态分布假设）生成蒙特卡洛模拟路径
 *   3. 对每条路径计算终值，判断是否达成目标金额
 *   4. 统计成功概率、终值概率分布、分位数路径
 *   5. 若存在约束条件（最大回撤、最大波动率），过滤不满足约束的路径后重新统计
 */

import type { GoalOptimizerRequest, GoalOptimizerResult } from '@backtest/shared/types/goal.js';
import { TRADING_DAYS_PER_YEAR } from '@backtest/shared/constants.js';

// ===== 统计工具函数 =====

/** Box-Muller 变换生成正态分布随机数 */
function gaussianRandom(mean: number, std: number): number {
  const u1 = Math.max(Math.random(), 1e-10);
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + std * z;
}

/** 计算数组均值 */
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/** 计算数组样本标准差 */
function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

/** 计算数组分位数（p ∈ [0, 1]） */
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(Math.floor(sorted.length * p), sorted.length - 1);
  return sorted[idx];
}

// ===== 核心计算 =====

/**
 * 计算组合历史日收益率序列
 *
 * 对齐所有资产的日期交集，按权重加权求和每日收益率。
 * 权重归一化为总和为 1。
 */
export function calcPortfolioDailyReturns(
  assets: Array<{ ticker: string; weight: number }>,
  priceData: Record<string, Record<string, number>>,
  startDate: string,
  endDate: string,
): number[] {
  const validAssets = assets.filter(
    (a) => priceData[a.ticker] && Object.keys(priceData[a.ticker]).length > 0,
  );
  if (validAssets.length === 0) return [];

  const totalWeight = validAssets.reduce((s, a) => s + Math.abs(a.weight), 0);
  if (totalWeight === 0) return [];
  const weights = validAssets.map((a) => Math.abs(a.weight) / totalWeight);

  // 对齐日期交集
  const dateSets = validAssets.map((a) => {
    const dates = Object.keys(priceData[a.ticker]).filter((d) => d >= startDate && d <= endDate);
    return new Set(dates);
  });
  const commonDates = Array.from(dateSets[0])
    .filter((d) => dateSets.every((s) => s.has(d)))
    .sort();

  if (commonDates.length < 2) return [];

  const returns: number[] = [];
  for (let i = 1; i < commonDates.length; i++) {
    let portfolioReturn = 0;
    for (let j = 0; j < validAssets.length; j++) {
      const prev = priceData[validAssets[j].ticker][commonDates[i - 1]];
      const curr = priceData[validAssets[j].ticker][commonDates[i]];
      if (prev && curr && prev > 0) {
        portfolioReturn += weights[j] * ((curr - prev) / prev);
      }
    }
    returns.push(portfolioReturn);
  }
  return returns;
}

/** 单条路径指标 */
export interface PathMetrics {
  finalValue: number;
  maxDrawdown: number;
  volatility: number;
}

/**
 * 运行蒙特卡洛模拟
 *
 * 基于历史日收益率的均值与标准差，使用正态分布生成每条路径的随机收益率序列，
 * 累乘得到组合价值路径。同时计算每条路径的最大回撤与年化波动率。
 */
export function runGoalSimulation(
  request: GoalOptimizerRequest,
  dailyMean: number,
  dailyStd: number,
): { paths: number[][]; metrics: PathMetrics[] } {
  const { initialAmount, years, numSimulations = 1000 } = request;
  const totalDays = Math.round(years * TRADING_DAYS_PER_YEAR);
  const numSims = Math.max(1, Math.min(numSimulations, 10000));

  const paths: number[][] = [];
  const metrics: PathMetrics[] = [];

  for (let s = 0; s < numSims; s++) {
    const path: number[] = [initialAmount];
    const dailyReturns: number[] = [];
    let peak = initialAmount;
    let maxDrawdown = 0;

    for (let d = 0; d < totalDays; d++) {
      const r = gaussianRandom(dailyMean, dailyStd);
      dailyReturns.push(r);
      const nextValue = path[path.length - 1] * (1 + r);
      path.push(nextValue);

      if (nextValue > peak) peak = nextValue;
      if (peak > 0) {
        const dd = (peak - nextValue) / peak;
        if (dd > maxDrawdown) maxDrawdown = dd;
      }
    }

    const volatility =
      dailyReturns.length > 1 ? std(dailyReturns) * Math.sqrt(TRADING_DAYS_PER_YEAR) : 0;

    paths.push(path);
    metrics.push({
      finalValue: path[path.length - 1],
      maxDrawdown,
      volatility,
    });
  }

  return { paths, metrics };
}

/**
 * 构建终值概率分布曲线
 *
 * 将所有路径的终值分箱统计，归一化为概率（每个箱的占比）。
 */
export function buildProbabilityCurve(
  finalValues: number[],
): Array<{ amount: number; probability: number }> {
  if (finalValues.length === 0) return [];

  let min = Infinity;
  let max = -Infinity;
  for (const v of finalValues) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max === min) return [{ amount: Math.round(min), probability: 1 }];

  const binCount = 50;
  const binWidth = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, i) => ({
    amount: Math.round(min + (i + 0.5) * binWidth),
    probability: 0,
  }));

  for (const v of finalValues) {
    let idx = Math.floor((v - min) / binWidth);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    bins[idx].probability++;
  }

  const total = finalValues.length;
  return bins.map((b) => ({ amount: b.amount, probability: b.probability / total }));
}

/**
 * 构建最优路径（分位数路径）
 *
 * 按年采样（每 252 个交易日），统计各时间点的中位数、P10、P90。
 */
export function buildOptimalPath(
  paths: number[][],
  years: number,
): Array<{ year: number; median: number; p10: number; p90: number }> {
  const result: Array<{ year: number; median: number; p10: number; p90: number }> = [];
  const pathLen = paths[0].length;

  for (let y = 0; y <= years; y++) {
    const dayIdx = Math.min(y * TRADING_DAYS_PER_YEAR, pathLen - 1);
    const values = paths.map((p) => p[dayIdx]);
    result.push({
      year: y,
      median: percentile(values, 0.5),
      p10: percentile(values, 0.1),
      p90: percentile(values, 0.9),
    });
  }
  return result;
}

/**
 * 计算建议定期投入金额（每年）
 *
 * 基于中位数终值反推年化收益率 r，使用年金终值公式：
 *   target = initial * (1+r)^years + C * [((1+r)^years - 1) / r]
 * 若 r ≈ 0 则退化为线性分摊。
 */
export function calcRequiredContribution(
  initialAmount: number,
  targetAmount: number,
  years: number,
  medianFinalValue: number,
): number {
  if (medianFinalValue >= targetAmount) return 0;

  const growthFactor =
    medianFinalValue > 0 && initialAmount > 0 ? medianFinalValue / initialAmount : 1;
  const r = years > 0 && growthFactor > 0 ? Math.pow(growthFactor, 1 / years) - 1 : 0;

  const fvInitial = initialAmount * Math.pow(1 + r, years);
  const gap = targetAmount - fvInitial;
  if (gap <= 0) return 0;

  if (Math.abs(r) < 1e-6) return gap / years;
  const annuityFactor = (Math.pow(1 + r, years) - 1) / r;
  return annuityFactor > 0 ? gap / annuityFactor : gap / years;
}

/**
 * 目标优化主函数
 *
 * 从历史价格数据出发，运行蒙特卡洛模拟，计算达成财务目标的概率与建议配置。
 * 返回 GoalOptimizerResult。
 */
export function optimizeGoals(
  request: GoalOptimizerRequest,
  priceData: Record<string, Record<string, number>>,
  startDateStr: string,
  endDateStr: string,
): GoalOptimizerResult {
  const validAssets = request.assets.filter((a) => a.ticker && a.ticker.trim());

  // 计算组合历史日收益率统计
  const dailyReturns = calcPortfolioDailyReturns(validAssets, priceData, startDateStr, endDateStr);

  const dailyMean = mean(dailyReturns);
  const dailyStd = std(dailyReturns);
  const annualMeanReturn = dailyMean * TRADING_DAYS_PER_YEAR;

  // 蒙特卡洛模拟
  const { paths, metrics } = runGoalSimulation(request, dailyMean, dailyStd);

  // 约束过滤（maxDrawdown、maxVolatility 为逐路径约束）
  const constraints = request.constraints;
  let filteredMetrics = metrics;
  let filteredPaths = paths;

  if (constraints) {
    const indices: number[] = [];
    for (let i = 0; i < metrics.length; i++) {
      if (constraints.maxDrawdown !== undefined && metrics[i].maxDrawdown > constraints.maxDrawdown)
        continue;
      if (
        constraints.maxVolatility !== undefined &&
        metrics[i].volatility > constraints.maxVolatility
      )
        continue;
      indices.push(i);
    }
    filteredMetrics = indices.map((i) => metrics[i]);
    filteredPaths = indices.map((i) => paths[i]);
  }

  // 约束过滤后无有效路径时，返回安全默认值
  if (filteredMetrics.length === 0) {
    return {
      successProbability: 0,
      probabilityCurve: [],
      optimalPath: [],
      recommendation: {
        expectedReturn: annualMeanReturn,
        requiredContribution: 0,
        successRate: 0,
      },
    };
  }

  // 统计成功概率
  const finalValues = filteredMetrics.map((m) => m.finalValue);
  const successCount = finalValues.filter((v) => v >= request.targetAmount).length;
  const successProbability = successCount / finalValues.length;

  // 概率分布曲线
  const probabilityCurve = buildProbabilityCurve(finalValues);

  // 最优路径（分位数路径）
  const optimalPath = buildOptimalPath(filteredPaths, request.years);

  // 建议配置
  const medianFinalValue = percentile(finalValues, 0.5);
  const expectedReturn = annualMeanReturn;
  const requiredContribution = calcRequiredContribution(
    request.initialAmount,
    request.targetAmount,
    request.years,
    medianFinalValue,
  );

  return {
    successProbability,
    probabilityCurve,
    optimalPath,
    recommendation: {
      expectedReturn,
      requiredContribution,
      successRate: successProbability,
    },
  };
}
