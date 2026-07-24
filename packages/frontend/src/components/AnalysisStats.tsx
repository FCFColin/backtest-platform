import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { CHART_COLORS } from '@backtest/shared';
import type { Statistics } from '@backtest/shared';
import type { AssetAnalysisResult } from '@backtest/shared';
import { fmtPct } from '@/utils/format';

const STATS_COLUMNS: {
  key: keyof Statistics;
  labelKey: string;
  fmt: 'pct' | 'ratio' | 'duration';
}[] = [
  { key: 'cagr', labelKey: 'CAGR', fmt: 'pct' },
  { key: 'maxDrawdown', labelKey: 'backtest.maxDrawdown', fmt: 'pct' },
  { key: 'avgDrawdown', labelKey: 'analysis.avgDrawdown', fmt: 'pct' },
  { key: 'maxDrawdownDuration', labelKey: 'analysis.maxDrawdownDuration', fmt: 'duration' },
  { key: 'stdev', labelKey: 'backtest.stdev', fmt: 'pct' },
  { key: 'sharpe', labelKey: 'backtest.sharpeRatio', fmt: 'ratio' },
  { key: 'sortino', labelKey: 'Sortino', fmt: 'ratio' },
  { key: 'calmar', labelKey: 'Calmar', fmt: 'ratio' },
  { key: 'ulcerIndex', labelKey: 'analysis.ulcerIndex', fmt: 'ratio' },
  { key: 'ulcerPerformanceIndex', labelKey: 'UPI', fmt: 'ratio' },
  { key: 'beta', labelKey: 'Beta', fmt: 'ratio' },
];

/**
 * 统计表表头：metrics 列 + 各 ticker 列（带颜色圆点）。
 * @param tickers - 资产分析结果的 tickers
 * @param metricLabel - metrics 列标题
 * @returns 渲染的 thead
 */
function StatsTableHeader({
  tickers,
  metricLabel,
}: {
  tickers: AssetAnalysisResult['tickers'];
  metricLabel: string;
}) {
  return (
    <thead>
      <tr className="bg-elevated">
        <th className="py-2 px-3 text-left text-caption font-semibold uppercase tracking-wide text-fg-tertiary border-b border-border-subtle">
          {metricLabel}
        </th>
        {tickers.map((tk, idx) => (
          <th
            key={tk.ticker}
            className="py-2 px-3 text-right text-caption font-semibold uppercase tracking-wide text-fg-tertiary border-b border-border-subtle whitespace-nowrap"
          >
            <span
              className="mr-1.5 inline-block size-2.5 rounded-full align-middle"
              style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
            />
            {tk.ticker}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/**
 * 资产分析统计表。
 *
 * 行为各统计指标，列为各 ticker；数值列使用等宽 tabular-nums 对齐。
 * 外层 Card 由调用方（OverviewCharts 的 ChartCard）提供。
 * @param props - tickers: 资产分析结果的 tickers
 * @returns 渲染的统计表
 */
export const StatsTable = memo(function StatsTable({
  tickers,
}: {
  tickers: AssetAnalysisResult['tickers'];
}) {
  const { t } = useTranslation();
  const cols = STATS_COLUMNS.map((c) => ({
    ...c,
    label: c.labelKey.includes('.') ? t(c.labelKey) : c.labelKey,
  }));
  const fmt = (v: number | undefined, f: 'pct' | 'ratio' | 'duration') => {
    if (v === undefined || v === null) return '—';
    if (f === 'pct') return fmtPct(v);
    if (f === 'ratio') return v.toFixed(2);
    return `${v} ${t('common.days')}`;
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-body">
        <StatsTableHeader tickers={tickers} metricLabel={t('common.metric')} />
        <tbody>
          {cols.map((col, ri) => {
            if (!tickers.some((tk) => tk.statistics[col.key] != null)) return null;
            return (
              <tr
                key={col.key}
                className={ri % 2 === 1 ? 'bg-elevated' : 'bg-transparent'}
              >
                <td className="py-2 px-3 text-fg-secondary border-b border-border-subtle">
                  {col.label}
                </td>
                {tickers.map((tk) => (
                  <td
                    key={tk.ticker}
                    className="py-2 px-3 text-right font-mono tabular-nums font-medium text-fg border-b border-border-subtle whitespace-nowrap"
                  >
                    {fmt(tk.statistics[col.key] as number | undefined, col.fmt)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
