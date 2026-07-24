/**
 * @file 蒙特卡洛结果 - 分布 Tab
 * @description 展示选定指标的频数分布直方图（含中位/均值参考线）
 */
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { CHART_COLORS } from '@backtest/shared';
import type { MonteCarloResult } from '@backtest/shared';
import {
  CHART_TOOLTIP_STYLE,
  CHART_GRID_PROPS,
  AXIS_TICK_STYLE,
} from '@/lib/chart-theme.js';
import { buildDistHistogram, metricLabels, METRIC_FORMAT } from './monteCarloTransforms.js';
import type { DistMetric } from './monteCarloTypes.js';
import { cn } from '@/lib/utils';

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
              : 'border-border bg-input-bg text-fg-secondary hover:bg-hover hover:text-fg'
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

/** 分布 Tab：指标选择器 + 频数直方图 */
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
