import { useState, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import type { AssetAnalysisResult } from '@backtest/shared';
import { TRADING_DAYS_PER_YEAR } from '@backtest/shared/constants';
import {
  tooltipStyle,
  computeRollingMetric,
  computeRollingExcessReturn,
  type RollingMetricKey,
} from './analysisChartUtils.js';

const ROLLING_METRICS = [
  { key: 'cagr' as const, labelKey: 'analysis.rollingCAGR' },
  { key: 'volatility' as const, labelKey: 'analysis.rollingVolatility' },
  { key: 'excess' as const, labelKey: 'analysis.rollingExcess' },
  { key: 'skewness' as const, labelKey: 'analysis.rollingSkewness' },
  { key: 'kurtosis' as const, labelKey: 'analysis.rollingKurtosis' },
  { key: 'kelly' as const, labelKey: 'analysis.rollingKelly' },
];

function RollingMetricSelector({
  metrics,
  selected,
  onChange,
  t,
}: {
  metrics: typeof ROLLING_METRICS;
  selected: RollingMetricKey;
  onChange: (v: RollingMetricKey) => void;
  t: (k: string) => string;
}) {
  return (
    <select
      className="param-input"
      style={{ width: 150, fontSize: 12, padding: '4px 8px' }}
      value={selected}
      onChange={(e) => onChange(e.target.value as RollingMetricKey)}
    >
      {metrics.map((m) => (
        <option key={m.key} value={m.key}>
          {t(m.labelKey)}
        </option>
      ))}
    </select>
  );
}

function RollingLineChart({
  chartData,
  isPct,
  results,
  metric,
  t,
}: {
  chartData: Array<Record<string, number | string>>;
  isPct: boolean;
  results: AssetAnalysisResult;
  metric: RollingMetricKey;
  t: (k: string) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
        <XAxis
          dataKey="date"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          tickFormatter={(v: string) => v.slice(0, 7)}
        />
        <YAxis
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          tickFormatter={isPct ? (v: number) => `${v.toFixed(0)}%` : (v: number) => v.toFixed(1)}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(label: string) => `${t('common.date')}: ${label}`}
          formatter={(value: number) => [isPct ? `${value.toFixed(2)}%` : value.toFixed(3), '']}
        />
        <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
        {(metric !== 'excess' ? results.tickers : results.tickers.slice(1)).map((tk, idx) => (
          <Line
            key={tk.ticker}
            type="monotone"
            dataKey={tk.ticker}
            stroke={CHART_COLORS[(metric === 'excess' ? idx + 1 : idx) % CHART_COLORS.length]}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3 }}
          />
        ))}
        {(metric === 'excess' || metric === 'skewness' || metric === 'kurtosis') && (
          <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="4 4" />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

export const RollingMetricsChart = memo(function RollingMetricsChart({
  results,
  rollingWindow,
}: {
  results: AssetAnalysisResult;
  rollingWindow: number;
}) {
  const { t } = useTranslation();
  const metrics = ROLLING_METRICS.map((m) => ({ ...m, label: t(m.labelKey) }));
  const [metric, setMetric] = useState<RollingMetricKey>('cagr');
  const windowDays = Math.round((rollingWindow * TRADING_DAYS_PER_YEAR) / 12);
  const chartData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number | string>>();
    for (let i = 0; i < results.tickers.length; i++) {
      const tk = results.tickers[i];
      const dates = tk.growthCurve.map((g) => g.date).slice(1);
      const rollingData =
        metric === 'excess'
          ? i === 0
            ? []
            : computeRollingExcessReturn(
                tk.dailyReturns,
                results.tickers[0].dailyReturns,
                dates,
                windowDays,
              )
          : computeRollingMetric(tk.dailyReturns, dates, windowDays, metric);
      for (const point of rollingData) {
        if (!dateMap.has(point.date)) dateMap.set(point.date, { date: point.date });
        dateMap.get(point.date)![tk.ticker] =
          metric === 'cagr' || metric === 'volatility' || metric === 'excess'
            ? +(point.value * 100).toFixed(2)
            : +point.value.toFixed(3);
      }
    }
    return Array.from(dateMap.values()).sort((a, b) =>
      (a.date as string).localeCompare(b.date as string),
    );
  }, [results, metric, windowDays]);
  const isPct = metric === 'cagr' || metric === 'volatility' || metric === 'excess';

  return (
    <div className="chart-card">
      <div className="flex items-center gap-4 mb-3">
        <div className="chart-card-title mb-0">{metrics.find((m) => m.key === metric)?.label}</div>
        <RollingMetricSelector
          metrics={ROLLING_METRICS}
          selected={metric}
          onChange={setMetric}
          t={t}
        />
      </div>
      <RollingLineChart
        chartData={chartData}
        isPct={isPct}
        results={results}
        metric={metric}
        t={t}
      />
    </div>
  );
});
