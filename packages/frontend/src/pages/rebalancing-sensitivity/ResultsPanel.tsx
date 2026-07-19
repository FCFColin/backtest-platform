import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import type { RebalanceFrequency } from '@backtest/shared';
import {
  REBALANCE_OPTIONS,
  TABS,
  type FreqResult,
  type RebalancingState,
} from './rebalancingSensitivityUtils.js';
import {
  CHART_MARGIN,
  CHART_GRID_PROPS,
  AXIS_TICK_STYLE,
  DATE_TICK_FORMATTER,
  CHART_TOOLTIP_STYLE,
} from '@/components/charts/chartConstants.js';
import { fmtPct } from '@/utils/format';

function ScatterTab({ results }: { results: FreqResult[] }) {
  const { t } = useTranslation();
  const data = results.map((r) => ({
    volatility: r.stdev * 100,
    cagr: r.cagr * 100,
    label: r.label,
    color: r.color,
    sharpe: r.sharpe,
    maxDrawdown: r.maxDrawdown * 100,
    sortino: r.sortino,
  }));
  return (
    <ResponsiveContainer width="100%" height={400}>
      <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 10 }}>
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
        <XAxis
          type="number"
          dataKey="volatility"
          name={t('rebalancingSensitivity.results.volatility')}
          tick={AXIS_TICK_STYLE}
          tickFormatter={(v: number) => `${v.toFixed(1)}%`}
          label={{
            value: t('rebalancingSensitivity.results.volatilityAxis'),
            position: 'insideBottom',
            offset: -15,
            style: { fill: 'var(--text-muted)', fontSize: 12 },
          }}
        />
        <YAxis
          type="number"
          dataKey="cagr"
          name="CAGR"
          tick={AXIS_TICK_STYLE}
          tickFormatter={(v: number) => `${v.toFixed(1)}%`}
          label={{
            value: t('rebalancingSensitivity.results.cagrAxis'),
            angle: -90,
            position: 'insideLeft',
            style: { fill: 'var(--text-muted)', fontSize: 12 },
          }}
        />
        <ZAxis type="number" dataKey="sharpe" range={[60, 200]} />
        <Tooltip
          cursor={{ strokeDasharray: '3 3' }}
          contentStyle={CHART_TOOLTIP_STYLE}
          formatter={(v: number, name: string) =>
            name === 'sharpe' || name === 'sortino' ? v.toFixed(2) : `${v.toFixed(2)}%`
          }
        />
        {data.map((p) => (
          <Scatter key={p.label} data={[p]} fill={p.color} />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function DistributionTab({ results }: { results: FreqResult[] }) {
  const { t } = useTranslation();
  const data = results.map((r) => ({
    name: t(`rebalancingSensitivity.freq.${r.frequency}`),
    CAGR: Number((r.cagr * 100).toFixed(2)),
    maxDrawdown: Number((r.maxDrawdown * 100).toFixed(2)),
    sharpeRatio: Number(r.sharpe.toFixed(2)),
    fill: r.color,
  }));
  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
        <XAxis dataKey="name" tick={AXIS_TICK_STYLE} />
        <YAxis tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => `${v}%`} />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => `${v}%`} />
        <Legend wrapperStyle={{ fontSize: '12px' }} />
        <Bar dataKey="CAGR" radius={[2, 2, 0, 0]}>
          {data.map((e, i) => (
            <Cell key={i} fill={e.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function OffsetSelector({ s }: { s: RebalancingState }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        {t('rebalancingSensitivity.results.frequency')}:
      </span>
      <select
        className="param-input"
        style={{ width: 120 }}
        value={s.offsetFreq}
        onChange={(e) => {
          s.setOffsetFreq(e.target.value as RebalanceFrequency);
          void s.runOffsetScan(e.target.value as RebalanceFrequency);
        }}
      >
        {REBALANCE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {t(`rebalancingSensitivity.freq.${o.value}`)}
          </option>
        ))}
      </select>
      {s.isLoadingOffset && (
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} />
      )}
    </div>
  );
}

function OffsetBarChart({ offsetData }: { offsetData: Array<{ offset: string; cagr: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={offsetData} margin={CHART_MARGIN}>
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
        <XAxis dataKey="offset" tick={AXIS_TICK_STYLE} />
        <YAxis tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => `${v}%`} />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => `${v}%`} />
        <Bar dataKey="cagr" fill={CHART_COLORS[2]} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function OffsetGrowthChart({ data }: { data: Array<{ date: string; value: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
        <XAxis dataKey="date" tick={AXIS_TICK_STYLE} tickFormatter={DATE_TICK_FORMATTER} />
        <YAxis tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => v.toLocaleString()} />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Line
          type="monotone"
          dataKey="value"
          stroke={CHART_COLORS[0]}
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function OffsetTab({ s }: { s: RebalancingState }) {
  const offsetData = s.offsetResults.map((r) => ({
    offset: `+${r.offset}d`,
    cagr: Number((r.cagr * 100).toFixed(2)),
  }));
  const growthData = s.results.find((r) => r.frequency === s.offsetFreq)?.growthCurve ?? [];
  return (
    <>
      <OffsetSelector s={s} />
      <OffsetBarChart offsetData={offsetData} />
      {growthData.length > 0 && <OffsetGrowthChart data={growthData} />}
    </>
  );
}

const resultsTableCols = (t: TFunction) => [
  ['CAGR', 'cagr'] as const,
  [t('rebalancingSensitivity.results.volatility'), 'stdev'] as const,
  [t('rebalancingSensitivity.results.maxDrawdown'), 'mdd'] as const,
  [t('rebalancingSensitivity.results.sharpe'), 'sharpe'] as const,
  ['Sortino', 'sortino'] as const,
];

function ResultsTableHead() {
  const { t } = useTranslation();
  const cols = resultsTableCols(t);
  return (
    <thead>
      <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
        <th
          className="text-[12px] font-semibold text-left py-2.5 px-3"
          style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}
        >
          {t('rebalancingSensitivity.results.frequency')}
        </th>
        {cols.map(([label]) => (
          <th
            key={label}
            className="text-[12px] font-semibold text-right py-2.5 px-3"
            style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}
          >
            {label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function ResultsTable({ results }: { results: FreqResult[] }) {
  const best = {
    cagr: Math.max(...results.map((x) => x.cagr)),
    stdev: Math.min(...results.map((x) => x.stdev)),
    mdd: Math.min(...results.map((x) => x.maxDrawdown)),
    sharpe: Math.max(...results.map((x) => x.sharpe)),
    sortino: Math.max(...results.map((x) => x.sortino)),
  };
  const cellStyle = (isBest: boolean) => ({
    color: isBest ? 'var(--success)' : 'var(--text-strong)',
    fontWeight: isBest ? 700 : 500,
    borderBottom: '1px solid var(--border-soft)',
  });
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <ResultsTableHead />
        <tbody>
          {results.map((r, idx) => (
            <tr
              key={r.frequency}
              style={{ backgroundColor: idx % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}
            >
              <td
                className="text-[13px] py-2 px-3"
                style={{
                  color: 'var(--text-strong)',
                  borderBottom: '1px solid var(--border-soft)',
                }}
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
                  style={{ backgroundColor: r.color }}
                />
                {r.label}
              </td>
              <td
                className="text-[13px] font-medium text-right py-2 px-3 font-mono"
                style={cellStyle(r.cagr === best.cagr)}
              >
                {fmtPct(r.cagr)}
              </td>
              <td
                className="text-[13px] font-medium text-right py-2 px-3 font-mono"
                style={cellStyle(r.stdev === best.stdev)}
              >
                {fmtPct(r.stdev)}
              </td>
              <td
                className="text-[13px] font-medium text-right py-2 px-3 font-mono"
                style={cellStyle(r.maxDrawdown === best.mdd)}
              >
                {fmtPct(r.maxDrawdown)}
              </td>
              <td
                className="text-[13px] font-medium text-right py-2 px-3 font-mono"
                style={cellStyle(r.sharpe === best.sharpe)}
              >
                {r.sharpe.toFixed(2)}
              </td>
              <td
                className="text-[13px] font-medium text-right py-2 px-3 font-mono"
                style={cellStyle(r.sortino === best.sortino)}
              >
                {r.sortino.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ResultsPanel({ s }: { s: RebalancingState }) {
  const { t } = useTranslation();
  if (s.error)
    return (
      <div
        className="bt-results-card card"
        style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}
      >
        {t('rebalancingSensitivity.results.analysisFailed')}: {s.error}
      </div>
    );
  if (s.results.length === 0 && !s.isLoading)
    return (
      <div
        className="bt-results-card card"
        style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48 }}
      >
        {t('rebalancingSensitivity.results.noResultsHint')}
      </div>
    );
  if (s.isLoading)
    return (
      <div className="bt-results-card card" style={{ textAlign: 'center', padding: 40 }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ display: 'inline-block' }} />
      </div>
    );
  return (
    <div className="bt-results-card card">
      <div className="results-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`tab-btn ${s.activeTab === tab.key ? 'active' : ''}`}
            onClick={() => s.setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {s.activeTab === 'scatter' && <ScatterTab results={s.results} />}
      {s.activeTab === 'distributions' && <DistributionTab results={s.results} />}
      {s.activeTab === 'offset' && <OffsetTab s={s} />}
      {s.activeTab === 'table' && <ResultsTable results={s.results} />}
    </div>
  );
}
