/**
 * @file DualSignal 结果面板
 * @description 统计对比表 + 信号方向对比表 + 权益曲线对比；从 DualSignalPage 拆分以便独立维护。
 *   基于 shadcn Card + CollapsibleSection，遵循 testfol.io 风格。
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { fmtPct, fmtRatio } from '@/utils/format';
import { CHART_COLORS } from '@backtest/shared';
import type { SignalAnalysisResult } from '@backtest/shared/types/signal';
import { CollapsibleSection } from '@/components/CollapsibleSection';
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

/**
 * 信号方向渲染：buy → pos 色，sell → neg 色，null → tertiary 灰。
 * @param d - 信号方向
 * @param t - i18n 翻译函数
 * @returns 渲染的方向标签
 */
function renderDir(d: SignalDir, t: TFunction): ReactNode {
  if (d === 'buy') return <span className="font-semibold text-pos">{t('signal.common.buy')}</span>;
  if (d === 'sell')
    return <span className="font-semibold text-neg">{t('signal.common.sell')}</span>;
  return <span className="text-fg-tertiary">-</span>;
}

/**
 * 合并三条权益曲线为按日期对齐的单份数据，供多系列折线图使用。
 * @param results - 双信号响应
 * @returns 按日期升序排列的权益曲线数据
 */
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

/** 统计列定义（key 与 SignalAnalysisResult.statistics 字段对齐） */
const STAT_COLS: { key: string; label: string; fmt: 'int' | 'pct' | 'ratio' }[] = [
  { key: 'totalSignals', label: 'signal.dual.statTotalSignals', fmt: 'int' },
  { key: 'winRate', label: 'signal.dual.statWinRate', fmt: 'pct' },
  { key: 'avgReturn', label: 'signal.dual.statAvgReturn', fmt: 'pct' },
  { key: 'maxDrawdown', label: 'signal.dual.statMaxDrawdown', fmt: 'pct' },
  { key: 'sharpe', label: 'signal.dual.statSharpe', fmt: 'ratio' },
];

/**
 * 按列格式化统计值。
 * @param v - 原始数值
 * @param fmt - 格式类型
 * @returns 格式化后的字符串
 */
function formatStat(v: number, fmt: 'int' | 'pct' | 'ratio'): string {
  if (fmt === 'int') return String(v);
  if (fmt === 'pct') return fmtPct(v);
  return fmtRatio(v);
}

/** 统计对比行数据 */
type StatRow = { name: string; stats: SignalAnalysisResult['statistics'] };

/**
 * 统计对比表 section：指标列 + 每个信号的统计列（带色点）。
 * @param statRows - 各信号统计行
 * @returns 渲染的统计对比表 section
 */
function StatsComparisonTable({ statRows }: { statRows: StatRow[] }) {
  const { t } = useTranslation();
  const columns: SimpleTableColumn<(typeof STAT_COLS)[number]>[] = [
    { key: 'metric', label: t('signal.dual.colMetric'), render: (col) => t(col.label) },
    ...statRows.map((r, idx) => ({
      key: `signal${idx}`,
      label: (
        <>
          <span
            className="mr-1.5 inline-block size-2.5 rounded-full align-middle"
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
    <CollapsibleSection
      title={t('signal.dual.statsComparison')}
      defaultOpen
      className="rounded-xl border border-border bg-surface"
    >
      <SimpleTable columns={columns} data={STAT_COLS} rowKey={(r) => r.key} />
    </CollapsibleSection>
  );
}

/**
 * 构建信号方向对比表列定义。
 * @param t - i18n 翻译函数
 * @returns 对比表列数组
 */
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

/**
 * DualSignal 结果面板（统计对比 + 信号对比 + 权益曲线对比 + 空态）。
 * @param props - 见 DualSignalResultsProps
 * @returns 渲染的结果面板
 */
export function DualSignalResultsPanel({ results, error, isLoading }: DualSignalResultsProps) {
  const { t } = useTranslation();
  const comparisonColumns = buildComparisonColumns(t);

  const statRows: StatRow[] = results
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
          <CollapsibleSection
            title={t('signal.dual.signalComparison', { count: results.comparison.length })}
            defaultOpen
            className="rounded-xl border border-border bg-surface"
          >
            {results.comparison.length > 0 ? (
              <SortableTable
                columns={comparisonColumns}
                data={results.comparison}
                initialSortKey="date"
                initialSortDir="asc"
              />
            ) : (
              <div className="py-6 text-center text-body text-fg-tertiary">
                {t('signal.common.noSignal')}
              </div>
            )}
          </CollapsibleSection>
          <CollapsibleSection
            title={t('signal.dual.equityCurveComparison')}
            defaultOpen
            className="rounded-xl border border-border bg-surface"
          >
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
          </CollapsibleSection>
        </>
      )}
      {!results && !error && !isLoading && <EmptyResultsHint />}
    </ResultsContainer>
  );
}
