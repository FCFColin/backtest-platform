import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { fmtPct, fmtRatio, fmtAmount, downsample } from '@/utils/format';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import type { SignalAnalysisResult } from '@backtest/shared/types/signal';
import { ResultsSection, StatCard } from '@/components/cards';
import {
  Button,
  PortfolioLabel,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/uiComponents.js';
import {
  SortableTable,
  type TableColumn,
  SimpleTable,
  type SimpleTableColumn,
} from '../../components/tables.js';
import { TimeSeriesLineChart } from '@/components/charts/TimeSeriesLineChart.js';
import { ResultsShell } from '@/components/resultsShell.js';
import { TableEmpty } from '@/components/stateDisplay.js';
import { ComputeToolShell } from '@/components/shells/index.js';
import type { ComputeToolConfig } from '@/components/shells/index.js';
import {
  useSignalAnalyzerState,
  useDualSignalState,
  useMultiSignalState,
  type UseSignalAnalyzerStateResult,
  type UseDualSignalStateResult,
  type UseMultiSignalStateResult,
  type DualSignalResponse,
  type MultiSignalResponse,
  type SignalDir,
  type ResultsPanelProps,
} from './signalState.js';
import { SignalAnalyzerParamsPanel, DualSignalParamsPanel } from './SignalParamsPanel.js';
import { MultiSignalParamsPanel } from './SignalSelector.js';
function renderDir(d: SignalDir, t: TFunction): ReactNode {
  if (d === 'buy') return <span className="font-semibold text-success">{t('Buy')}</span>;
  if (d === 'sell') return <span className="font-semibold text-danger">{t('Sell')}</span>;
  return <span className="text-fg-tertiary">-</span>;
}
function buildEquityData(results: DualSignalResponse): Array<Record<string, number | string>> {
  const dateMap = new Map<string, Record<string, number | string>>();
  const series: Array<{ name: string; curve: SignalAnalysisResult['equityCurve'] }> = [
    { name: 'signal1', curve: results.signal1.equityCurve },
    { name: 'signal2', curve: results.signal2.equityCurve },
    { name: 'combined', curve: results.combined.equityCurve },
  ];
  for (const s of series) {
    for (const p of s.curve) {
      if (!dateMap.has(p.date)) dateMap.set(p.date, { date: p.date });
      dateMap.get(p.date)![s.name] = p.value;
    }
  }
  return Array.from(dateMap.values()).sort((a, b) =>
    (a.date as string).localeCompare(b.date as string),
  );
}
const STAT_COLS: { key: string; label: string; fmt: 'int' | 'pct' | 'ratio' }[] = [
  { key: 'totalSignals', label: 'signal.dual.statTotalSignals', fmt: 'int' },
  { key: 'winRate', label: 'Win Rate', fmt: 'pct' },
  { key: 'avgReturn', label: 'Average Return', fmt: 'pct' },
  { key: 'maxDrawdown', label: 'Max Drawdown', fmt: 'pct' },
  { key: 'sharpe', label: 'backtest.sharpeRatio', fmt: 'ratio' },
];
function formatStat(v: number, fmt: 'int' | 'pct' | 'ratio'): string {
  if (fmt === 'int') return String(v);
  if (fmt === 'pct') return fmtPct(v);
  return fmtRatio(v);
}
type StatRow = { name: string; stats: SignalAnalysisResult['statistics'] };
function StatsComparisonTable({ statRows }: { statRows: StatRow[] }) {
  const { t } = useTranslation();
  const columns: SimpleTableColumn<(typeof STAT_COLS)[number]>[] = [
    { key: 'metric', label: t('Metric'), render: (col) => t(col.label) },
    ...statRows.map((r, idx) => ({
      key: `signal${idx}`,
      label: <PortfolioLabel color={getPortfolioColor(idx)} name={r.name} />,
      align: 'right' as const,
      render: (col: (typeof STAT_COLS)[number]) =>
        formatStat((r.stats as Record<string, number>)[col.key], col.fmt),
    })),
  ];
  return (
    <ResultsSection title={t('Combined Signal Stats vs Single Signal Stats')}>
      <SimpleTable columns={columns} data={STAT_COLS} rowKey={(r) => r.key} />
    </ResultsSection>
  );
}
function buildComparisonColumns(
  t: TFunction,
): TableColumn<DualSignalResponse['comparison'][number]>[] {
  return [
    { key: 'date', label: t('Date'), sortValue: (r) => r.date },
    {
      key: 'signal1',
      label: t('Signal 1'),
      render: (r) => renderDir(r.signal1, t),
      sortValue: (r) => r.signal1 ?? '',
    },
    {
      key: 'signal2',
      label: t('Signal 2'),
      render: (r) => renderDir(r.signal2, t),
      sortValue: (r) => r.signal2 ?? '',
    },
    {
      key: 'combined',
      label: t('Combined Signal'),
      render: (r) => renderDir(r.combined, t),
      sortValue: (r) => r.combined ?? '',
    },
  ];
}
const PAGE_SIZE = 100;
function DualSignalResultsBody({
  t,
  comparisonColumns,
  comparison,
  comparisonPage,
  setComparisonPage,
  statRows,
  equityData,
}: {
  t: TFunction;
  comparisonColumns: TableColumn<DualSignalResponse['comparison'][number]>[];
  comparison: DualSignalResponse['comparison'];
  comparisonPage: number;
  setComparisonPage: (fn: (p: number) => number) => void;
  statRows: StatRow[];
  equityData: Array<Record<string, number | string>>;
}) {
  const pageRows = comparison.slice(comparisonPage * PAGE_SIZE, (comparisonPage + 1) * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(comparison.length / PAGE_SIZE));
  return (
    <div className="flex flex-col gap-4">
      <StatsComparisonTable statRows={statRows} />
      <ResultsSection title={t('Signal Comparison ({{count}})', { count: comparison.length })}>
        {comparison.length > 0 ? (
          <>
            <div className="flex items-center justify-between border-b border-border px-4 py-2 text-caption text-fg-tertiary">
              <span>
                {comparisonPage * PAGE_SIZE + 1}–
                {Math.min((comparisonPage + 1) * PAGE_SIZE, comparison.length)} /{' '}
                {comparison.length}
              </span>
              <span className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setComparisonPage((p) => Math.max(0, p - 1))}
                  disabled={comparisonPage === 0}
                >
                  {t('Prev')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setComparisonPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={comparisonPage >= pageCount - 1}
                >
                  {t('Next')}
                </Button>
              </span>
            </div>
            <SortableTable
              columns={comparisonColumns}
              data={pageRows}
              initialSortKey="date"
              initialSortDir="asc"
            />
          </>
        ) : (
          <TableEmpty message={t('No signals generated for the current parameters')} />
        )}
      </ResultsSection>
      <ResultsSection title={t('Equity Curve Comparison')}>
        <TimeSeriesLineChart
          data={downsample(equityData, 400)}
          series={[
            { dataKey: 'signal1', legendName: t('Sig1'), strokeWidth: 1.5 },
            { dataKey: 'signal2', legendName: t('Sig2'), strokeWidth: 1.5 },
            { dataKey: 'combined', legendName: t('Portfolio'), strokeWidth: 2.5 },
          ]}
          referenceY={10000}
          tooltipLabelFormatter={(label) => `${t('Date')}: ${label}`}
        />
      </ResultsSection>
    </div>
  );
}
function DualSignalResultsPanel({
  results,
  error,
  isLoading,
}: ResultsPanelProps<DualSignalResponse>) {
  const { t } = useTranslation();
  const [comparisonPage, setComparisonPage] = useState(0);
  useEffect(() => setComparisonPage(0), [results]);
  const comparison = results
    ? results.comparison.filter((r) => r.signal1 || r.signal2 || r.combined)
    : [];
  const statRows: StatRow[] = results
    ? [
        { name: t('Signal 1'), stats: results.signal1.statistics },
        { name: t('Signal 2'), stats: results.signal2.statistics },
        { name: t('Combined Signal'), stats: results.combined.statistics },
      ]
    : [];
  const equityData = results ? buildEquityData(results) : [];
  return (
    <ResultsShell
      error={error}
      errorPrefix={t('Analysis failed: ')}
      isLoading={isLoading}
      hasResults={!!results}
      emptyTitle={t('Set parameters and click "Run Analysis" to view results')}
    >
      <DualSignalResultsBody
        t={t}
        comparisonColumns={buildComparisonColumns(t)}
        comparison={comparison}
        comparisonPage={comparisonPage}
        setComparisonPage={setComparisonPage}
        statRows={statRows}
        equityData={equityData}
      />
    </ResultsShell>
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
function buildSignalColumns(
  t: (key: string) => string,
): TableColumn<{ date: string; type: 'buy' | 'sell'; price: number }>[] {
  return [
    { key: 'date', label: t('Date'), sortValue: (r) => r.date },
    {
      key: 'type',
      label: t('Type'),
      render: (r) => (
        <span
          className={r.type === 'buy' ? 'text-success font-semibold' : 'text-danger font-semibold'}
        >
          {r.type === 'buy' ? t('Buy') : t('Sell')}
        </span>
      ),
      sortValue: (r) => r.type,
    },
    {
      key: 'price',
      label: t('Price'),
      render: (r) => fmtAmount(r.price),
      sortValue: (r) => r.price,
    },
  ];
}
function SignalListSection({
  results,
  signalColumns,
}: {
  results: SignalAnalysisResult;
  signalColumns: TableColumn<{ date: string; type: 'buy' | 'sell'; price: number }>[];
}) {
  const { t } = useTranslation();
  return results.signals.length > 0 ? (
    <SortableTable
      columns={signalColumns}
      data={results.signals}
      initialSortKey="date"
      initialSortDir="asc"
    />
  ) : (
    <TableEmpty message={t('No signals generated for the current parameters')} />
  );
}
function EquityCurveSection({
  equityCurve: data,
}: {
  equityCurve: SignalAnalysisResult['equityCurve'];
}) {
  const { t } = useTranslation();
  return (
    <TimeSeriesLineChart
      data={downsample(data, 400)}
      series={[{ dataKey: 'value', legendName: t('Equity') }]}
      referenceY={10000}
      tooltipValueFormatter={(v) => [fmtAmount(v), t('Equity')]}
      tooltipLabelFormatter={(label) => `${t('Date')}: ${label}`}
    />
  );
}
function SignalResultsContent({
  results,
  signalColumns,
}: {
  results: SignalAnalysisResult;
  signalColumns: TableColumn<{ date: string; type: 'buy' | 'sell'; price: number }>[];
}) {
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
function SignalAnalyzerResultsPanel({
  error,
  results,
  isLoading,
  onRetry,
}: ResultsPanelProps<SignalAnalysisResult> & { onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <ResultsShell
      error={error}
      errorPrefix={t('Analysis failed: ')}
      isLoading={isLoading}
      hasResults={!!results}
      emptyTitle={t('Set parameters and click "Run Analysis" to view results')}
      onRetry={onRetry}
    >
      <div className="flex flex-col gap-4">
        <SignalResultsContent results={results!} signalColumns={buildSignalColumns(t)} />
      </div>
    </ResultsShell>
  );
}
function buildContributionColumns(
  t: TFunction,
): TableColumn<MultiSignalResponse['contributions'][number]>[] {
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
function buildAggStatRows(results: MultiSignalResponse) {
  const s = results.aggregated.statistics;
  return [
    { label: 'signal.dual.statTotalSignals', value: String(s.totalSignals) },
    { label: 'Win Rate', value: fmtPct(s.winRate) },
    { label: 'Average Return', value: fmtPct(s.avgReturn) },
    { label: 'Max Drawdown', value: fmtPct(s.maxDrawdown) },
    { label: 'backtest.sharpeRatio', value: fmtRatio(s.sharpe) },
  ];
}
function MultiSignalResultsPanel({
  results,
  error,
  isLoading,
}: ResultsPanelProps<MultiSignalResponse>) {
  const { t } = useTranslation();
  const aggStatRows = results ? buildAggStatRows(results) : [];
  return (
    <ResultsShell
      error={error}
      errorPrefix={t('Analysis failed: ')}
      isLoading={isLoading}
      hasResults={!!results}
      emptyTitle={t('Set parameters and click "Run Analysis" to view results')}
    >
      <div className="flex flex-col gap-4">
        <ResultsSection title={t('Aggregated Signal Statistics')}>
          <StatGrid rows={aggStatRows.map((r) => ({ label: t(r.label), value: r.value }))} />
        </ResultsSection>
        <ResultsSection title={t('Signal Contribution Comparison')}>
          {results!.contributions.length > 0 ? (
            <SortableTable
              columns={buildContributionColumns(t)}
              data={results!.contributions}
              initialSortKey="contribution"
              initialSortDir="desc"
            />
          ) : (
            <TableEmpty message={t('No contribution data')} />
          )}
        </ResultsSection>
        <ResultsSection title={t('Equity Curve')}>
          <TimeSeriesLineChart
            data={downsample(results?.aggregated.equityCurve ?? [], 400)}
            series={[{ dataKey: 'value', legendName: t('Aggregated Equity') }]}
            referenceY={10000}
            tooltipValueFormatter={(v) => [fmtAmount(v), t('Equity')]}
            tooltipLabelFormatter={(label) => `${t('Date')}: ${label}`}
          />
        </ResultsSection>
      </div>
    </ResultsShell>
  );
}
const analyzerConfig: ComputeToolConfig<UseSignalAnalyzerStateResult> = {
  titleKey: 'signal.analyzer.title',
  params: ({ state }) => <SignalAnalyzerParamsPanel state={state} />,
  results: ({ state }) => (
    <SignalAnalyzerResultsPanel
      error={state.error}
      results={state.results}
      isLoading={state.isLoading}
      onRetry={state.runAnalysis}
    />
  ),
};
export default function SignalAnalyzerPage() {
  const s = useSignalAnalyzerState();
  return <ComputeToolShell config={analyzerConfig} state={s} />;
}
const dualConfig: ComputeToolConfig<UseDualSignalStateResult> = {
  titleKey: 'signal.dual.title',
  params: ({ state }) => <DualSignalParamsPanel state={state} />,
  results: ({ state }) => (
    <DualSignalResultsPanel
      results={state.results}
      error={state.error}
      isLoading={state.isLoading}
    />
  ),
};
export function DualSignalPage() {
  const s = useDualSignalState();
  return <ComputeToolShell config={dualConfig} state={s} />;
}
const multiConfig: ComputeToolConfig<UseMultiSignalStateResult> = {
  titleKey: 'signal.multi.title',
  params: ({ state }) => <MultiSignalParamsPanel state={state} />,
  results: ({ state }) => (
    <MultiSignalResultsPanel
      results={state.results}
      error={state.error}
      isLoading={state.isLoading}
    />
  ),
};
export function MultiSignalPage() {
  const s = useMultiSignalState();
  return <ComputeToolShell config={multiConfig} state={s} />;
}
