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
import { CHART_COLORS } from '@backtest/shared';
import type { MonteCarloResult } from '@backtest/shared';
import {
  CHART_TOOLTIP_STYLE,
  CHART_GRID_PROPS,
  AXIS_TICK_STYLE,
} from '@/components/charts/chartConstants.js';
import { buildDistHistogram, metricLabels, METRIC_FORMAT } from './monteCarloTransforms.js';
import type { DistMetric } from './monteCarloTypes.js';
import { EMPTY_DATA_STYLE } from './monteCarloSharedConstants.js';

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
    <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
      {(Object.keys(labels) as DistMetric[]).map((key) => (
        <button
          key={key}
          onClick={() => setDistMetric(key)}
          style={{
            padding: '4px 12px',
            fontSize: 12,
            fontWeight: 500,
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-control)',
            cursor: 'pointer',
            backgroundColor: distMetric === key ? 'var(--brand)' : 'var(--bg-elevated)',
            color: distMetric === key ? '#fff' : 'var(--text-body)',
            transition: 'all 0.15s',
          }}
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
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
        <XAxis dataKey="range" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} interval={3} />
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
  if (!r.perPathMetrics || r.perPathMetrics.length === 0)
    return <div style={EMPTY_DATA_STYLE}>{t('monteCarlo.results.noData')}</div>;
  const { data, medianLabel, meanLabel, medianVal, meanVal } = buildDistHistogram(
    r.perPathMetrics,
    distMetric,
    startingValue,
  );
  return (
    <div>
      <DistMetricSelector distMetric={distMetric} setDistMetric={setDistMetric} />
      <DistHistogramChart
        data={data}
        medianLabel={medianLabel}
        meanLabel={meanLabel}
        medianVal={medianVal}
        meanVal={meanVal}
        distMetric={distMetric}
      />
    </div>
  );
}
