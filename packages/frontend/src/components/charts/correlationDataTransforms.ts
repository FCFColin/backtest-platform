/**
 * @file 相关性矩阵数据变换函数
 * @description 承载 CorrelationHeatmapChart 所需的纯函数：日收益计算、Beta 计算、滚动相关性，以及单元格颜色映射辅助
 */

import { pickByAbsThreshold } from '@/utils/colorScale';

/** 增长曲线数据点（与 PortfolioResult.growthCurve 元素结构一致） */
type GrowthCurvePoint = { date: string; value: number };

/**
 * 滚动相关性数据点
 * 使用 type alias 而非 interface：对象字面量类型可获得隐式索引签名，
 * 从而可赋值给 ChartExporter 所需的 Record<string, string | number>。
 */
export type RollingCorrelationPoint = { date: string; correlation: number };

/** Beta 表行数据 */
export type BetaRow = { name: string; beta: number };

/**
 * 计算日收益率序列
 * @param curve - 增长曲线
 * @returns 日收益率数组（长度 = curve.length - 1，跳过前值为 0 的退化点）
 */
export function computeDailyReturns(curve: GrowthCurvePoint[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    if (curve[i - 1].value > 0)
      returns.push((curve[i].value - curve[i - 1].value) / curve[i - 1].value);
  }
  return returns;
}

/**
 * 计算 Beta 系数（target 相对于 base 的 OLS 回归斜率）
 * @param baseReturns - 基准收益率序列
 * @param targetReturns - 目标收益率序列
 * @returns Beta 值；样本不足或 base 无方差时返回 0
 */
export function computeBeta(baseReturns: number[], targetReturns: number[]): number {
  const n = Math.min(baseReturns.length, targetReturns.length);
  if (n < 2) return 0;
  const xMean = baseReturns.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const yMean = targetReturns.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let ssXY = 0,
    ssXX = 0;
  for (let i = 0; i < n; i++) {
    ssXY += (baseReturns[i] - xMean) * (targetReturns[i] - yMean);
    ssXX += (baseReturns[i] - xMean) ** 2;
  }
  return ssXX > 0 ? ssXY / ssXX : 0;
}

/**
 * 计算滚动相关系数序列
 * @param baseReturns - 基准收益率序列
 * @param targetReturns - 目标收益率序列
 * @param dates - 日期序列（与收益率等长，对齐到区间末尾）
 * @param windowSize - 滚动窗口大小
 * @returns 滚动相关性数据点数组；样本不足时返回空数组
 */
export function computeRollingCorrelation(
  baseReturns: number[],
  targetReturns: number[],
  dates: string[],
  windowSize: number,
): RollingCorrelationPoint[] {
  const n = Math.min(baseReturns.length, targetReturns.length);
  if (n < windowSize) return [];
  const result: RollingCorrelationPoint[] = [];
  const step = Math.max(1, Math.floor((n - windowSize) / 200));
  for (let start = 0; start + windowSize <= n; start += step) {
    const xSlice = baseReturns.slice(start, start + windowSize);
    const ySlice = targetReturns.slice(start, start + windowSize);
    const xMean = xSlice.reduce((s, v) => s + v, 0) / windowSize;
    const yMean = ySlice.reduce((s, v) => s + v, 0) / windowSize;
    let ssXY = 0,
      ssXX = 0,
      ssYY = 0;
    for (let i = 0; i < windowSize; i++) {
      const dx = xSlice[i] - xMean,
        dy = ySlice[i] - yMean;
      ssXY += dx * dy;
      ssXX += dx * dx;
      ssYY += dy * dy;
    }
    const corr = ssXX > 0 && ssYY > 0 ? ssXY / Math.sqrt(ssXX * ssYY) : 0;
    result.push({ date: dates[start + windowSize - 1] || '', correlation: +corr.toFixed(4) });
  }
  return result;
}

/**
 * 根据相关系数绝对值决定单元格文字颜色，保证与背景色的可读对比度
 * @param val - 相关系数 [-1, 1]
 * @returns 文字颜色 CSS 字符串（深色背景→白字，浅色背景→黑字）
 */
export function getCorrelationTextColor(val: number): string {
  return pickByAbsThreshold(val, 0.6, '#fff', '#000');
}
