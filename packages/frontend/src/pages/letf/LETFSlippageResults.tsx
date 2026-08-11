import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { LETFResult } from '@backtest/shared';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { fmtPct } from '@/utils/format';
import { ResultsShell } from '@/components/resultsShell.js';
import { Card } from '@/components/ui/uiComponents';
import { TimeSeriesLineChart } from '@/components/charts/TimeSeriesLineChart.js';
import { cn } from '@/lib/utils';
import ChartCard from '../../components/ChartCard.js';
import { SortableTable, type TableColumn } from '../../components/tables.js';
interface SlippageCurveDataPoint extends Record<string, number | string | null> {
  date: string;
  cumulative: number;
  daily: number;
}
interface LeverageComparisonDataPoint extends Record<string, number | string | null> {
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
  return (
    <ChartCard title={t('Slippage Curve')}>
      <TimeSeriesLineChart
        data={data}
        height={350}
        yTickFormatter={(v: number) => `${v.toFixed(1)}%`}
        tooltipValueFormatter={(v: number) => [`${v.toFixed(2)}%`, '']}
        tooltipLabelFormatter={(label: string) => t('Date: {{date}}', { date: label })}
        referenceY={0}
        series={[
          { dataKey: 'cumulative', legendName: t('Cumulative Slippage'), strokeWidth: 2 },
          {
            dataKey: 'daily',
            legendName: t('Daily Slippage'),
            strokeWidth: 1,
            strokeOpacity: 0.6,
            activeDotR: 3,
          },
        ]}
      />
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
  return (
    <ChartCard title={t('Effective vs Nominal Leverage')}>
      <TimeSeriesLineChart
        data={data}
        height={300}
        yTickFormatter={(v: number) => `${v.toFixed(1)}x`}
        tooltipValueFormatter={(v: number) => [`${v.toFixed(2)}x`, '']}
        tooltipLabelFormatter={(label: string) => t('Date: {{date}}', { date: label })}
        series={[
          {
            dataKey: 'nominal',
            legendName: t('Nominal Leverage ({{leverage}}x)', { leverage }),
            color: 'hsl(var(--fg-tertiary))',
            strokeWidth: 1.5,
            strokeDasharray: '6 3',
          },
          {
            dataKey: 'effective',
            legendName: t('Effective Leverage'),
            color: getPortfolioColor(2),
            strokeWidth: 1.5,
            activeDotR: 3,
            connectNulls: true,
          },
        ]}
      />
    </ChartCard>
  );
}
interface StatRow {
  metric: string;
  value: number;
}
function buildStatColumns(t: TFunction): TableColumn<StatRow>[] {
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
    { metric: 'Benchmark Return', value: results.stats.benchmarkReturn },
    { metric: 'LETF Return', value: results.stats.letfReturn },
    { metric: 'Expected Return', value: results.stats.expectedReturn },
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
