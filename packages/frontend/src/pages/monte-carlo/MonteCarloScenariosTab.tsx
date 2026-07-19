/**
 * @file 蒙特卡洛结果 - 情景 Tab
 * @description 展示代表路径（best/p75/median/p25/worst）对比曲线
 */
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import type { MonteCarloResult } from '@backtest/shared';
import {
  CHART_TOOLTIP_STYLE,
  CHART_GRID_PROPS,
  AXIS_TICK_STYLE,
} from '@/components/charts/chartConstants.js';
import {
  buildScenarioData,
  monthFormatter,
  dollarKFormatter,
  dollarFormatter,
  yearLabelFormatter,
} from './monteCarloTransforms.js';
import { EMPTY_DATA_STYLE } from './monteCarloSharedConstants.js';

/** 情景 Tab：best/p75/median/p25/worst 代表路径曲线 */
export function MonteCarloScenariosTab({
  r,
  startingValue,
}: {
  r: MonteCarloResult;
  startingValue: number;
}) {
  const { t } = useTranslation();
  const { data } = buildScenarioData(r, startingValue);
  if (data.length === 0)
    return <div style={EMPTY_DATA_STYLE}>{t('monteCarlo.results.noData')}</div>;
  return (
    <ResponsiveContainer width="100%" height={450}>
      <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
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
        <Line
          type="monotone"
          dataKey="best"
          stroke={CHART_COLORS[2]}
          strokeWidth={2}
          dot={false}
          name="Best"
        />
        <Line
          type="monotone"
          dataKey="p75"
          stroke={CHART_COLORS[0]}
          strokeWidth={1.5}
          dot={false}
          name="P75"
        />
        <Line
          type="monotone"
          dataKey="median"
          stroke={CHART_COLORS[4]}
          strokeWidth={2.5}
          dot={false}
          name="Median"
        />
        <Line
          type="monotone"
          dataKey="p25"
          stroke={CHART_COLORS[1]}
          strokeWidth={1.5}
          dot={false}
          name="P25"
        />
        <Line
          type="monotone"
          dataKey="worst"
          stroke={CHART_COLORS[3]}
          strokeWidth={2}
          dot={false}
          name="Worst"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
