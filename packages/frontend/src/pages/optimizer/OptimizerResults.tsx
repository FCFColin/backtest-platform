import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';
import { CHART_COLORS, type Statistics } from '@backtest/shared';
import type { EfficientFrontierState, OptimizerResultExt } from './OptimizerUtils.js';
import { CHART_TOOLTIP_STYLE, CHART_GRID_PROPS, AXIS_TICK_STYLE } from '@/lib/chart-theme.js';
import { SimpleTable, type SimpleTableColumn } from '@/components/tables.js';
import ChartCard from '@/components/ChartCard.js';
import { Button } from '@/components/ui/uiComponents';
import { ResultsShell } from '@/components/resultsShell.js';
import { fmtPct, fmtNum } from '@/utils/format';
const METRICS_ROWS: { key: keyof Statistics; label: string; fmt: 'pct' | 'num' }[] = [
  { key: 'cagr', label: 'CAGR', fmt: 'pct' },
  { key: 'stdev', label: 'Volatility', fmt: 'pct' },
  { key: 'maxDrawdown', label: 'Max Drawdown', fmt: 'pct' },
  { key: 'avgDrawdown', label: 'Avg Drawdown', fmt: 'pct' },
  { key: 'sharpe', label: 'Sharpe', fmt: 'num' },
  { key: 'sortino', label: 'Sortino', fmt: 'num' },
  { key: 'calmar', label: 'Calmar', fmt: 'num' },
  { key: 'ulcerIndex', label: 'Ulcer Index', fmt: 'num' },
  { key: 'ulcerPerformanceIndex', label: 'UPI', fmt: 'num' },
];
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-elevated px-3 py-2.5">
      <div className="text-caption text-fg-tertiary">{label}</div>
      <div className="mt-1 font-mono tabular-nums text-body font-semibold text-fg">{value}</div>
    </div>
  );
}
function ConstraintsSummary({ s }: { s: EfficientFrontierState }) {
  const { t } = useTranslation();
  const cards: Array<{ show: boolean; label: string; value: string }> = [
    { show: true, label: t('Min Weight'), value: `${s.minWeight}%` },
    { show: true, label: t('Max Weight'), value: `${s.maxWeight}%` },
    { show: true, label: t('T-Bill Rate'), value: `${s.tbillRate}%` },
    {
      show: true,
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
      label: t('Min Weight to Include'),
      value: `${s.minWeightToInclude}%`,
    },
    {
      show: true,
      label: t('Solver'),
      value: s.solver === 'markowitz' ? 'Markowitz' : 'GA',
    },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {cards
        .filter((c) => c.show)
        .map((c, i) => (
          <StatCard key={i} label={c.label} value={c.value} />
        ))}
    </div>
  );
}
function WeightBarChart({
  data,
}: {
  data: Array<{ ticker: string; weight: number; fill: string }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={data.length * 48 + 20}>
      <BarChart data={data} layout="vertical" margin={{ left: 60, right: 40, top: 5, bottom: 5 }}>
        <CartesianGrid {...CHART_GRID_PROPS} horizontal={false} />
        <XAxis type="number" tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => `${v}%`} />
        <YAxis
          type="category"
          dataKey="ticker"
          tick={{ fill: 'var(--fg)', fontSize: 13, fontWeight: 500 }}
          width={56}
        />
        <Tooltip formatter={(v: number) => `${v}%`} contentStyle={CHART_TOOLTIP_STYLE} />
        <Bar dataKey="weight" radius={[0, 4, 4, 0]} barSize={24}>
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
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
    { key: 'metric', label: t('Metric'), render: (r) => r.label },
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
  if (data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart>
        <CartesianGrid {...CHART_GRID_PROPS} />
        <XAxis
          dataKey="expectedVolatility"
          tick={AXIS_TICK_STYLE}
          label={{
            value: t('Volatility (%)'),
            position: 'insideBottom',
            offset: -5,
            fontSize: 12,
            fill: 'var(--fg-tertiary)',
          }}
        />
        <YAxis
          dataKey="expectedReturn"
          tick={AXIS_TICK_STYLE}
          label={{
            value: t('Return (%)'),
            angle: -90,
            position: 'insideLeft',
            fontSize: 12,
            fill: 'var(--fg-tertiary)',
          }}
        />
        <ZAxis range={[36, 36]} />
        <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} contentStyle={CHART_TOOLTIP_STYLE} />
        <Scatter
          data={data.map((p) => ({
            expectedVolatility: p.expectedVolatility,
            expectedReturn: p.expectedReturn,
          }))}
          fill={CHART_COLORS[0]}
          fillOpacity={0.6}
        />
        <Scatter
          data={[
            {
              expectedVolatility: results.expectedVolatility,
              expectedReturn: results.expectedReturn,
            },
          ]}
          fill={CHART_COLORS[3]}
          shape="star"
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
export function OptimizerResults({ s }: { s: EfficientFrontierState }) {
  const { t } = useTranslation();
  const weightBarData = Object.entries(s.results?.optimalWeights ?? {}).map(
    ([ticker, weight], i) => ({
      ticker,
      weight: Number((weight * 100).toFixed(1)),
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }),
  );
  return (
    <ResultsShell
      error={s.error}
      isLoading={s.isLoading}
      hasResults={!!s.results}
      errorPrefix={`${t('Optimization Failed')}：`}
      loadingLabel={t('Optimizing...')}
      emptyTitle={t(
        'Configure parameters on the left and click "Start Calculation" to see optimal weights',
      )}
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
          <ChartCard title={t('Efficient Frontier')}>
            <FrontierChart data={s.results.frontier ?? []} results={s.results} />
          </ChartCard>
          <section>
            <div className="mb-3 text-h3 font-semibold text-fg">{t('Constraints Summary')}</div>
            <ConstraintsSummary s={s} />
          </section>
        </div>
      )}
    </ResultsShell>
  );
}
