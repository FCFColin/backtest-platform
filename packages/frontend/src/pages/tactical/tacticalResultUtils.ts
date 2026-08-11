import { fmtPct, fmtRatio } from '@/utils/format';
import type { PortfolioResult } from '@backtest/shared';
import type { WhatIfResult } from '@backtest/shared/types/tactical';
import type { TFunction } from 'i18next';
export interface StatRow {
  metric: string;
  tactical: string;
  benchmark: string;
  _sortTactical: number;
}
function fmtPrice(v: number): string {
  return v > 0 ? `$${v.toFixed(2)}` : '\u2014';
}
function buildGrowthData(
  portfolio: PortfolioResult,
  benchmark: PortfolioResult,
): Array<Record<string, number | string>> {
  const dateMap = new Map<string, Record<string, number | string>>();
  for (const pt of portfolio.growthCurve) {
    if (!dateMap.has(pt.date)) dateMap.set(pt.date, { date: pt.date });
    dateMap.get(pt.date)!['tactical'] = pt.value;
  }
  for (const pt of benchmark.growthCurve) {
    if (!dateMap.has(pt.date)) dateMap.set(pt.date, { date: pt.date });
    dateMap.get(pt.date)!['benchmark'] = pt.value;
  }
  return Array.from(dateMap.values()).sort((a, b) =>
    (a.date as string).localeCompare(b.date as string),
  );
}
function buildStatRows(
  portfolio: PortfolioResult,
  benchmark: PortfolioResult,
  t: TFunction,
): StatRow[] {
  const metrics: Array<{
    key: keyof typeof portfolio.statistics;
    label: string;
    fmt: 'pct' | 'ratio';
  }> = [
    { key: 'cagr', label: 'stats.cagr', fmt: 'pct' },
    { key: 'totalReturn', label: 'stats.totalReturn', fmt: 'pct' },
    { key: 'stdev', label: 'backtest.stdev', fmt: 'pct' },
    { key: 'sharpe', label: 'backtest.sharpeRatio', fmt: 'ratio' },
    { key: 'maxDrawdown', label: 'Max Drawdown', fmt: 'pct' },
    { key: 'calmar', label: 'lumpSumDca.stats.calmar', fmt: 'ratio' },
    { key: 'pctPositiveDays', label: 'tactical.results.pctPositiveDays', fmt: 'pct' },
    { key: 'maxDailyReturn', label: 'tactical.results.maxDailyReturn', fmt: 'pct' },
    { key: 'minDailyReturn', label: 'tactical.results.minDailyReturn', fmt: 'pct' },
  ];
  return metrics.map((m) => ({
    metric: t(m.label),
    tactical:
      m.fmt === 'pct'
        ? fmtPct(portfolio.statistics[m.key] as number | undefined)
        : fmtRatio(portfolio.statistics[m.key] as number | undefined),
    benchmark:
      m.fmt === 'pct'
        ? fmtPct(benchmark.statistics[m.key] as number | undefined)
        : fmtRatio(benchmark.statistics[m.key] as number | undefined),
    _sortTactical: (portfolio.statistics[m.key] as number | undefined) ?? 0,
  }));
}
function whatIfSignalColor(t: WhatIfResult['signalType']): string {
  if (t === 'buy') return 'var(--success)';
  if (t === 'sell') return 'var(--danger)';
  return 'var(--text-muted)';
}
function whatIfSignalLabel(t: WhatIfResult['signalType'], tfn: TFunction): string {
  if (t === 'buy') return tfn('Buy');
  if (t === 'sell') return tfn('Sell');
  return tfn('tactical.results.hold');
}
export { fmtPrice, buildGrowthData, buildStatRows, whatIfSignalColor, whatIfSignalLabel };
