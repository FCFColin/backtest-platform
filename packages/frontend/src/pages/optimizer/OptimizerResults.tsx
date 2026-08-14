import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import type { EChartsOption } from 'echarts';
import { type Statistics } from '@backtest/shared';
import type { EfficientFrontierState, OptimizerResultExt } from './OptimizerUtils.js';
import {
  AXIS_TEXT,
  BORDER_SOFT,
  axisTooltipFormatter,
  tooltipOption,
} from '@/components/charts/chartUtils.js';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import EChart from '@/components/charts/EChart.js';
import { SimpleTable, type SimpleTableColumn } from '@/components/tables.js';
import ChartCard from '@/components/ChartCard.js';
import { Button } from '@/components/ui/uiComponents';
import { ResultsShell } from '@/components/resultsShell.js';
import { MiniStatCard } from '@/components/cards.js';
import { fmtPct, fmtNum } from '@/utils/format';
import { XYScatterChart } from '@/components/charts/sharedChartContent.js';
import { ChartEmptyState } from '@/components/stateDisplay.js';
const METRICS_ROWS: { key: keyof Statistics; labelKey: string; fmt: 'pct' | 'num' }[] = [
  { key: 'cagr', labelKey: 'stats.cagr', fmt: 'pct' },
  { key: 'stdev', labelKey: 'Volatility', fmt: 'pct' },
  { key: 'maxDrawdown', labelKey: 'Max Drawdown', fmt: 'pct' },
  { key: 'avgDrawdown', labelKey: 'Avg Drawdown', fmt: 'pct' },
  { key: 'sharpe', labelKey: 'Sharpe', fmt: 'num' },
  { key: 'sortino', labelKey: 'Sortino', fmt: 'num' },
  { key: 'calmar', labelKey: 'Calmar', fmt: 'num' },
  { key: 'ulcerIndex', labelKey: 'analysis.ulcerIndex', fmt: 'num' },
  { key: 'ulcerPerformanceIndex', labelKey: 'UPI', fmt: 'num' },
];
function ConstraintsSummary({ s }: { s: EfficientFrontierState }) {
  const { t } = useTranslation();
  const cards: Array<{ show?: boolean; label: string; value: string }> = [
    { label: t('Min Weight'), value: `${s.minWeight}%` },
    { label: t('Max Weight'), value: `${s.maxWeight}%` },
    { label: t('T-Bill Rate'), value: `${s.tbillRate}%` },
    {
      label: t('Allow Short Selling'),
      value: s.allowShort ? t('Yes') : t('No'),
    },
    {
      show: s.enableMinCagr && s.minCagr !== '',
      label: t('Min CAGR'),
      value: `${s.minCagr}%`,
    },
    { show: s.minSharpe !== '', label: t('Min Sharpe'), value: s.minSharpe },
    { show: s.minSortino !== '', label: t('Min Sortino'), value: s.minSortino },
    {
      show: s.enableMaxVol && s.maxVol !== '',
      label: t('Max Vol'),
      value: `${s.maxVol}%`,
    },
    {
      show: s.enableMaxDD && s.maxMaxDD !== '',
      label: t('Max Max DD'),
      value: `${s.maxMaxDD}%`,
    },
    { show: s.maxAvgDD !== '', label: t('Max Avg DD'), value: `${s.maxAvgDD}%` },
    { show: s.maxHoldings !== '', label: t('Max Holdings'), value: s.maxHoldings },
    {
      show: s.minWeightToInclude !== '',
      label: t('Min Inclusion Weight'),
      value: `${s.minWeightToInclude}%`,
    },
    {
      label: t('Solver'),
      value: s.solver === 'markowitz' ? t('optimizer.solverMarkowitz') : t('optimizer.solverGA'),
    },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {cards
        .filter((c) => c.show !== false)
        .map((c, i) => (
          <MiniStatCard key={i} variant="border" label={c.label} value={c.value} />
        ))}
    </div>
  );
}
function WeightBarChart({
  data,
}: {
  data: Array<{ ticker: string; weight: number; fill: string }>;
}) {
  const { t } = useTranslation();
  const option: EChartsOption = {
    grid: { left: 60, right: 40, top: 5, bottom: 5, containLabel: false },
    xAxis: {
      type: 'value',
      axisLabel: { ...AXIS_TEXT, formatter: (v: number) => `${v}%` },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: BORDER_SOFT, opacity: 0.6 } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: data.map((d) => d.ticker),
      axisLabel: {
        color: 'hsl(var(--fg))',
        fontSize: 13,
        fontWeight: 500,
        width: 56,
        overflow: 'truncate',
      },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    tooltip: tooltipOption(axisTooltipFormatter(undefined, (v) => `${v}%`)),
    series: [
      {
        type: 'bar',
        data: data.map((d) => ({
          value: d.weight,
          itemStyle: { color: d.fill, borderRadius: [0, 4, 4, 0] },
        })),
        barWidth: 24,
      },
    ],
  };
  return <EChart option={option} height={data.length * 48 + 20} ariaLabel={t('Optimal Weights')} />;
}
function MetricsTable({
  backtestStats,
  results,
}: {
  backtestStats: Statistics | null;
  results: OptimizerResultExt;
}) {
  const { t } = useTranslation();
  const getVal = (key: keyof Statistics, fmt: 'pct' | 'num'): string => {
    const val = backtestStats ? backtestStats[key] : undefined;
    if (val != null) return fmt === 'pct' ? fmtPct(val as number) : fmtNum(val as number);
    if (!backtestStats && key === 'cagr') return fmtPct(results.expectedReturn);
    if (!backtestStats && key === 'stdev') return fmtPct(results.expectedVolatility);
    if (!backtestStats && key === 'sharpe') return fmtNum(results.sharpeRatio);
    return '\u2014';
  };
  const columns: SimpleTableColumn<(typeof METRICS_ROWS)[number]>[] = [
    { key: 'metric', label: t('Metric'), render: (r) => t(r.labelKey) },
    {
      key: 'value',
      label: t('Optimal Portfolio'),
      align: 'right',
      render: (r) => getVal(r.key, r.fmt),
    },
  ];
  return <SimpleTable columns={columns} data={METRICS_ROWS} rowKey={(r) => String(r.key)} />;
}
function FrontierChart({
  data,
  results,
}: {
  data: Array<{ expectedReturn: number; expectedVolatility: number }>;
  results: OptimizerResultExt;
}) {
  const { t } = useTranslation();
  if (data.length === 0) return <ChartEmptyState message={t('No data')} />;
  return (
    <XYScatterChart
      xKey="expectedVolatility"
      yKey="expectedReturn"
      xName={t('Volatility (%)')}
      yName={t('Return (%)')}
      height={300}
      tooltipFormatter={(v: number) => `${v.toFixed(2)}%`}
      series={[
        {
          data: data.map((p) => ({
            expectedVolatility: p.expectedVolatility,
            expectedReturn: p.expectedReturn,
          })),
          color: getPortfolioColor(0),
          opacity: 0.6,
        },
        {
          data: [
            {
              expectedVolatility: results.expectedVolatility,
              expectedReturn: results.expectedReturn,
            },
          ],
          color: getPortfolioColor(3),
          symbol: 'star',
          symbolSize: 12,
        },
      ]}
    />
  );
}
export function OptimizerResults({ s }: { s: EfficientFrontierState }) {
  const { t } = useTranslation();
  const weightBarData = Object.entries(s.results?.optimalWeights ?? {}).map(
    ([ticker, weight], i) => ({
      ticker,
      weight: Number((weight * 100).toFixed(1)),
      fill: getPortfolioColor(i),
    }),
  );
  return (
    <ResultsShell
      error={s.error}
      isLoading={s.isLoading}
      hasResults={!!s.results}
      errorPrefix={`${t('Optimization failed')}: `}
      loadingLabel={t('Optimizing...')}
      emptyTitle={t(
        'Configure parameters above and click "Start Calculation" to see optimal weights',
      )}
      onRetry={s.runOptimize}
    >
      {s.results && (
        <div className="flex flex-col gap-5">
          <ChartCard
            title={t('Optimal Weights')}
            headerExtra={
              <Button variant="ghost" size="sm" onClick={s.handleLoadInBacktester}>
                <ArrowRight />
                {t('Load in backtester')}
              </Button>
            }
          >
            <WeightBarChart data={weightBarData} />
          </ChartCard>
          <section>
            <div className="mb-3 text-h3 font-semibold text-fg">
              {t('Optimal Portfolio Metrics')}
            </div>
            <MetricsTable backtestStats={s.backtestStats} results={s.results} />
          </section>
          <ChartCard title={t('nav.efficientFrontier')}>
            <FrontierChart data={s.results.frontier ?? []} results={s.results} />
          </ChartCard>
          <section>
            <div className="mb-3 text-h3 font-semibold text-fg">{t('Constraints')}</div>
            <ConstraintsSummary s={s} />
          </section>
        </div>
      )}
    </ResultsShell>
  );
}
