/** @file Shared color utilities for chart visualization */

const POS_CORR_THRESHOLDS = [0.8, 0.6, 0.4, 0.2] as const;
const POS_CORR_COLORS = ['#1a7a3a', '#2e8b57', '#6abf7e', '#b8e0c4', 'var(--bg-subtle)'] as const;
const NEG_CORR_THRESHOLDS = [-0.8, -0.6, -0.4, -0.2] as const;
const NEG_CORR_COLORS = ['#8b2020', '#b04040', '#d47070', '#f0c8c8', 'var(--bg-subtle)'] as const;

/**
 * 根据相关系数返回对应颜色（绿色=正相关，红色=负相关）
 * @param val - 相关系数 [-1, 1]
 * @returns CSS 颜色字符串
 */
export function getCorrelationColor(val: number): string {
  if (val >= 0) {
    const idx = POS_CORR_THRESHOLDS.findIndex((t) => val >= t);
    return POS_CORR_COLORS[idx === -1 ? POS_CORR_COLORS.length - 1 : idx];
  }
  const idx = NEG_CORR_THRESHOLDS.findIndex((t) => val <= t);
  return NEG_CORR_COLORS[idx === -1 ? NEG_CORR_COLORS.length - 1 : idx];
}
