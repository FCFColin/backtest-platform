import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { YEAR_ONLY_TICK_FORMATTER, SMART_DATE_INTERVAL, CHART_TOOLTIP_STYLE, CHART_GRID_PROPS, AXIS_TICK_STYLE, CHART_MARGIN, getPortfolioColor } from '@/lib/chart-theme.js';
import { formatPercent } from '@/utils/format.js';
import { ChartEmptyState } from '@/components/charts/ChartEmptyState.js';
type DrawdownPoint = { date: string; drawdown: number };
type ChartDataRow = Record<string, string | number>;
interface UnderwaterCurveProps {
  portfolios: Array<{
    id: string;
    name: string;
    drawdownCurve: DrawdownPoint[];
  }>;
}
interface UnderwaterStats {
  maxDrawdown: number;
  underwaterPct: number;
  longestDays: number;
}
function computeUnderwaterStats(curve: DrawdownPoint[]): UnderwaterStats {
  if (curve.length === 0) {
    return { maxDrawdown: 0, underwaterPct: 0, longestDays: 0 };
  }
  let maxDrawdown = 0;
  let underwaterCount = 0;
  let longestStreak = 0;
  let currentStreak = 0;
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
  const underwaterPct = curve.length > 0 ? underwaterCount / curve.length : 0;
  return { maxDrawdown, underwaterPct, longestDays: longestStreak };
}
function buildChartData(portfolios: UnderwaterCurveProps['portfolios']): ChartDataRow[] {
  const merged: Record<string, ChartDataRow> = {};
  portfolios.forEach((p) => {
    p.drawdownCurve.forEach((point) => {
      if (!merged[point.date]) merged[point.date] = { date: point.date };
      merged[point.date][p.id] = -Math.abs(point.drawdown);
    });
  });
  return Object.values(merged).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
function computeTotalMonths(chartData: ChartDataRow[]): number {
  if (chartData.length <= 1) return 1;
  const first = new Date(String(chartData[0].date));
  const last = new Date(String(chartData[chartData.length - 1].date));
  return Math.max(1, (last.getFullYear() - first.getFullYear()) * 12 + last.getMonth() - first.getMonth());
}
function StatsBar({ stats }: { stats: UnderwaterStats }) {
  const { t } = useTranslation();
  return (
    <div className="px-6 pb-3 flex flex-wrap gap-4">
      <div className="flex items-baseline gap-1.5">
        <span className="text-label-tiny text-fg-tertiary">{t('underwaterCurve.maxDrawdown')}</span>
        <span className="text-caption font-mono tabular-nums font-semibold text-neg">{formatPercent(-stats.maxDrawdown)}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-label-tiny text-fg-tertiary">{t('underwaterCurve.underwaterPct')}</span>
        <span className="text-caption font-mono tabular-nums font-semibold text-fg">{formatPercent(stats.underwaterPct)}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-label-tiny text-fg-tertiary">{t('underwaterCurve.longestStreak')}</span>
        <span className="text-caption font-mono tabular-nums font-semibold text-fg">{t('underwaterCurve.dataPoints', { count: stats.longestDays })}</span>
      </div>
    </div>
  );
}
function ChartArea({ chartData, portfolios, totalMonths }: { chartData: ChartDataRow[]; portfolios: UnderwaterCurveProps['portfolios']; totalMonths: number }) {
  const { t } = useTranslation();
  return (
    <div className="h-[440px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ ...CHART_MARGIN, left: 64, right: 8 }}>
          <defs>
            <linearGradient id="underwaterGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--danger))" stopOpacity={0.4} />
              <stop offset="100%" stopColor="hsl(var(--danger))" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="date" tickFormatter={YEAR_ONLY_TICK_FORMATTER} interval={SMART_DATE_INTERVAL(totalMonths)} tick={AXIS_TICK_STYLE} />
          <YAxis tickFormatter={(v: number) => formatPercent(v)} tick={AXIS_TICK_STYLE} domain={['auto', 0]} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value: number, name: string) => [formatPercent(value), name]} labelFormatter={(label) => t('underwaterCurve.dateLabel', { label })} isAnimationActive={chartData.length < 100} animationDuration={chartData.length >= 100 ? 0 : 150} />
          {portfolios.map((p, i) => (
            <Area key={p.id} type="monotone" dataKey={p.id} name={p.name} stroke={getPortfolioColor(i)} fill="url(#underwaterGradient)" strokeWidth={1.5} isAnimationActive={false} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function UnderwaterCurve({ portfolios }: UnderwaterCurveProps) {
  const { t } = useTranslation();
  const chartData = useMemo(() => buildChartData(portfolios), [portfolios]);
  const totalMonths = useMemo(() => computeTotalMonths(chartData), [chartData]);
  const stats = useMemo(() => computeUnderwaterStats(portfolios[0]?.drawdownCurve ?? []), [portfolios]);
  return (
    <div className="bg-surface border border-border rounded-xl" data-testid="underwater-curve">
      <div className="px-6 pt-5 pb-3">
        <h3 className="text-h3">{t('underwaterCurve.title')}</h3>
        <p className="text-caption text-fg-tertiary mt-1">{t('underwaterCurve.description')}</p>
      </div>
      <StatsBar stats={stats} />
      {chartData.length === 0 ? (
        <div className="px-6 pb-6">
          <ChartEmptyState />
        </div>
      ) : (
        <ChartArea chartData={chartData} portfolios={portfolios} totalMonths={totalMonths} />
      )}
    </div>
  );
}
