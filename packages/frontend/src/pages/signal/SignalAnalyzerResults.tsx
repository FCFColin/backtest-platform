import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { fmtPct, fmtRatio, fmtDollar, downsample } from '@/utils/format';
import type { SignalAnalysisResult } from '@backtest/shared/types/signal';
import type { MultiSignalResponse } from './signalTypes.js';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/uiComponents';
import { CollapsibleSection } from '@/components/cards';
import { SortableTable, type Column } from '../../components/tables.js';
import { TimeSeriesLineChart } from '@/components/charts/TimeSeriesLineChart.js';
import { ResultsShell } from '@/components/resultsShell.js';
import { TableEmpty } from '@/components/stateDisplay.js';
interface SignalRow {
  date: string;
  type: 'buy' | 'sell';
  price: number;
}
interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
}
function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <Card className="p-3">
      <div className="text-caption text-fg-tertiary">{label}</div>
      <div className="mt-1 font-mono text-h1 font-semibold tabular-nums text-fg">{value}</div>
      {hint && <div className="mt-0.5 text-caption text-fg-tertiary">{hint}</div>}
    </Card>
  );
}
function StatGrid({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {rows.map((r) => (
        <StatCard key={r.label} label={r.label} value={r.value} />
      ))}
    </div>
  );
}
function buildSignalColumns(t: (key: string) => string): Column<SignalRow>[] {
  return [
    { key: 'date', label: t('Date'), sortValue: (r) => r.date },
    {
      key: 'type',
      label: t('Type'),
      render: (r) => (
        <span className={r.type === 'buy' ? 'text-pos font-semibold' : 'text-neg font-semibold'}>
          {r.type === 'buy' ? t('Buy') : t('Sell')}
        </span>
      ),
      sortValue: (r) => r.type,
    },
    {
      key: 'price',
      label: t('Price'),
      render: (r) => fmtDollar(r.price),
      sortValue: (r) => r.price,
    },
  ];
}
interface SignalListSectionProps {
  results: SignalAnalysisResult;
  signalColumns: Column<SignalRow>[];
}
function SignalListSection({ results, signalColumns }: SignalListSectionProps) {
  const { t } = useTranslation();
  if (results.signals.length > 0) {
    return (
      <SortableTable
        columns={signalColumns}
        data={results.signals}
        initialSortKey="date"
        initialSortDir="asc"
      />
    );
  }
  return <TableEmpty message={t('No signals generated for the current parameters')} />;
}
interface EquityCurveSectionProps {
  equityCurve: SignalAnalysisResult['equityCurve'];
}
function EquityCurveSection({ equityCurve: data }: EquityCurveSectionProps) {
  const { t } = useTranslation();
  const chartData = downsample(data, 400);
  return (
    <TimeSeriesLineChart
      data={chartData}
      series={[{ dataKey: 'value', legendName: t('Equity') }]}
      referenceY={10000}
      tooltipValueFormatter={(v) => [`$${v.toLocaleString()}`, t('Equity')]}
      tooltipLabelFormatter={(label) => `${t('Date')}: ${label}`}
    />
  );
}
interface SignalResultsContentProps {
  results: SignalAnalysisResult;
  signalColumns: Column<SignalRow>[];
}
function SignalResultsContent({ results, signalColumns }: SignalResultsContentProps) {
  const { t } = useTranslation();
  return (
    <>
      <StatGrid
        rows={[
          { label: t('Total Signals'), value: String(results.statistics.totalSignals) },
          { label: t('Win Rate'), value: fmtPct(results.statistics.winRate) },
          { label: t('Average Return'), value: fmtPct(results.statistics.avgReturn) },
          { label: t('Max Drawdown'), value: fmtPct(results.statistics.maxDrawdown) },
          { label: t('Sharpe'), value: fmtRatio(results.statistics.sharpe) },
        ]}
      />
      <Tabs defaultValue="signals">
        <TabsList>
          <TabsTrigger value="signals">
            {t('Signal List ({{count}})', { count: results.signals.length })}
          </TabsTrigger>
          <TabsTrigger value="equity">{t('Equity Curve')}</TabsTrigger>
        </TabsList>
        <TabsContent value="signals">
          <SignalListSection results={results} signalColumns={signalColumns} />
        </TabsContent>
        <TabsContent value="equity">
          <EquityCurveSection equityCurve={results.equityCurve} />
        </TabsContent>
      </Tabs>
    </>
  );
}
interface SignalAnalyzerResultsProps {
  error: string | null;
  results: SignalAnalysisResult | null;
  isLoading: boolean;
}
export function SignalAnalyzerResultsPanel({
  error,
  results,
  isLoading,
}: SignalAnalyzerResultsProps) {
  const { t } = useTranslation();
  const signalColumns = buildSignalColumns(t);
  return (
    <ResultsShell
      error={error}
      errorPrefix={t('Analysis failed: ')}
      isLoading={isLoading}
      hasResults={!!results}
      emptyTitle={t('Set parameters and click "Run Analysis" to view results')}
    >
      <div className="flex flex-col gap-4">
        <SignalResultsContent results={results!} signalColumns={signalColumns} />
      </div>
    </ResultsShell>
  );
}
interface AggStatRow {
  label: string;
  value: string;
}
function buildContributionColumns(
  t: TFunction,
): Column<MultiSignalResponse['contributions'][number]>[] {
  return [
    { key: 'index', label: '#', sortValue: (r) => r.index },
    { key: 'indicator', label: t('Metric'), sortValue: (r) => r.indicator },
    {
      key: 'contribution',
      label: t('Contribution (Avg Return)'),
      render: (r) => fmtPct(r.contribution),
      sortValue: (r) => r.contribution,
    },
    {
      key: 'winRate',
      label: t('Win Rate'),
      render: (r) => fmtPct(r.statistics.winRate),
      sortValue: (r) => r.statistics.winRate,
    },
    {
      key: 'totalSignals',
      label: t('Signals'),
      render: (r) => String(r.statistics.totalSignals),
      sortValue: (r) => r.statistics.totalSignals,
    },
  ];
}
function buildAggStatRows(results: MultiSignalResponse): AggStatRow[] {
  const s = results.aggregated.statistics;
  return [
    { label: 'signal.dual.statTotalSignals', value: String(s.totalSignals) },
    { label: 'Win Rate', value: fmtPct(s.winRate) },
    { label: 'Average Return', value: fmtPct(s.avgReturn) },
    { label: 'Max Drawdown', value: fmtPct(s.maxDrawdown) },
    { label: 'backtest.sharpeRatio', value: fmtRatio(s.sharpe) },
  ];
}
export function MultiSignalResultsPanel({
  results,
  error,
  isLoading,
}: {
  results: MultiSignalResponse | null;
  error: string | null;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const aggStatRows = results ? buildAggStatRows(results) : [];
  const contributionColumns = buildContributionColumns(t);
  const equityChartData = downsample(results?.aggregated.equityCurve ?? [], 400);
  return (
    <ResultsShell
      error={error}
      errorPrefix={t('Analysis failed: ')}
      isLoading={isLoading}
      hasResults={!!results}
      emptyTitle={t('Set parameters and click "Run Analysis" to view results')}
    >
      <div className="flex flex-col gap-4">
        <CollapsibleSection
          title={t('Aggregated Signal Statistics')}
          defaultOpen
          className="rounded-xl border border-border bg-surface"
        >
          <StatGrid rows={aggStatRows.map((r) => ({ label: t(r.label), value: r.value }))} />
        </CollapsibleSection>
        <CollapsibleSection
          title={t('Signal Contribution Comparison')}
          defaultOpen
          className="rounded-xl border border-border bg-surface"
        >
          {results!.contributions.length > 0 ? (
            <SortableTable
              columns={contributionColumns}
              data={results!.contributions}
              initialSortKey="contribution"
              initialSortDir="desc"
            />
          ) : (
            <TableEmpty message={t('No contribution data')} />
          )}
        </CollapsibleSection>
        <CollapsibleSection
          title={t('Equity Curve')}
          defaultOpen
          className="rounded-xl border border-border bg-surface"
        >
          <TimeSeriesLineChart
            data={equityChartData}
            series={[{ dataKey: 'value', legendName: t('Aggregated Equity') }]}
            referenceY={10000}
            tooltipValueFormatter={(v) => [`$${v.toLocaleString()}`, t('Equity')]}
            tooltipLabelFormatter={(label) => `${t('Date')}: ${label}`}
          />
        </CollapsibleSection>
      </div>
    </ResultsShell>
  );
}
