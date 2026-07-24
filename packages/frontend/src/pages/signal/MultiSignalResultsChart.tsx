/**
 * @file 多信号聚合结果展示
 * @description 聚合统计卡片 + 各信号贡献度表 + 聚合权益曲线。
 *   基于 shadcn Card + CollapsibleSection + chart-theme，遵循 testfol.io 风格。
 */
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { fmtPct, fmtRatio } from '@/utils/format';
import { Card } from '@/components/ui/card';
import { CollapsibleSection } from '@/components/CollapsibleSection';
import { SortableTable, type Column } from '../../components/SortableTable.js';
import {
  ResultsContainer,
  AnalysisErrorAlert,
  EmptyResultsHint,
  EquityLineChart,
} from './SignalResultsPanel.js';
import type { MultiSignalResponse } from './multiSignalTypes.js';

/** MultiSignal 结果面板 Props */
interface MultiSignalResultsProps {
  results: MultiSignalResponse | null;
  error: string | null;
  isLoading: boolean;
}

/** 聚合统计行 */
interface AggStatRow {
  /** 统计项 i18n key */
  label: string;
  /** 已格式化的统计值 */
  value: string;
}

/** 统计卡片 Props */
interface StatCardProps {
  /** 统计项标签 */
  label: string;
  /** 统计值（已格式化） */
  value: string;
}

/**
 * 统计卡片：标签 + 大号数值。
 * @param props - 见 StatCardProps
 * @returns 渲染的统计卡片
 */
function StatCard({ label, value }: StatCardProps) {
  return (
    <Card className="p-3">
      <div className="text-caption text-fg-tertiary">{label}</div>
      <div className="mt-1 font-mono text-h1 font-semibold tabular-nums text-fg">{value}</div>
    </Card>
  );
}

/**
 * 构建贡献度对比表列定义。
 * @param t - i18n 翻译函数
 * @returns 贡献度表列数组
 */
function buildContributionColumns(
  t: TFunction,
): Column<MultiSignalResponse['contributions'][number]>[] {
  return [
    { key: 'index', label: t('signal.multi.colIndex'), sortValue: (r) => r.index },
    { key: 'indicator', label: t('signal.multi.colIndicator'), sortValue: (r) => r.indicator },
    {
      key: 'contribution',
      label: t('signal.multi.colContribution'),
      render: (r) => fmtPct(r.contribution),
      sortValue: (r) => r.contribution,
    },
    {
      key: 'winRate',
      label: t('signal.multi.colWinRate'),
      render: (r) => fmtPct(r.statistics.winRate),
      sortValue: (r) => r.statistics.winRate,
    },
    {
      key: 'totalSignals',
      label: t('signal.multi.colTotalSignals'),
      render: (r) => String(r.statistics.totalSignals),
      sortValue: (r) => r.statistics.totalSignals,
    },
  ];
}

/**
 * 构建聚合统计行（5 项核心指标）。
 * @param results - 多信号响应
 * @returns 聚合统计行数组
 */
function buildAggStatRows(results: MultiSignalResponse): AggStatRow[] {
  const s = results.aggregated.statistics;
  return [
    { label: 'signal.multi.statTotalSignals', value: String(s.totalSignals) },
    { label: 'signal.multi.statWinRate', value: fmtPct(s.winRate) },
    { label: 'signal.multi.statAvgReturn', value: fmtPct(s.avgReturn) },
    { label: 'signal.multi.statMaxDrawdown', value: fmtPct(s.maxDrawdown) },
    { label: 'signal.multi.statSharpe', value: fmtRatio(s.sharpe) },
  ];
}

/**
 * 多信号聚合结果面板（聚合统计 + 贡献度对比 + 权益曲线 + 空态）。
 * @param props - 见 MultiSignalResultsProps
 * @returns 渲染的结果面板
 */
export function MultiSignalResultsPanel({ results, error, isLoading }: MultiSignalResultsProps) {
  const { t } = useTranslation();
  const aggStatRows = results ? buildAggStatRows(results) : [];
  const contributionColumns = buildContributionColumns(t);

  return (
    <ResultsContainer>
      <AnalysisErrorAlert error={error} />
      {results && (
        <>
          <CollapsibleSection
            title={t('signal.multi.aggStatsTitle')}
            defaultOpen
            className="rounded-xl border border-border bg-surface"
          >
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {aggStatRows.map((r) => (
                <StatCard key={r.label} label={t(r.label)} value={r.value} />
              ))}
            </div>
          </CollapsibleSection>
          <CollapsibleSection
            title={t('signal.multi.contributionTitle')}
            defaultOpen
            className="rounded-xl border border-border bg-surface"
          >
            {results.contributions.length > 0 ? (
              <SortableTable
                columns={contributionColumns}
                data={results.contributions}
                initialSortKey="contribution"
                initialSortDir="desc"
              />
            ) : (
              <div className="py-6 text-center text-body text-fg-tertiary">
                {t('signal.multi.noContribution')}
              </div>
            )}
          </CollapsibleSection>
          <CollapsibleSection
            title={t('signal.multi.equityCurve')}
            defaultOpen
            className="rounded-xl border border-border bg-surface"
          >
            <EquityLineChart
              data={results.aggregated.equityCurve}
              series={[{ dataKey: 'value', legendName: t('signal.multi.aggEquity') }]}
              tooltipName={t('signal.common.equity')}
            />
          </CollapsibleSection>
        </>
      )}
      {!results && !error && !isLoading && <EmptyResultsHint />}
    </ResultsContainer>
  );
}
