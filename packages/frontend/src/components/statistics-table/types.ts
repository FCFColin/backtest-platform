/**
 * @file StatisticsTable 共享类型
 * @description 统计指标表格的共享类型定义。
 *   从 index.tsx 拆分以满足 react-refresh/only-export-components 规则
 *   （.tsx 文件仅导出组件，类型定义移至独立 .ts 文件）。
 */
import type { Statistics } from '@backtest/shared';

/** 数值格式化类型 */
export type FmtType = 'pct' | 'ratio' | 'num' | 'int' | 'duration';

/** 指标重要性层级 */
export type MetricImportance = 'primary' | 'secondary' | 'detailed';

/** 单行统计指标描述 */
export interface StatRow {
  key: keyof Statistics;
  label: string;
  fmt: FmtType;
  importance?: MetricImportance;
  /** 该指标是否"越大越好"，用于颜色编码（默认true） */
  higherIsBetter?: boolean;
}

/** 统计指标分组 */
export interface StatGroup {
  title: string;
  rows: StatRow[];
}
