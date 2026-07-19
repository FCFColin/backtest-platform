/**
 * @file 单信号分析结果面板子组件
 * @description 承载统计卡片、信号列表表、权益曲线
 */
import { useTranslation } from 'react-i18next';
import { fmtPct, fmtRatio, fmtDollar } from '@/utils/format';
import type { SignalAnalysisResult } from '@backtest/shared/types/signal';
import ChartCard from '../../components/ChartCard.js';
import { SortableTable, type Column } from '../../components/SortableTable.js';
import {
  ResultsContainer,
  AnalysisErrorAlert,
  EmptyResultsHint,
  EquityLineChart,
} from './SignalResultsPanel.js';

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
    <div className="card" style={{ padding: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-strong)', marginTop: 4 }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function buildSignalColumns(t: (key: string) => string): Column<SignalRow>[] {
  return [
    { key: 'date', label: t('signal.analyzer.colDate'), sortValue: (r) => r.date },
    {
      key: 'type',
      label: t('signal.analyzer.colType'),
      render: (r) => (
        <span style={{ color: r.type === 'buy' ? '#1a7a3a' : '#c94a4a', fontWeight: 600 }}>
          {r.type === 'buy' ? t('signal.common.buy') : t('signal.common.sell')}
        </span>
      ),
      sortValue: (r) => r.type,
    },
    {
      key: 'price',
      label: t('signal.analyzer.colPrice'),
      render: (r) => fmtDollar(r.price),
      sortValue: (r) => r.price,
    },
  ];
}

function SignalListSection({
  results,
  signalColumns,
}: {
  results: SignalAnalysisResult;
  signalColumns: Column<SignalRow>[];
}) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('signal.analyzer.signalListTitle', { count: results.signals.length })}>
      {results.signals.length > 0 ? (
        <SortableTable
          columns={signalColumns}
          data={results.signals}
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
  );
}

function EquityCurveSection({
  equityCurve: data,
}: {
  equityCurve: SignalAnalysisResult['equityCurve'];
}) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('signal.analyzer.equityCurve')}>
      <EquityLineChart
        data={data}
        series={[{ dataKey: 'value', legendName: t('signal.common.equity') }]}
        tooltipName={t('signal.common.equity')}
      />
    </ChartCard>
  );
}

function SignalResultsContent({
  results,
  signalColumns,
}: {
  results: SignalAnalysisResult;
  signalColumns: Column<SignalRow>[];
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label={t('signal.analyzer.statTotalSignals')}
          value={String(results.statistics.totalSignals)}
        />
        <StatCard
          label={t('signal.analyzer.statWinRate')}
          value={fmtPct(results.statistics.winRate)}
        />
        <StatCard
          label={t('signal.analyzer.statAvgReturn')}
          value={fmtPct(results.statistics.avgReturn)}
        />
        <StatCard
          label={t('signal.analyzer.statMaxDrawdown')}
          value={fmtPct(results.statistics.maxDrawdown)}
        />
        <StatCard
          label={t('signal.analyzer.statSharpe')}
          value={fmtRatio(results.statistics.sharpe)}
        />
      </div>
      <SignalListSection results={results} signalColumns={signalColumns} />
      <EquityCurveSection equityCurve={results.equityCurve} />
    </>
  );
}

/** 单信号分析结果面板 Props */
interface SignalAnalyzerResultsProps {
  error: string | null;
  results: SignalAnalysisResult | null;
  isLoading: boolean;
}

/** 单信号分析结果面板（错误态 + 统计卡 + 信号列表 + 权益曲线 + 空态） */
export function SignalAnalyzerResultsPanel({
  error,
  results,
  isLoading,
}: SignalAnalyzerResultsProps) {
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
