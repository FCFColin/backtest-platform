import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import { buildChartData } from '../backtestOptimizerUtils.js';
import { CHART_GRID_PROPS, CHART_TOOLTIP_STYLE } from '@/lib/chart-theme.js';
import type { GrowthComparisonChartProps } from './types.js';
export function GrowthComparisonChart({ best, benchmarkGrowth }: GrowthComparisonChartProps) {
  const { t } = useTranslation();
  const chartData = buildChartData(best, benchmarkGrowth);
  if (chartData.length === 0) return null;
  return (
    <>
      <div className="mb-3 mt-6 text-body font-semibold text-fg">{t('backtest.optimizer.growthComparison')}</div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ left: 8, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="hsl(var(--border-subtle))" />
          <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'hsl(var(--fg-tertiary))' }} tickFormatter={(d: string) => d.substring(0, 7)} minTickGap={40} />
          <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--fg-tertiary))' }} tickFormatter={(v: number) => `$${v.toLocaleString('en-US')}`} width={70} />
          <Tooltip labelFormatter={(d: string) => d} formatter={(v: number, name: string) => [`$${v.toLocaleString('en-US')}`, name === 'portfolio' ? t('backtest.optimizer.bestPortfolio') : t('backtest.optimizer.benchmark')]} contentStyle={CHART_TOOLTIP_STYLE} />
          <Legend formatter={(name: string) => (name === 'portfolio' ? t('backtest.optimizer.bestPortfolio') : t('backtest.optimizer.benchmark'))} />
          <Line type="monotone" dataKey="portfolio" stroke={CHART_COLORS[0]} dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="benchmark" stroke={CHART_COLORS[1]} dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}
