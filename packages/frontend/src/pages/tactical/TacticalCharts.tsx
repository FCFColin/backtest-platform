import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart } from 'lucide-react';
import { Card } from '@/components/ui/uiComponents';
import { EmptyState } from '@/components/EmptyState';
import { SortableTable, type Column } from '@/components/SortableTable';
import { TimeSeriesLineChart } from '@/components/charts/TimeSeriesLineChart';
import { buildGrowthData, buildStatRows, type StatRow } from './tacticalResultUtils';
import { SignalHistoryTable } from './TacticalTables';
import type { BacktestResponse } from './TacticalUtils';
function ChartCardTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 text-h3 text-fg">{children}</h3>;
}
function GrowthChart({ growthData }: { growthData: Array<Record<string, number | string>> }) {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <ChartCardTitle>{t('tactical.results.growthTitle')}</ChartCardTitle>
      <TimeSeriesLineChart
        data={growthData}
        height={380}
        tooltipLabelFormatter={(label) => t('tactical.results.dateLabel', { label })}
        series={[
          { dataKey: 'tactical', legendName: t('tactical.results.tactical') },
          {
            dataKey: 'benchmark',
            legendName: t('tactical.results.benchmark'),
            strokeDasharray: '6 3'
          }
        ]}
      />
    </Card>
  );
}
function BacktestResultTab({ results }: { results: BacktestResponse }) {
  const { t } = useTranslation();
  const { portfolio, benchmark, signalHistory } = results;
  const growthData = useMemo(() => buildGrowthData(portfolio, benchmark), [portfolio, benchmark]);
  const statRows = useMemo(() => buildStatRows(portfolio, benchmark, t), [portfolio, benchmark, t]);
  const statColumns: Column<StatRow>[] = [
    { key: 'metric', label: t('tactical.results.metric') },
    {
      key: 'tactical',
      label: t('tactical.results.tactical'),
      sortValue: (r) => r._sortTactical,
      render: (r) => <span className="font-mono tabular-nums">{r.tactical}</span>
    },
    {
      key: 'benchmark',
      label: t('tactical.results.benchmark'),
      render: (r) => <span className="font-mono tabular-nums">{r.benchmark}</span>
    }
  ];
  return (
    <div className="flex flex-col gap-3">
      <GrowthChart growthData={growthData} />
      <Card className="p-4">
        <ChartCardTitle>{t('tactical.results.statsTitle')}</ChartCardTitle>
        <SortableTable columns={statColumns} data={statRows} initialSortKey="tactical" initialSortDir="desc" />
      </Card>
      {signalHistory.length > 0 && <SignalHistoryTable signalHistory={signalHistory} />}
    </div>
  );
}
function BacktestEmptyState() {
  const { t } = useTranslation();
  return <EmptyState icon={LineChart} title={t('tactical.results.noResultsHint')} className="py-16" />;
}
export { BacktestResultTab, BacktestEmptyState };
