import { useTranslation } from 'react-i18next';
import type { EChartsOption } from 'echarts';
import type { GoalOptimizerResult } from '@backtest/shared';
import { fmtPct, fmtAmount } from '@/utils/format';
import { useGoalOptimizerState, type GoalOptimizerState } from '@/hooks/useGoalOptimizerState.js';
import { GoalOptimizerParamsPanel } from './GoalOptimizerParams.js';
import { ComputeToolShell, type ComputeToolConfig } from '../../components/shells/index.js';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import {
  axisTooltipFormatter,
  categoryAxis,
  tooltipOption,
  valueXAxis,
  valueYAxis,
} from '@/components/charts/chartUtils.js';
import EChart from '@/components/charts/EChart.js';
import ChartCard from '@/components/ChartCard.js';
import { Card, Progress } from '@/components/ui/uiComponents';
import { ResultsShell } from '@/components/resultsShell.js';
import { MiniStatCard } from '@/components/cards.js';
import { getProbColor } from './goalOptimizerUtils.js';
const GRID = { top: 10, right: 20, bottom: 5, left: 60 };
function ProbabilityDistributionChart({
  data,
  targetAmount,
}: {
  data: GoalOptimizerResult['probabilityCurve'];
  targetAmount: number;
}) {
  const { t } = useTranslation();
  const option: EChartsOption = {
    grid: GRID,
    xAxis: valueXAxis((v: number) => `$${(v / 1000).toFixed(0)}k`),
    yAxis: valueYAxis({ formatter: (v: number) => `${(v * 100).toFixed(1)}%` }),
    tooltip: tooltipOption(
      axisTooltipFormatter(
        (label) => fmtAmount(Number(label)),
        (v) => [`${(v * 100).toFixed(2)}%`, t('Probability')],
      ),
    ),
    series: [
      {
        name: t('Probability'),
        type: 'area',
        smooth: true,
        data: data.map((d) => [d.amount, d.probability]),
        lineStyle: { width: 2, color: getPortfolioColor(0) },
        itemStyle: { color: getPortfolioColor(0) },
        areaStyle: { opacity: 0.3 },
        symbol: 'none',
        markLine: {
          silent: true,
          data: [
            {
              xAxis: targetAmount,
              lineStyle: { color: getPortfolioColor(3), type: 'dashed', width: 1.5 },
              label: { formatter: t('Target'), color: getPortfolioColor(3), fontSize: 11 },
            },
          ],
        },
      },
    ] as EChartsOption['series'],
  };
  return (
    <ChartCard title={t('Final Value Probability Distribution')}>
      <EChart option={option} height={300} ariaLabel={t('Final Value Probability Distribution')} />
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
  const years = data.map((d) => String(d.year));
  const series = (
    [
      { dataKey: 'p90', name: 'P90', color: getPortfolioColor(2), width: 1.5 },
      { dataKey: 'median', name: t('Median'), color: getPortfolioColor(0), width: 2.5 },
      { dataKey: 'p10', name: 'P10', color: getPortfolioColor(3), width: 1.5 },
    ] as const
  ).map((s) => ({
    name: s.name,
    type: 'line',
    smooth: true,
    data: data.map((d) => d[s.dataKey]),
    lineStyle: { width: s.width, color: s.color },
    itemStyle: { color: s.color },
    symbol: 'none',
    emphasis: { focus: 'series' },
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 需要动态添加 markLine 属性
  const seriesArr: any[] = series;
  seriesArr[0].markLine = {
    silent: true,
    data: [
      {
        yAxis: targetAmount,
        lineStyle: { color: getPortfolioColor(3), type: 'dashed', width: 1.5 },
        label: {
          formatter: t('Target'),
          color: getPortfolioColor(3),
          fontSize: 11,
          position: 'insideEndTop',
        },
      },
    ],
  };
  const option: EChartsOption = {
    grid: GRID,
    xAxis: categoryAxis(years, { formatter: (v: string) => `${v}y` }),
    yAxis: valueYAxis({ formatter: (v: number) => `$${(v / 1000).toFixed(0)}k` }),
    tooltip: tooltipOption(
      axisTooltipFormatter(
        (label) => t('Year {{year}}', { year: label }),
        (v) => [fmtAmount(v), ''],
      ),
    ),
    legend: { top: 0, textStyle: { color: 'hsl(var(--fg-tertiary))', fontSize: 12 } },
    series: seriesArr as EChartsOption['series'],
  };
  return (
    <ChartCard title={t('Optimal Path (Median / P10 / P90)')}>
      <EChart option={option} height={350} ariaLabel={t('Optimal Path (Median / P10 / P90)')} />
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
      value: fmtAmount(recommendation.requiredContribution),
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
                target: fmtAmount(state.targetAmount),
                initial: fmtAmount(state.initialAmount),
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
