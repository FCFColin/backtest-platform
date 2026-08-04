import { useTranslation } from 'react-i18next';
import { CHART_COLORS, type GoalOptimizerResult } from '@backtest/shared';
import { fmtPct, fmtDollar } from '@/utils/format';
import { useGoalOptimizerState } from '@/hooks/useGoalOptimizerState.js';
import { GoalOptimizerParamsPanel } from './GoalOptimizerParams.js';
import { ComputeToolShell, type ComputeToolConfig } from '../../components/shells/index.js';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';
import {
  CHART_TOOLTIP_STYLE,
  CHART_GRID_PROPS,
  AXIS_TICK_STYLE,
  LEGEND_WRAPPER_STYLE,
} from '@/lib/chart-theme.js';
import ChartCard from '@/components/ChartCard.js';
import { Card, Progress } from '@/components/ui/uiComponents';
import { ResultsShell } from '@/components/resultsShell.js';
import { getProbColor } from './goalOptimizerUtils.js';
function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-border bg-elevated px-3 py-3">
      <div className="text-caption text-fg-tertiary">{label}</div>
      <div
        className="mt-1 font-mono tabular-nums text-h3 font-semibold"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
    </div>
  );
}
function ProbabilityDistributionChart({
  data,
  targetAmount,
}: {
  data: GoalOptimizerResult['probabilityCurve'];
  targetAmount: number;
}) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('Final Value Probability Distribution')}>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis
            dataKey="amount"
            type="number"
            domain={['dataMin', 'dataMax']}
            tick={AXIS_TICK_STYLE}
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
          />
          <YAxis tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(v: number) => [`${(v * 100).toFixed(2)}%`, t('Probability')]}
            labelFormatter={(v: number) => fmtDollar(v)}
          />
          <ReferenceLine
            x={targetAmount}
            stroke={CHART_COLORS[3]}
            strokeDasharray="4 2"
            label={{
              value: t('Target'),
              position: 'top',
              fill: CHART_COLORS[3],
              fontSize: 11,
            }}
          />
          <Area
            type="monotone"
            dataKey="probability"
            stroke={CHART_COLORS[0]}
            fill={CHART_COLORS[0]}
            fillOpacity={0.3}
            name={t('Probability')}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
function OptimalPathChart({
  data,
  targetAmount,
}: {
  data: GoalOptimizerResult['optimalPath'];
  targetAmount: number;
}) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('Optimal Path (Median / P10 / P90)')}>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="year" tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => `${v}y`} />
          <YAxis
            tick={AXIS_TICK_STYLE}
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(v: number) => fmtDollar(v)}
            labelFormatter={(v: number) => t('Year {{year}}', { year: v })}
          />
          <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
          <ReferenceLine
            y={targetAmount}
            stroke={CHART_COLORS[3]}
            strokeDasharray="4 2"
            label={{
              value: t('Target'),
              fill: CHART_COLORS[3],
              fontSize: 11,
              position: 'insideTopRight',
            }}
          />
          <Line
            type="monotone"
            dataKey="p90"
            stroke={CHART_COLORS[2]}
            strokeWidth={1.5}
            dot={false}
            name="P90"
          />
          <Line
            type="monotone"
            dataKey="median"
            stroke={CHART_COLORS[0]}
            strokeWidth={2.5}
            dot={false}
            name={t('Median')}
          />
          <Line
            type="monotone"
            dataKey="p10"
            stroke={CHART_COLORS[3]}
            strokeWidth={1.5}
            dot={false}
            name="P10"
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
function RecommendationCards({
  recommendation,
  probColor,
}: {
  recommendation: GoalOptimizerResult['recommendation'];
  probColor: string;
}) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('Recommended Configuration')}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label={t('Expected Annual Return')}
          value={fmtPct(recommendation.expectedReturn)}
        />
        <StatCard
          label={t('Required Annual Contribution')}
          value={fmtDollar(recommendation.requiredContribution)}
        />
        <StatCard
          label={t('Success Rate')}
          value={fmtPct(recommendation.successRate)}
          color={probColor}
        />
      </div>
    </ChartCard>
  );
}
export function GoalOptimizerResultsPanel({
  results,
  error,
  isLoading,
  targetAmount,
  initialAmount,
  years,
}: {
  results: GoalOptimizerResult | null;
  error: string | null;
  isLoading: boolean;
  targetAmount: number;
  initialAmount: number;
  years: number;
}) {
  const { t } = useTranslation();
  const r = results!;
  const probColor = r ? getProbColor(r.successProbability) : '';
  return (
    <ResultsShell
      error={error ? `${t('Optimization failed')}: ${error}` : null}
      isLoading={isLoading}
      hasResults={!!results}
      loadingLabel={t('Optimizing...')}
      emptyTitle={t(
        'Set your goal and asset allocation, then click "Start Optimization" to see results',
      )}
    >
      <div className="flex flex-col gap-5">
        <Card className="flex flex-col items-center px-6 py-8 text-center">
          <div className="text-label text-fg-secondary">{t('Probability of Reaching Goal')}</div>
          <div
            className="mt-2 font-mono tabular-nums text-display font-bold"
            style={{ color: probColor }}
          >
            {(r.successProbability * 100).toFixed(1)}%
          </div>
          <Progress value={r.successProbability * 100} className="mt-4 h-2 w-full max-w-xs" />
          <div className="mt-3 text-caption text-fg-tertiary">
            {t('Target {{target}} · Initial {{initial}} · {{years}} years', {
              target: fmtDollar(targetAmount),
              initial: fmtDollar(initialAmount),
              years,
            })}
          </div>
        </Card>
        <ProbabilityDistributionChart data={r.probabilityCurve} targetAmount={targetAmount} />
        <OptimalPathChart data={r.optimalPath} targetAmount={targetAmount} />
        <RecommendationCards recommendation={r.recommendation} probColor={probColor} />
      </div>
    </ResultsShell>
  );
}
type GOState = ReturnType<typeof useGoalOptimizerState>;
function GOParamsWrapper({ state }: { state: GOState }) {
  return (
    <GoalOptimizerParamsPanel
      targetAmount={state.targetAmount}
      initialAmount={state.initialAmount}
      years={state.years}
      assets={state.assets}
      maxDrawdown={state.maxDrawdown}
      minSuccessRate={state.minSuccessRate}
      maxVolatility={state.maxVolatility}
      numSimulations={state.numSimulations}
      totalWeight={state.totalWeight}
      isLoading={state.isLoading}
      onTargetAmountChange={state.setTargetAmount}
      onInitialAmountChange={state.setInitialAmount}
      onYearsChange={state.setYears}
      onAddAsset={state.addAsset}
      onRemoveAsset={state.removeAsset}
      onUpdateAsset={state.updateAsset}
      onMaxDrawdownChange={state.setMaxDrawdown}
      onMinSuccessRateChange={state.setMinSuccessRate}
      onMaxVolatilityChange={state.setMaxVolatility}
      onNumSimulationsChange={state.setNumSimulations}
      onRun={state.runOptimize}
    />
  );
}
function GOResultsWrapper({ state }: { state: GOState }) {
  return (
    <GoalOptimizerResultsPanel
      results={state.results}
      error={state.error}
      isLoading={state.isLoading}
      targetAmount={state.targetAmount}
      initialAmount={state.initialAmount}
      years={state.years}
    />
  );
}
const config: ComputeToolConfig<GOState> = {
  titleKey: 'goalOptimizer.title',
  seoDescKey: 'goalOptimizer.seo.desc',
  seoFeatures: [
    { titleKey: 'goalOptimizer.seo.analyzableTitle', descKey: 'goalOptimizer.seo.analyzableDesc' },
    { titleKey: 'goalOptimizer.seo.outputTitle', descKey: 'goalOptimizer.seo.outputDesc' },
  ],
  relatedTools: [
    { titleKey: 'nav.monteCarlo', href: '/monte-carlo' },
    { titleKey: 'nav.portfolioOptimize', href: '/optimizer' },
    { titleKey: 'nav.efficientFrontier', href: '/efficient-frontier' },
  ],
  hideParamsTitle: true,
  params: GOParamsWrapper,
  results: GOResultsWrapper,
};
export default function GoalOptimizerPage() {
  const { t } = useTranslation();
  const s = useGoalOptimizerState(t);
  return <ComputeToolShell config={config} state={s} />;
}
