import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/uiComponents';
import { CHART_COLORS } from '@backtest/shared';
import type { MonteCarloResult } from '@backtest/shared';
import { AXIS_TICK_STYLE, CHART_GRID_PROPS, CHART_TOOLTIP_STYLE } from '@/lib/chart-theme.js';
import { cn } from '@/lib/utils';
import {
  METRIC_FORMAT,
  buildDistHistogram,
  buildScenarioData,
  dollarFormatter,
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
  medianLabel,
  meanLabel,
  medianVal,
  meanVal,
  distMetric,
}: {
  data: { range: string; count: number }[];
  medianLabel: string;
  meanLabel: string;
  medianVal?: number;
  meanVal?: number;
  distMetric: DistMetric;
}) {
  const { t } = useTranslation();
  if (data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data}>
        <CartesianGrid {...CHART_GRID_PROPS} stroke="hsl(var(--border-subtle))" />
        <XAxis
          dataKey="range"
          tick={{ fill: 'hsl(var(--fg-tertiary))', fontSize: 10 }}
          interval={3}
        />
        <YAxis tick={AXIS_TICK_STYLE} />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Bar
          dataKey="count"
          fill={CHART_COLORS[0]}
          fillOpacity={0.7}
          name={t('monteCarlo.results.frequency')}
          radius={[2, 2, 0, 0]}
        />
        <ReferenceLine
          x={medianLabel}
          stroke={CHART_COLORS[2]}
          strokeDasharray="4 2"
          label={{
            value: t('monteCarlo.results.medianLabel', {
              value: medianVal !== undefined ? METRIC_FORMAT[distMetric](medianVal) : '',
            }),
            position: 'top',
            fontSize: 11,
            fill: CHART_COLORS[2],
          }}
        />
        <ReferenceLine
          x={meanLabel}
          stroke={CHART_COLORS[1]}
          strokeDasharray="4 2"
          label={{
            value: t('monteCarlo.results.meanLabel', {
              value: meanVal !== undefined ? METRIC_FORMAT[distMetric](meanVal) : '',
            }),
            position: 'top',
            fontSize: 11,
            fill: CHART_COLORS[1],
          }}
        />
      </BarChart>
    </ResponsiveContainer>
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
  const { t } = useTranslation();
  if (!r.perPathMetrics || r.perPathMetrics.length === 0) {
    return (
      <Card className="p-5">
        <div className="py-6 text-center text-caption text-fg-tertiary">
          {t('monteCarlo.results.noData')}
        </div>
      </Card>
    );
  }
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
function ScenarioLines({ isAnimationActive = true }: { isAnimationActive?: boolean }) {
  return (
    <>
      <Line
        type="monotone"
        dataKey="best"
        stroke={CHART_COLORS[2]}
        strokeWidth={2}
        dot={false}
        name="Best"
        isAnimationActive={isAnimationActive}
      />
      <Line
        type="monotone"
        dataKey="p75"
        stroke={CHART_COLORS[0]}
        strokeWidth={1.5}
        dot={false}
        name="P75"
        isAnimationActive={isAnimationActive}
      />
      <Line
        type="monotone"
        dataKey="median"
        stroke={CHART_COLORS[4]}
        strokeWidth={2.5}
        dot={false}
        name="Median"
        isAnimationActive={isAnimationActive}
      />
      <Line
        type="monotone"
        dataKey="p25"
        stroke={CHART_COLORS[1]}
        strokeWidth={1.5}
        dot={false}
        name="P25"
        isAnimationActive={isAnimationActive}
      />
      <Line
        type="monotone"
        dataKey="worst"
        stroke={CHART_COLORS[3]}
        strokeWidth={2}
        dot={false}
        name="Worst"
        isAnimationActive={isAnimationActive}
      />
    </>
  );
}
export function MonteCarloScenariosTab({
  r,
  startingValue,
}: {
  r: MonteCarloResult;
  startingValue: number;
}) {
  const { t } = useTranslation();
  const { data } = buildScenarioData(r, startingValue);
  if (data.length === 0) {
    return (
      <Card className="p-5">
        <div className="py-6 text-center text-caption text-fg-tertiary">
          {t('monteCarlo.results.noData')}
        </div>
      </Card>
    );
  }
  const isLargeDataset = data.length >= 100;
  return (
    <Card className="p-5">
      <ResponsiveContainer width="100%" height={450}>
        <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="hsl(var(--border-subtle))" />
          <XAxis
            dataKey="month"
            tick={AXIS_TICK_STYLE}
            tickFormatter={monthFormatter}
            interval={11}
          />
          <YAxis tick={AXIS_TICK_STYLE} tickFormatter={dollarKFormatter} />
          <Tooltip
            formatter={dollarFormatter}
            labelFormatter={(l: number) => yearLabelFormatter(t, l)}
            contentStyle={CHART_TOOLTIP_STYLE}
            isAnimationActive={!isLargeDataset}
            animationDuration={isLargeDataset ? 0 : 150}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: 'hsl(var(--fg-tertiary))' }} />
          <ScenarioLines isAnimationActive={!isLargeDataset} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
