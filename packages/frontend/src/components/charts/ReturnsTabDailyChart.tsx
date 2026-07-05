/**
 * @file Returns tab 日收益直方图（从 BacktestPage 拆出以 lazy 加载 recharts）
 */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { PortfolioResult } from '@backtest/shared/types';
import { CHART_COLORS } from '@backtest/shared/types';
import { CHART_TOOLTIP_STYLE } from '../chartHelpers';
import ChartCard from '../ChartCard';

interface ReturnsTabDailyChartProps {
  portfolios: PortfolioResult[];
  bins: Array<{ range: string; [portfolioName: string]: string | number }>;
}

export default memo(function ReturnsTabDailyChart({ portfolios, bins }: ReturnsTabDailyChartProps) {
  const { t } = useTranslation();

  if (bins.length === 0) return null;

  return (
    <ChartCard title={t('backtest.dailyReturnsHist')} data={bins}>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={bins} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis dataKey="range" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} interval={4} />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            label={{
              value: t('backtest.frequency'),
              angle: -90,
              position: 'insideLeft',
              style: { fill: 'var(--text-muted)', fontSize: 12 },
            }}
          />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: '12px' }} />
          {portfolios.map((p, idx) => (
            <Bar
              key={p.name}
              dataKey={p.name}
              fill={CHART_COLORS[idx % CHART_COLORS.length]}
              fillOpacity={0.7}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
});
