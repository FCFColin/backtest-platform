import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { fmtPct } from '@/utils/format';
import { SortableTable, type Column } from '../../components/SortableTable.js';
import type { LETFResult } from '@backtest/shared';
import ChartCard from '../../components/ChartCard.js';
interface StatRow {
  metric: string;
  value: number;
}
function buildStatColumns(t: TFunction): Column<StatRow>[] {
  return [
    {
      key: 'metric',
      label: t('letf.stats.metric'),
      render: (r) => t(r.metric),
      sortValue: (r) => t(r.metric)
    },
    {
      key: 'value',
      label: t('letf.stats.value'),
      sortValue: (r) => r.value,
      render: (r) => <span className="font-mono font-semibold tabular-nums text-fg">{fmtPct(r.value)}</span>
    }
  ];
}
function buildStatRows(results: LETFResult): StatRow[] {
  return [
    { metric: 'letf.stats.benchmarkReturn', value: results.stats.benchmarkReturn },
    { metric: 'letf.stats.letfReturn', value: results.stats.letfReturn },
    { metric: 'letf.stats.expectedReturn', value: results.stats.expectedReturn },
    { metric: 'letf.stats.slippage', value: results.stats.slippage },
    { metric: 'letf.stats.annualDecay', value: results.annualDecay }
  ];
}
export function LETFStatsTable({ results }: { results: LETFResult }) {
  const { t } = useTranslation();
  const columns = buildStatColumns(t);
  const rows = buildStatRows(results);
  return (
    <ChartCard title={t('letf.results.comparisonStats')}>
      <SortableTable columns={columns} data={rows} initialSortKey="value" initialSortDir="desc" />
    </ChartCard>
  );
}
