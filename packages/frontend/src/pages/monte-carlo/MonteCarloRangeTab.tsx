/**
 * @file 蒙特卡洛结果 - 区间 Tab
 * @description 展示组合价值的百分位区间带（P5-P95 / P25-P75 + 中位线）
 */
import { useTranslation } from 'react-i18next';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Line,
} from 'recharts';
import type { MonteCarloResult } from '@backtest/shared';
import {
  CHART_TOOLTIP_STYLE,
  CHART_GRID_PROPS,
  AXIS_TICK_STYLE,
} from '@/components/charts/chartConstants.js';
import {
  buildRangeData,
  RANGE_AREAS,
  rangeLines,
  monthFormatter,
  dollarKFormatter,
  dollarFormatter,
  yearLabelFormatter,
  type RangeDataPoint,
} from './monteCarloTransforms.js';
import { EMPTY_DATA_STYLE } from './monteCarloSharedConstants.js';

function RangeChart({ data }: { data: RangeDataPoint[] }) {
  const { t } = useTranslation();
  return (
    <ResponsiveContainer width="100%" height={450}>
      <AreaChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
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
        />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
        {RANGE_AREAS.map((a) => (
          <Area
            key={a.dataKey + a.stackId}
            type="monotone"
            dataKey={a.dataKey}
            stackId={a.stackId}
            stroke="none"
            fill={a.fill}
            fillOpacity={a.fillOpacity}
            name={a.name}
          />
        ))}
        {rangeLines(t).map((l) => (
          <Line
            key={l.dataKey}
            type="monotone"
            dataKey={l.dataKey}
            stroke={l.stroke}
            strokeWidth={l.strokeWidth}
            strokeDasharray={l.dash}
            dot={false}
            name={l.name}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** 区间 Tab：百分位区间带图 */
export function MonteCarloRangeTab({
  r,
  startingValue,
}: {
  r: MonteCarloResult;
  startingValue: number;
}) {
  const { t } = useTranslation();
  const data = buildRangeData(r, startingValue);
  if (data.length === 0)
    return <div style={EMPTY_DATA_STYLE}>{t('monteCarlo.results.noData')}</div>;
  return <RangeChart data={data} />;
}
