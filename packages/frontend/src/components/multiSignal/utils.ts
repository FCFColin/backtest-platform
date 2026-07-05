import { type Column } from '../SortableTable';
import type { MultiSignalResponse } from './types.js';

export function fmtPct(v: number | undefined): string {
  if (v === undefined || v === null) return '—';
  return `${(v * 100).toFixed(2)}%`;
}

export function fmtRatio(v: number | undefined): string {
  if (v === undefined || v === null) return '—';
  return v.toFixed(2);
}

export const CONTRIBUTION_COLUMNS: Column<MultiSignalResponse['contributions'][number]>[] = [
  { key: 'index', label: '#', sortValue: (r) => r.index },
  { key: 'indicator', label: '指标', sortValue: (r) => r.indicator },
  {
    key: 'contribution',
    label: '贡献度（平均收益）',
    render: (r) => fmtPct(r.contribution),
    sortValue: (r) => r.contribution,
  },
  {
    key: 'winRate',
    label: '胜率',
    render: (r) => fmtPct(r.statistics.winRate),
    sortValue: (r) => r.statistics.winRate,
  },
  {
    key: 'totalSignals',
    label: '信号数',
    render: (r) => String(r.statistics.totalSignals),
    sortValue: (r) => r.statistics.totalSignals,
  },
];

export function buildAggStatRows(results: MultiSignalResponse) {
  const s = results.aggregated.statistics;
  return [
    { label: '总信号数', value: String(s.totalSignals) },
    { label: '胜率', value: fmtPct(s.winRate) },
    { label: '平均收益', value: fmtPct(s.avgReturn) },
    { label: '最大回撤', value: fmtPct(s.maxDrawdown) },
    { label: '夏普', value: fmtRatio(s.sharpe) },
  ];
}
