/**
 * TacticalResults 拆分共享类型。
 * 仅放置被多个拆分文件共同引用的类型，单文件私有类型不外移。
 */

/**
 * 统计指标对比行（tactical 策略 vs benchmark 等权基准）。
 * `_sortTactical` 为排序用数值，不直接展示。
 */
export interface StatRow {
  metric: string;
  tactical: string;
  benchmark: string;
  _sortTactical: number;
}
