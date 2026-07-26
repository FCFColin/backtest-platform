/**
 * @file 图表配色方案
 * @description 统一的图表颜色常量，替代散落在各组件中的硬编码颜色值。
 *   基于 tmp.md P1-3 规范：使用单一数据源 + 语义化命名。
 */

/**
 * 投资组合配色序列。
 * 前 4 色参考 testfol.io (蓝/橙/绿/紫)，后续扩展色使用 Tailwind 调色板。
 */
export const PORTFOLIO_COLORS = [
  '#3b82f6', // Blue-500 — 组合 1
  '#f97316', // Orange-500 — 组合 2
  '#22c55e', // Green-500 — 组合 3
  '#a855f7', // Purple-500 — 组合 4
  '#06b6d4', // Cyan-500 — 组合 5
  '#ef4444', // Red-500 — 组合 6
  '#eab308', // Yellow-500 — 组合 7
  '#ec4899', // Pink-500 — 组合 8
] as const;

/**
 * 基准对比色（benchmark）。
 */
export const BENCHMARK_COLOR = '#64748b' as const; // Slate-500

/**
 * 语义色：收益正/负
 */
export const SEMANTIC_COLORS = {
  positive: '#22c55e', // Green-500
  negative: '#ef4444', // Red-500
  neutral: '#64748b', // Slate-500
} as const;

/**
 * 根据索引获取组合颜色，循环复用。
 * @param index - 组合索引
 * @returns CSS 颜色字符串
 */
export function getPortfolioColor(index: number): string {
  return PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length];
}
