import { useState, useMemo, memo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetAnalysisResult } from '@backtest/shared';
import { TRADING_DAYS_PER_YEAR } from '@backtest/shared/constants';
import { TimeSeriesLineChart } from './TimeSeriesLineChart.js';
import { useChartCalcWorker, type WorkerTask } from '../../hooks/useWorkerCompute.js';
const ROLLING_METRICS = [
  { key: 'cagr' as const, labelKey: 'analysis.rollingCAGR' },
  { key: 'volatility' as const, labelKey: 'analysis.rollingVolatility' },
  { key: 'excess' as const, labelKey: 'analysis.rollingExcess' },
  { key: 'skewness' as const, labelKey: 'analysis.rollingSkewness' },
  { key: 'kurtosis' as const, labelKey: 'analysis.rollingKurtosis' },
  { key: 'kelly' as const, labelKey: 'analysis.rollingKelly' }
];
function RollingMetricSelector({ metrics, selected, onChange, t }: { metrics: typeof ROLLING_METRICS; selected: string; onChange: (v: string) => void; t: (k: string) => string }) {
  return (
    <select className="bg-input-bg text-fg border border-border-subtle rounded font-medium cursor-pointer" style={{ width: 150, fontSize: 12, padding: '4px 8px' }} value={selected} onChange={(e) => onChange(e.target.value)}>
      {metrics.map((m) => (
        <option key={m.key} value={m.key}>
          {t(m.labelKey)}
        </option>
      ))}
    </select>
  );
}
function RollingLineChart({ chartData, isPct, results, metric, t }: { chartData: Array<Record<string, number | string>>; isPct: boolean; results: AssetAnalysisResult; metric: string; t: (k: string) => string }) {
  const seriesTickers = metric !== 'excess' ? results.tickers : results.tickers.slice(1);
  return <TimeSeriesLineChart data={chartData} series={seriesTickers.map((tk) => tk.ticker)} height={400} defaultStrokeWidth={1.5} yTickFormatter={isPct ? (v) => `${v.toFixed(0)}%` : (v) => v.toFixed(1)} tooltipValueFormatter={(v) => [isPct ? `${v.toFixed(2)}%` : v.toFixed(3), '']} tooltipLabelFormatter={(label) => `${t('common.date')}: ${label}`} referenceY={metric === 'excess' || metric === 'skewness' || metric === 'kurtosis' ? 0 : undefined} colorOffset={metric === 'excess' ? 1 : 0} />;
}
export const RollingMetricsChart = memo(function RollingMetricsChart({ results, rollingWindow }: { results: AssetAnalysisResult; rollingWindow: number }) {
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
          growthCurve: tk.growthCurve
        })),
        metric,
        windowDays
      ]
    }),
    [results, metric, windowDays]
  );
  const { data: chartData, isPending } = useChartCalcWorker<Array<Record<string, number | string>>>(task);
  const prevDataRef = useRef(chartData);
  if (chartData !== null) prevDataRef.current = chartData;
  const displayData = chartData ?? prevDataRef.current;
  const isPct = metric === 'cagr' || metric === 'volatility' || metric === 'excess';
  return (
    <div className="chart-card">
      <div className="flex items-center gap-4 mb-3">
        <div className="chart-card-title mb-0">{metrics.find((m) => m.key === metric)?.label}</div>
        <RollingMetricSelector metrics={ROLLING_METRICS} selected={metric} onChange={setMetric} t={t} />
        {isPending && <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent text-fg-tertiary" />}
      </div>
      {displayData ? <RollingLineChart chartData={displayData} isPct={isPct} results={results} metric={metric} t={t} /> : <div className="flex items-center justify-center h-[400px] text-fg-tertiary text-caption">{t('common.loading')}</div>}
    </div>
  );
});
