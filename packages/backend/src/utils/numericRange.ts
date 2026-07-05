/**
 * 数值序列生成工具（T-24：消除重复实现）
 *
 * 企业为何需要：参数扫描的"生成 [min, min+step, ..., max] 序列"在 backtestOptimizerRoutes 与
 * engine/tacticalGrid 中各实现一份，仅舍入精度不同（2 位 vs 3 位）。重复实现易在修复浮点边界
 * （如 max + 1e-9 容差）时只改一处而漏另一处。抽取为单一带精度参数的实现，消除分叉。
 */

/**
 * 生成等差数值序列 [min, min+step, ..., max]（含末端，带浮点容差）。
 *
 * @param min - 起始值
 * @param max - 结束值（含）
 * @param step - 步长；<=0 时视为退化，返回 [min]
 * @param decimals - 每个元素四舍五入的小数位数（默认 2）
 * @returns 数值数组；min > max 时返回 [min]
 */
export function numericRange(min: number, max: number, step: number, decimals = 2): number[] {
  if (step <= 0 || min > max) return [min];
  const factor = 10 ** decimals;
  const arr: number[] = [];
  // 1e-9 容差：避免浮点累加误差导致末端值被漏掉。
  for (let v = min; v <= max + 1e-9; v += step) {
    arr.push(Math.round(v * factor) / factor);
  }
  return arr;
}
