import type { LETFResult } from '@backtest/shared/types';
import type { StatRow } from './types.js';

export const tooltipStyle = {
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-body)',
  fontSize: '12px',
  boxShadow: 'var(--shadow-md)',
};

export function fmtPct(v: number | undefined | null): string {
  if (v === undefined || v === null || isNaN(v)) return '—';
  return `${(v * 100).toFixed(2)}%`;
}

export function buildStatRows(results: LETFResult): StatRow[] {
  return [
    { metric: '基准收益', value: results.stats.benchmarkReturn },
    { metric: 'LETF 收益', value: results.stats.letfReturn },
    { metric: '预期收益', value: results.stats.expectedReturn },
    { metric: '滑点', value: results.stats.slippage },
    { metric: '年化拖累', value: results.annualDecay },
  ];
}
