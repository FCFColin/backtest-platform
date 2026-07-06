import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { getCorrelationColor } from './analysisChartUtils.js';

export const CorrelationMatrixTable = memo(function CorrelationMatrixTable({
  tickers,
  correlations,
}: {
  tickers: Array<{ ticker: string }>;
  correlations: number[][];
}) {
  const { t } = useTranslation();
  return (
    <div className="chart-card">
      <div className="chart-card-title">{t('analysis.correlationMatrix')}</div>
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th
                className="px-3 py-2 text-[11px] font-medium"
                style={{ color: 'var(--text-muted)' }}
              />
              {tickers.map((tk) => (
                <th
                  key={tk.ticker}
                  className="px-3 py-2 text-[11px] font-medium text-center"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {tk.ticker}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickers.map((rowTk, i) => (
              <tr key={rowTk.ticker}>
                <td
                  className="px-3 py-2 text-[12px] font-medium"
                  style={{ color: 'var(--text-body)' }}
                >
                  {rowTk.ticker}
                </td>
                {tickers.map((colTk, j) => {
                  const val = correlations[i]?.[j] ?? 0;
                  return (
                    <td
                      key={colTk.ticker}
                      className="text-[12px] text-center cursor-default"
                      style={{
                        backgroundColor: getCorrelationColor(val),
                        color: Math.abs(val) > 0.5 ? '#fff' : 'var(--text-body)',
                        width: `${Math.max(48, 600 / tickers.length)}px`,
                        height: `${Math.max(36, 400 / tickers.length)}px`,
                      }}
                      title={`${rowTk.ticker} vs ${colTk.ticker}: ${val.toFixed(2)}`}
                    >
                      {val.toFixed(2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});
