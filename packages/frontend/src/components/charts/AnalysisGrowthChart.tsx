import { memo } from 'react';
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
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import { tooltipStyle } from './analysisChartUtils.js';
import {
  CHART_MARGIN,
  CHART_GRID_PROPS,
  AXIS_TICK_STYLE,
  LEGEND_WRAPPER_STYLE,
  DATE_TICK_FORMATTER,
} from './chartConstants.js';

export const GrowthChart = memo(function GrowthChart({
  growthData,
  portfolioResults,
}: {
  growthData: Array<Record<string, number | string>>;
  portfolioResults: Array<{ name: string }>;
}) {
  const { t } = useTranslation();
  return (
    <div className="chart-card">
      <div className="chart-card-title">{t('analysis.growthCurve')}</div>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={growthData} margin={CHART_MARGIN}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
          <XAxis dataKey="date" tick={AXIS_TICK_STYLE} tickFormatter={DATE_TICK_FORMATTER} />
          <YAxis
            domain={['auto', 'auto']}
            tick={AXIS_TICK_STYLE}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0))}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(label: string) => `${t('common.date')}: ${label}`}
            formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
          />
          <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
          {portfolioResults.map((p, idx) => (
            <Line
              key={p.name}
              type="monotone"
              dataKey={p.name}
              stroke={CHART_COLORS[idx % CHART_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});
