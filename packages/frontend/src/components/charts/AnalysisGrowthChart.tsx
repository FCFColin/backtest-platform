import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, CartesianGrid, ResponsiveContainer } from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import { CHART_MARGIN, CHART_GRID_PROPS } from './chartConstants.js';
import { ChartXAxis, ChartYAxis, ChartTooltip, ChartLegend } from './ChartAxis.js';
import ChartCard from '../ChartCard.js';

/**
 * 分析页增长曲线图（接受预合并数据）。
 *
 * 与 charts/GrowthChart.tsx 的区别：后者接受 PortfolioResult[] 并自行合并，
 * 此组件接受 useAnalysisData 预处理后的数据，适用于资产分析页面。
 */
export const GrowthChart = memo(function GrowthChart({
  growthData,
  portfolioResults,
}: {
  growthData: Array<Record<string, number | string>>;
  portfolioResults: Array<{ name: string }>;
}) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('analysis.growthCurve')}>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={growthData} margin={CHART_MARGIN}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
          <ChartXAxis />
          <ChartYAxis
            domain={['auto', 'auto']}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0))}
          />
          <ChartTooltip
            labelFormatter={(label: string) => `${t('common.date')}: ${label}`}
            formatter={(value: number, name: string) => {
              const numValue = typeof value === 'number' && isFinite(value) ? value : 0;
              return [`$${numValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, name];
            }}
          />
          <ChartLegend />
          {portfolioResults.map((p, idx) => (
            <Line
              key={p.name}
              type="monotone"
              dataKey={p.name}
              name={p.name}
              stroke={CHART_COLORS[idx % CHART_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, stroke: 'var(--bg-elevated)', strokeWidth: 2 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
});
