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
import { CHART_TOOLTIP_STYLE, CHART_GRID_PROPS } from '@/components/charts/chartConstants.js';
import { SimpleTable, type SimpleTableColumn } from '@/components/SimpleTable.js';
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

function ConstraintCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: 12,
        backgroundColor: 'var(--bg-subtle)',
        borderRadius: 'var(--radius-control)',
      }}
    >
      <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>{label}</div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          fontFamily: 'monospace',
          color: 'var(--text-body)',
        }}
      >
        {value}
      </div>
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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
      {cards
        .filter((c) => c.show)
        .map((c, i) => (
          <ConstraintCard key={i} label={c.label} value={c.value} />
        ))}
    </div>
  );
}

function LoadBacktesterBtn({ onClick, t }: { onClick: () => void; t: (k: string) => string }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 14px',
        borderRadius: 'var(--radius-control)',
        border: '1px solid var(--brand)',
        backgroundColor: 'transparent',
        color: 'var(--brand)',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all .15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--brand)';
        e.currentTarget.style.color = '#fff';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
        e.currentTarget.style.color = 'var(--brand)';
      }}
    >
      <ArrowRight className="w-3.5 h-3.5" />
      {t('optimizer.loadInBacktester')}
    </button>
  );
}

function WeightBarChart({
  data,
  onLoadBacktester,
}: {
  data: Array<{ ticker: string; weight: number; fill: string }>;
  onLoadBacktester: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)' }}>
          {t('optimizer.optimalWeights')}
        </div>
        <LoadBacktesterBtn onClick={onLoadBacktester} t={t} />
      </div>
      <ResponsiveContainer width="100%" height={data.length * 48 + 20}>
        <BarChart data={data} layout="vertical" margin={{ left: 60, right: 40, top: 5, bottom: 5 }}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
            tickFormatter={(v: number) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="ticker"
            tick={{ fontSize: 13, fill: 'var(--text-strong)', fontWeight: 500 }}
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
    </>
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
    <>
      <div
        style={{
          fontWeight: 600,
          fontSize: 14,
          color: 'var(--text-strong)',
          marginBottom: 12,
          marginTop: 24,
        }}
      >
        {t('optimizer.efficientFrontier')}
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
          <XAxis
            dataKey="expectedVolatility"
            tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
            label={{
              value: t('optimizer.volatilityAxis'),
              position: 'insideBottom',
              offset: -5,
              fontSize: 12,
              fill: 'var(--text-muted)',
            }}
          />
          <YAxis
            dataKey="expectedReturn"
            tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
            label={{
              value: t('optimizer.returnAxis'),
              angle: -90,
              position: 'insideLeft',
              fontSize: 12,
              fill: 'var(--text-muted)',
            }}
          />
          <ZAxis range={[36, 36]} />
          <Tooltip
            formatter={(v: number) => `${v.toFixed(2)}%`}
            contentStyle={CHART_TOOLTIP_STYLE}
          />
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
    </>
  );
}

function OptimizerResults({ s }: { s: EfficientFrontierState }) {
  const { t } = useTranslation();
  if (s.error)
    return (
      <div
        className="bt-results-card card"
        style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}
      >
        {t('optimizer.optFailed')}：{s.error}
      </div>
    );
  if (!s.results)
    return (
      <div
        className="bt-results-card card"
        style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48 }}
      >
        {t('optimizer.noResultsHint')}
      </div>
    );
  const weightBarData = Object.entries(s.results.optimalWeights).map(([ticker, weight], i) => ({
    ticker,
    weight: Number((weight * 100).toFixed(1)),
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));
  return (
    <div className="bt-results-card card">
      <WeightBarChart data={weightBarData} onLoadBacktester={s.handleLoadInBacktester} />
      <div
        style={{
          fontWeight: 600,
          fontSize: 14,
          color: 'var(--text-strong)',
          marginBottom: 12,
          marginTop: 24,
        }}
      >
        {t('optimizer.optimalMetrics')}
      </div>
      <MetricsTable backtestStats={s.backtestStats} results={s.results} />
      <FrontierChart data={s.results.frontier ?? []} results={s.results} />
      <div
        style={{
          fontWeight: 600,
          fontSize: 14,
          color: 'var(--text-strong)',
          marginBottom: 12,
          marginTop: 24,
        }}
      >
        {t('optimizer.constraintsSummary')}
      </div>
      <ConstraintsSummary s={s} />
    </div>
  );
}

export { OptimizerResults };
