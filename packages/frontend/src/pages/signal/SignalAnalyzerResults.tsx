import { useTranslation } from 'react-i18next';
import { fmtPct, fmtRatio, fmtDollar } from '@/utils/format';
import type { SignalAnalysisResult } from '@backtest/shared/types/signal';
import { Card } from '@/components/ui/uiComponents';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/uiComponents';
import { SortableTable, type Column } from '../../components/SortableTable.js';
import { ResultsContainer, AnalysisErrorAlert, EmptyResultsHint, EquityLineChart } from './SignalResultsPanel.js';
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
function buildSignalColumns(t: (key: string) => string): Column<SignalRow>[] {
  return [
    { key: 'date', label: t('signal.analyzer.colDate'), sortValue: (r) => r.date },
    {
      key: 'type',
      label: t('signal.analyzer.colType'),
      render: (r) => <span className={r.type === 'buy' ? 'text-pos font-semibold' : 'text-neg font-semibold'}>{r.type === 'buy' ? t('signal.common.buy') : t('signal.common.sell')}</span>,
      sortValue: (r) => r.type
    },
    {
      key: 'price',
      label: t('signal.analyzer.colPrice'),
      render: (r) => fmtDollar(r.price),
      sortValue: (r) => r.price
    }
  ];
}
interface SignalListSectionProps {
  results: SignalAnalysisResult;
  signalColumns: Column<SignalRow>[];
}
function SignalListSection({ results, signalColumns }: SignalListSectionProps) {
  const { t } = useTranslation();
  if (results.signals.length > 0) {
    return <SortableTable columns={signalColumns} data={results.signals} initialSortKey="date" initialSortDir="asc" />;
  }
  return <div className="py-6 text-center text-body text-fg-tertiary">{t('signal.common.noSignal')}</div>;
}
interface EquityCurveSectionProps {
  equityCurve: SignalAnalysisResult['equityCurve'];
}
function EquityCurveSection({ equityCurve: data }: EquityCurveSectionProps) {
  const { t } = useTranslation();
  return <EquityLineChart data={data} series={[{ dataKey: 'value', legendName: t('signal.common.equity') }]} tooltipName={t('signal.common.equity')} />;
}
interface SignalResultsContentProps {
  results: SignalAnalysisResult;
  signalColumns: Column<SignalRow>[];
}
function SignalResultsContent({ results, signalColumns }: SignalResultsContentProps) {
  const { t } = useTranslation();
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label={t('signal.analyzer.statTotalSignals')} value={String(results.statistics.totalSignals)} />
        <StatCard label={t('signal.analyzer.statWinRate')} value={fmtPct(results.statistics.winRate)} />
        <StatCard label={t('signal.analyzer.statAvgReturn')} value={fmtPct(results.statistics.avgReturn)} />
        <StatCard label={t('signal.analyzer.statMaxDrawdown')} value={fmtPct(results.statistics.maxDrawdown)} />
        <StatCard label={t('signal.analyzer.statSharpe')} value={fmtRatio(results.statistics.sharpe)} />
      </div>
      <Tabs defaultValue="signals">
        <TabsList>
          <TabsTrigger value="signals">{t('signal.analyzer.signalListTitle', { count: results.signals.length })}</TabsTrigger>
          <TabsTrigger value="equity">{t('signal.analyzer.equityCurve')}</TabsTrigger>
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
export function SignalAnalyzerResultsPanel({ error, results, isLoading }: SignalAnalyzerResultsProps) {
  const { t } = useTranslation();
  const signalColumns = buildSignalColumns(t);
  return (
    <ResultsContainer>
      <AnalysisErrorAlert error={error} />
      {results && <SignalResultsContent results={results} signalColumns={signalColumns} />}
      {!results && !error && !isLoading && <EmptyResultsHint />}
    </ResultsContainer>
  );
}
