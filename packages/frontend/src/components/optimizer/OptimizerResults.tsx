/** @file Optimizer results panel components */
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
import type { OptimizerState } from './types.js';
import { METRICS_ROWS } from './types.js';

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

function ConstraintsSummary({ s }: { s: OptimizerState }) {
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

function WeightBarChartHeader({ onLoadBacktester }: { onLoadBacktester: () => void }) {
  const { t } = useTranslation();
  return (
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
      <button
        onClick={onLoadBacktester}
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
    </div>
  );
}

function WeightBarChartBody({
  data,
}: {
  data: Array<{ ticker: string; weight: number; fill: string }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={data.length * 48 + 20}>
      <BarChart data={data} layout="vertical" margin={{ left: 60, right: 40, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" horizontal={false} />
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
        <Tooltip
          formatter={(v: number) => `${v}%`}
          contentStyle={{
            fontSize: 12,
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-control)',
            color: 'var(--text-body)',
            boxShadow: 'var(--shadow-md)',
          }}
        />
        <Bar dataKey="weight" radius={[0, 4, 4, 0]} barSize={24}>
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function WeightBarChart({
  data,
  onLoadBacktester,
}: {
  data: Array<{ ticker: string; weight: number; fill: string }>;
  onLoadBacktester: () => void;
}) {
  return (
    <>
      <WeightBarChartHeader onLoadBacktester={onLoadBacktester} />
      <WeightBarChartBody data={data} />
    </>
  );
}

function MetricsTable({
  backtestStats,
  results,
}: {
  backtestStats: Statistics | null;
  results: OptimizerState['results'];
}) {
  const { t } = useTranslation();
  if (!results) return null;
  const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const fmtNum = (v: number) => v.toFixed(2);
  const getVal = (key: keyof Statistics, fmt: 'pct' | 'num'): string => {
    const val = backtestStats ? backtestStats[key] : undefined;
    if (val != null) return fmt === 'pct' ? fmtPct(val as number) : fmtNum(val as number);
    if (!backtestStats && key === 'cagr') return fmtPct(results.expectedReturn);
    if (!backtestStats && key === 'stdev') return fmtPct(results.expectedVolatility);
    if (!backtestStats && key === 'sharpe') return fmtNum(results.sharpeRatio);
    return '\u2014';
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
            <th
              className="text-[12px] font-semibold text-left py-2.5 px-3"
              style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}
            >
              {t('common.metric')}
            </th>
            <th
              className="text-[12px] font-semibold text-right py-2.5 px-3"
              style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}
            >
              {t('optimizer.optimalPortfolio')}
            </th>
          </tr>
        </thead>
        <tbody>
          {METRICS_ROWS.map((row, i) => (
            <tr
              key={row.key}
              style={{ backgroundColor: i % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}
            >
              <td
                className="text-[13px] py-2 px-3"
                style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}
              >
                {row.label}
              </td>
              <td
                className="text-[13px] font-medium text-right py-2 px-3 font-mono"
                style={{
                  color: 'var(--text-strong)',
                  borderBottom: '1px solid var(--border-soft)',
                }}
              >
                {getVal(row.key, row.fmt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FrontierChartTitle() {
  const { t } = useTranslation();
  return (
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
  );
}

function FrontierChart({
  data,
  results,
}: {
  data: Array<{ expectedReturn: number; expectedVolatility: number }>;
  results: NonNullable<OptimizerState['results']>;
}) {
  const { t } = useTranslation();
  if (data.length === 0) return null;
  return (
    <>
      <FrontierChartTitle />
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
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
            contentStyle={{
              fontSize: 12,
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-control)',
              color: 'var(--text-body)',
              boxShadow: 'var(--shadow-md)',
            }}
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

export function OptimizerResults({ s }: { s: OptimizerState }) {
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
