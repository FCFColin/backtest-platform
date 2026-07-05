export type DcaFrequency = 'monthly' | 'quarterly';

export interface CompareResult {
  label: string;
  cagr: number;
  stdev: number;
  maxDrawdown: number;
  sharpe: number;
  sortino: number;
  calmar?: number;
  maxDrawdownDuration?: number;
  ulcerIndex?: number;
  finalValue: number;
  growthCurve: Array<{ date: string; value: number }>;
}

export const STATS_ROWS: Array<{ key: keyof CompareResult; label: string }> = [
  { key: 'finalValue', label: '终值' },
  { key: 'cagr', label: 'CAGR' },
  { key: 'stdev', label: '波动率' },
  { key: 'maxDrawdown', label: '最大回撤' },
  { key: 'sharpe', label: '夏普比率' },
  { key: 'sortino', label: 'Sortino' },
  { key: 'calmar', label: 'Calmar' },
  { key: 'maxDrawdownDuration', label: '最长回撤期' },
  { key: 'ulcerIndex', label: 'Ulcer Index' },
];

export const REQUIRED_KEYS = new Set([
  'finalValue',
  'cagr',
  'stdev',
  'maxDrawdown',
  'sharpe',
  'sortino',
]);
