import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AreaChart,
  Area,
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

export const DrawdownChart = memo(function DrawdownChart({
  drawdownData,
  portfolioResults,
}: {
  drawdownData: Array<Record<string, number | string>>;
  portfolioResults: Array<{ name: string }>;
}) {
  const { t } = useTranslation();
  return (
    <div className="chart-card">
      <div className="chart-card-title">{t('analysis.drawdown')}</div>
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={drawdownData} margin={CHART_MARGIN}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
          <XAxis dataKey="date" tick={AXIS_TICK_STYLE} tickFormatter={DATE_TICK_FORMATTER} />
          <YAxis
            domain={['auto', 0]}
            tick={AXIS_TICK_STYLE}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(label: string) => `${t('common.date')}: ${label}`}
            formatter={(value: number) => [`${value.toFixed(2)}%`, '']}
          />
          <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
          {portfolioResults.map((p, idx) => (
            <Area
              key={p.name}
              type="monotone"
              dataKey={p.name}
              stroke={CHART_COLORS[idx % CHART_COLORS.length]}
              fill={CHART_COLORS[idx % CHART_COLORS.length]}
              fillOpacity={0.12}
              strokeWidth={1.5}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});
