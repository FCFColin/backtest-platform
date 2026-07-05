import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
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
import { CHART_COLORS } from '@backtest/shared/types';
import type { RebalanceFrequency } from '@backtest/shared/types';
import type { RebalancingState, FreqResult } from './types.js';
import { TABS, REBALANCE_OPTIONS } from './types.js';
import { fmtPct } from './utils.js';

function ScatterTab({ results }: { results: FreqResult[] }) {
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
        <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
        <XAxis
          type="number"
          dataKey="volatility"
          name="波动率"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          tickFormatter={(v: number) => `${v.toFixed(1)}%`}
          label={{
            value: '波动率 (%)',
            position: 'insideBottom',
            offset: -15,
            style: { fill: 'var(--text-muted)', fontSize: 12 },
          }}
        />
        <YAxis
          type="number"
          dataKey="cagr"
          name="CAGR"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          tickFormatter={(v: number) => `${v.toFixed(1)}%`}
          label={{
            value: 'CAGR (%)',
            angle: -90,
            position: 'insideLeft',
            style: { fill: 'var(--text-muted)', fontSize: 12 },
          }}
        />
        <ZAxis type="number" dataKey="sharpe" range={[60, 200]} />
        <Tooltip
          cursor={{ strokeDasharray: '3 3' }}
          contentStyle={{
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-control)',
          }}
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
  const data = results.map((r) => ({
    name: r.label,
    CAGR: Number((r.cagr * 100).toFixed(2)),
    最大回撤: Number((r.maxDrawdown * 100).toFixed(2)),
    夏普比率: Number(r.sharpe.toFixed(2)),
    fill: r.color,
  }));
  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
        <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
        <YAxis
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-control)',
          }}
          formatter={(v: number) => `${v}%`}
        />
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

function OffsetTab({ s }: { s: RebalancingState }) {
  const offsetData = s.offsetResults.map((r) => ({
    offset: `+${r.offset}d`,
    cagr: Number((r.cagr * 100).toFixed(2)),
  }));
  const growthData = s.results.find((r) => r.frequency === s.offsetFreq)?.growthCurve ?? [];
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>频率：</span>
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
              {o.label}
            </option>
          ))}
        </select>
        {s.isLoadingOffset && (
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} />
        )}
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={offsetData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis dataKey="offset" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-control)',
            }}
            formatter={(v: number) => `${v}%`}
          />
          <Bar dataKey="cagr" fill={CHART_COLORS[2]} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      {growthData.length > 0 && (
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={growthData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              tickFormatter={(v: string) => v.slice(0, 7)}
            />
            <YAxis
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              tickFormatter={(v: number) => v.toLocaleString()}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-soft)',
                borderRadius: 'var(--radius-control)',
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={CHART_COLORS[0]}
              strokeWidth={1.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </>
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
        <thead>
          <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
            <th
              className="text-[12px] font-semibold text-left py-2.5 px-3"
              style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}
            >
              频率
            </th>
            {[
              ['CAGR', 'cagr'],
              ['波动率', 'stdev'],
              ['最大回撤', 'mdd'],
              ['夏普', 'sharpe'],
              ['Sortino', 'sortino'],
            ].map(([label]) => (
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

export function RebalancingSensitivityResults({ s }: { s: RebalancingState }): ReactNode {
  if (s.error)
    return (
      <div
        className="bt-results-card card"
        style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}
      >
        分析失败：{s.error}
      </div>
    );
  if (s.results.length === 0 && !s.isLoading)
    return (
      <div
        className="bt-results-card card"
        style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48 }}
      >
        选择调仓频率后点击「开始分析」
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
