import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_COLORS, type LETFResult } from '@backtest/shared';
import { fmtPct } from '@/utils/format';
import { ResultsShell } from '@/components/resultsShell.js';
import { Card } from '@/components/ui/uiComponents';
import {
  AXIS_TICK_STYLE,
  CHART_GRID_PROPS,
  CHART_MARGIN,
  CHART_TOOLTIP_STYLE,
  DATE_TICK_FORMATTER,
  LEGEND_WRAPPER_STYLE,
} from '@/lib/chart-theme.js';
import { cn } from '@/lib/utils';
import ChartCard from '../../components/ChartCard.js';
import { SortableTable, type Column } from '../../components/tables.js';
interface SlippageCurveDataPoint {
  date: string;
  cumulative: number;
  daily: number;
}
interface LeverageComparisonDataPoint {
  date: string;
  effective: number | null;
  nominal: number;
}
interface LETFResultsProps {
  results: LETFResult | null;
  error: string | null;
  isLoading: boolean;
  leverage: number;
}
interface KpiCardProps {
  label: ReactNode;
  value: ReactNode;
  danger?: boolean;
}
function KpiCard({ label, value, danger = false }: KpiCardProps) {
  return (
    <Card className="p-4">
      <div className="mb-1 text-caption text-fg-tertiary">{label}</div>
      <div
        className={cn(
          'font-mono text-2xl font-bold tabular-nums',
          danger ? 'text-danger' : 'text-fg',
        )}
      >
        {value}
      </div>
    </Card>
  );
}
function LETFKpiCards({ results }: { results: LETFResult }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard
        label={t('Annual Decay')}
        value={fmtPct(results.annualDecay)}
        danger={results.annualDecay < 0}
      />
      <KpiCard label={t('Benchmark Return')} value={fmtPct(results.stats.benchmarkReturn)} />
      <KpiCard label={t('LETF Return')} value={fmtPct(results.stats.letfReturn)} />
      <KpiCard
        label={t('Total Slippage')}
        value={fmtPct(results.stats.slippage)}
        danger={results.stats.slippage < 0}
      />
    </div>
  );
}
function SlippageCurveChart({ data }: { data: SlippageCurveDataPoint[] }) {
  const { t } = useTranslation();
  const isLargeDataset = data.length >= 100;
  const seriesAnimationActive = !isLargeDataset;
  return (
    <ChartCard title={t('Slippage Curve')}>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="date" tick={AXIS_TICK_STYLE} tickFormatter={DATE_TICK_FORMATTER} />
          <YAxis tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => `${v.toFixed(1)}%`} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelFormatter={(label: string) => t('Date: {{date}}', { date: label })}
            formatter={(value: number) => [`${value.toFixed(2)}%`, '']}
            isAnimationActive={!isLargeDataset}
            animationDuration={isLargeDataset ? 0 : 150}
          />
          <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
          <ReferenceLine y={0} stroke="var(--fg-tertiary)" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="cumulative"
            name={t('Cumulative Slippage')}
            stroke={CHART_COLORS[0]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={seriesAnimationActive}
          />
          <Line
            type="monotone"
            dataKey="daily"
            name={t('Daily Slippage')}
            stroke={CHART_COLORS[1]}
            strokeWidth={1}
            dot={false}
            activeDot={{ r: 3 }}
            strokeOpacity={0.6}
            isAnimationActive={seriesAnimationActive}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
function LeverageComparisonChart({
  data,
  leverage,
}: {
  data: LeverageComparisonDataPoint[];
  leverage: number;
}) {
  const { t } = useTranslation();
  const isLargeDataset = data.length >= 100;
  const seriesAnimationActive = !isLargeDataset;
  return (
    <ChartCard title={t('Effective vs Nominal Leverage')}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="date" tick={AXIS_TICK_STYLE} tickFormatter={DATE_TICK_FORMATTER} />
          <YAxis tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => `${v.toFixed(1)}x`} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelFormatter={(label: string) => t('Date: {{date}}', { date: label })}
            formatter={(value: number) => [`${value.toFixed(2)}x`, '']}
            isAnimationActive={!isLargeDataset}
            animationDuration={isLargeDataset ? 0 : 150}
          />
          <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
          <Line
            type="monotone"
            dataKey="nominal"
            name={t('Nominal Leverage ({{leverage}}x)', { leverage })}
            stroke="var(--fg-tertiary)"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            dot={false}
            isAnimationActive={seriesAnimationActive}
          />
          <Line
            type="monotone"
            dataKey="effective"
            name={t('Effective Leverage')}
            stroke={CHART_COLORS[2]}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3 }}
            connectNulls
            isAnimationActive={seriesAnimationActive}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
interface StatRow {
  metric: string;
  value: number;
}
function buildStatColumns(t: TFunction): Column<StatRow>[] {
  return [
    {
      key: 'metric',
      label: t('Metric'),
      render: (r) => t(r.metric),
      sortValue: (r) => t(r.metric),
    },
    {
      key: 'value',
      label: t('Value'),
      sortValue: (r) => r.value,
      render: (r) => (
        <span className="font-mono font-semibold tabular-nums text-fg">{fmtPct(r.value)}</span>
      ),
    },
  ];
}
function buildStatRows(results: LETFResult): StatRow[] {
  return [
    { metric: 'letf.stats.benchmarkReturn', value: results.stats.benchmarkReturn },
    { metric: 'letf.stats.letfReturn', value: results.stats.letfReturn },
    { metric: 'letf.stats.expectedReturn', value: results.stats.expectedReturn },
    { metric: 'letf.stats.slippage', value: results.stats.slippage },
    { metric: 'letf.stats.annualDecay', value: results.annualDecay },
  ];
}
function LETFStatsTable({ results }: { results: LETFResult }) {
  const { t } = useTranslation();
  const columns = buildStatColumns(t);
  const rows = buildStatRows(results);
  return (
    <ChartCard title={t('Comparison Statistics')}>
      <SortableTable columns={columns} data={rows} initialSortKey="value" initialSortDir="desc" />
    </ChartCard>
  );
}
export function LETFResultsPanel({ results, error, isLoading, leverage }: LETFResultsProps) {
  const { t } = useTranslation();
  const slippageChartData = useMemo<SlippageCurveDataPoint[]>(() => {
    if (!results) return [];
    return results.slippageCurve.map((p, i) => {
      const daily = i === 0 ? p.slippage : p.slippage - results.slippageCurve[i - 1].slippage;
      return {
        date: p.date,
        cumulative: +(p.slippage * 100).toFixed(4),
        daily: +(daily * 100).toFixed(4),
      };
    });
  }, [results]);
  const leverageChartData = useMemo<LeverageComparisonDataPoint[]>(() => {
    if (!results) return [];
    return results.slippageCurve.map((p, i) => {
      const lev = results.effectiveLeverage[i];
      return {
        date: p.date,
        effective: lev == null || isNaN(lev) ? null : +lev.toFixed(3),
        nominal: leverage,
      };
    });
  }, [results, leverage]);
  return (
    <ResultsShell
      error={error}
      isLoading={isLoading}
      hasResults={!!results}
      errorPrefix={t('Analysis failed: ')}
      emptyTitle={t('Set parameters and click "Run Analysis" to view results')}
    >
      {results && (
        <div className="flex flex-col gap-4">
          <LETFKpiCards results={results} />
          <SlippageCurveChart data={slippageChartData} />
          <LeverageComparisonChart data={leverageChartData} leverage={leverage} />
          <LETFStatsTable results={results} />
        </div>
      )}
    </ResultsShell>
  );
}
