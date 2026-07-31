import { useTranslation } from 'react-i18next';
import type { GoalOptimizerResult } from '@backtest/shared';
import { CHART_COLORS } from '@backtest/shared';
import { fmtPct, fmtDollar } from '@/utils/format';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { CHART_TOOLTIP_STYLE, CHART_GRID_PROPS, AXIS_TICK_STYLE, LEGEND_WRAPPER_STYLE } from '@/lib/chart-theme.js';
import ChartCard from '@/components/ChartCard.js';
import { Card } from '@/components/ui/uiComponents';
import { Progress } from '@/components/ui/uiComponents';
import ErrorBanner from '@/components/ErrorBanner.js';
import { EmptyState } from '@/components/EmptyState.js';
import { LoadingState } from '@/components/LoadingState.js';
import { getProbColor } from './goalOptimizerUtils.js';
function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-border bg-elevated px-3 py-3">
      <div className="text-caption text-fg-tertiary">{label}</div>
      <div className="mt-1 font-mono tabular-nums text-h3 font-semibold" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}
function ProbabilityDistributionChart({ data, targetAmount }: { data: GoalOptimizerResult['probabilityCurve']; targetAmount: number }) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('goalOptimizer.results.probDistTitle')}>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="amount" type="number" domain={['dataMin', 'dataMax']} tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
          <YAxis tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => [`${(v * 100).toFixed(2)}%`, t('goalOptimizer.results.probability')]} labelFormatter={(v: number) => fmtDollar(v)} />
          <ReferenceLine
            x={targetAmount}
            stroke={CHART_COLORS[3]}
            strokeDasharray="4 2"
            label={{
              value: t('goalOptimizer.results.target'),
              position: 'top',
              fill: CHART_COLORS[3],
              fontSize: 11
            }}
          />
          <Area type="monotone" dataKey="probability" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.3} name={t('goalOptimizer.results.probability')} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
function OptimalPathChart({ data, targetAmount }: { data: GoalOptimizerResult['optimalPath']; targetAmount: number }) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('goalOptimizer.results.optimalPathTitle')}>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="year" tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => `${v}y`} />
          <YAxis tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => fmtDollar(v)} labelFormatter={(v: number) => t('goalOptimizer.results.yearLabel', { year: v })} />
          <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
          <ReferenceLine
            y={targetAmount}
            stroke={CHART_COLORS[3]}
            strokeDasharray="4 2"
            label={{
              value: t('goalOptimizer.results.target'),
              fill: CHART_COLORS[3],
              fontSize: 11,
              position: 'insideTopRight'
            }}
          />
          <Line type="monotone" dataKey="p90" stroke={CHART_COLORS[2]} strokeWidth={1.5} dot={false} name="P90" />
          <Line type="monotone" dataKey="median" stroke={CHART_COLORS[0]} strokeWidth={2.5} dot={false} name={t('goalOptimizer.results.median')} />
          <Line type="monotone" dataKey="p10" stroke={CHART_COLORS[3]} strokeWidth={1.5} dot={false} name="P10" />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
function RecommendationCards({ recommendation, probColor }: { recommendation: GoalOptimizerResult['recommendation']; probColor: string }) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('goalOptimizer.results.recommendationTitle')}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label={t('goalOptimizer.results.expectedReturn')} value={fmtPct(recommendation.expectedReturn)} />
        <StatCard label={t('goalOptimizer.results.requiredContribution')} value={fmtDollar(recommendation.requiredContribution)} />
        <StatCard label={t('goalOptimizer.results.successRate')} value={fmtPct(recommendation.successRate)} color={probColor} />
      </div>
    </ChartCard>
  );
}
export function GoalOptimizerResultsPanel({ results, error, isLoading, targetAmount, initialAmount, years }: { results: GoalOptimizerResult | null; error: string | null; isLoading: boolean; targetAmount: number; initialAmount: number; years: number }) {
  const { t } = useTranslation();
  if (error) {
    return <ErrorBanner message={`${t('goalOptimizer.optFailed')}: ${error}`} variant="error" />;
  }
  if (isLoading && !results) {
    return <LoadingState label={t('goalOptimizer.optimizing')} />;
  }
  if (!results) {
    return <EmptyState title={t('goalOptimizer.results.emptyHint')} />;
  }
  const probColor = getProbColor(results.successProbability);
  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col items-center px-6 py-8 text-center">
        <div className="text-label text-fg-secondary">{t('goalOptimizer.results.achieveProb')}</div>
        <div className="mt-2 font-mono tabular-nums text-display font-bold" style={{ color: probColor }}>
          {(results.successProbability * 100).toFixed(1)}%
        </div>
        <Progress value={results.successProbability * 100} className="mt-4 h-2 w-full max-w-xs" />
        <div className="mt-3 text-caption text-fg-tertiary">
          {t('goalOptimizer.results.targetInitialYears', {
            target: fmtDollar(targetAmount),
            initial: fmtDollar(initialAmount),
            years
          })}
        </div>
      </Card>
      <ProbabilityDistributionChart data={results.probabilityCurve} targetAmount={targetAmount} />
      <OptimalPathChart data={results.optimalPath} targetAmount={targetAmount} />
      <RecommendationCards recommendation={results.recommendation} probColor={probColor} />
    </div>
  );
}
