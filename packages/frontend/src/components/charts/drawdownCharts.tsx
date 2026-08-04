import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Area } from 'recharts';
import {
  YEAR_ONLY_TICK_FORMATTER,
  SMART_DATE_INTERVAL,
  CHART_MARGIN,
  getPortfolioColor,
} from '@/lib/chart-theme.js';
import { formatPercent } from '@/utils/format.js';
import { ChartEmptyState, SimpleAreaChart } from '@/components/charts/sharedChartContent.js';

interface DrawdownChartProps {
  portfolios: Array<{
    id: string;
    name: string;
    drawdownCurve: Array<{ date: string; drawdown: number }>;
  }>;
}
function useDrawdownData(portfolios: DrawdownChartProps['portfolios']) {
  return useMemo(() => {
    const merged: Record<string, Record<string, string | number>> = {};
    portfolios.forEach((p) => {
      p.drawdownCurve.forEach((point) => {
        if (!merged[point.date]) merged[point.date] = { date: point.date };
        merged[point.date][p.id] = -Math.abs(point.drawdown);
      });
    });
    return Object.values(merged).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [portfolios]);
}
function useTotalMonths(chartData: Array<Record<string, string | number>>) {
  return useMemo(() => {
    if (chartData.length <= 1) return 1;
    const first = new Date(String(chartData[0].date));
    const last = new Date(String(chartData[chartData.length - 1].date));
    return Math.max(
      1,
      (last.getFullYear() - first.getFullYear()) * 12 + last.getMonth() - first.getMonth(),
    );
  }, [chartData]);
}
function DrawdownAreas({
  portfolios,
  gradientId,
}: {
  portfolios: DrawdownChartProps['portfolios'];
  gradientId: string;
}) {
  return portfolios.map((p, i) => (
    <Area
      key={p.id}
      type="monotone"
      dataKey={p.id}
      name={p.name}
      stroke={getPortfolioColor(i)}
      fill={`url(#${gradientId})`}
      strokeWidth={1.5}
      isAnimationActive={false}
    />
  ));
}
interface UnderwaterStats {
  maxDrawdown: number;
  underwaterPct: number;
  longestDays: number;
}
function computeUnderwaterStats(curve: Array<{ date: string; drawdown: number }>): UnderwaterStats {
  if (curve.length === 0) return { maxDrawdown: 0, underwaterPct: 0, longestDays: 0 };
  let maxDrawdown = 0,
    underwaterCount = 0,
    longestStreak = 0,
    currentStreak = 0;
  for (const pt of curve) {
    const dd = Math.abs(pt.drawdown);
    if (dd > maxDrawdown) maxDrawdown = dd;
    if (pt.drawdown < 0) {
      underwaterCount++;
      currentStreak++;
      if (currentStreak > longestStreak) longestStreak = currentStreak;
    } else {
      currentStreak = 0;
    }
  }
  return {
    maxDrawdown,
    underwaterPct: underwaterCount / curve.length,
    longestDays: longestStreak,
  };
}
function StatsBar({ stats }: { stats: UnderwaterStats }) {
  const { t } = useTranslation();
  return (
    <div className="px-6 pb-3 flex flex-wrap gap-4">
      <div className="flex items-baseline gap-1.5">
        <span className="text-label-tiny text-fg-tertiary">{t('underwaterCurve.maxDrawdown')}</span>
        <span className="text-caption font-mono tabular-nums font-semibold text-neg">
          {formatPercent(-stats.maxDrawdown)}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-label-tiny text-fg-tertiary">
          {t('underwaterCurve.underwaterPct')}
        </span>
        <span className="text-caption font-mono tabular-nums font-semibold text-fg">
          {formatPercent(stats.underwaterPct)}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-label-tiny text-fg-tertiary">
          {t('underwaterCurve.longestStreak')}
        </span>
        <span className="text-caption font-mono tabular-nums font-semibold text-fg">
          {t('underwaterCurve.dataPoints', { count: stats.longestDays })}
        </span>
      </div>
    </div>
  );
}
interface DrawdownAreaChartProps extends DrawdownChartProps {
  title: string;
  description?: string;
  gradientId: string;
  tooltipLabelKey: string;
  showStats?: boolean;
}
function DrawdownAreaChart({
  portfolios,
  title,
  description,
  gradientId,
  tooltipLabelKey,
  showStats,
}: DrawdownAreaChartProps) {
  const { t } = useTranslation();
  const chartData = useDrawdownData(portfolios);
  const totalMonths = useTotalMonths(chartData);
  const stats = useMemo(
    () => (showStats ? computeUnderwaterStats(portfolios[0]?.drawdownCurve ?? []) : null),
    [portfolios, showStats],
  );
  return (
    <div
      className="bg-surface border border-border rounded-xl"
      data-testid={showStats ? 'underwater-curve' : undefined}
    >
      <div className="px-6 pt-5 pb-3">
        <h3 className="text-h3">{title}</h3>
        {description && <p className="text-caption text-fg-tertiary mt-1">{description}</p>}
      </div>
      {stats && <StatsBar stats={stats} />}
      {chartData.length === 0 ? (
        <div className="px-6 pb-6">
          <ChartEmptyState />
        </div>
      ) : (
        <div className="h-[440px]">
          <SimpleAreaChart
            data={chartData}
            margin={{ ...CHART_MARGIN, left: 64, right: 8 }}
            xTickFormatter={YEAR_ONLY_TICK_FORMATTER}
            xTickInterval={SMART_DATE_INTERVAL(totalMonths)}
            yTickFormatter={(v: number) => formatPercent(v)}
            yDomain={['auto', 0]}
            gradientId={gradientId}
            tooltipFormatter={(value: number, name: string) => [formatPercent(value), name]}
            tooltipLabelFormatter={(label) => t(tooltipLabelKey, { label })}
          >
            <DrawdownAreas portfolios={portfolios} gradientId={gradientId} />
          </SimpleAreaChart>
        </div>
      )}
    </div>
  );
}
export function DrawdownChart({ portfolios }: DrawdownChartProps) {
  const { t } = useTranslation();
  return (
    <DrawdownAreaChart
      portfolios={portfolios}
      title={t('charts.drawdown.title')}
      gradientId="dangerGradient"
      tooltipLabelKey="charts.drawdown.dateLabel"
    />
  );
}
export function UnderwaterCurve({ portfolios }: DrawdownChartProps) {
  const { t } = useTranslation();
  return (
    <DrawdownAreaChart
      portfolios={portfolios}
      title={t('underwaterCurve.title')}
      description={t('underwaterCurve.description')}
      gradientId="underwaterGradient"
      tooltipLabelKey="underwaterCurve.dateLabel"
      showStats
    />
  );
}
