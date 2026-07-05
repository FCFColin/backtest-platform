import type { DualSignalResponse } from './types.js';

export function fmtPct(v: number | undefined): string {
  if (v === undefined || v === null) return '—';
  return `${(v * 100).toFixed(2)}%`;
}

export function fmtRatio(v: number | undefined): string {
  if (v === undefined || v === null) return '—';
  return v.toFixed(2);
}

export const STAT_COLS: { key: string; label: string; fmt: 'int' | 'pct' | 'ratio' }[] = [
  { key: 'totalSignals', label: '总信号数', fmt: 'int' },
  { key: 'winRate', label: '胜率', fmt: 'pct' },
  { key: 'avgReturn', label: '平均收益', fmt: 'pct' },
  { key: 'maxDrawdown', label: '最大回撤', fmt: 'pct' },
  { key: 'sharpe', label: '夏普', fmt: 'ratio' },
];

export function formatStat(v: number, fmt: 'int' | 'pct' | 'ratio'): string {
  if (fmt === 'int') return String(v);
  if (fmt === 'pct') return fmtPct(v);
  return fmtRatio(v);
}

export function buildEquityData(results: DualSignalResponse): Array<Record<string, number | string>> {
  const dateMap = new Map<string, Record<string, number | string>>();
  const series: Array<{ name: string; curve: typeof results.signal1.equityCurve }> = [
    { name: '信号1', curve: results.signal1.equityCurve },
    { name: '信号2', curve: results.signal2.equityCurve },
    { name: '组合', curve: results.combined.equityCurve },
  ];
  for (const s of series) {
    for (const p of s.curve) {
      if (!dateMap.has(p.date)) dateMap.set(p.date, { date: p.date });
      dateMap.get(p.date)![s.name] = p.value;
    }
  }
  return Array.from(dateMap.values()).sort((a, b) =>
    (a.date as string).localeCompare(b.date as string),
  );
}
