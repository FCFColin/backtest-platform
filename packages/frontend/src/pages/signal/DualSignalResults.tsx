import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { fmtPct, fmtRatio, downsample } from '@/utils/format';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import type { SignalAnalysisResult } from '@backtest/shared/types/signal';
import { CollapsibleSection } from '@/components/cards';
import { Button } from '@/components/ui/uiComponents.js';
import {
  SortableTable,
  type TableColumn,
  SimpleTable,
  type SimpleTableColumn,
} from '../../components/tables.js';
import { TimeSeriesLineChart } from '@/components/charts/TimeSeriesLineChart.js';
import { ResultsShell } from '@/components/resultsShell.js';
import { TableEmpty } from '@/components/stateDisplay.js';
import type { DualSignalResponse, SignalDir } from './signalState.js';
interface DualSignalResultsProps {
  results: DualSignalResponse | null;
  error: string | null;
  isLoading: boolean;
}
function renderDir(d: SignalDir, t: TFunction): ReactNode {
  if (d === 'buy') return <span className="font-semibold text-pos">{t('Buy')}</span>;
  if (d === 'sell') return <span className="font-semibold text-neg">{t('Sell')}</span>;
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
      label: (
        <>
          <span
            className="mr-1.5 inline-block size-2.5 rounded-full align-middle"
            style={{ backgroundColor: getPortfolioColor(idx) }}
          />
          {r.name}
        </>
      ),
      align: 'right' as const,
      render: (col: (typeof STAT_COLS)[number]) =>
        formatStat((r.stats as Record<string, number>)[col.key], col.fmt),
    })),
  ];
  return (
    <CollapsibleSection
      title={t('Combined Signal Stats vs Single Signal Stats')}
      defaultOpen
      className="rounded-xl border border-border bg-surface"
    >
      <SimpleTable columns={columns} data={STAT_COLS} rowKey={(r) => r.key} />
    </CollapsibleSection>
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
function DualSignalResultsBody({
  t,
  comparisonColumns,
  comparison,
  comparisonPage,
  prevPage,
  nextPage,
  statRows,
  equityData,
}: {
  t: TFunction;
  comparisonColumns: TableColumn<DualSignalResponse['comparison'][number]>[];
  comparison: DualSignalResponse['comparison'];
  comparisonPage: number;
  prevPage: () => void;
  nextPage: () => void;
  statRows: StatRow[];
  equityData: Array<Record<string, number | string>>;
}) {
  const pageSize = 100;
  const pageRows = comparison.slice(comparisonPage * pageSize, (comparisonPage + 1) * pageSize);
  const chartData = downsample(equityData, 400);
  return (
    <div className="flex flex-col gap-4">
      <StatsComparisonTable statRows={statRows} />
      <CollapsibleSection
        title={t('Signal Comparison ({{count}})', { count: comparison.length })}
        defaultOpen
        className="rounded-xl border border-border bg-surface"
      >
        {comparison.length > 0 ? (
          <>
            <div className="flex items-center justify-between border-b border-border px-4 py-2 text-caption text-fg-tertiary">
              <span>
                {comparisonPage * pageSize + 1}–
                {Math.min((comparisonPage + 1) * pageSize, comparison.length)} / {comparison.length}
              </span>
              <span className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={prevPage}
                  disabled={comparisonPage === 0}
                >
                  {t('Prev')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={nextPage}
                  disabled={comparisonPage >= Math.ceil(comparison.length / pageSize) - 1}
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
      </CollapsibleSection>
      <CollapsibleSection
        title={t('Equity Curve Comparison')}
        defaultOpen
        className="rounded-xl border border-border bg-surface"
      >
        <TimeSeriesLineChart
          data={chartData}
          series={[
            { dataKey: 'signal1', legendName: t('Sig1'), strokeWidth: 1.5 },
            { dataKey: 'signal2', legendName: t('Sig2'), strokeWidth: 1.5 },
            { dataKey: 'combined', legendName: t('Portfolio'), strokeWidth: 2.5 },
          ]}
          referenceY={10000}
          tooltipLabelFormatter={(label) => `${t('Date')}: ${label}`}
        />
      </CollapsibleSection>
    </div>
  );
}
export function DualSignalResultsPanel({ results, error, isLoading }: DualSignalResultsProps) {
  const { t } = useTranslation();
  const comparisonColumns = buildComparisonColumns(t);
  const [comparisonPage, setComparisonPage] = useState(0);
  useEffect(() => setComparisonPage(0), [results]);
  const comparison = results
    ? results.comparison.filter((r) => r.signal1 || r.signal2 || r.combined)
    : [];
  const pageSize = 100;
  const pageCount = Math.max(1, Math.ceil(comparison.length / pageSize));
  const prevPage = () => setComparisonPage((p) => Math.max(0, p - 1));
  const nextPage = () => setComparisonPage((p) => Math.min(pageCount - 1, p + 1));
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
        comparisonColumns={comparisonColumns}
        comparison={comparison}
        comparisonPage={comparisonPage}
        prevPage={prevPage}
        nextPage={nextPage}
        statRows={statRows}
        equityData={equityData}
      />
    </ResultsShell>
  );
}
