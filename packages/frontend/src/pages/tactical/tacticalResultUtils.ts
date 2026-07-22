import { fmtPct, fmtRatio } from '@/utils/format';
import type { PortfolioResult } from '@backtest/shared';
import type { WhatIfResult } from '@backtest/shared/types/tactical';
import type { TFunction } from 'i18next';

/**
 * 统计指标对比行（tactical 策略 vs benchmark 等权基准）。
 * `_sortTactical` 为排序用数值，不直接展示。
 */
export interface StatRow {
  metric: string;
  tactical: string;
  benchmark: string;
  _sortTactical: number;
}

/**
 * 格式化价格为 `$x.xx`，非正数显示占位符。
 * @param v 价格数值
 * @returns 形如 `$123.45` 的字符串，`v <= 0` 时返回 em dash
 */
function fmtPrice(v: number): string {
  return v > 0 ? `$${v.toFixed(2)}` : '\u2014';
}

/**
 * 合并 portfolio 与 benchmark 的增长曲线为 recharts 可消费的数据序列，
 * 缺失方在该日期缺省对应字段。
 * @param portfolio 战术策略曲线
 * @param benchmark 等权基准曲线
 * @returns 按日期升序的记录数组
 */
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

/**
 * 基于 portfolio/benchmark 统计指标构造对比行，指标标签走 i18n。
 * @param portfolio 战术策略统计
 * @param benchmark 等权基准统计
 * @param t i18n 翻译函数
 * @returns 指标对比行数组
 */
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
    { key: 'cagr', label: 'tactical.results.cagr', fmt: 'pct' },
    { key: 'totalReturn', label: 'tactical.results.totalReturn', fmt: 'pct' },
    { key: 'stdev', label: 'tactical.results.stdev', fmt: 'pct' },
    { key: 'sharpe', label: 'tactical.results.sharpe', fmt: 'ratio' },
    { key: 'maxDrawdown', label: 'tactical.results.maxDrawdown', fmt: 'pct' },
    { key: 'calmar', label: 'tactical.results.calmar', fmt: 'ratio' },
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

/**
 * WhatIf 信号类型对应的展示色（CSS 变量）。
 * @param t 信号类型
 * @returns 颜色 CSS 变量字符串
 */
function whatIfSignalColor(t: WhatIfResult['signalType']): string {
  if (t === 'buy') return 'var(--success)';
  if (t === 'sell') return 'var(--danger)';
  return 'var(--text-muted)';
}

/**
 * WhatIf 信号类型对应的 i18n 标签。
 * @param t 信号类型
 * @param tfn i18n 翻译函数
 * @returns 本地化信号文案
 */
function whatIfSignalLabel(t: WhatIfResult['signalType'], tfn: TFunction): string {
  if (t === 'buy') return tfn('tactical.results.buy');
  if (t === 'sell') return tfn('tactical.results.sell');
  return tfn('tactical.results.hold');
}

export { fmtPrice, buildGrowthData, buildStatRows, whatIfSignalColor, whatIfSignalLabel };
