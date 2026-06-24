/**
 * LETF 滑点分析核心算法
 *
 * Architecture: LETF计算逻辑，从路由文件外迁
 * 企业为何需要：业务逻辑与HTTP处理耦合导致无法单元测试、无法复用
 * 权衡：增加一层间接调用，但可测试性和可维护性大幅提升
 *
 * 计算流程：
 *   1. 对齐杠杆 ETF 与基准指数的日期
 *   2. 计算基准日收益率与 LETF 日收益率
 *   3. 预期日收益 = 基准日收益 × 杠杆倍数
 *   4. 累积滑点 = 累积预期收益 - 累积实际 LETF 收益
 *   5. 年化拖累 = 预期年化收益 - 实际年化收益
 *   6. 实际杠杆 = 滚动窗口内 LETF 日收益对基准日收益的回归 Beta
 */

import type { LETFResult } from '../../shared/types/letf.js';
import { TRADING_DAYS_PER_YEAR } from '../../shared/constants.js';

/** 实际杠杆滚动窗口天数 */
const EFFECTIVE_LEVERAGE_WINDOW = 20;

/**
 * 执行 LETF 滑点分析
 *
 * @param letfSeries   杠杆 ETF 价格序列（升序）
 * @param benchSeries  基准指数价格序列（升序）
 * @param leverage     杠杆倍数
 * @returns LETFResult
 */
export function analyzeLetfSlippage(
  letfSeries: Array<{ date: string; price: number }>,
  benchSeries: Array<{ date: string; price: number }>,
  leverage: number,
): LETFResult {
  // 1. 对齐日期：取两者都有数据的日期交集
  const benchMap = new Map(benchSeries.map((p) => [p.date, p.price]));
  const aligned: Array<{ date: string; letfPrice: number; benchPrice: number }> = [];
  for (const p of letfSeries) {
    const benchPrice = benchMap.get(p.date);
    if (benchPrice !== undefined) {
      aligned.push({ date: p.date, letfPrice: p.price, benchPrice });
    }
  }

  if (aligned.length < 2) {
    throw new Error('有效价格数据不足，至少需要 2 个交易日');
  }

  // 2. 逐日计算收益率、累积收益、滑点与实际杠杆
  const slippageCurve: Array<{ date: string; slippage: number }> = [];
  const effectiveLeverage: number[] = [];

  let cumBench = 1; // 累积基准净值
  let cumLetf = 1; // 累积 LETF 净值
  let cumExpected = 1; // 累积预期净值

  // 滚动窗口缓存（用于实际杠杆计算）
  const letfReturns: number[] = [];
  const benchReturns: number[] = [];

  for (let i = 1; i < aligned.length; i++) {
    const prev = aligned[i - 1];
    const curr = aligned[i];

    const benchRet =
      prev.benchPrice !== 0
        ? (curr.benchPrice - prev.benchPrice) / prev.benchPrice
        : 0;
    const letfRet =
      prev.letfPrice !== 0
        ? (curr.letfPrice - prev.letfPrice) / prev.letfPrice
        : 0;
    const expectedRet = benchRet * leverage;

    cumBench *= 1 + benchRet;
    cumLetf *= 1 + letfRet;
    cumExpected *= 1 + expectedRet;

    // 累积滑点 = 累积预期收益 - 累积实际收益
    const cumSlippage = cumExpected - cumLetf;
    slippageCurve.push({ date: curr.date, slippage: cumSlippage });

    // 实际杠杆（滚动窗口回归 Beta = cov(letf, bench) / var(bench)）
    letfReturns.push(letfRet);
    benchReturns.push(benchRet);
    if (letfReturns.length >= EFFECTIVE_LEVERAGE_WINDOW) {
      const start = letfReturns.length - EFFECTIVE_LEVERAGE_WINDOW;
      const n = EFFECTIVE_LEVERAGE_WINDOW;
      let sumLetf = 0;
      let sumBench = 0;
      for (let j = start; j < letfReturns.length; j++) {
        sumLetf += letfReturns[j];
        sumBench += benchReturns[j];
      }
      const meanLetf = sumLetf / n;
      const meanBench = sumBench / n;

      let cov = 0;
      let varBench = 0;
      for (let j = start; j < letfReturns.length; j++) {
        const dl = letfReturns[j] - meanLetf;
        const db = benchReturns[j] - meanBench;
        cov += dl * db;
        varBench += db * db;
      }
      effectiveLeverage.push(varBench > 0 ? cov / varBench : NaN);
    } else {
      effectiveLeverage.push(NaN);
    }
  }

  // 3. 统计
  const benchmarkReturn = cumBench - 1;
  const letfReturn = cumLetf - 1;
  const expectedReturn = cumExpected - 1;
  const slippage = expectedReturn - letfReturn;

  // 4. 年化拖累 = 预期年化收益 - 实际年化收益
  const years = (aligned.length - 1) / TRADING_DAYS_PER_YEAR;
  let annualDecay = 0;
  if (years > 0 && cumExpected > 0 && cumLetf > 0) {
    const expectedAnnual = Math.pow(cumExpected, 1 / years) - 1;
    const letfAnnual = Math.pow(cumLetf, 1 / years) - 1;
    annualDecay = expectedAnnual - letfAnnual;
  }

  return {
    slippageCurve,
    annualDecay,
    effectiveLeverage,
    stats: {
      benchmarkReturn,
      letfReturn,
      expectedReturn,
      slippage,
    },
  };
}
