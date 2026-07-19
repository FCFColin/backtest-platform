import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ChartCard from '../../components/ChartCard.js';
import { SortableTable, type Column } from '../../components/SortableTable.js';
import { TimeSeriesLineChart } from '@/components/charts/TimeSeriesLineChart.js';
import { buildGrowthData, buildStatRows } from './tacticalResultUtils.js';
import type { StatRow } from './tacticalTypes.js';
import { SignalHistoryTable } from './TacticalTables.js';
import type { BacktestResponse } from './TacticalUtils.js';

function GrowthChart({ growthData }: { growthData: Array<Record<string, number | string>> }) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('tactical.results.growthTitle')}>
      <TimeSeriesLineChart
        data={growthData}
        height={380}
        tooltipLabelFormatter={(label) => t('tactical.results.dateLabel', { label })}
        series={[
          { dataKey: 'tactical', legendName: t('tactical.results.tactical') },
          {
            dataKey: 'benchmark',
            legendName: t('tactical.results.benchmark'),
            strokeDasharray: '6 3',
          },
        ]}
      />
    </ChartCard>
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
    },
    { key: 'benchmark', label: t('tactical.results.benchmark') },
  ];
  return (
    <div className="space-y-4">
      <GrowthChart growthData={growthData} />
      <ChartCard title={t('tactical.results.statsTitle')}>
        <SortableTable
          columns={statColumns}
          data={statRows}
          initialSortKey="tactical"
          initialSortDir="desc"
        />
      </ChartCard>
      {signalHistory.length > 0 && <SignalHistoryTable signalHistory={signalHistory} />}
    </div>
  );
}

function BacktestEmptyState() {
  const { t } = useTranslation();
  return (
    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48, fontSize: 14 }}>
      {t('tactical.results.noResultsHint')}
    </div>
  );
}

export { BacktestResultTab, BacktestEmptyState };
