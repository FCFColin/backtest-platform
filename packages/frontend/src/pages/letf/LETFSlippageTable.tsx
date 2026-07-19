/**
 * @file LETF Slippage 对比统计表格
 * @description 滑点分析对比指标的可排序表格，列定义与行构造为模块私有
 */
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { fmtPct } from '@/utils/format';
import { SortableTable, type Column } from '../../components/SortableTable.js';
import type { LETFResult } from '@backtest/shared';
import ChartCard from '../../components/ChartCard.js';

/** 对比统计行 */
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
      sortValue: (r) => t(r.metric),
    },
    {
      key: 'value',
      label: t('letf.stats.value'),
      sortValue: (r) => r.value,
      render: (r) => (
        <span className="font-mono" style={{ fontWeight: 600 }}>
          {fmtPct(r.value)}
        </span>
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

/** 对比统计表格（含卡片标题） */
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
