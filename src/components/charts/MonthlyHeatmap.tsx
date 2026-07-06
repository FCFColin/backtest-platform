import { useState, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetAnalysisResult } from '../../../shared/types';
import { getHeatColor } from './analysisChartUtils.js';

export const MonthlyHeatmap = memo(function MonthlyHeatmap({
  results,
}: {
  results: AssetAnalysisResult;
}) {
  const { t } = useTranslation();
  const monthLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  const [selectedTicker, setSelectedTicker] = useState(0);
  const heatmapData = useMemo(() => {
    const tk = results.tickers[selectedTicker];
    if (!tk) return [];
    const yearMap = new Map<number, (number | null)[]>();
    for (const mr of tk.monthlyReturns) {
      if (!yearMap.has(mr.year)) yearMap.set(mr.year, Array(12).fill(null));
      yearMap.get(mr.year)![mr.month - 1] = +(mr.return * 100).toFixed(2);
    }
    return Array.from(yearMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, months]) => ({ year, months }));
  }, [results, selectedTicker]);

  return (
    <div className="chart-card">
      <div className="flex items-center gap-4 mb-3">
        <div className="chart-card-title mb-0">{t('analysis.monthlyReturnsHeatmap')}</div>
        <select
          className="param-input"
          style={{ width: 100, fontSize: 12, padding: '4px 8px' }}
          value={selectedTicker}
          onChange={(e) => setSelectedTicker(Number(e.target.value))}
        >
          {results.tickers.map((tk, i) => (
            <option key={tk.ticker} value={i}>
              {tk.ticker}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th
                className="px-2 py-1 text-[11px] font-medium text-left w-10"
                style={{ color: 'var(--text-muted)' }}
              />
              {monthLabels.map((m) => (
                <th
                  key={m}
                  className="px-1 py-1 text-[11px] font-medium text-center min-w-[36px]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heatmapData.map((row) => (
              <tr key={row.year}>
                <td
                  className="px-2 py-0.5 text-[11px] font-medium"
                  style={{ color: 'var(--text-body)' }}
                >
                  {row.year}
                </td>
                {row.months.map((val, mIdx) => (
                  <td
                    key={mIdx}
                    className="px-0.5 py-0.5 text-center cursor-default"
                    style={{ backgroundColor: getHeatColor(val) }}
                    title={`${row.year} ${monthLabels[mIdx]}: ${val !== null ? val.toFixed(2) : '—'}%`}
                  >
                    <span
                      className="text-[10px] inline-block w-[34px] leading-[24px]"
                      style={{
                        color: val !== null && Math.abs(val) > 5 ? '#fff' : 'var(--text-muted)',
                      }}
                    >
                      {val !== null ? val.toFixed(1) : '—'}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});
