import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, FunctionSquare } from 'lucide-react';
import { Button } from '@/components/ui/uiComponents.js';
import { ChartEmptyState, SimpleChart } from '@/components/charts/sharedChartContent.js';
import { totalMonths } from './chartUtils.js';
import {
  currencyFormatter,
  YEAR_ONLY_TICK_FORMATTER,
  SMART_DATE_INTERVAL,
  getPortfolioColor,
} from '@/lib/chart-theme.js';
import {
  formatCurrency,
  downsample,
  DOWNSAMPLE_THRESHOLD,
  DOWNSAMPLE_TARGET,
} from '@/utils/format.js';
import { cn } from '@/lib/utils.js';
interface GrowthChartProps {
  portfolios: Array<{
    id: string;
    name: string;
    growthCurve: Array<{ date: string; value: number }>;
  }>;
  currency?: string;
}
const TIME_RANGES = ['1Y', '5Y', '10Y', 'MAX'] as const;
function GrowthHeader({
  timeRange,
  onTimeRange,
  logScale,
  onLogScale,
  hidden,
  onToggleHidden,
}: {
  timeRange: (typeof TIME_RANGES)[number];
  onTimeRange: (r: (typeof TIME_RANGES)[number]) => void;
  logScale: boolean;
  onLogScale: () => void;
  hidden: boolean;
  onToggleHidden: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-between gap-y-2 px-6 pt-5 pb-3">
      <h3 className="text-h3">{t('Portfolio Value Trend')}</h3>
      <div className="flex items-center gap-1">
        <div
          className="flex items-center gap-0.5 mr-2 bg-input-bg rounded-md p-0.5"
          data-testid="chart-time-range"
        >
          {TIME_RANGES.map((range) => (
            <button
              key={range}
              onClick={() => onTimeRange(range)}
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
          onClick={onLogScale}
          title={t('Log Scale')}
          data-testid="chart-log-toggle"
        >
          <FunctionSquare className={cn('h-4 w-4', logScale && 'text-brand')} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onToggleHidden}
          aria-label={hidden ? t('Show Chart') : t('Hide Chart')}
        >
          {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
function ChartLegend({
  portfolios,
  hiddenIds,
  onToggle,
  currency,
}: {
  portfolios: GrowthChartProps['portfolios'];
  hiddenIds: Set<string>;
  onToggle: (id: string) => void;
  currency: string;
}) {
  return (
    <div className="border-t border-border-subtle px-6 py-3 flex items-center justify-center gap-6 flex-wrap">
      {portfolios.map((p, i) => {
        const isHidden = hiddenIds.has(p.id);
        const currentValue = p.growthCurve[p.growthCurve.length - 1]?.value;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onToggle(p.id)}
            className={cn(
              'flex items-center gap-2 transition-opacity',
              isHidden ? 'opacity-30' : 'opacity-100',
            )}
            data-testid={`legend-${p.id}`}
            data-hidden={isHidden}
          >
            <div className="w-3 h-0.5" style={{ background: getPortfolioColor(i) }} />
            <span className={cn('text-caption text-fg', isHidden && 'line-through')}>{p.name}</span>
            {currentValue !== undefined && !isHidden && (
              <span className="text-caption font-mono tabular-nums text-fg-tertiary">
                {formatCurrency(currentValue, currency)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
function GrowthLines({
  filteredData,
  portfolios,
  currency,
  logScale,
  hiddenIds,
  t,
}: {
  filteredData: Array<Record<string, string | number>>;
  portfolios: GrowthChartProps['portfolios'];
  currency: string;
  logScale: boolean;
  hiddenIds: Set<string>;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const totalMonthsValue = useMemo(() => totalMonths(filteredData), [filteredData]);
  return (
    <SimpleChart
      type="line"
      data={filteredData}
      height={440}
      margin={{ top: 20, right: 32, bottom: 20, left: 32 }}
      xDataKey="date"
      xTickFormatter={YEAR_ONLY_TICK_FORMATTER as (v: number | string) => string}
      xTickInterval={SMART_DATE_INTERVAL(totalMonthsValue)}
      yTickFormatter={(v: number) => currencyFormatter(v, currency)}
      yDomain={logScale ? [1, 'auto'] : ['auto', 'auto']}
      yScale={logScale ? 'log' : 'linear'}
      tooltipFormatter={(value: number, name: string) => [
        currencyFormatter(value, currency, 2),
        name,
      ]}
      tooltipLabelFormatter={(label) => t('Date: {{label}}', { label })}
      showLegend={false}
      series={portfolios.flatMap((p, i) =>
        hiddenIds.has(p.id) ? [] : [{ dataKey: p.id, name: p.name, color: getPortfolioColor(i) }],
      )}
    />
  );
}
export function GrowthChart({ portfolios, currency = 'USD' }: GrowthChartProps) {
  const { t } = useTranslation();
  const [logScale, setLogScale] = useState(false);
  const [timeRange, setTimeRange] = useState<(typeof TIME_RANGES)[number]>('MAX');
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
    portfolios.forEach((p) =>
      p.growthCurve.forEach((point) => {
        if (!merged[point.date]) merged[point.date] = { date: point.date };
        merged[point.date][p.id] = point.value;
      }),
    );
    return Object.values(merged).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [portfolios]);
  const filteredData = useMemo(() => {
    let data = chartData;
    if (timeRange !== 'MAX' && chartData.length > 0) {
      const cutoff = new Date(String(chartData[chartData.length - 1].date));
      cutoff.setFullYear(cutoff.getFullYear() - parseInt(timeRange));
      data = chartData.filter((d) => new Date(String(d.date)) >= cutoff);
    }
    return data.length > DOWNSAMPLE_THRESHOLD ? downsample(data, DOWNSAMPLE_TARGET) : data;
  }, [chartData, timeRange]);
  return (
    <div className="bg-surface border border-border rounded-xl">
      <GrowthHeader
        timeRange={timeRange}
        onTimeRange={setTimeRange}
        logScale={logScale}
        onLogScale={() => setLogScale(!logScale)}
        hidden={hidden}
        onToggleHidden={() => setHidden(!hidden)}
      />
      {!hidden &&
        (filteredData.length === 0 ? (
          <div className="px-6 pb-4">
            <ChartEmptyState />
          </div>
        ) : (
          <>
            <GrowthLines
              filteredData={filteredData}
              portfolios={portfolios}
              currency={currency}
              logScale={logScale}
              hiddenIds={hiddenIds}
              t={t}
            />
            <ChartLegend
              portfolios={portfolios}
              hiddenIds={hiddenIds}
              onToggle={toggleVisibility}
              currency={currency}
            />
          </>
        ))}
    </div>
  );
}
