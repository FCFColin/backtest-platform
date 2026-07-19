import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import ChartCard from '../ChartCard.js';

export const BetaMatrixTable = memo(function BetaMatrixTable({
  tickers,
  betaMatrix,
}: {
  tickers: string[];
  betaMatrix: number[][];
}) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('analysis.betaMatrix')}>
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
                  key={tk}
                  className="px-3 py-2 text-[11px] font-medium text-center"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {tk}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickers.map((rowTk, i) => (
              <tr key={rowTk}>
                <td
                  className="px-3 py-2 text-[12px] font-medium"
                  style={{ color: 'var(--text-body)' }}
                >
                  {rowTk}
                </td>
                {tickers.map((colTk, j) => {
                  const val = betaMatrix[i]?.[j] ?? 0;
                  const absVal = Math.abs(val);
                  return (
                    <td
                      key={colTk}
                      className="text-[12px] text-center cursor-default"
                      style={{
                        backgroundColor:
                          absVal > 1.5
                            ? '#f0c8c8'
                            : absVal > 1
                              ? '#f5e0d0'
                              : absVal > 0.5
                                ? '#d8e8f0'
                                : 'var(--bg-subtle)',
                        color: 'var(--text-body)',
                        width: `${Math.max(48, 600 / tickers.length)}px`,
                        height: `${Math.max(36, 400 / tickers.length)}px`,
                      }}
                      title={`${rowTk} vs ${colTk}: Beta = ${val.toFixed(2)}`}
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
    </ChartCard>
  );
});
