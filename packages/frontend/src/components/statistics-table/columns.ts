import type { Statistics } from '@backtest/shared';
import type { StatRow } from './types.js';

export type StatFormat = 'currency' | 'percent' | 'duration' | 'number' | 'text';
export interface StatColumn {
  key: string;
  label: string;
  format: StatFormat;
  colorize?: boolean;
  invert?: boolean;
  sticky?: 'left' | 'right';
  minWidth?: string;
}

export const DEFAULT_COLUMNS: StatColumn[] = [
  {
    key: 'name',
    label: 'statsTable.portfolioName',
    format: 'text',
    sticky: 'left',
    minWidth: '140px',
  },
  { key: 'cagr', label: 'stats.cagr', format: 'percent', colorize: true },
  { key: 'mwrr', label: 'stats.mwrr', format: 'percent', colorize: true },
  { key: 'maxDrawdown', label: 'Max Drawdown', format: 'percent', colorize: true },
  { key: 'avgDrawdown', label: 'Avg Drawdown', format: 'percent', colorize: true },
  { key: 'maxDrawdownDuration', label: 'analysis.maxDrawdownDuration', format: 'duration' },
  { key: 'stdev', label: 'Volatility', format: 'percent' },
  { key: 'sharpe', label: 'backtest.sharpeRatio', format: 'number' },
  { key: 'sortino', label: 'lumpSumDca.stats.sortino', format: 'number' },
  { key: 'calmar', label: 'lumpSumDca.stats.calmar', format: 'number' },
  { key: 'ulcerIndex', label: 'analysis.ulcerIndex', format: 'number' },
  { key: 'ulcerPerformanceIndex', label: 'UPI', format: 'number' },
  { key: 'diversificationRatio', label: 'statsTable.diversificationRatio', format: 'number' },
  { key: 'beta', label: 'Beta', format: 'number' },
  // H-1 高级指标包
  { key: 'psr', label: 'statsTable.psr', format: 'percent', colorize: true },
  { key: 'hurstExponent', label: 'statsTable.hurst', format: 'number' },
  { key: 'burkeRatio', label: 'statsTable.burkeRatio', format: 'number' },
  { key: 'martinRatio', label: 'statsTable.martinRatio', format: 'number' },
  { key: 'sterlingRatio', label: 'statsTable.sterlingRatio', format: 'number' },
  { key: 'battingAverage', label: 'statsTable.battingAverage', format: 'percent' },
];

export const EXTENDED_COLUMNS: StatColumn[] = [
  { key: 'varAnnual5', label: 'statsTable.vaR95', format: 'percent', colorize: true },
  { key: 'varAnnual1', label: 'statsTable.vaR99', format: 'percent', colorize: true },
  { key: 'cvarAnnual5', label: 'statsTable.cvaR95', format: 'percent', colorize: true },
  { key: 'cvarAnnual1', label: 'statsTable.cvaR99', format: 'percent', colorize: true },
  { key: 'skewnessDaily', label: 'statsTable.skewness', format: 'number' },
  { key: 'excessKurtosisDaily', label: 'statsTable.kurtosis', format: 'number' },
  { key: 'alpha', label: 'stats.alpha', format: 'percent', colorize: true },
  { key: 'rSquared', label: 'stats.rSquared', format: 'number' },
  { key: 'trackingError', label: 'stats.trackingError', format: 'percent', colorize: true },
  { key: 'informationRatio', label: 'stats.informationRatio', format: 'number' },
  { key: 'bestYear', label: 'summarySidebar.bestYear', format: 'percent', colorize: true },
  { key: 'worstYear', label: 'summarySidebar.worstYear', format: 'percent', colorize: true },
  { key: 'maxMonthlyReturn', label: 'statsTable.bestMonth', format: 'percent', colorize: true },
  { key: 'minMonthlyReturn', label: 'statsTable.worstMonth', format: 'percent', colorize: true },
  { key: 'upsideCapture', label: 'stats.upsideCapture', format: 'percent', colorize: true },
  { key: 'downsideCapture', label: 'stats.downsideCapture', format: 'percent', colorize: true },
  {
    key: 'pctPositiveMonths',
    label: 'statsTable.positiveMonths',
    format: 'percent',
    colorize: true,
  },
  {
    key: 'negativeMonthsPct',
    label: 'statsTable.negativeMonths',
    format: 'percent',
    colorize: true,
    invert: true,
  },
];

const EXTRA_METRICS: StatColumn[] = [
  { key: 'totalReturn', label: 'stats.totalReturn', format: 'percent', colorize: true },
  { key: 'varDaily5', label: 'stats.varDaily5', format: 'percent', colorize: true },
  { key: 'cvarDaily5', label: 'stats.cvarDaily5', format: 'percent', colorize: true },
  { key: 'swr10y', label: 'stats.swr10y', format: 'percent', colorize: true },
  { key: 'pwr10y', label: 'stats.pwr10y', format: 'percent', colorize: true },
  { key: 'swr30y', label: 'stats.swr30y', format: 'percent', colorize: true },
  { key: 'pwr30y', label: 'stats.pwr30y', format: 'percent', colorize: true },
];

const METRIC_LOOKUP = new Map(
  [...DEFAULT_COLUMNS, ...EXTENDED_COLUMNS, ...EXTRA_METRICS].map((c) => [c.key, c]),
);

const METRIC_FMT: Record<StatFormat, StatRow['fmt']> = {
  currency: 'num',
  percent: 'pct',
  duration: 'duration',
  number: 'num',
  text: 'num',
};
export function rowsFromMeta(keys: readonly (keyof Statistics)[]): StatRow[] {
  return keys.map((key) => {
    const col = METRIC_LOOKUP.get(key);
    if (!col) throw new Error(`Unknown metric key: ${key}`);
    return { key, label: col.label, fmt: METRIC_FMT[col.format], colorize: col.colorize };
  });
}
