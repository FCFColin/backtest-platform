import { memo, useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetAnalysisResult, PortfolioResult } from '@backtest/shared';
import { TRADING_DAYS_PER_YEAR } from '@backtest/shared/constants';
import { Spinner } from '@/components/ui/uiComponents';
import { TimeSeriesLineChart } from './TimeSeriesLineChart.js';
import { useChartCalcWorker, type WorkerTask } from '../../hooks/miscHooks.js';
import {
  mergePortfolioSeries,
  downsample,
  DOWNSAMPLE_THRESHOLD,
  DOWNSAMPLE_TARGET,
} from '../../utils/format.js';
import ChartCard from '../ChartCard.js';
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
        <div className="chart-card-title mb-0">{t('Rolling Correlation')}</div>
        <div className="flex items-center gap-2">
          <select
            className="bg-input-bg text-fg border border-border-subtle rounded font-medium cursor-pointer"
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
            className="bg-input-bg text-fg border border-border-subtle rounded font-medium cursor-pointer"
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
        tooltipValueFormatter={(v) => [v.toFixed(3), t('Correlation')]}
        tooltipLabelFormatter={(label) => `${t('Date')}: ${label}`}
        yDomain={[-1, 1]}
        referenceY={0}
        showLegend={false}
      />
    </div>
  );
});
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
  selected: string;
  onChange: (v: string) => void;
  t: (k: string) => string;
}) {
  return (
    <select
      className="bg-input-bg text-fg border border-border-subtle rounded font-medium cursor-pointer"
      style={{ width: 150, fontSize: 12, padding: '4px 8px' }}
      value={selected}
      onChange={(e) => onChange(e.target.value)}
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
  metric: string;
  t: (k: string) => string;
}) {
  const seriesTickers = metric !== 'excess' ? results.tickers : results.tickers.slice(1);
  return (
    <TimeSeriesLineChart
      data={chartData}
      series={seriesTickers.map((tk) => tk.ticker)}
      height={400}
      defaultStrokeWidth={1.5}
      yTickFormatter={isPct ? (v) => `${v.toFixed(0)}%` : (v) => v.toFixed(1)}
      tooltipValueFormatter={(v) => [isPct ? `${v.toFixed(2)}%` : v.toFixed(3), '']}
      tooltipLabelFormatter={(label) => `${t('Date')}: ${label}`}
      referenceY={
        metric === 'excess' || metric === 'skewness' || metric === 'kurtosis' ? 0 : undefined
      }
      colorOffset={metric === 'excess' ? 1 : 0}
    />
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
  const [metric, setMetric] = useState('cagr');
  const windowDays = Math.round((rollingWindow * TRADING_DAYS_PER_YEAR) / 12);
  const task = useMemo<WorkerTask | null>(
    () => ({
      type: 'buildRollingChartData',
      payload: [
        results.tickers.map((tk) => ({
          ticker: tk.ticker,
          dailyReturns: tk.dailyReturns,
          growthCurve: tk.growthCurve,
        })),
        metric,
        windowDays,
      ],
    }),
    [results, metric, windowDays],
  );
  const { data: chartData, isPending } =
    useChartCalcWorker<Array<Record<string, number | string>>>(task);
  const prevDataRef = useRef(chartData);
  if (chartData !== null) prevDataRef.current = chartData;
  const displayData = chartData ?? prevDataRef.current;
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
        {isPending && <Spinner size={4} />}
      </div>
      {displayData ? (
        <RollingLineChart
          chartData={displayData}
          isPct={isPct}
          results={results}
          metric={metric}
          t={t}
        />
      ) : (
        <div className="flex items-center justify-center h-[400px] text-fg-tertiary text-caption">
          {t('Loading...')}
        </div>
      )}
    </div>
  );
});
interface RollingReturnChartProps {
  portfolios: PortfolioResult[];
}
export default function RollingReturnChart({ portfolios }: RollingReturnChartProps) {
  const { t } = useTranslation();
  const mergedData = mergePortfolioSeries(
    portfolios,
    (p) => p.rollingReturns,
    (pt) => pt.date,
    (pt) => +(pt.return * 100).toFixed(2),
  );
  const chartData =
    mergedData.length > DOWNSAMPLE_THRESHOLD
      ? downsample(mergedData, DOWNSAMPLE_TARGET)
      : mergedData;
  return (
    <ChartCard title={t('Rolling Return')} data={mergedData} csvFilename="rolling-return">
      <TimeSeriesLineChart
        data={chartData}
        series={portfolios.map((p) => p.name)}
        height={300}
        defaultStrokeWidth={1.5}
        yTickFormatter={(v) => `${v.toFixed(0)}%`}
        tooltipValueFormatter={(v) => [`${v.toFixed(2)}%`, '']}
        tooltipLabelFormatter={(label) => t('Date: {{label}}', { label })}
        showBrush
      />
    </ChartCard>
  );
}
