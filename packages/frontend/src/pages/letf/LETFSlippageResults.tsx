/**
 * @file LETF Slippage 结果面板
 * @description KPI 卡片 + 滑点曲线 + 杠杆对比 + 对比统计，负责将原始结果转换为图表数据
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { LETFResult } from '@backtest/shared';
import { fmtPct } from '@/utils/format';
import { AnalysisErrorAlert, EmptyResultsHint } from '@/components/resultsShell.js';
import { SlippageCurveChart, LeverageComparisonChart } from './LETFSlippageCharts.js';
import { LETFStatsTable } from './LETFSlippageTable.js';
import type { SlippageCurveDataPoint, LeverageComparisonDataPoint } from './letfSlippageTypes.js';

/** 结果面板属性 */
interface LETFResultsProps {
  results: LETFResult | null;
  error: string | null;
  isLoading: boolean;
  leverage: number;
}

/** KPI 卡片 */
function LETFKpiCards({ results }: { results: LETFResult }) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12,
      }}
    >
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
          {t('letf.results.kpiAnnualDecay')}
        </div>
        <div
          className="font-mono"
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: results.annualDecay < 0 ? 'var(--error)' : 'var(--text-strong)',
          }}
        >
          {fmtPct(results.annualDecay)}
        </div>
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
          {t('letf.results.kpiBenchmarkReturn')}
        </div>
        <div
          className="font-mono"
          style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)' }}
        >
          {fmtPct(results.stats.benchmarkReturn)}
        </div>
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
          {t('letf.results.kpiLetfReturn')}
        </div>
        <div
          className="font-mono"
          style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)' }}
        >
          {fmtPct(results.stats.letfReturn)}
        </div>
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
          {t('letf.results.kpiTotalSlippage')}
        </div>
        <div
          className="font-mono"
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: results.stats.slippage < 0 ? 'var(--error)' : 'var(--text-strong)',
          }}
        >
          {fmtPct(results.stats.slippage)}
        </div>
      </div>
    </div>
  );
}

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
    <div className="space-y-4">
      <AnalysisErrorAlert error={error} prefix={t('letf.analysisFailedPrefix')} />

      {results && (
        <div className="space-y-4">
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
