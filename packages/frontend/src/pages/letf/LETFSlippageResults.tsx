import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { LETFResult } from '@backtest/shared';
import { fmtPct } from '@/utils/format';
import { AnalysisErrorAlert, EmptyResultsHint } from '@/components/resultsShell.js';
import { Card } from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';
import { SlippageCurveChart, LeverageComparisonChart } from './LETFSlippageCharts.js';
import { LETFStatsTable } from './LETFSlippageTable.js';
import type { SlippageCurveDataPoint, LeverageComparisonDataPoint } from './letfSlippageTypes.js';
interface LETFResultsProps {
  results: LETFResult | null;
  error: string | null;
  isLoading: boolean;
  leverage: number;
}
interface KpiCardProps {
  label: ReactNode;
  value: ReactNode;
  danger?: boolean;
}
function KpiCard({ label, value, danger = false }: KpiCardProps) {
  return (
    <Card className="p-4">
      <div className="mb-1 text-caption text-fg-tertiary">{label}</div>
      <div className={cn('font-mono text-2xl font-bold tabular-nums', danger ? 'text-danger' : 'text-fg')}>{value}</div>
    </Card>
  );
}
function LETFKpiCards({ results }: { results: LETFResult }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard label={t('letf.results.kpiAnnualDecay')} value={fmtPct(results.annualDecay)} danger={results.annualDecay < 0} />
      <KpiCard label={t('letf.results.kpiBenchmarkReturn')} value={fmtPct(results.stats.benchmarkReturn)} />
      <KpiCard label={t('letf.results.kpiLetfReturn')} value={fmtPct(results.stats.letfReturn)} />
      <KpiCard label={t('letf.results.kpiTotalSlippage')} value={fmtPct(results.stats.slippage)} danger={results.stats.slippage < 0} />
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
        daily: +(daily * 100).toFixed(4)
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
        nominal: leverage
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
