/**
 * @file LETF Slippage 图表组件
 * @description 滑点曲线图与实际杠杆 vs 名义杠杆对比图
 */
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
import {
  CHART_TOOLTIP_STYLE,
  CHART_MARGIN,
  CHART_GRID_PROPS,
  AXIS_TICK_STYLE,
  LEGEND_WRAPPER_STYLE,
  DATE_TICK_FORMATTER,
} from '@/components/charts/chartConstants.js';
import ChartCard from '../../components/ChartCard.js';
import type { SlippageCurveDataPoint, LeverageComparisonDataPoint } from './letfSlippageTypes.js';

/** 滑点曲线图（累积滑点 + 每日滑点） */
export function SlippageCurveChart({ data }: { data: SlippageCurveDataPoint[] }) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('letf.results.slippageCurve')}>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
          <XAxis dataKey="date" tick={AXIS_TICK_STYLE} tickFormatter={DATE_TICK_FORMATTER} />
          <YAxis tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => `${v.toFixed(1)}%`} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelFormatter={(label: string) => t('letf.results.slippageDateLabel', { date: label })}
            formatter={(value: number) => [`${value.toFixed(2)}%`, '']}
          />
          <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
          <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="cumulative"
            name={t('letf.results.cumulativeSlippage')}
            stroke={CHART_COLORS[0]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="daily"
            name={t('letf.results.dailySlippage')}
            stroke={CHART_COLORS[1]}
            strokeWidth={1}
            dot={false}
            activeDot={{ r: 3 }}
            strokeOpacity={0.6}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** 杠杆对比图（实际杠杆 vs 名义杠杆） */
export function LeverageComparisonChart({
  data,
  leverage,
}: {
  data: LeverageComparisonDataPoint[];
  leverage: number;
}) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('letf.results.leverageComparison')}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
          <XAxis dataKey="date" tick={AXIS_TICK_STYLE} tickFormatter={DATE_TICK_FORMATTER} />
          <YAxis tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => `${v.toFixed(1)}x`} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelFormatter={(label: string) => t('letf.results.leverageDateLabel', { date: label })}
            formatter={(value: number) => [`${value.toFixed(2)}x`, '']}
          />
          <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
          <Line
            type="monotone"
            dataKey="nominal"
            name={t('letf.results.nominalLeverage', { leverage })}
            stroke="var(--text-muted)"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="effective"
            name={t('letf.results.effectiveLeverage')}
            stroke={CHART_COLORS[2]}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
