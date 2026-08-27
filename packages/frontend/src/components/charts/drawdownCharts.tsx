import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { dateAxisTickFormatter, SMART_DATE_INTERVAL, CHART_MARGIN, getPortfolioColor } from '@/lib/chart-theme.js';
import { fmtPct, maybeDownsample, mergeRowsByDate } from '@/utils/format.js';
import { totalMonths } from './chartUtils.js';
import { SimpleAreaChart } from '@/components/charts/sharedChartContent.js';
import { ChartEmptyState } from '@/components/stateDisplay.js';
import { Card } from '@/components/ui/uiComponents';
type P = { id: string; name: string; drawdownCurve: Array<{ date: string; drawdown: number }> };
const useDrawdownData = (ps: P[]) => useMemo(() => maybeDownsample(mergeRowsByDate(ps.map((p) => ({ key: p.id, rows: p.drawdownCurve, value: (pt: { date: string; drawdown: number }) => -Math.abs(pt.drawdown) })))), [ps]);
const computeStats = (c: P['drawdownCurve']) => {
  if (!c.length) return { maxDrawdown: 0, underwaterPct: 0, longestDays: 0 };
  let maxDD = 0, uw = 0, longest = 0, cur = 0;
  for (const pt of c) { const dd = Math.abs(pt.drawdown); if (dd > maxDD) maxDD = dd; if (pt.drawdown > 0) { uw++; cur++; if (cur > longest) longest = cur; } else cur = 0; }
  return { maxDrawdown: maxDD, underwaterPct: uw / c.length, longestDays: longest };
};
function DrawdownAreaChart({ portfolios, title, description, areaColor, tooltipLabelKey, showStats }: { portfolios: P[]; title: string; description?: string; areaColor?: string; tooltipLabelKey: string; showStats?: boolean }) {
  const { t } = useTranslation(); const chartData = useDrawdownData(portfolios); const tm = useMemo(() => totalMonths(chartData), [chartData]); const stats = useMemo(() => (showStats ? computeStats(portfolios[0]?.drawdownCurve ?? []) : null), [portfolios, showStats]);
  return (
    <Card data-testid={showStats ? 'underwater-curve' : undefined}>
      <div className="px-6 pt-5 pb-3"><h3 className="text-h3">{title}</h3>{description && <p className="text-caption text-fg-tertiary mt-1">{description}</p>}</div>
      {stats && <div className="px-6 pb-3 flex flex-wrap gap-4">{[{ label: t('Max Drawdown'), value: fmtPct(-stats.maxDrawdown), cls: 'text-danger' }, { label: t('Time Underwater'), value: fmtPct(stats.underwaterPct), cls: 'text-fg' }, { label: t('Longest Underwater'), value: t('{{count}} data points', { count: stats.longestDays }), cls: 'text-fg' }].map((it) => <div key={it.label} className="flex items-baseline gap-1.5"><span className="text-label-tiny text-fg-tertiary">{it.label}</span><span className={`text-caption font-mono tabular-nums font-semibold ${it.cls}`}>{it.value}</span></div>)}</div>}
      {chartData.length === 0 ? <div className="px-6 pb-6"><ChartEmptyState /></div> : <div className="h-[440px]"><SimpleAreaChart data={chartData} margin={{ ...CHART_MARGIN, left: 64, right: 8 }} xTickFormatter={dateAxisTickFormatter(tm)} xTickInterval={SMART_DATE_INTERVAL(tm)} yTickFormatter={(v: number) => fmtPct(v)} yDomain={['auto', 0]} areaColor={portfolios.length === 1 ? areaColor : undefined} tooltipFormatter={(value: number, name: string) => [fmtPct(value), name]} tooltipLabelFormatter={(label) => t(tooltipLabelKey, { label })} series={portfolios.map((p, i) => ({ dataKey: p.id, name: p.name, color: getPortfolioColor(i), width: 1.5 }))} /></div>}
    </Card>
  );
}
export function DrawdownChart({ portfolios }: { portfolios: P[] }) { const { t } = useTranslation(); return <DrawdownAreaChart portfolios={portfolios} title={t('Drawdown Trend')} areaColor="hsl(var(--danger))" tooltipLabelKey="Date: {{label}}" />; }
export function UnderwaterCurve({ portfolios }: { portfolios: P[] }) { const { t } = useTranslation(); return <DrawdownAreaChart portfolios={portfolios} title={t('Underwater Curve')} description={t('Drawdown depth over time — shows how long and how deep the portfolio was below its peak.')} areaColor="hsl(var(--danger))" tooltipLabelKey="Date: {{label}}" showStats />; }
