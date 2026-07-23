/**
 * @file StatisticsTable 共享 helper
 * @description 统计指标表格的格式化 helper。
 *   从 index.tsx 拆分以满足 react-refresh/only-export-components 规则
 *   （.tsx 文件仅导出组件，非组件函数移至独立 .ts 文件）。
 */
import { fmtPct, fmtRatio, fmtNum } from '@/utils/format';
import type { FmtType } from './types.js';

/**
 * 按 fmt 类型格式化统计值。
 * @param v - 原始数值，可能为 undefined
 * @param fmt - 格式化类型
 * @returns 格式化后的字符串；缺值为 '—'
 */
export function formatValue(v: number | undefined, fmt: FmtType): string {
  if (v == null) return '—';
  if (fmt === 'pct') return fmtPct(v);
  if (fmt === 'ratio') return fmtRatio(v);
  if (fmt === 'num') return fmtNum(v, 2);
  if (fmt === 'int') return `${Math.round(v)}d`;
  if (fmt === 'duration') return `${Math.round(v)}d`;
  return v.toString();
}
