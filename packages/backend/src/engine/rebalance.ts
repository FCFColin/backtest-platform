/**
 * 再平衡频率判断
 *
 * Architecture: shouldRebalance统一实现，消除三处重复
 * 企业为何需要：重复实现已有细微差异，存在一致性风险
 * 权衡：统一后各调用方需适配，但一致性保证远大于适配成本
 *
 * 合并来源：
 *   - api/engine/portfolio.ts（最完整，含 threshold 频率与持仓偏差判断）
 *   - api/routes/tacticalRoutes.ts（仅基于日期的频率判断）
 *   - api/routes/tacticalGridRoutes.ts（仅基于日期的频率判断）
 */

import type { RebalanceFrequency } from '@backtest/shared/types/index.js';

/** 基于频率与日期的再平衡判断参数 */
export interface RebalanceParams {
  frequency: RebalanceFrequency;
  currentDate: string;
  prevDate: string | null;
  /** 以下参数仅在 frequency='threshold' 时使用 */
  holdings?: number[];
  weights?: number[];
  portfolioValue?: number;
  threshold?: number;
}

/**
 * 判断当前日期是否需要再平衡
 *
 * 支持的频率：
 * - none: 从不自动再平衡
 * - daily: 每个交易日
 * - weekly: 跨周时
 * - monthly: 跨月时
 * - quarterly: 跨季时
 * - annual: 跨年时
 * - threshold: 持仓权重偏离目标权重超过阈值时
 */
/** 检查阈值型再平衡：持仓权重偏离目标超过阈值时触发 */
function checkThresholdRebalance(
  holdings: number[],
  weights: number[],
  portfolioValue: number,
  threshold: number,
): boolean {
  for (let j = 0; j < holdings.length; j++) {
    if (weights[j] === 0) continue;
    const actualWeight = holdings[j] / portfolioValue;
    const deviation = (Math.abs(actualWeight - weights[j]) / Math.abs(weights[j])) * 100;
    if (deviation >= threshold) return true;
  }
  return false;
}

/** 按日期频率判断是否跨周期（周/月/季/年） */
function crossesFrequencyBoundary(frequency: RebalanceFrequency, cur: Date, prev: Date): boolean {
  switch (frequency) {
    case 'weekly': {
      const curWeek = getISOWeekNumber(cur.toISOString());
      const prevWeek = getISOWeekNumber(prev.toISOString());
      return curWeek !== prevWeek || cur.getFullYear() !== prev.getFullYear();
    }
    case 'monthly':
      return cur.getMonth() !== prev.getMonth() || cur.getFullYear() !== prev.getFullYear();
    case 'quarterly': {
      const cq = Math.floor(cur.getMonth() / 3);
      const pq = Math.floor(prev.getMonth() / 3);
      return cq !== pq || cur.getFullYear() !== prev.getFullYear();
    }
    case 'annual':
      return cur.getFullYear() !== prev.getFullYear();
    default:
      return false;
  }
}

export function shouldRebalance(params: RebalanceParams): boolean {
  const { frequency, currentDate, prevDate, holdings, weights, portfolioValue, threshold } = params;

  if (frequency === 'none') return false;
  if (frequency === 'daily') return true;
  if (!prevDate) return true;

  if (frequency === 'threshold') {
    if (!threshold || threshold <= 0) return false;
    if (!holdings || !weights || !portfolioValue) return false;
    return checkThresholdRebalance(holdings, weights, portfolioValue, threshold);
  }

  const cur = new Date(currentDate);
  const prev = new Date(prevDate);
  return crossesFrequencyBoundary(frequency, cur, prev);
}

/** ISO 周号计算（与 portfolio.ts 原实现一致） */
export function getISOWeekNumber(dateStr: string): number {
  const d = new Date(dateStr);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
