import { memo, useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetAnalysisResult, PortfolioResult } from '@backtest/shared';
import { TRADING_DAYS_PER_YEAR } from '@backtest/shared/constants';
import { MiniSelect, Spinner } from '@/components/ui/uiComponents';
import { TimeSeriesLineChart } from './TimeSeriesLineChart.js';
import { useChartCalcWorker, type WorkerTask } from '../../hooks/miscHooks.js';
import {
  mergePortfolioSeries,
  downsample,
  DOWNSAMPLE_THRESHOLD,
  DOWNSAMPLE_TARGET,
} from '../../utils/format.js';
import ChartCard from '../ChartCard.js';
import { LoadingState } from '@/components/stateDisplay';
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
    [seriesName]: +d.value.toFixed(4),
  }));
  return (
    <ChartCard
      title={t('Rolling Correlation')}
      headerExtra={
        <div className="flex items-center gap-2">
          <MiniSelect
            value={rollingPair[0]}
            onChange={(v) => setRollingPair([v, rollingPair[1]])}
            options={tickers.map((tk, i) => ({ value: i, label: tk }))}
            width={100}
          />
          <span style={{ color: 'hsl(var(--fg-tertiary))', fontSize: 12 }}>vs</span>
          <MiniSelect
            value={rollingPair[1]}
            onChange={(v) => setRollingPair([rollingPair[0], v])}
            options={tickers.map((tk, i) => ({ value: i, label: tk }))}
            width={100}
          />
        </div>
      }
    >
      <TimeSeriesLineChart
        data={data}
        series={[seriesName]}
        height={300}
        defaultStrokeWidth={1.5}
        tooltipValueFormatter={(v) => [v.toFixed(4), t('Correlation')]}
        tooltipLabelFormatter={(label) => `${t('Date')}: ${label}`}
        yTickFormatter={(v) => v.toFixed(1)}
        yDomain={[-1, 1]}
        referenceY={0}
        showLegend={false}
      />
    </ChartCard>
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
      tooltipValueFormatter={(v) => (isPct ? `${v.toFixed(2)}%` : v.toFixed(3))}
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
    <ChartCard
      title={metrics.find((m) => m.key === metric)?.label}
      headerExtra={
        <>
          <MiniSelect
            value={metric}
            onChange={setMetric}
            options={ROLLING_METRICS.map((m) => ({ value: m.key as string, label: t(m.labelKey) }))}
            width={150}
          />
          {isPending && <Spinner size={4} />}
        </>
      }
    >
      {displayData ? (
        <RollingLineChart
          chartData={displayData}
          isPct={isPct}
          results={results}
          metric={metric}
          t={t}
        />
      ) : (
        <LoadingState label={t('Loading...')} className="h-[400px]" />
      )}
    </ChartCard>
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
        tooltipValueFormatter={(v) => `${v.toFixed(2)}%`}
        tooltipLabelFormatter={(label) => t('Date: {{label}}', { label })}
        showBrush
      />
    </ChartCard>
  );
}
