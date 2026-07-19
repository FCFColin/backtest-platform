/**
 * @file StatisticsTable 共享 helper
 * @description 数值格式化函数，供子组件渲染单元格时调用。
 */
import { fmtPct, fmtRatio } from '@/utils/format';
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
  if (fmt === 'duration') return `${v} mo`;
  return v.toString();
}
