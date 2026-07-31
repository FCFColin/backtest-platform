import { fmtPct, fmtRatio, fmtNum } from '@/utils/format';
import type { FmtType } from './types.js';
export function formatValue(v: number | undefined, fmt: FmtType): string {
  if (v == null) return '—';
  if (fmt === 'pct') return fmtPct(v);
  if (fmt === 'ratio') return fmtRatio(v);
  if (fmt === 'num') return fmtNum(v, 2);
  if (fmt === 'int') return `${Math.round(v)}d`;
  if (fmt === 'duration') return `${Math.round(v)}d`;
  return v.toString();
}
