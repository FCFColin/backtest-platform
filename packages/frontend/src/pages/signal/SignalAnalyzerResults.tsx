/**
 * @file 单信号分析结果面板子组件
 * @description 承载统计卡片、信号列表表、权益曲线。基于 shadcn Card + Tabs。
 */
import { useTranslation } from 'react-i18next';
import { fmtPct, fmtRatio, fmtDollar } from '@/utils/format';
import type { SignalAnalysisResult } from '@backtest/shared/types/signal';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SortableTable, type Column } from '../../components/SortableTable.js';
import {
  ResultsContainer,
  AnalysisErrorAlert,
  EmptyResultsHint,
  EquityLineChart,
} from './SignalResultsPanel.js';

/** 信号行类型 */
interface SignalRow {
  date: string;
  type: 'buy' | 'sell';
  price: number;
}

/** 统计卡片 Props */
interface StatCardProps {
  /** 统计项标签 */
  label: string;
  /** 统计值（已格式化） */
  value: string;
  /** 可选辅助说明 */
  hint?: string;
}

/**
 * 统计卡片：标签 + 大号数值 + 可选说明。
 * @param props - 见 StatCardProps
 * @returns 渲染的统计卡片
 */
function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <Card className="p-3">
      <div className="text-caption text-fg-tertiary">{label}</div>
      <div className="mt-1 font-mono text-h1 font-semibold tabular-nums text-fg">{value}</div>
      {hint && <div className="mt-0.5 text-caption text-fg-tertiary">{hint}</div>}
    </Card>
  );
}

/**
 * 构建信号列表列定义。
 * @param t - i18n 翻译函数
 * @returns 信号列表列数组
 */
function buildSignalColumns(t: (key: string) => string): Column<SignalRow>[] {
  return [
    { key: 'date', label: t('signal.analyzer.colDate'), sortValue: (r) => r.date },
    {
      key: 'type',
      label: t('signal.analyzer.colType'),
      render: (r) => (
        <span className={r.type === 'buy' ? 'text-pos font-semibold' : 'text-neg font-semibold'}>
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

/** 信号列表 section Props */
interface SignalListSectionProps {
  results: SignalAnalysisResult;
  signalColumns: Column<SignalRow>[];
}

/**
 * 信号列表 section：信号数 > 0 渲染 SortableTable，否则渲染空提示。
 * @param props - 见 SignalListSectionProps
 * @returns 渲染的信号列表
 */
function SignalListSection({ results, signalColumns }: SignalListSectionProps) {
  const { t } = useTranslation();
  if (results.signals.length > 0) {
    return (
      <SortableTable
        columns={signalColumns}
        data={results.signals}
        initialSortKey="date"
        initialSortDir="asc"
      />
    );
  }
  return (
    <div className="py-6 text-center text-body text-fg-tertiary">{t('signal.common.noSignal')}</div>
  );
}

/** 权益曲线 section Props */
interface EquityCurveSectionProps {
  equityCurve: SignalAnalysisResult['equityCurve'];
}

/**
 * 权益曲线 section：渲染单系列 EquityLineChart。
 * @param props - 见 EquityCurveSectionProps
 * @returns 渲染的权益曲线
 */
function EquityCurveSection({ equityCurve: data }: EquityCurveSectionProps) {
  const { t } = useTranslation();
  return (
    <EquityLineChart
      data={data}
      series={[{ dataKey: 'value', legendName: t('signal.common.equity') }]}
      tooltipName={t('signal.common.equity')}
    />
  );
}

/** 信号结果内容 Props */
interface SignalResultsContentProps {
  results: SignalAnalysisResult;
  signalColumns: Column<SignalRow>[];
}

/**
 * 信号结果内容：统计卡网格 + Tabs（信号列表 / 权益曲线）。
 * @param props - 见 SignalResultsContentProps
 * @returns 渲染的结果内容
 */
function SignalResultsContent({ results, signalColumns }: SignalResultsContentProps) {
  const { t } = useTranslation();
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
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
      <Tabs defaultValue="signals">
        <TabsList>
          <TabsTrigger value="signals">
            {t('signal.analyzer.signalListTitle', { count: results.signals.length })}
          </TabsTrigger>
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

/** 单信号分析结果面板 Props */
interface SignalAnalyzerResultsProps {
  error: string | null;
  results: SignalAnalysisResult | null;
  isLoading: boolean;
}

/**
 * 单信号分析结果面板（错误态 + 统计卡 + 信号列表 + 权益曲线 + 空态）。
 * @param props - 见 SignalAnalyzerResultsProps
 * @returns 渲染的结果面板
 */
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
