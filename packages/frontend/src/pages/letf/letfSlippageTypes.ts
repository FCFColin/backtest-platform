/**
 * @file LETF Slippage 拆分共享类型
 * @description 仅放置被多个拆分文件共同引用的类型，单文件私有类型不外移（参照 tacticalResultUtils.ts 中 StatRow 约定）
 */

/** 滑点曲线图数据点（累积滑点 + 每日滑点） */
export interface SlippageCurveDataPoint {
  /** 日期 */
  date: string;
  /** 累积滑点（百分比） */
  cumulative: number;
  /** 每日滑点（百分比） */
  daily: number;
}

/** 杠杆对比图数据点（实际杠杆 vs 名义杠杆） */
export interface LeverageComparisonDataPoint {
  /** 日期 */
  date: string;
  /** 实际杠杆（缺失时为 null） */
  effective: number | null;
  /** 名义杠杆 */
  nominal: number;
}
