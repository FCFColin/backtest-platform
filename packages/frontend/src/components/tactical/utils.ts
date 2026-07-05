/**
 * @file Tactical page utility functions and formatters
 */
import type { PortfolioResult, Statistics } from '@backtest/shared/types';
import type { TradingSignal } from '@backtest/shared/types/tactical';
import type { StatRow } from './types.js';

export function fmtPct(v: number | undefined | null): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(2)}%`;
}

export function fmtRatio(v: number | undefined | null): string {
  if (v == null) return '—';
  return v.toFixed(2);
}

export function fmtPrice(v: number): string {
  return v > 0 ? `$${v.toFixed(2)}` : '—';
}

export function buildGrowthData(
  portfolio: PortfolioResult,
  benchmark: PortfolioResult,
): Array<Record<string, number | string>> {
  const dateMap = new Map<string, Record<string, number | string>>();
  for (const pt of portfolio.growthCurve) {
    if (!dateMap.has(pt.date)) dateMap.set(pt.date, { date: pt.date });
    dateMap.get(pt.date)!['战术分配'] = pt.value;
  }
  for (const pt of benchmark.growthCurve) {
    if (!dateMap.has(pt.date)) dateMap.set(pt.date, { date: pt.date });
    dateMap.get(pt.date)!['等权基准'] = pt.value;
  }
  return Array.from(dateMap.values()).sort((a, b) =>
    (a.date as string).localeCompare(b.date as string),
  );
}

export function buildStatRows(portfolio: PortfolioResult, benchmark: PortfolioResult): StatRow[] {
  const metrics: Array<{ key: keyof Statistics; label: string; fmt: 'pct' | 'ratio' }> = [
    { key: 'cagr', label: '年化收益率 (CAGR)', fmt: 'pct' },
    { key: 'totalReturn', label: '累计收益', fmt: 'pct' },
    { key: 'stdev', label: '年化波动率', fmt: 'pct' },
    { key: 'sharpe', label: '夏普比率', fmt: 'ratio' },
    { key: 'maxDrawdown', label: '最大回撤', fmt: 'pct' },
    { key: 'calmar', label: '卡尔玛比率', fmt: 'ratio' },
    { key: 'pctPositiveDays', label: '正收益日占比', fmt: 'pct' },
    { key: 'maxDailyReturn', label: '最大日收益', fmt: 'pct' },
    { key: 'minDailyReturn', label: '最大日亏损', fmt: 'pct' },
  ];
  return metrics.map((m) => ({
    metric: m.label,
    tactical:
      m.fmt === 'pct' ? fmtPct(portfolio.statistics[m.key]) : fmtRatio(portfolio.statistics[m.key]),
    benchmark:
      m.fmt === 'pct' ? fmtPct(benchmark.statistics[m.key]) : fmtRatio(benchmark.statistics[m.key]),
    _sortTactical: portfolio.statistics[m.key] ?? 0,
  }));
}

export function validateStrategy(signals: TradingSignal[]): string | null {
  for (const sig of signals) {
    if (sig.conditions.length === 0) return `信号「${sig.name}」缺少触发条件`;
    const validWeights = sig.targetWeights.filter((w) => w.ticker && w.weight > 0);
    if (validWeights.length === 0) return `信号「${sig.name}」缺少有效目标权重`;
  }
  return null;
}
