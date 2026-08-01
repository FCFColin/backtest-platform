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
import { CHART_COLORS } from '@backtest/shared';
import type { Statistics } from '@backtest/shared';
import type { EfficientFrontierState, OptimizerResultExt } from './OptimizerUtils.js';
import { CHART_TOOLTIP_STYLE, CHART_GRID_PROPS, AXIS_TICK_STYLE } from '@/lib/chart-theme.js';
import { SimpleTable, type SimpleTableColumn } from '@/components/SimpleTable.js';
import ChartCard from '@/components/ChartCard.js';
import { Button } from '@/components/ui/uiComponents';
import { ErrorBanner, EmptyState, LoadingState } from '@/components/stateDisplay.js';
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
    { show: true, label: t('optimizer.minWeight'), value: `${s.minWeight}%` },
    { show: true, label: t('optimizer.maxWeight'), value: `${s.maxWeight}%` },
    { show: true, label: t('optimizer.tbillRate'), value: `${s.tbillRate}%` },
    {
      show: true,
      label: t('optimizer.allowShort'),
      value: s.allowShort ? t('common.yes') : t('common.no'),
    },
    {
      show: s.enableMinCagr && s.minCagr !== '',
      label: t('optimizer.minCagrLabel'),
      value: `${s.minCagr}%`,
    },
    { show: s.minSharpe !== '', label: t('optimizer.minSharpeLabel'), value: s.minSharpe },
    { show: s.minSortino !== '', label: t('optimizer.minSortinoLabel'), value: s.minSortino },
    {
      show: s.enableMaxVol && s.maxVol !== '',
      label: t('optimizer.maxVolLabel'),
      value: `${s.maxVol}%`,
    },
    {
      show: s.enableMaxDD && s.maxMaxDD !== '',
      label: t('optimizer.maxMaxDDLabel'),
      value: `${s.maxMaxDD}%`,
    },
    { show: s.maxAvgDD !== '', label: t('optimizer.maxAvgDDLabel'), value: `${s.maxAvgDD}%` },
    { show: s.maxHoldings !== '', label: t('optimizer.maxHoldings'), value: s.maxHoldings },
    {
      show: s.minWeightToInclude !== '',
      label: t('optimizer.minWeightToInclude'),
      value: `${s.minWeightToInclude}%`,
    },
    {
      show: true,
      label: t('optimizer.solver'),
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
    { key: 'metric', label: t('common.metric'), render: (r) => r.label },
    {
      key: 'value',
      label: t('optimizer.optimalPortfolio'),
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
            value: t('optimizer.volatilityAxis'),
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
            value: t('optimizer.returnAxis'),
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
  if (s.error) {
    return <ErrorBanner message={`${t('optimizer.optFailed')}：${s.error}`} variant="error" />;
  }
  if (s.isLoading && !s.results) {
    return <LoadingState label={t('optimizer.optimizing')} />;
  }
  if (!s.results) {
    return <EmptyState title={t('optimizer.noResultsHint')} />;
  }
  const weightBarData = Object.entries(s.results.optimalWeights).map(([ticker, weight], i) => ({
    ticker,
    weight: Number((weight * 100).toFixed(1)),
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));
  return (
    <div className="flex flex-col gap-5">
      <ChartCard
        title={t('optimizer.optimalWeights')}
        headerExtra={
          <Button variant="ghost" size="sm" onClick={s.handleLoadInBacktester}>
            <ArrowRight />
            {t('optimizer.loadInBacktester')}
          </Button>
        }
      >
        <WeightBarChart data={weightBarData} />
      </ChartCard>
      <section>
        <div className="mb-3 text-h3 font-semibold text-fg">{t('optimizer.optimalMetrics')}</div>
        <MetricsTable backtestStats={s.backtestStats} results={s.results} />
      </section>
      <ChartCard title={t('optimizer.efficientFrontier')}>
        <FrontierChart data={s.results.frontier ?? []} results={s.results} />
      </ChartCard>
      <section>
        <div className="mb-3 text-h3 font-semibold text-fg">
          {t('optimizer.constraintsSummary')}
        </div>
        <ConstraintsSummary s={s} />
      </section>
    </div>
  );
}
