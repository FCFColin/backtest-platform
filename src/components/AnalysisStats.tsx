import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { CHART_COLORS } from '../../shared/types';
import type { Statistics } from '../../shared/types';
import type { AssetAnalysisResult } from '../../shared/types';

export const StatsTable = memo(function StatsTable({
  tickers,
}: {
  tickers: AssetAnalysisResult['tickers'];
}) {
  const { t } = useTranslation();
  const cols: { key: keyof Statistics; label: string; fmt: 'pct' | 'ratio' | 'duration' }[] = [
    { key: 'cagr', label: 'CAGR', fmt: 'pct' },
    { key: 'maxDrawdown', label: t('backtest.maxDrawdown'), fmt: 'pct' },
    { key: 'avgDrawdown', label: t('analysis.avgDrawdown'), fmt: 'pct' },
    { key: 'maxDrawdownDuration', label: t('analysis.maxDrawdownDuration'), fmt: 'duration' },
    { key: 'stdev', label: t('backtest.stdev'), fmt: 'pct' },
    { key: 'sharpe', label: t('backtest.sharpeRatio'), fmt: 'ratio' },
    { key: 'sortino', label: 'Sortino', fmt: 'ratio' },
    { key: 'calmar', label: 'Calmar', fmt: 'ratio' },
    { key: 'ulcerIndex', label: t('analysis.ulcerIndex'), fmt: 'ratio' },
    { key: 'ulcerPerformanceIndex', label: 'UPI', fmt: 'ratio' },
    { key: 'beta', label: 'Beta', fmt: 'ratio' },
  ];
  const fmt = (v: number | undefined, f: 'pct' | 'ratio' | 'duration') => {
    if (v === undefined || v === null) return '—';
    if (f === 'pct') return `${(v * 100).toFixed(2)}%`;
    if (f === 'ratio') return v.toFixed(2);
    return `${v} ${t('common.days')}`;
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
            <th
              className="text-[12px] font-semibold text-left py-2 px-3"
              style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}
            >
              {t('common.metric')}
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
