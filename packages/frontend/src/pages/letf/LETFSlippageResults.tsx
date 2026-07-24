/**
 * @file LETF Slippage 结果面板
 * @description KPI 卡片 + 滑点曲线 + 杠杆对比 + 对比统计，负责将原始结果转换为图表数据。
 *   基于 shadcn Card + token 体系，参照计算器结果区模式。
 */
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { LETFResult } from '@backtest/shared';
import { fmtPct } from '@/utils/format';
import { AnalysisErrorAlert, EmptyResultsHint } from '@/components/resultsShell.js';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { SlippageCurveChart, LeverageComparisonChart } from './LETFSlippageCharts.js';
import { LETFStatsTable } from './LETFSlippageTable.js';
import type { SlippageCurveDataPoint, LeverageComparisonDataPoint } from './letfSlippageTypes.js';

/** 结果面板属性 */
interface LETFResultsProps {
  /** 分析结果，null 表示尚未运行 */
  results: LETFResult | null;
  /** 错误信息，null 表示无错误 */
  error: string | null;
  /** 是否加载中 */
  isLoading: boolean;
  /** 当前杠杆倍数 */
  leverage: number;
}

/** KPI 卡片 Props */
interface KpiCardProps {
  /** 标签文本 */
  label: ReactNode;
  /** 数值文本（已格式化） */
  value: ReactNode;
  /** 是否使用 danger 色调（负值），默认 false */
  danger?: boolean;
}

/**
 * KPI 指标卡片：Card + caption 标签 + 等宽大号数值。
 * @param props - 见 KpiCardProps
 * @returns 渲染的 KPI 卡片
 */
function KpiCard({ label, value, danger = false }: KpiCardProps) {
  return (
    <Card className="p-4">
      <div className="mb-1 text-caption text-fg-tertiary">{label}</div>
      <div
        className={cn(
          'font-mono text-2xl font-bold tabular-nums',
          danger ? 'text-danger' : 'text-fg',
        )}
      >
        {value}
      </div>
    </Card>
  );
}

/** KPI 卡片组 */
function LETFKpiCards({ results }: { results: LETFResult }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard
        label={t('letf.results.kpiAnnualDecay')}
        value={fmtPct(results.annualDecay)}
        danger={results.annualDecay < 0}
      />
      <KpiCard
        label={t('letf.results.kpiBenchmarkReturn')}
        value={fmtPct(results.stats.benchmarkReturn)}
      />
      <KpiCard
        label={t('letf.results.kpiLetfReturn')}
        value={fmtPct(results.stats.letfReturn)}
      />
      <KpiCard
        label={t('letf.results.kpiTotalSlippage')}
        value={fmtPct(results.stats.slippage)}
        danger={results.stats.slippage < 0}
      />
    </div>
  );
}

/**
 * LETF Slippage 结果面板。
 *
 * 将原始 LETFResult 转换为滑点曲线与杠杆对比图表数据，依次渲染：
 * KPI 卡片组 → 滑点曲线图 → 杠杆对比图 → 对比统计表格。
 * @param props - 见 LETFResultsProps
 * @returns 渲染的结果面板
 */
export function LETFResultsPanel({ results, error, isLoading, leverage }: LETFResultsProps) {
  const { t } = useTranslation();
  const slippageChartData = useMemo<SlippageCurveDataPoint[]>(() => {
    if (!results) return [];
    return results.slippageCurve.map((p, i) => {
      const daily = i === 0 ? p.slippage : p.slippage - results.slippageCurve[i - 1].slippage;
      return {
        date: p.date,
        cumulative: +(p.slippage * 100).toFixed(4),
        daily: +(daily * 100).toFixed(4),
      };
    });
  }, [results]);

  const leverageChartData = useMemo<LeverageComparisonDataPoint[]>(() => {
    if (!results) return [];
    return results.slippageCurve.map((p, i) => {
      const lev = results.effectiveLeverage[i];
      return {
        date: p.date,
        effective: lev == null || isNaN(lev) ? null : +lev.toFixed(3),
        nominal: leverage,
      };
    });
  }, [results, leverage]);

  return (
    <div className="flex flex-col gap-4">
      <AnalysisErrorAlert error={error} prefix={t('letf.analysisFailedPrefix')} />

      {results && (
        <div className="flex flex-col gap-4">
          <LETFKpiCards results={results} />
          <SlippageCurveChart data={slippageChartData} />
          <LeverageComparisonChart data={leverageChartData} leverage={leverage} />
          <LETFStatsTable results={results} />
        </div>
      )}

      {!results && !error && !isLoading && <EmptyResultsHint text={t('letf.emptyHint')} />}
    </div>
  );
}
