import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { fmtPct, fmtRatio } from '@/utils/format';
import { Card } from '@/components/ui/uiComponents';
import { CollapsibleSection } from '@/components/CollapsibleSection';
import { SortableTable, type Column } from '../../components/SortableTable.js';
import { ResultsContainer, AnalysisErrorAlert, EmptyResultsHint, EquityLineChart } from './SignalResultsPanel.js';
import type { MultiSignalResponse } from './signalTypes.js';
interface MultiSignalResultsProps {
  results: MultiSignalResponse | null;
  error: string | null;
  isLoading: boolean;
}
interface AggStatRow {
  label: string;
  value: string;
}
interface StatCardProps {
  label: string;
  value: string;
}
function StatCard({ label, value }: StatCardProps) {
  return (
    <Card className="p-3">
      <div className="text-caption text-fg-tertiary">{label}</div>
      <div className="mt-1 font-mono text-h1 font-semibold tabular-nums text-fg">{value}</div>
    </Card>
  );
}
function buildContributionColumns(t: TFunction): Column<MultiSignalResponse['contributions'][number]>[] {
  return [
    { key: 'index', label: t('signal.multi.colIndex'), sortValue: (r) => r.index },
    { key: 'indicator', label: t('signal.multi.colIndicator'), sortValue: (r) => r.indicator },
    {
      key: 'contribution',
      label: t('signal.multi.colContribution'),
      render: (r) => fmtPct(r.contribution),
      sortValue: (r) => r.contribution
    },
    {
      key: 'winRate',
      label: t('signal.multi.colWinRate'),
      render: (r) => fmtPct(r.statistics.winRate),
      sortValue: (r) => r.statistics.winRate
    },
    {
      key: 'totalSignals',
      label: t('signal.multi.colTotalSignals'),
      render: (r) => String(r.statistics.totalSignals),
      sortValue: (r) => r.statistics.totalSignals
    }
  ];
}
function buildAggStatRows(results: MultiSignalResponse): AggStatRow[] {
  const s = results.aggregated.statistics;
  return [
    { label: 'signal.multi.statTotalSignals', value: String(s.totalSignals) },
    { label: 'signal.multi.statWinRate', value: fmtPct(s.winRate) },
    { label: 'signal.multi.statAvgReturn', value: fmtPct(s.avgReturn) },
    { label: 'signal.multi.statMaxDrawdown', value: fmtPct(s.maxDrawdown) },
    { label: 'signal.multi.statSharpe', value: fmtRatio(s.sharpe) }
  ];
}
export function MultiSignalResultsPanel({ results, error, isLoading }: MultiSignalResultsProps) {
  const { t } = useTranslation();
  const aggStatRows = results ? buildAggStatRows(results) : [];
  const contributionColumns = buildContributionColumns(t);
  return (
    <ResultsContainer>
      <AnalysisErrorAlert error={error} />
      {results && (
        <>
          <CollapsibleSection title={t('signal.multi.aggStatsTitle')} defaultOpen className="rounded-xl border border-border bg-surface">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {aggStatRows.map((r) => (
                <StatCard key={r.label} label={t(r.label)} value={r.value} />
              ))}
            </div>
          </CollapsibleSection>
          <CollapsibleSection title={t('signal.multi.contributionTitle')} defaultOpen className="rounded-xl border border-border bg-surface">
            {results.contributions.length > 0 ? <SortableTable columns={contributionColumns} data={results.contributions} initialSortKey="contribution" initialSortDir="desc" /> : <div className="py-6 text-center text-body text-fg-tertiary">{t('signal.multi.noContribution')}</div>}
          </CollapsibleSection>
          <CollapsibleSection title={t('signal.multi.equityCurve')} defaultOpen className="rounded-xl border border-border bg-surface">
            <EquityLineChart data={results.aggregated.equityCurve} series={[{ dataKey: 'value', legendName: t('signal.multi.aggEquity') }]} tooltipName={t('signal.common.equity')} />
          </CollapsibleSection>
        </>
      )}
      {!results && !error && !isLoading && <EmptyResultsHint />}
    </ResultsContainer>
  );
}
