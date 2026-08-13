import { useTranslation } from 'react-i18next';
import type { EChartsOption } from 'echarts';
import { Card } from '@/components/ui/uiComponents';
import type { MonteCarloResult } from '@backtest/shared';
import {
  AXIS_TEXT,
  BORDER_SOFT,
  axisTooltipFormatter,
  tooltipOption,
} from '@/components/charts/chartUtils.js';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { cn } from '@/lib/utils';
import { fmtDollar } from '@/utils/format';
import { useChartAnimation } from '@/hooks/miscHooks';
import EChart from '@/components/charts/EChart.js';
import { HistogramChart, NoDataCard } from './HistogramChart.js';
import {
  METRIC_FORMAT,
  buildDistHistogram,
  buildScenarioData,
  dollarKFormatter,
  metricLabels,
  monthFormatter,
  yearLabelFormatter,
} from './monteCarloUtils.js';
import type { DistMetric } from './monteCarloUtils.js';
function DistMetricSelector({
  distMetric,
  setDistMetric,
}: {
  distMetric: DistMetric;
  setDistMetric: (m: DistMetric) => void;
}) {
  const { t } = useTranslation();
  const labels = metricLabels(t);
  return (
    <div className="mb-4 flex flex-wrap gap-1.5">
      {(Object.keys(labels) as DistMetric[]).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => setDistMetric(key)}
          className={cn(
            'rounded-md border px-3 py-1 text-caption font-medium transition-colors duration-150',
            distMetric === key
              ? 'border-brand bg-brand text-brand-fg'
              : 'border-border bg-input-bg text-fg-secondary hover:bg-hover hover:text-fg',
          )}
        >
          {labels[key]}
        </button>
      ))}
    </div>
  );
}
function DistHistogramChart({
  data,
  distMetric,
  medianLabel,
  meanLabel,
  medianVal,
  meanVal,
}: {
  data: { range: string; count: number }[];
  distMetric: DistMetric;
  medianLabel: string;
  meanLabel: string;
  medianVal?: number;
  meanVal?: number;
}) {
  const { t } = useTranslation();
  return (
    <HistogramChart
      data={data}
      referenceLines={[
        {
          label: medianLabel,
          color: getPortfolioColor(2),
          value: t('Median', {
            value: medianVal !== undefined ? METRIC_FORMAT[distMetric](medianVal) : '',
          }),
        },
        {
          label: meanLabel,
          color: getPortfolioColor(1),
          value: t('charts.annualReturn.mean', {
            value: meanVal !== undefined ? METRIC_FORMAT[distMetric](meanVal) : '',
          }),
        },
      ]}
    />
  );
}
export function MonteCarloDistributionsTab({
  r,
  distMetric,
  setDistMetric,
  startingValue,
}: {
  r: MonteCarloResult;
  distMetric: DistMetric;
  setDistMetric: (m: DistMetric) => void;
  startingValue: number;
}) {
  if (!r.perPathMetrics || r.perPathMetrics.length === 0) return <NoDataCard />;
  const { data, medianLabel, meanLabel, medianVal, meanVal } = buildDistHistogram(
    r.perPathMetrics,
    distMetric,
    startingValue,
  );
  return (
    <Card className="p-5">
      <DistMetricSelector distMetric={distMetric} setDistMetric={setDistMetric} />
      <DistHistogramChart
        data={data}
        medianLabel={medianLabel}
        meanLabel={meanLabel}
        medianVal={medianVal}
        meanVal={meanVal}
        distMetric={distMetric}
      />
    </Card>
  );
}
const SCENARIO_LINES: Array<{
  key: 'best' | 'p75' | 'median' | 'p25' | 'worst';
  color: string;
  width: number;
  name: string;
}> = [
  { key: 'best', color: getPortfolioColor(2), width: 2, name: 'Best' },
  { key: 'p75', color: getPortfolioColor(0), width: 1.5, name: 'P75' },
  { key: 'median', color: getPortfolioColor(4), width: 2.5, name: 'Median' },
  { key: 'p25', color: getPortfolioColor(1), width: 1.5, name: 'P25' },
  { key: 'worst', color: getPortfolioColor(3), width: 2, name: 'Worst' },
];
export function MonteCarloScenariosTab({
  r,
  startingValue,
}: {
  r: MonteCarloResult;
  startingValue: number;
}) {
  const { t } = useTranslation();
  const { data } = buildScenarioData(r, startingValue);
  const anim = useChartAnimation(data.length >= 100);
  if (data.length === 0) return <NoDataCard />;
  const option: EChartsOption = {
    grid: { top: 10, right: 30, left: 10, bottom: 20 },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.month),
      axisLabel: {
        ...AXIS_TEXT,
        formatter: (v: string) => monthFormatter(Number(v)),
        interval: 11,
      },
      axisLine: { lineStyle: { color: BORDER_SOFT } },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { ...AXIS_TEXT, formatter: dollarKFormatter },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: BORDER_SOFT, opacity: 0.6 } },
    },
    tooltip: tooltipOption(
      axisTooltipFormatter(
        (label) => yearLabelFormatter(t, Number(label)),
        (v) => fmtDollar(v),
      ),
    ),
    legend: { top: 0, textStyle: { color: 'hsl(var(--fg-tertiary))', fontSize: 12 } },
    series: SCENARIO_LINES.map((l) => ({
      name: l.name,
      type: 'line',
      smooth: true,
      data: data.map((d) => d[l.key]),
      lineStyle: { width: l.width, color: l.color },
      itemStyle: { color: l.color },
      symbol: 'none',
      emphasis: { focus: 'series' },
    })) as EChartsOption['series'],
    animation: anim.isAnimationActive,
  };
  return (
    <Card className="p-5">
      <EChart option={option} height={450} ariaLabel={t('Scenario Paths')} />
    </Card>
  );
}
