/**
 * @file DualSignal 结果面板
 * @description 统计对比表 + 信号方向对比表 + 权益曲线对比；从 DualSignalPage 拆分以便独立维护。
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { fmtPct, fmtRatio } from '@/utils/format';
import { CHART_COLORS } from '@backtest/shared';
import type { SignalAnalysisResult } from '@backtest/shared/types/signal';
import ChartCard from '../../components/ChartCard.js';
import { SortableTable, type Column } from '../../components/SortableTable.js';
import { SimpleTable, type SimpleTableColumn } from '../../components/SimpleTable.js';
import {
  ResultsContainer,
  AnalysisErrorAlert,
  EmptyResultsHint,
  EquityLineChart,
} from './SignalResultsPanel.js';
import type { DualSignalResponse, SignalDir } from './dualSignalTypes.js';

/** DualSignal 结果面板 Props */
interface DualSignalResultsProps {
  results: DualSignalResponse | null;
  error: string | null;
  isLoading: boolean;
}

/** 信号方向渲染 */
function renderDir(d: SignalDir, t: TFunction): ReactNode {
  if (d === 'buy')
    return <span style={{ color: '#1a7a3a', fontWeight: 600 }}>{t('signal.common.buy')}</span>;
  if (d === 'sell')
    return <span style={{ color: '#c94a4a', fontWeight: 600 }}>{t('signal.common.sell')}</span>;
  return <span style={{ color: 'var(--text-muted)' }}>—</span>;
}

/** 权益曲线合并 */
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

/** 统计列定义 */
const STAT_COLS: { key: string; label: string; fmt: 'int' | 'pct' | 'ratio' }[] = [
  { key: 'totalSignals', label: 'signal.dual.statTotalSignals', fmt: 'int' },
  { key: 'winRate', label: 'signal.dual.statWinRate', fmt: 'pct' },
  { key: 'avgReturn', label: 'signal.dual.statAvgReturn', fmt: 'pct' },
  { key: 'maxDrawdown', label: 'signal.dual.statMaxDrawdown', fmt: 'pct' },
  { key: 'sharpe', label: 'signal.dual.statSharpe', fmt: 'ratio' },
];

function formatStat(v: number, fmt: 'int' | 'pct' | 'ratio'): string {
  if (fmt === 'int') return String(v);
  if (fmt === 'pct') return fmtPct(v);
  return fmtRatio(v);
}

/** 统计对比表 */
function StatsComparisonTable({
  statRows,
}: {
  statRows: { name: string; stats: SignalAnalysisResult['statistics'] }[];
}) {
  const { t } = useTranslation();
  const columns: SimpleTableColumn<(typeof STAT_COLS)[number]>[] = [
    { key: 'metric', label: t('signal.dual.colMetric'), render: (col) => t(col.label) },
    ...statRows.map((r, idx) => ({
      key: `signal${idx}`,
      label: (
        <>
          <span
            className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
            style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
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
    <ChartCard title={t('signal.dual.statsComparison')}>
      <SimpleTable columns={columns} data={STAT_COLS} rowKey={(r) => r.key} />
    </ChartCard>
  );
}

/** 构建信号方向对比表列定义 */
function buildComparisonColumns(t: TFunction): Column<DualSignalResponse['comparison'][number]>[] {
  return [
    { key: 'date', label: t('signal.dual.colDate'), sortValue: (r) => r.date },
    {
      key: 'signal1',
      label: t('signal.dual.signal1'),
      render: (r) => renderDir(r.signal1, t),
      sortValue: (r) => r.signal1 ?? '',
    },
    {
      key: 'signal2',
      label: t('signal.dual.signal2'),
      render: (r) => renderDir(r.signal2, t),
      sortValue: (r) => r.signal2 ?? '',
    },
    {
      key: 'combined',
      label: t('signal.dual.combined'),
      render: (r) => renderDir(r.combined, t),
      sortValue: (r) => r.combined ?? '',
    },
  ];
}

/** DualSignal 结果面板 */
export function DualSignalResultsPanel({ results, error, isLoading }: DualSignalResultsProps) {
  const { t } = useTranslation();
  const comparisonColumns = buildComparisonColumns(t);

  const statRows = results
    ? [
        { name: t('signal.dual.signal1'), stats: results.signal1.statistics },
        { name: t('signal.dual.signal2'), stats: results.signal2.statistics },
        { name: t('signal.dual.combined'), stats: results.combined.statistics },
      ]
    : [];

  const equityData = results ? buildEquityData(results) : [];

  return (
    <ResultsContainer>
      <AnalysisErrorAlert error={error} />
      {results && (
        <>
          <StatsComparisonTable statRows={statRows} />
          <ChartCard
            title={t('signal.dual.signalComparison', { count: results.comparison.length })}
          >
            {results.comparison.length > 0 ? (
              <SortableTable
                columns={comparisonColumns}
                data={results.comparison}
                initialSortKey="date"
                initialSortDir="asc"
              />
            ) : (
              <div
                style={{
                  color: 'var(--text-muted)',
                  fontSize: 13,
                  padding: '24px 0',
                  textAlign: 'center',
                }}
              >
                {t('signal.common.noSignal')}
              </div>
            )}
          </ChartCard>
          <ChartCard title={t('signal.dual.equityCurveComparison')}>
            <EquityLineChart
              data={equityData}
              series={[
                {
                  dataKey: 'signal1',
                  legendName: t('signal.dual.signal1Short'),
                  strokeWidth: 1.5,
                },
                {
                  dataKey: 'signal2',
                  legendName: t('signal.dual.signal2Short'),
                  strokeWidth: 1.5,
                },
                {
                  dataKey: 'combined',
                  legendName: t('signal.dual.combinedShort'),
                  strokeWidth: 2.5,
                },
              ]}
              tooltipName=""
            />
          </ChartCard>
        </>
      )}
      {!results && !error && !isLoading && <EmptyResultsHint />}
    </ResultsContainer>
  );
}
