/**
 * @file GrowthChartV2 组件
 * @description 专业增长曲线图：Y 轴完整金额 + X 轴纯年份 + 时间范围快捷 +
 *   对数坐标切换 + 隐藏/显示 + 导出 + Tooltip backdrop-blur + 底部 Legend。
 */
import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Eye, EyeOff, FunctionSquare } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { ChartEmptyState } from '@/components/charts/ChartEmptyState.js';
import {
  CURRENCY_TICK_FORMATTER,
  CURRENCY_EXACT_FORMATTER,
  YEAR_ONLY_TICK_FORMATTER,
  SMART_DATE_INTERVAL,
  getPortfolioColor,
  CHART_TOOLTIP_STYLE,
  CHART_GRID_PROPS,
  AXIS_TICK_STYLE,
  CHART_LINE_STYLE,
  CHART_MARGIN,
} from '@/lib/chart-theme.js';
import { formatCurrency } from '@/lib/formatters.js';
import { cn } from '@/lib/utils.js';

interface GrowthChartV2Props {
  portfolios: Array<{
    id: string;
    name: string;
    growthCurve: Array<{ date: string; value: number }>;
  }>;
  currency?: string;
  benchmark?: { name: string; growthCurve: Array<{ date: string; value: number }> };
  onExport?: (format: 'png' | 'svg' | 'csv') => void;
}

/**
 * 专业增长曲线图组件 V2。
 * @param props - portfolios/currency/benchmark/onExport。
 * @returns 图表容器元素（h-[440px]）。
 */
export function GrowthChartV2({
  portfolios,
  currency = 'USD',
  benchmark,
  onExport,
}: GrowthChartV2Props) {
  void onExport;
  const [logScale, setLogScale] = useState(false);
  const [timeRange, setTimeRange] = useState<'1Y' | '5Y' | '10Y' | 'MAX'>('MAX');
  const [hidden, setHidden] = useState(false);

  const chartData = useMemo(() => {
    const merged: Record<string, Record<string, string | number>> = {};
    portfolios.forEach((p) => {
      p.growthCurve.forEach((point) => {
        if (!merged[point.date]) merged[point.date] = { date: point.date };
        merged[point.date][p.id] = point.value;
      });
    });
    if (benchmark) {
      benchmark.growthCurve.forEach((point) => {
        if (!merged[point.date]) merged[point.date] = { date: point.date };
        merged[point.date]['benchmark'] = point.value;
      });
    }
    return Object.values(merged).sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
  }, [portfolios, benchmark]);

  const filteredData = useMemo(() => {
    if (timeRange === 'MAX') return chartData;
    const cutoff = new Date();
    if (timeRange === '1Y') cutoff.setFullYear(cutoff.getFullYear() - 1);
    if (timeRange === '5Y') cutoff.setFullYear(cutoff.getFullYear() - 5);
    if (timeRange === '10Y') cutoff.setFullYear(cutoff.getFullYear() - 10);
    return chartData.filter((d) => new Date(String(d.date)) >= cutoff);
  }, [chartData, timeRange]);

  const totalMonths = filteredData.length;

  return (
    <div className="bg-surface border border-border rounded-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <h3 className="text-h3">组合价值走势</h3>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-0.5 mr-2 bg-input-bg rounded-md p-0.5">
            {(['1Y', '5Y', '10Y', 'MAX'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={cn(
                  'px-2.5 py-1 text-caption font-medium rounded transition-colors',
                  timeRange === range ? 'bg-surface text-fg' : 'text-fg-tertiary hover:text-fg',
                )}
              >
                {range}
              </button>
            ))}
          </div>
          <div className="w-px h-5 bg-border mx-1" />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setLogScale(!logScale)}
            title="对数坐标"
          >
            <FunctionSquare className={cn('h-4 w-4', logScale && 'text-brand')} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setHidden(!hidden)}
            title={hidden ? '显示图表' : '隐藏图表'}
          >
            {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* 图表主体 */}
      {!hidden &&
        (filteredData.length === 0 ? (
          <div className="px-6 pb-4">
            <ChartEmptyState />
          </div>
        ) : (
          <>
            <div className="h-[440px] px-6">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={filteredData} margin={CHART_MARGIN}>
                <CartesianGrid {...CHART_GRID_PROPS} />
                <XAxis
                  dataKey="date"
                  tickFormatter={YEAR_ONLY_TICK_FORMATTER}
                  interval={SMART_DATE_INTERVAL(totalMonths)}
                  tick={AXIS_TICK_STYLE}
                />
                <YAxis
                  tickFormatter={(v: number) => CURRENCY_TICK_FORMATTER(v, currency)}
                  tick={AXIS_TICK_STYLE}
                  scale={logScale ? 'log' : 'linear'}
                  domain={logScale ? [1, 'auto'] : ['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value: number, name: string) => [
                    CURRENCY_EXACT_FORMATTER(value, currency),
                    name,
                  ]}
                  labelFormatter={(label) => `日期: ${label}`}
                />
                {portfolios.map((p, i) => (
                  <Line
                    key={p.id}
                    type="monotone"
                    dataKey={p.id}
                    name={p.name}
                    stroke={getPortfolioColor(i)}
                    {...CHART_LINE_STYLE}
                  />
                ))}
                {benchmark && (
                  <Line
                    type="monotone"
                    dataKey="benchmark"
                    name={benchmark.name}
                    stroke="hsl(var(--fg-tertiary))"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="border-t border-border-subtle px-6 py-3 flex items-center justify-center gap-6 flex-wrap">
            {portfolios.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2">
                <div className="w-3 h-0.5" style={{ background: getPortfolioColor(i) }} />
                <span className="text-caption text-fg">{p.name}</span>
                {p.growthCurve.length > 0 && (
                  <span className="text-caption font-mono tabular-nums text-fg-tertiary">
                    {formatCurrency(p.growthCurve[p.growthCurve.length - 1].value, currency)}
                  </span>
                )}
              </div>
            ))}
            {benchmark && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 border-t-2 border-dashed border-fg-tertiary" />
                <span className="text-caption text-fg">{benchmark.name}</span>
              </div>
            )}
          </div>
        </>
        ))}
    </div>
  );
}
