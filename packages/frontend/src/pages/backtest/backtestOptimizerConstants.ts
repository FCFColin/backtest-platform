import type { BacktestOptimizerObjective as Objective, OptimizeResultItem } from '@backtest/shared';
import i18n from '@/i18n/index.js';
import { REBALANCE_LABELS } from '@backtest/shared';
import { fmtPct, fmtNum, fmtDollar } from '@/utils/format';
import type { Column } from '../../components/SortableTable.js';

// FREQ_LABELS / FREQ_OPTIONS 已上提到 @backtest/shared（REBALANCE_LABELS /
// REBALANCE_FREQUENCY_OPTIONS），此处 re-export 保留本模块既有导入路径。
export { REBALANCE_LABELS as FREQ_LABELS } from '@backtest/shared';
export { REBALANCE_FREQUENCY_OPTIONS as FREQ_OPTIONS } from '@backtest/shared';

export const OBJECTIVE_SORT_KEY: Record<Objective, keyof OptimizeResultItem> = {
  maxCagr: 'cagr',
  minMaxDrawdown: 'maxDrawdown',
  maxSharpe: 'sharpe',
  maxSortino: 'sortino',
};

export const TABLE_COLUMNS: Column<OptimizeResultItem>[] = [
  {
    key: 'rebalanceFrequency',
    label: i18n.t('params.rebalanceFrequency'),
    sortValue: (r) => r.rebalanceFrequency,
    render: (r) =>
      r.rebalanceFrequency === 'threshold'
        ? i18n.t('params.thresholdWithValue', { value: r.rebalanceThreshold })
        : (REBALANCE_LABELS[r.rebalanceFrequency] ?? r.rebalanceFrequency),
  },
  {
    key: 'rebalanceThreshold',
    label: i18n.t('params.threshold'),
    sortValue: (r) => r.rebalanceThreshold ?? 0,
    render: (r) => (r.rebalanceThreshold !== undefined ? `${r.rebalanceThreshold}%` : '-'),
  },
  {
    key: 'initialCapital',
    label: i18n.t('params.initialCapital'),
    sortValue: (r) => r.initialCapital,
    render: (r) => fmtDollar(r.initialCapital),
  },
  { key: 'cagr', label: 'CAGR', sortValue: (r) => r.cagr, render: (r) => fmtPct(r.cagr) },
  {
    key: 'maxDrawdown',
    label: i18n.t('statsTable.maxDrawdown'),
    sortValue: (r) => r.maxDrawdown,
    render: (r) => fmtPct(r.maxDrawdown),
  },
  { key: 'stdev', label: i18n.t('statsTable.volatility'), sortValue: (r) => r.stdev, render: (r) => fmtPct(r.stdev) },
  { key: 'sharpe', label: 'Sharpe', sortValue: (r) => r.sharpe, render: (r) => fmtNum(r.sharpe) },
  {
    key: 'sortino',
    label: 'Sortino',
    sortValue: (r) => r.sortino,
    render: (r) => fmtNum(r.sortino),
  },
  { key: 'calmar', label: 'Calmar', sortValue: (r) => r.calmar, render: (r) => fmtNum(r.calmar) },
];
