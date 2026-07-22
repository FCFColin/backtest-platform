import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { TimeSeriesLineChart } from './TimeSeriesLineChart.js';

export const RollingCorrelationChart = memo(function RollingCorrelationChart({
  tickers,
  rollingPair,
  setRollingPair,
  rollingCorrData,
}: {
  tickers: string[];
  rollingPair: [number, number];
  setRollingPair: (pair: [number, number]) => void;
  rollingCorrData: Array<{ date: string; value: number }>;
}) {
  const { t } = useTranslation();
  const seriesName = `${tickers[rollingPair[0]]} vs ${tickers[rollingPair[1]]}`;
  const data = rollingCorrData.map((d) => ({
    date: d.date,
    [seriesName]: +d.value.toFixed(3),
  }));
  return (
    <div className="chart-card">
      <div className="flex items-center gap-4 mb-3">
        <div className="chart-card-title mb-0">{t('analysis.rollingCorrelation')}</div>
        <div className="flex items-center gap-2">
          <select
            className="param-input"
            style={{ width: 100, fontSize: 12, padding: '4px 8px' }}
            value={rollingPair[0]}
            onChange={(e) => setRollingPair([Number(e.target.value), rollingPair[1]])}
          >
            {tickers.map((tk, i) => (
              <option key={tk} value={i}>
                {tk}
              </option>
            ))}
          </select>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>vs</span>
          <select
            className="param-input"
            style={{ width: 100, fontSize: 12, padding: '4px 8px' }}
            value={rollingPair[1]}
            onChange={(e) => setRollingPair([rollingPair[0], Number(e.target.value)])}
          >
            {tickers.map((tk, i) => (
              <option key={tk} value={i}>
                {tk}
              </option>
            ))}
          </select>
        </div>
      </div>
      <TimeSeriesLineChart
        data={data}
        series={[seriesName]}
        height={300}
        defaultStrokeWidth={1.5}
        tooltipValueFormatter={(v) => [v.toFixed(3), t('analysis.correlation')]}
        tooltipLabelFormatter={(label) => `${t('common.date')}: ${label}`}
        yDomain={[-1, 1]}
        referenceY={0}
        showLegend={false}
      />
    </div>
  );
});
