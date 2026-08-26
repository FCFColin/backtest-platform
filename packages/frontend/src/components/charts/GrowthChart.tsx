import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, FunctionSquare } from 'lucide-react';
import { Button, Card } from '@/components/ui/uiComponents.js';
import { SimpleChart } from '@/components/charts/sharedChartContent.js';
import { ChartEmptyState } from '@/components/stateDisplay.js';
import { totalMonths } from './chartUtils.js';
import {
  dateAxisTickFormatter,
  SMART_DATE_INTERVAL,
  getPortfolioColor,
} from '@/lib/chart-theme.js';
import { formatCurrency, maybeDownsample, mergeRowsByDate } from '@/utils/format.js';
import { cn } from '@/lib/utils.js';
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
  portfolios: Array<{
    id: string;
    name: string;
    growthCurve: Array<{ date: string; value: number }>;
  }>;
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
            aria-pressed={!isHidden}
            title={isHidden ? 'Hidden' : undefined}
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
function useIsMobile(bp = 640) {
  const [m, setM] = useState(false);
  useEffect(() => {
    const q = window.matchMedia(`(max-width: ${bp}px)`);
    setM(q.matches);
    const h = () => setM(q.matches);
    q.addEventListener('change', h);
    return () => q.removeEventListener('change', h);
  }, [bp]);
  return m;
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
  portfolios: Array<{
    id: string;
    name: string;
    growthCurve: Array<{ date: string; value: number }>;
  }>;
  currency: string;
  logScale: boolean;
  hiddenIds: Set<string>;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const tm = useMemo(() => totalMonths(filteredData), [filteredData]);
  const isMobile = useIsMobile();
  return (
    <SimpleChart
      type="line"
      data={filteredData}
      height={isMobile ? 280 : 440}
      margin={
        isMobile
          ? { top: 20, right: 16, bottom: 20, left: 64 }
          : { top: 20, right: 32, bottom: 20, left: 80 }
      }
      xDataKey="date"
      xTickFormatter={dateAxisTickFormatter(tm)}
      xTickInterval={SMART_DATE_INTERVAL(tm)}
      yTickFormatter={(v: number) => formatCurrency(v, currency, 0)}
      yDomain={logScale ? [1, 'auto'] : ['auto', 'auto']}
      yScale={logScale ? 'log' : 'linear'}
      tooltipFormatter={(value: number, name: string) => [formatCurrency(value, currency, 2), name]}
      tooltipLabelFormatter={(label) => t('Date: {{label}}', { label })}
      showLegend={false}
      series={portfolios.flatMap((p, i) =>
        hiddenIds.has(p.id) ? [] : [{ dataKey: p.id, name: p.name, color: getPortfolioColor(i) }],
      )}
    />
  );
}
export function GrowthChart({
  portfolios,
  currency = 'USD',
}: {
  portfolios: Array<{
    id: string;
    name: string;
    growthCurve: Array<{ date: string; value: number }>;
  }>;
  currency?: string;
}) {
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
  const chartData = useMemo(
    () =>
      mergeRowsByDate(
        portfolios.map((p) => ({
          key: p.id,
          rows: p.growthCurve,
          value: (pt: { date: string; value: number }) => pt.value,
        })),
      ),
    [portfolios],
  );
  const filteredData = useMemo(() => {
    let data = chartData;
    if (timeRange !== 'MAX' && chartData.length > 0) {
      const cutoff = new Date(String(chartData[chartData.length - 1].date));
      cutoff.setFullYear(cutoff.getFullYear() - parseInt(timeRange));
      data = chartData.filter((d) => new Date(String(d.date)) >= cutoff);
    }
    return maybeDownsample(data);
  }, [chartData, timeRange]);
  return (
    <Card className="overflow-hidden">
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
    </Card>
  );
}
