import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
import { Button } from '@/components/ui/uiComponents.js';
import { ChartEmptyState } from '@/components/charts/sharedChartContent.js';
import {
  currencyFormatter,
  YEAR_ONLY_TICK_FORMATTER,
  SMART_DATE_INTERVAL,
  getPortfolioColor,
  CHART_TOOLTIP_STYLE,
  CHART_GRID_PROPS,
  AXIS_TICK_STYLE,
  CHART_LINE_STYLE,
} from '@/lib/chart-theme.js';
import { formatCurrency } from '@/utils/format.js';
import { cn } from '@/lib/utils.js';
interface GrowthChartProps {
  portfolios: Array<{
    id: string;
    name: string;
    growthCurve: Array<{ date: string; value: number }>;
  }>;
  currency?: string;
  benchmark?: { name: string; growthCurve: Array<{ date: string; value: number }> };
  onExport?: (format: 'png' | 'svg' | 'csv') => void;
}
// eslint-disable-next-line max-lines-per-function
export function GrowthChart({
  portfolios,
  currency = 'USD',
  benchmark,
  onExport,
}: GrowthChartProps) {
  const { t } = useTranslation();
  void onExport;
  const [logScale, setLogScale] = useState(false);
  const [timeRange, setTimeRange] = useState<'1Y' | '5Y' | '10Y' | 'MAX'>('MAX');
  const [hidden, setHidden] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const toggleVisibility = (id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
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
    return Object.values(merged).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [portfolios, benchmark]);
  const filteredData = useMemo(() => {
    if (timeRange === 'MAX') return chartData;
    if (chartData.length === 0) return chartData;
    const lastDate = new Date(String(chartData[chartData.length - 1].date));
    const cutoff = new Date(lastDate);
    if (timeRange === '1Y') cutoff.setFullYear(cutoff.getFullYear() - 1);
    if (timeRange === '5Y') cutoff.setFullYear(cutoff.getFullYear() - 5);
    if (timeRange === '10Y') cutoff.setFullYear(cutoff.getFullYear() - 10);
    return chartData.filter((d) => new Date(String(d.date)) >= cutoff);
  }, [chartData, timeRange]);
  const totalMonths = filteredData.length;
  const isLargeDataset = filteredData.length >= 100;
  return (
    <div className="bg-surface border border-border rounded-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <h3 className="text-h3">{t('charts.growth.title')}</h3>
        <div className="flex items-center gap-1">
          <div
            className="flex items-center gap-0.5 mr-2 bg-input-bg rounded-md p-0.5"
            data-testid="chart-time-range"
          >
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
            title={t('charts.growth.logScale')}
            data-testid="chart-log-toggle"
          >
            <FunctionSquare className={cn('h-4 w-4', logScale && 'text-brand')} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setHidden(!hidden)}
            title={hidden ? t('charts.growth.showChart') : t('charts.growth.hideChart')}
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
            <div className="h-[440px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={filteredData}
                  margin={{ top: 20, right: 32, bottom: 20, left: 32 }}
                >
                  <CartesianGrid {...CHART_GRID_PROPS} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={YEAR_ONLY_TICK_FORMATTER}
                    interval={SMART_DATE_INTERVAL(totalMonths)}
                    tick={AXIS_TICK_STYLE}
                  />
                  <YAxis
                    tickFormatter={(v: number) => currencyFormatter(v, currency)}
                    tick={AXIS_TICK_STYLE}
                    scale={logScale ? 'log' : 'linear'}
                    domain={logScale ? [1, 'auto'] : ['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(value: number, name: string) => [
                      currencyFormatter(value, currency, 2),
                      name,
                    ]}
                    labelFormatter={(label) => t('charts.growth.dateLabel', { label })}
                    isAnimationActive={!isLargeDataset}
                    animationDuration={isLargeDataset ? 0 : 150}
                  />
                  {portfolios.map((p, i) =>
                    hiddenIds.has(p.id) ? null : (
                      <Line
                        key={p.id}
                        type="monotone"
                        dataKey={p.id}
                        name={p.name}
                        stroke={getPortfolioColor(i)}
                        {...CHART_LINE_STYLE}
                      />
                    ),
                  )}
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
              {portfolios.map((p, i) => {
                const isHidden = hiddenIds.has(p.id);
                const currentValue = p.growthCurve[p.growthCurve.length - 1]?.value;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleVisibility(p.id)}
                    className={cn(
                      'flex items-center gap-2 transition-opacity',
                      isHidden ? 'opacity-30' : 'opacity-100',
                    )}
                    data-testid={`legend-${p.id}`}
                    data-hidden={isHidden}
                  >
                    <div className="w-3 h-0.5" style={{ background: getPortfolioColor(i) }} />
                    <span className={cn('text-caption text-fg', isHidden && 'line-through')}>
                      {p.name}
                    </span>
                    {currentValue !== undefined && !isHidden && (
                      <span className="text-caption font-mono tabular-nums text-fg-tertiary">
                        {formatCurrency(currentValue, currency)}
                      </span>
                    )}
                  </button>
                );
              })}
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
