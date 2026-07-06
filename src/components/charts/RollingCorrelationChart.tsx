import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { CHART_COLORS } from '../../../shared/types';
import { tooltipStyle } from './analysisChartUtils.js';

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
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={rollingCorrData.map((d) => ({ ...d, value: +d.value.toFixed(3) }))}
          margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(0, 7)}
          />
          <YAxis domain={[-1, 1]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(label: string) => `${t('common.date')}: ${label}`}
            formatter={(value: number) => [value.toFixed(3), t('analysis.correlation')]}
          />
          <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="value"
            stroke={CHART_COLORS[0]}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3 }}
            name={`${tickers[rollingPair[0]]} vs ${tickers[rollingPair[1]]}`}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});
