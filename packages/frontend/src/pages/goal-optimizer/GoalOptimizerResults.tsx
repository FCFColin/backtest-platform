import { useTranslation } from 'react-i18next';
import type { GoalOptimizerResult } from '@backtest/shared';
import { fmtPct, fmtDollar } from '@/utils/format';
import { useGoalOptimizerState, type GoalOptimizerState } from '@/hooks/useGoalOptimizerState.js';
import { GoalOptimizerParamsPanel } from './GoalOptimizerParams.js';
import { ComputeToolShell, type ComputeToolConfig } from '../../components/shells/index.js';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';
import { CHART_GRID_PROPS, LEGEND_WRAPPER_STYLE, getPortfolioColor } from '@/lib/chart-theme.js';
import { ChartTooltip, ChartXAxis, ChartYAxis } from '@/components/charts/sharedChartContent.js';
import ChartCard from '@/components/ChartCard.js';
import { Card, Progress } from '@/components/ui/uiComponents';
import { ResultsShell } from '@/components/resultsShell.js';
import { MiniStatCard } from '@/components/cards.js';
import { getProbColor } from './goalOptimizerUtils.js';
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
          <ChartXAxis
            dataKey="amount"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v: number | string) => `$${(Number(v) / 1000).toFixed(0)}k`}
          />
          <ChartYAxis tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
          <ChartTooltip
            formatter={(v: number) => [`${(v * 100).toFixed(2)}%`, t('Probability')]}
            labelFormatter={(v: number | string) => fmtDollar(Number(v))}
          />
          <ReferenceLine
            x={targetAmount}
            stroke={getPortfolioColor(3)}
            strokeDasharray="4 2"
            label={{
              value: t('Target'),
              position: 'top',
              fill: getPortfolioColor(3),
              fontSize: 11,
            }}
          />
          <Area
            type="monotone"
            dataKey="probability"
            stroke={getPortfolioColor(0)}
            fill={getPortfolioColor(0)}
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
          <ChartXAxis dataKey="year" tickFormatter={(v: number | string) => `${v}y`} />
          <ChartYAxis tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
          <ChartTooltip
            formatter={(v: number) => fmtDollar(v)}
            labelFormatter={(v: number | string) => t('Year {{year}}', { year: v })}
          />
          <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
          <ReferenceLine
            y={targetAmount}
            stroke={getPortfolioColor(3)}
            strokeDasharray="4 2"
            label={{
              value: t('Target'),
              fill: getPortfolioColor(3),
              fontSize: 11,
              position: 'insideTopRight',
            }}
          />
          <Line
            type="monotone"
            dataKey="p90"
            stroke={getPortfolioColor(2)}
            strokeWidth={1.5}
            dot={false}
            name="P90"
          />
          <Line
            type="monotone"
            dataKey="median"
            stroke={getPortfolioColor(0)}
            strokeWidth={2.5}
            dot={false}
            name={t('Median')}
          />
          <Line
            type="monotone"
            dataKey="p10"
            stroke={getPortfolioColor(3)}
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
  const cards = [
    { label: t('Expected Annual Return'), value: fmtPct(recommendation.expectedReturn) },
    {
      label: t('Required Annual Contribution'),
      value: fmtDollar(recommendation.requiredContribution),
    },
    { label: t('Success Rate'), value: fmtPct(recommendation.successRate), color: probColor },
  ] as const;
  return (
    <ChartCard title={t('Recommended Configuration')}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map((c) => (
          <MiniStatCard key={c.label} variant="border" {...c} />
        ))}
      </div>
    </ChartCard>
  );
}
function GoalOptimizerResultsPanel({ state }: { state: GoalOptimizerState }) {
  const { t } = useTranslation();
  const r = state.results;
  const probColor = r ? getProbColor(r.successProbability) : '';
  return (
    <ResultsShell
      error={state.error ? `${t('Optimization Failed')}: ${state.error}` : null}
      isLoading={state.isLoading}
      hasResults={!!state.results}
      loadingLabel={t('Optimizing...')}
      emptyTitle={t(
        'Set your goal and asset allocation, then click "Start Optimization" to see results',
      )}
    >
      {r && (
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
                target: fmtDollar(state.targetAmount),
                initial: fmtDollar(state.initialAmount),
                years: state.years,
              })}
            </div>
          </Card>
          <ProbabilityDistributionChart
            data={r.probabilityCurve}
            targetAmount={state.targetAmount}
          />
          <OptimalPathChart data={r.optimalPath} targetAmount={state.targetAmount} />
          <RecommendationCards recommendation={r.recommendation} probColor={probColor} />
        </div>
      )}
    </ResultsShell>
  );
}
const config: ComputeToolConfig<GoalOptimizerState> = {
  titleKey: 'goalOptimizer.title',
  seoDescKey: 'goalOptimizer.seo.desc',
  seoFeatures: [
    { titleKey: 'analysis.seoAnalyzable', descKey: 'goalOptimizer.seo.analyzableDesc' },
    { titleKey: 'goalOptimizer.seo.outputTitle', descKey: 'goalOptimizer.seo.outputDesc' },
  ],
  relatedTools: [
    { titleKey: 'nav.monteCarlo', href: '/monte-carlo' },
    { titleKey: 'nav.portfolioOptimize', href: '/optimizer' },
    { titleKey: 'nav.efficientFrontier', href: '/efficient-frontier' },
  ],
  hideParamsTitle: true,
  params: GoalOptimizerParamsPanel,
  results: GoalOptimizerResultsPanel,
};
export default function GoalOptimizerPage() {
  const { t } = useTranslation();
  const s = useGoalOptimizerState(t);
  return <ComputeToolShell config={config} state={s} />;
}
