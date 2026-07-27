/**
 * @file DrawdownChartV2 组件
 * @description 回撤图表：AreaChart + dangerGradient 填充，Y 轴反向（0 在上，负值向下）。
 *   结构同 GrowthChartV2 但无 Legend。
 */
import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { YEAR_ONLY_TICK_FORMATTER, SMART_DATE_INTERVAL, CHART_TOOLTIP_STYLE, CHART_GRID_PROPS, AXIS_TICK_STYLE, CHART_MARGIN, getPortfolioColor } from '@/lib/chart-theme.js';
import { formatPercent } from '@/lib/formatters.js';
import { ChartEmptyState } from '@/components/charts/ChartEmptyState.js';

interface DrawdownChartV2Props {
  portfolios: Array<{
    id: string;
    name: string;
    drawdownCurve: Array<{ date: string; drawdown: number }>;
  }>;
}

/**
 * 回撤图表 V2。
 * @param props - portfolios（含 drawdownCurve 的组合列表）。
 * @returns 面积图元素（h-[440px]）。
 */
export function DrawdownChartV2({ portfolios }: DrawdownChartV2Props) {
  const chartData = useMemo(() => {
    const merged: Record<string, Record<string, string | number>> = {};
    portfolios.forEach((p) => {
      p.drawdownCurve.forEach((point) => {
        if (!merged[point.date]) merged[point.date] = { date: point.date };
        merged[point.date][p.id] = point.drawdown;
      });
    });
    return Object.values(merged).sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
  }, [portfolios]);

  const totalMonths = chartData.length;

  return (
    <div className="bg-surface border border-border rounded-xl">
      <div className="px-6 pt-5 pb-3">
        <h3 className="text-h3">回撤走势</h3>
      </div>
      {chartData.length === 0 ? (
        <div className="px-6 pb-4">
          <ChartEmptyState />
        </div>
      ) : (
        <div className="h-[440px] px-6">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={CHART_MARGIN}>
            <defs>
              <linearGradient id="dangerGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--danger))" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(var(--danger))" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid {...CHART_GRID_PROPS} />
            <XAxis
              dataKey="date"
              tickFormatter={YEAR_ONLY_TICK_FORMATTER}
              interval={SMART_DATE_INTERVAL(totalMonths)}
              tick={AXIS_TICK_STYLE}
            />
            <YAxis
              tickFormatter={(v: number) => formatPercent(v)}
              tick={AXIS_TICK_STYLE}
              domain={['auto', 0]}
              reversed={false}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              formatter={(value: number, name: string) => [formatPercent(value), name]}
              labelFormatter={(label) => `日期: ${label}`}
            />
            {portfolios.map((p, i) => (
              <Area
                key={p.id}
                type="monotone"
                dataKey={p.id}
                name={p.name}
                stroke={getPortfolioColor(i)}
                fill="url(#dangerGradient)"
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      )}
    </div>
  );
}
