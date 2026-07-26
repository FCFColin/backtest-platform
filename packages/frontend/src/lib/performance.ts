/**
 * @file 性能优化工具
 * @description P4-5: 大表格虚拟化、代码分割检查、Bundle 分析工具。
 */

/**
 * 代码分割清单：确认 lazy load 覆盖所有 /pages/。
 * 每个页面路由必须使用 lazy(() => import(...)) 加载。
 */
export const LAZY_LOADED_ROUTES = [
  '/pages/backtest',
  '/pages/analysis',
  '/pages/monte-carlo',
  '/pages/optimizer',
  '/pages/efficient-frontier',
  '/pages/factor-regression',
  '/pages/goal-optimizer',
  '/pages/pca',
  '/pages/signal',
  '/pages/tactical',
  '/pages/letf',
  '/pages/lump-sum-dca',
  '/pages/rebalancing-sensitivity',
  '/pages/data-engine',
  '/pages/portfolio-comparison',
  '/pages/swr',
  '/pages/tvm-scanner',
  '/pages/workspace',
  '/pages/about',
  '/pages/account/pricing',
  '/pages/admin',
  '/pages/calculators',
] as const;

/**
 * 检查是否所有页面路由都已 lazy load。
 * 在 CI 中运行此函数，输出未覆盖的路由。
 */
export function checkLazyLoadCoverage(importedRoutes: string[]): {
  allCovered: boolean;
  missing: string[];
} {
  const required = new Set(LAZY_LOADED_ROUTES);
  const imported = new Set(importedRoutes);
  const missing = [...required].filter((r) => !imported.has(r));
  return { allCovered: missing.length === 0, missing };
}

/** 虚拟化表格的推荐阈值 */
export const VIRTUALIZATION_THRESHOLD = 100;

/**
 * 判断表格是否需要虚拟化。
 * 行数超过 100 时建议使用 @tanstack/react-virtual。
 */
export function shouldVirtualize(rowCount: number): boolean {
  return rowCount > VIRTUALIZATION_THRESHOLD;
}
