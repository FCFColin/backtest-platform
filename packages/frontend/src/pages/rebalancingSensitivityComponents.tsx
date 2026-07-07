import { Link } from 'react-router-dom';
import { Play, Loader2, Plus, X } from 'lucide-react';
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

export function SeoCard() {
  return (
    <div className="bt-seo-card card">
      <p className="bt-seo-desc">
        对比不同调仓频率对同一投资组合长期表现的影响。选择多种调仓频率并行回测，直观查看
        CAGR、波动率、最大回撤、夏普比率和 Sortino 比率的差异。
      </p>
      <div className="bt-seo-features">
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">可分析内容</div>
          <div className="bt-seo-feature-desc">
            每日/每周/每月/每季度/每年调仓对组合收益与风险的影响，支持偏离带扫描。
          </div>
        </div>
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">偏移扫描</div>
          <div className="bt-seo-feature-desc">
            在选定频率下扫描不同偏移天数（0-20天），观察调仓时点对收益的影响。
          </div>
        </div>
      </div>
      <div className="bt-seo-related">
        <span className="bt-seo-related-label">相关工具：</span>
        <Link to="/" className="link-blue" style={{ fontWeight: 700 }}>
          组合回测
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/optimizer" className="link-blue" style={{ fontWeight: 700 }}>
          组合优化器
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/lumpsum-vs-dca" className="link-blue" style={{ fontWeight: 700 }}>
          一次性 vs 定投
        </Link>
      </div>
    </div>
  );
}

export function FreqSelector({ s }: { s: RebalancingState }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
        调仓频率（可多选）
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {REBALANCE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 'var(--radius-control)',
              border: `1px solid ${s.selectedFreqs.includes(opt.value) ? opt.color : 'var(--border-soft)'}`,
              backgroundColor: s.selectedFreqs.includes(opt.value)
                ? `${opt.color}18`
                : 'transparent',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              color: s.selectedFreqs.includes(opt.value) ? opt.color : 'var(--text-muted)',
              transition: 'all .12s',
            }}
          >
            <input
              type="checkbox"
              checked={s.selectedFreqs.includes(opt.value)}
              onChange={() => s.toggleFreq(opt.value)}
              style={{ display: 'none' }}
            />
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: opt.color }}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function RebalParamsFields({ s }: { s: RebalancingState }) {
  return (
    <div className="params-row">
      <div className="param-field">
        <label className="param-label">开始日期</label>
        <input
          type="date"
          className="param-input"
          value={s.startDate}
          onChange={(e) => s.setStartDate(e.target.value)}
        />
      </div>
      <div className="param-field">
        <label className="param-label">结束日期</label>
        <input
          type="date"
          className="param-input"
          value={s.endDate}
          onChange={(e) => s.setEndDate(e.target.value)}
        />
      </div>
      <div className="param-field param-field-start-val">
        <label className="param-label">初始资金</label>
        <div className="param-input-prefix-wrap">
          <span className="param-input-prefix">{s.baseCurrency === 'usd' ? '$' : '¥'}</span>
          <input
            type="number"
            className="param-input param-input-with-prefix"
            value={s.startingValue}
            onChange={(e) => s.setStartingValue(Number(e.target.value))}
          />
        </div>
      </div>
      <div className="param-field" style={{ width: 90 }}>
        <label className="param-label">货币</label>
        <select
          className="param-input"
          value={s.baseCurrency}
          onChange={(e) => s.setBaseCurrency(e.target.value as 'usd' | 'cny')}
        >
          <option value="usd">USD ($)</option>
          <option value="cny">CNY (¥)</option>
        </select>
      </div>
      <label className="param-toggle">
        <span>通胀调整</span>
        <div
          className={`toggle-switch ${s.adjustForInflation ? 'active' : ''}`}
          onClick={() => s.setAdjustForInflation(!s.adjustForInflation)}
        />
      </label>
    </div>
  );
}

function RebalBandFields({ s }: { s: RebalancingState }) {
  return (
    <div
      style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}
    >
      <div className="param-field" style={{ width: 120 }}>
        <label className="param-label">绝对偏离带</label>
        <div className="param-input-suffix-wrap">
          <input
            type="number"
            className="param-input param-input-with-suffix"
            value={s.absoluteBand}
            onChange={(e) => s.setAbsoluteBand(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="留空关闭"
            min={0}
            max={50}
          />
          <span className="param-input-suffix">%</span>
        </div>
      </div>
      <div className="param-field" style={{ width: 120 }}>
        <label className="param-label">相对偏离带</label>
        <div className="param-input-suffix-wrap">
          <input
            type="number"
            className="param-input param-input-with-suffix"
            value={s.relativeBand}
            onChange={(e) => s.setRelativeBand(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="留空关闭"
            min={0}
            max={100}
          />
          <span className="param-input-suffix">%</span>
        </div>
      </div>
    </div>
  );
}

function RebalPortfolioSection({ s }: { s: RebalancingState }) {
  return (
    <div className="portfolios-section">
      <div className="portfolios-header">
        <span className="portfolios-title">投资组合</span>
      </div>
      <div className="portfolios-cards">
        <div className="portfolio-card">
          {s.assets.map((a, i) => (
            <div key={i} className="ticker-row">
              <input
                type="text"
                value={a.ticker}
                onChange={(e) => s.updateAsset(i, 'ticker', e.target.value)}
                placeholder="输入代码，如 VTI"
                className="ticker-input"
              />
              <div className="weight-cell">
                <input
                  type="number"
                  value={a.weight || ''}
                  onChange={(e) => s.updateAsset(i, 'weight', Number(e.target.value))}
                  min={0}
                  max={100}
                  className="weight-input"
                  placeholder="%"
                />
                <span className="weight-suffix">%</span>
              </div>
              <button onClick={() => s.removeAsset(i)} className="row-remove-btn" title="删除">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="portfolio-card-toolbar">
            <button className="toolbar-btn" onClick={s.addAsset}>
              <Plus className="w-4 h-4" />
              添加标的
            </button>
          </div>
          <div
            className={`portfolio-total ${Math.abs(s.totalWeight - 100) <= 0.01 ? 'complete' : 'incomplete'}`}
          >
            <span>合计</span>
            <span className="total-value">{s.totalWeight}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ParamsPanel({ s }: { s: RebalancingState }) {
  return (
    <div className="bt-main-card card">
      <div className="params-section">
        <div className="params-title">参数设置</div>
        <RebalParamsFields s={s} />
        <div style={{ marginTop: 12 }}>
          <FreqSelector s={s} />
        </div>
        <RebalBandFields s={s} />
      </div>
      <RebalPortfolioSection s={s} />
      <div className="bt-action-row">
        <button
          onClick={() => void s.runSensitivity()}
          disabled={s.isLoading}
          className="main-action-btn"
          style={{ width: '100%' }}
        >
          {s.isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {s.isLoading ? '分析中...' : '开始分析'}
        </button>
      </div>
    </div>
  );
}

const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;

export function ScatterTab({ results }: { results: FreqResult[] }) {
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

export function DistributionTab({ results }: { results: FreqResult[] }) {
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

function OffsetSelector({ s }: { s: RebalancingState }) {
  return (
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
  );
}

function OffsetBarChart({ offsetData }: { offsetData: Array<{ offset: string; cagr: number }> }) {
  return (
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
  );
}

function OffsetGrowthChart({ data }: { data: Array<{ date: string; value: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
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
  );
}

export function OffsetTab({ s }: { s: RebalancingState }) {
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

const RESULTS_TABLE_COLS = [
  ['CAGR', 'cagr'] as const,
  ['波动率', 'stdev'] as const,
  ['最大回撤', 'mdd'] as const,
  ['夏普', 'sharpe'] as const,
  ['Sortino', 'sortino'] as const,
];

function ResultsTableHead() {
  return (
    <thead>
      <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
        <th
          className="text-[12px] font-semibold text-left py-2.5 px-3"
          style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}
        >
          频率
        </th>
        {RESULTS_TABLE_COLS.map(([label]) => (
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

export function ResultsTable({ results }: { results: FreqResult[] }) {
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
