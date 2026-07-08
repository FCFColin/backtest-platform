import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { CHART_COLORS } from '@backtest/shared';
import type { Statistics } from '@backtest/shared';
import type { AssetAnalysisResult } from '@backtest/shared';

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

function StatsTableHeader({
  tickers,
  metricLabel,
}: {
  tickers: AssetAnalysisResult['tickers'];
  metricLabel: string;
}) {
  return (
    <thead>
      <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
        <th
          className="text-[12px] font-semibold text-left py-2 px-3"
          style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}
        >
          {metricLabel}
        </th>
        {tickers.map((tk, idx) => (
          <th
            key={tk.ticker}
            className="text-[12px] font-semibold text-right py-2 px-3"
            style={{
              color: 'var(--text-muted)',
              borderBottom: '2px solid var(--border-soft)',
              whiteSpace: 'nowrap',
            }}
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
              style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
            />
            {tk.ticker}
          </th>
        ))}
      </tr>
    </thead>
  );
}

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
    if (f === 'pct') return `${(v * 100).toFixed(2)}%`;
    if (f === 'ratio') return v.toFixed(2);
    return `${v} ${t('common.days')}`;
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <StatsTableHeader tickers={tickers} metricLabel={t('common.metric')} />
        <tbody>
          {cols.map((col, ri) => {
            if (
              !tickers.some(
                (tk) => tk.statistics[col.key] !== undefined && tk.statistics[col.key] !== null,
              )
            )
              return null;
            return (
              <tr
                key={col.key}
                style={{ backgroundColor: ri % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}
              >
                <td
                  className="text-[13px] py-2 px-3"
                  style={{
                    color: 'var(--text-body)',
                    borderBottom: '1px solid var(--border-soft)',
                  }}
                >
                  {col.label}
                </td>
                {tickers.map((tk) => (
                  <td
                    key={tk.ticker}
                    className="text-[13px] font-medium text-right py-2 px-3 font-mono"
                    style={{
                      color: 'var(--text-strong)',
                      borderBottom: '1px solid var(--border-soft)',
                      whiteSpace: 'nowrap',
                    }}
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
