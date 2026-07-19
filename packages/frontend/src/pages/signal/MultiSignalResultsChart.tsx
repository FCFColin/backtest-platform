/**
 * @file 多信号聚合结果展示
 * @description 聚合统计卡片 + 各信号贡献度表 + 聚合权益曲线
 */
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { fmtPct, fmtRatio } from '@/utils/format';
import ChartCard from '../../components/ChartCard.js';
import { SortableTable, type Column } from '../../components/SortableTable.js';
import {
  ResultsContainer,
  AnalysisErrorAlert,
  EmptyResultsHint,
  EquityLineChart,
} from './SignalResultsPanel.js';
import type { MultiSignalResponse } from './multiSignalTypes.js';

interface MultiSignalResultsProps {
  results: MultiSignalResponse | null;
  error: string | null;
  isLoading: boolean;
}

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

function buildAggStatRows(results: MultiSignalResponse) {
  const s = results.aggregated.statistics;
  return [
    { label: 'signal.multi.statTotalSignals', value: String(s.totalSignals) },
    { label: 'signal.multi.statWinRate', value: fmtPct(s.winRate) },
    { label: 'signal.multi.statAvgReturn', value: fmtPct(s.avgReturn) },
    { label: 'signal.multi.statMaxDrawdown', value: fmtPct(s.maxDrawdown) },
    { label: 'signal.multi.statSharpe', value: fmtRatio(s.sharpe) },
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
          <ChartCard title={t('signal.multi.aggStatsTitle')}>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {aggStatRows.map((r) => (
                <div className="card" key={r.label} style={{ padding: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t(r.label)}</div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 600,
                      color: 'var(--text-strong)',
                      marginTop: 4,
                    }}
                  >
                    {r.value}
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>
          <ChartCard title={t('signal.multi.contributionTitle')}>
            {results.contributions.length > 0 ? (
              <SortableTable
                columns={contributionColumns}
                data={results.contributions}
                initialSortKey="contribution"
                initialSortDir="desc"
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
                {t('signal.multi.noContribution')}
              </div>
            )}
          </ChartCard>
          <ChartCard title={t('signal.multi.equityCurve')}>
            <EquityLineChart
              data={results.aggregated.equityCurve}
              series={[{ dataKey: 'value', legendName: t('signal.multi.aggEquity') }]}
              tooltipName={t('signal.common.equity')}
            />
          </ChartCard>
        </>
      )}
      {!results && !error && !isLoading && <EmptyResultsHint />}
    </ResultsContainer>
  );
}
