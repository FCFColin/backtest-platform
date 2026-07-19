/**
 * @file StatisticsTable 共享类型
 * @description 从主文件抽出以避免循环依赖与重复定义，供子组件复用。
 */
import type { Statistics } from '@backtest/shared';

/** 数值格式化类型 */
export type FmtType = 'pct' | 'ratio' | 'duration';

/** 单行统计指标描述 */
export interface StatRow {
  key: keyof Statistics;
  label: string;
  fmt: FmtType;
}

/** 统计指标分组 */
export interface StatGroup {
  title: string;
  rows: StatRow[];
}
