/**
 * @file 蒙特卡洛模拟页面
 * @description 基于历史收益分布进行蒙特卡洛模拟，展示未来净值区间、成功率及分布统计
 * @route /monte-carlo
 */
import { useState } from 'react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import { Play, Loader2, Plus, X } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, BarChart, Bar, LineChart, Line, ReferenceLine,
} from 'recharts';
import { CHART_COLORS } from '../../shared/types';
import type { MonteCarloResult, PerPathMetrics } from '../../shared/types';
import { ToolPageLayout } from '../components/layout/ToolPageLayout';
import { ParamsPanel, ParamsSection } from '../components/ParamsPanel';

type PortfolioMode = 1 | 2;
type ResultTab = 'summary' | 'range' | 'success' | 'distributions' | 'scenarios';
type DistMetric = 'finalValue' | 'cagr' | 'maxDrawdown' | 'volatility' | 'sharpe' | 'sortino';
type SimMode = 'standard' | 'frontier';

interface PortfolioState {
  name: string;
  assets: { ticker: string; weight: number }[];
  rebalanceFrequency: string;
}

function createDefaultPortfolio(suffix: number): PortfolioState {
  return {
    name: `组合 ${suffix}`,
    assets:
      suffix === 1
        ? [{ ticker: 'VTI', weight: 60 }, { ticker: 'BND', weight: 40 }]
        : [{ ticker: 'VXUS', weight: 50 }, { ticker: 'BND', weight: 50 }],
    rebalanceFrequency: 'yearly',
  };
}

const GOAL_OPTIONS: { value: string; label: string }[] = [
  { value: 'maxCagrPercentile', label: '最大化 CAGR 百分位' },
  { value: 'minMaxDrawdown', label: '最小化最大回撤' },
  { value: 'maxSharpe', label: '最大化夏普比率' },
  { value: 'minVolatility', label: '最小化波动率' },
  { value: 'maxFinalValue', label: '最大化终值' },
  { value: 'maxSuccessRate', label: '最大化保本概率' },
];

// ===== 工具函数 =====

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(Math.floor(sorted.length * p), sorted.length - 1)];
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function fmtDollar(v: number): string {
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function fmtPct(v: number, decimals = 1): string {
  return `${(v * 100).toFixed(decimals)}%`;
}
function fmtNum(v: number, decimals = 2): string {
  return v.toFixed(decimals);
}

const METRIC_LABELS: Record<DistMetric, string> = {
  finalValue: '终值', cagr: 'CAGR', maxDrawdown: '最大回撤',
  volatility: '波动率', sharpe: '夏普比率', sortino: 'Sortino比率',
};

const METRIC_FORMAT: Record<DistMetric, (v: number) => string> = {
  finalValue: fmtDollar, cagr: fmtPct, maxDrawdown: fmtPct,
  volatility: fmtPct, sharpe: fmtNum, sortino: fmtNum,
};

const SUMMARY_STATS = ['Min', 'P10', 'P25', 'P50', 'Mean', 'P75', 'P90', 'Max', 'Std'] as const;

const RESULT_TABS: { key: ResultTab; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'range', label: 'Portfolio Value Range' },
  { key: 'success', label: 'Portfolio Success' },
  { key: 'distributions', label: 'Distributions' },
  { key: 'scenarios', label: 'Scenarios' },
];

const EMPTY_DATA_STYLE: CSSProperties = { color: 'var(--text-muted)', textAlign: 'center', padding: 24 };
const TOOLTIP_STYLE: CSSProperties = {
  fontSize: 12, backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)', color: 'var(--text-body)', boxShadow: 'var(--shadow-md)',
};
const statCardStyle: CSSProperties = {
  textAlign: 'center', padding: 14, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)',
};

// ===== 数据计算 =====

function buildSummaryData(r: MonteCarloResult, startingValue: number) {
  const metrics = r.perPathMetrics;
  if (!metrics || metrics.length === 0) return null;
  const keys: DistMetric[] = ['finalValue', 'cagr', 'maxDrawdown', 'volatility', 'sharpe', 'sortino'];
  return keys.map((key) => {
    const vals = key === 'finalValue'
      ? metrics.map((m) => m.finalValue * startingValue)
      : metrics.map((m) => m[key]);
    const p = (frac: number) => percentile(vals, frac);
    const m = mean(vals);
    const s = std(vals);
    return {
      metric: METRIC_LABELS[key], key,
      values: {
        Min: METRIC_FORMAT[key](Math.min(...vals)), P10: METRIC_FORMAT[key](p(0.1)),
        P25: METRIC_FORMAT[key](p(0.25)), P50: METRIC_FORMAT[key](p(0.5)),
        Mean: METRIC_FORMAT[key](m), P75: METRIC_FORMAT[key](p(0.75)),
        P90: METRIC_FORMAT[key](p(0.9)), Max: METRIC_FORMAT[key](Math.max(...vals)),
        Std: key === 'finalValue' ? fmtDollar(s) : fmtNum(s),
      } as Record<string, string>,
    };
  });
}

interface RangeDataPoint {
  month: number; label: string; p5: number; p25: number; p50: number; p75: number; p95: number;
}

function buildRangeData(r: MonteCarloResult, startingValue: number): RangeDataPoint[] {
  const { p5, p25, p50, p75, p95 } = r.percentiles;
  if (!p5 || p5.length === 0) return [];
  const data: RangeDataPoint[] = [];
  const push = (day: number, month: number) => {
    data.push({
      month, label: month % 12 === 0 ? `${month / 12}y` : '',
      p5: p5[day] * startingValue, p25: p25[day] * startingValue, p50: p50[day] * startingValue,
      p75: p75[day] * startingValue, p95: p95[day] * startingValue,
    });
  };
  push(0, 0);
  let day = 0, month = 0;
  while (day < p5.length - 1) {
    day += 21; month++;
    if (day >= p5.length) day = p5.length - 1;
    push(day, month);
    if (day >= p5.length - 1) break;
  }
  return data;
}

function buildSuccessData(r: MonteCarloResult) {
  const sp = r.successProbabilities;
  if (!sp || !sp.survival || sp.survival.length === 0) return [];
  return sp.survival.map((_, i) => ({
    year: i + 1,
    survival: Number((sp.survival[i] * 100).toFixed(1)),
    capitalPreservation: Number((sp.capitalPreservation[i] * 100).toFixed(1)),
    profit: Number((sp.profit[i] * 100).toFixed(1)),
  }));
}

function buildDistHistogram(metrics: PerPathMetrics[], metric: DistMetric, startingValue: number) {
  const vals = metric === 'finalValue'
    ? metrics.map((m) => m.finalValue * startingValue)
    : metrics.map((m) => m[metric]);
  if (vals.length === 0) return { data: [], medianLabel: '', meanLabel: '' };
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const binCount = 40;
  const binWidth = (max - min) / binCount || 1;
  const formatBin = (v: number) => {
    if (metric === 'finalValue') return `$${(v / 1000).toFixed(0)}k`;
    if (metric === 'cagr' || metric === 'maxDrawdown' || metric === 'volatility') return `${(v * 100).toFixed(1)}%`;
    return v.toFixed(2);
  };
  const bins: { range: string; count: number; minVal: number }[] = [];
  for (let i = 0; i < binCount; i++) bins.push({ range: formatBin(min + i * binWidth), count: 0, minVal: min + i * binWidth });
  for (const v of vals) {
    let idx = Math.floor((v - min) / binWidth);
    if (idx >= binCount) idx = binCount - 1;
    bins[idx].count++;
  }
  const medianVal = percentile(vals, 0.5);
  const meanVal = mean(vals);
  return {
    data: bins,
    medianLabel: formatBin(Math.floor((medianVal - min) / binWidth) * binWidth + min),
    meanLabel: formatBin(Math.floor((meanVal - min) / binWidth) * binWidth + min),
    medianVal, meanVal,
  };
}

function buildScenarioData(r: MonteCarloResult, startingValue: number) {
  const rp = r.representativePaths;
  if (!rp || !rp.best || rp.best.length === 0) return { data: [] };
  return { data: rp.best.map((_, i) => ({
    month: i, best: rp.best[i] * startingValue, p75: rp.p75[i] * startingValue,
    median: rp.median[i] * startingValue, p25: rp.p25[i] * startingValue, worst: rp.worst[i] * startingValue,
  }))};
}

// ===== 图表配置常量 =====

const monthFormatter = (v: number) => { const y = v / 12; return Number.isInteger(y) ? `${y}y` : ''; };
const dollarKFormatter = (v: number) => `$${(v / 1000).toFixed(0)}k`;
const dollarFormatter = (v: number) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const yearLabelFormatter = (l: number) => `${(l / 12).toFixed(1)} 年`;

const RANGE_AREAS = [
  { dataKey: 'p95', stackId: 'outer', fill: CHART_COLORS[0], fillOpacity: 0.06, name: 'P95' },
  { dataKey: 'p5', stackId: 'outer-base', fill: '#fff', fillOpacity: 1, name: '' },
  { dataKey: 'p75', stackId: 'inner', fill: CHART_COLORS[0], fillOpacity: 0.12, name: 'P75' },
  { dataKey: 'p25', stackId: 'inner-base', fill: '#fff', fillOpacity: 1, name: '' },
];

const RANGE_LINES = [
  { dataKey: 'p50', stroke: CHART_COLORS[0], strokeWidth: 2, name: '中位数' },
  { dataKey: 'p5', stroke: CHART_COLORS[3], strokeWidth: 0.8, dash: '4 2', name: 'P5' },
  { dataKey: 'p95', stroke: CHART_COLORS[4], strokeWidth: 0.8, dash: '4 2', name: 'P95' },
  { dataKey: 'p25', stroke: CHART_COLORS[1], strokeWidth: 0.8, dash: '3 3', name: 'P25' },
  { dataKey: 'p75', stroke: CHART_COLORS[2], strokeWidth: 0.8, dash: '3 3', name: 'P75' },
];

// ===== Tab 组件 =====

function SummaryTab({ r, startingValue }: { r: MonteCarloResult; startingValue: number }) {
  const rows = buildSummaryData(r, startingValue);
  if (!rows) return <div style={EMPTY_DATA_STYLE}>暂无数据</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '2px solid var(--border-soft)', color: 'var(--text-muted)', fontWeight: 600 }}>指标</th>
            {SUMMARY_STATS.map((s) => (
              <th key={s} style={{ textAlign: 'right', padding: '8px 12px', borderBottom: '2px solid var(--border-soft)', color: 'var(--text-muted)', fontWeight: 600 }}>{s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-soft)', fontWeight: 500, color: 'var(--text-strong)' }}>{row.metric}</td>
              {SUMMARY_STATS.map((s) => (
                <td key={s} style={{ textAlign: 'right', padding: '8px 12px', borderBottom: '1px solid var(--border-soft)', fontFamily: 'monospace', color: 'var(--text-body)' }}>{row.values[s]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RangeChart({ data }: { data: RangeDataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={450}>
      <AreaChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={monthFormatter} interval={11} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={dollarKFormatter} />
        <Tooltip formatter={dollarFormatter} labelFormatter={yearLabelFormatter} contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
        {RANGE_AREAS.map((a) => (
          <Area key={a.dataKey + a.stackId} type="monotone" dataKey={a.dataKey} stackId={a.stackId} stroke="none" fill={a.fill} fillOpacity={a.fillOpacity} name={a.name} />
        ))}
        {RANGE_LINES.map((l) => (
          <Line key={l.dataKey} type="monotone" dataKey={l.dataKey} stroke={l.stroke} strokeWidth={l.strokeWidth} strokeDasharray={l.dash} dot={false} name={l.name} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function RangeTab({ r, startingValue }: { r: MonteCarloResult; startingValue: number }) {
  const data = buildRangeData(r, startingValue);
  if (data.length === 0) return <div style={EMPTY_DATA_STYLE}>暂无数据</div>;
  return <RangeChart data={data} />;
}

function SuccessTab({ r }: { r: MonteCarloResult }) {
  const data = buildSuccessData(r);
  if (data.length === 0) return <div style={EMPTY_DATA_STYLE}>暂无数据</div>;
  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
        <XAxis dataKey="year" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} label={{ value: '年限', position: 'insideBottom', offset: -5, fontSize: 12, fill: 'var(--text-muted)' }} />
        <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
        <Tooltip formatter={(v: number) => `${v}%`} contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
        <Line type="monotone" dataKey="survival" stroke={CHART_COLORS[2]} strokeWidth={2} dot={false} name="存活概率 (终值>0)" />
        <Line type="monotone" dataKey="capitalPreservation" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} name="保本概率 (终值≥初始资金)" />
        <Line type="monotone" dataKey="profit" stroke={CHART_COLORS[1]} strokeWidth={2} dot={false} name="盈利概率 (终值>初始资金)" />
      </LineChart>
    </ResponsiveContainer>
  );
}

function DistMetricSelector({ distMetric, setDistMetric }: { distMetric: DistMetric; setDistMetric: (m: DistMetric) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
      {(Object.keys(METRIC_LABELS) as DistMetric[]).map((key) => (
        <button key={key} onClick={() => setDistMetric(key)} style={{
          padding: '4px 12px', fontSize: 12, fontWeight: 500, border: '1px solid var(--border-soft)',
          borderRadius: 'var(--radius-control)', cursor: 'pointer',
          backgroundColor: distMetric === key ? 'var(--brand)' : 'var(--bg-elevated)',
          color: distMetric === key ? '#fff' : 'var(--text-body)', transition: 'all 0.15s',
        }}>{METRIC_LABELS[key]}</button>
      ))}
    </div>
  );
}

function DistHistogramChart({ data, medianLabel, meanLabel, medianVal, meanVal, distMetric }: {
  data: { range: string; count: number }[]; medianLabel: string; meanLabel: string;
  medianVal?: number; meanVal?: number; distMetric: DistMetric;
}) {
  if (data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
        <XAxis dataKey="range" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} interval={3} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="count" fill={CHART_COLORS[0]} fillOpacity={0.7} name="频次" radius={[2, 2, 0, 0]} />
        <ReferenceLine x={medianLabel} stroke={CHART_COLORS[2]} strokeDasharray="4 2" label={{ value: `中位数: ${medianVal !== undefined ? METRIC_FORMAT[distMetric](medianVal) : ''}`, position: 'top', fontSize: 11, fill: CHART_COLORS[2] }} />
        <ReferenceLine x={meanLabel} stroke={CHART_COLORS[1]} strokeDasharray="4 2" label={{ value: `均值: ${meanVal !== undefined ? METRIC_FORMAT[distMetric](meanVal) : ''}`, position: 'top', fontSize: 11, fill: CHART_COLORS[1] }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function DistributionsTab({ r, distMetric, setDistMetric, startingValue }: {
  r: MonteCarloResult; distMetric: DistMetric; setDistMetric: (m: DistMetric) => void; startingValue: number;
}) {
  if (!r.perPathMetrics || r.perPathMetrics.length === 0) return <div style={EMPTY_DATA_STYLE}>暂无数据</div>;
  const { data, medianLabel, meanLabel, medianVal, meanVal } = buildDistHistogram(r.perPathMetrics, distMetric, startingValue);
  return (
    <div>
      <DistMetricSelector distMetric={distMetric} setDistMetric={setDistMetric} />
      <DistHistogramChart data={data} medianLabel={medianLabel} meanLabel={meanLabel} medianVal={medianVal} meanVal={meanVal} distMetric={distMetric} />
    </div>
  );
}

function ScenariosTab({ r, startingValue }: { r: MonteCarloResult; startingValue: number }) {
  const { data } = buildScenarioData(r, startingValue);
  if (data.length === 0) return <div style={EMPTY_DATA_STYLE}>暂无数据</div>;
  return (
    <ResponsiveContainer width="100%" height={450}>
      <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={monthFormatter} interval={11} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={dollarKFormatter} />
        <Tooltip formatter={dollarFormatter} labelFormatter={yearLabelFormatter} contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
        <Line type="monotone" dataKey="best" stroke={CHART_COLORS[2]} strokeWidth={2} dot={false} name="Best" />
        <Line type="monotone" dataKey="p75" stroke={CHART_COLORS[0]} strokeWidth={1.5} dot={false} name="P75" />
        <Line type="monotone" dataKey="median" stroke={CHART_COLORS[4]} strokeWidth={2.5} dot={false} name="Median" />
        <Line type="monotone" dataKey="p25" stroke={CHART_COLORS[1]} strokeWidth={1.5} dot={false} name="P25" />
        <Line type="monotone" dataKey="worst" stroke={CHART_COLORS[3]} strokeWidth={2} dot={false} name="Worst" />
      </LineChart>
    </ResponsiveContainer>
  );
}

function TabContent({ activeTab, r, startingValue, distMetric, setDistMetric }: {
  activeTab: ResultTab; r: MonteCarloResult; startingValue: number; distMetric: DistMetric; setDistMetric: (m: DistMetric) => void;
}) {
  switch (activeTab) {
    case 'summary': return <SummaryTab r={r} startingValue={startingValue} />;
    case 'range': return <RangeTab r={r} startingValue={startingValue} />;
    case 'success': return <SuccessTab r={r} />;
    case 'distributions': return <DistributionsTab r={r} distMetric={distMetric} setDistMetric={setDistMetric} startingValue={startingValue} />;
    case 'scenarios': return <ScenariosTab r={r} startingValue={startingValue} />;
  }
}

// ===== 组合编辑器 =====

function PortfolioEditor({ portfolio: p, onUpdate, onAddAsset, onRemoveAsset, onUpdateAsset, totalWeight, isComplete }: {
  portfolio: PortfolioState; onUpdate: (patch: Partial<PortfolioState>) => void; onAddAsset: () => void;
  onRemoveAsset: (aIdx: number) => void; onUpdateAsset: (aIdx: number, field: 'ticker' | 'weight', val: string | number) => void;
  totalWeight: number; isComplete: boolean;
}) {
  return (
    <div className="portfolio-card" style={{ width: '100%', maxWidth: 'none', minWidth: 0, display: 'block' }}>
      <div className="portfolio-card-header">
        <div className="portfolio-card-name-row">
          <input type="text" className="portfolio-name-input" style={{ flex: 1, width: 'auto' }} value={p.name} onChange={(e) => onUpdate({ name: e.target.value })} />
          <select className="portfolio-rebalance-select" value={p.rebalanceFrequency} onChange={(e) => onUpdate({ rebalanceFrequency: e.target.value })}>
            <option value="yearly">每年</option><option value="quarterly">每季度</option>
            <option value="monthly">每月</option><option value="none">不调仓</option>
          </select>
        </div>
      </div>
      {p.assets.map((a, i) => (
        <div key={i} className="ticker-row">
          <input type="text" value={a.ticker} onChange={(e) => onUpdateAsset(i, 'ticker', e.target.value)} placeholder="输入代码，如 VTI" className="ticker-input" />
          <div className="weight-cell">
            <input type="number" value={a.weight || ''} onChange={(e) => onUpdateAsset(i, 'weight', Number(e.target.value))} min={0} max={100} className="weight-input" placeholder="%" />
            <span className="weight-suffix">%</span>
          </div>
          <button onClick={() => onRemoveAsset(i)} className="row-remove-btn" title="删除"><X className="w-4 h-4" /></button>
        </div>
      ))}
      <div className="portfolio-card-toolbar">
        <button className="toolbar-btn" onClick={onAddAsset}><Plus className="w-4 h-4" /> 添加标的</button>
      </div>
      <div className={`portfolio-total ${isComplete ? 'complete' : 'incomplete'}`}>
        <span>合计</span><span className="total-value">{totalWeight}%</span>
      </div>
    </div>
  );
}

// ===== 结果展示 =====

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={statCardStyle}>
      <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'monospace', color: color ?? 'var(--text-strong)' }}>{value}</div>
    </div>
  );
}

function StatsGrid({ r, startingValue, numSimulations }: { r: MonteCarloResult; startingValue: number; numSimulations: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
      <StatCard label="中位终值" value={fmtDollar(r.statistics.medianFinalValue * startingValue)} />
      <StatCard label="均值终值" value={fmtDollar(r.statistics.meanFinalValue * startingValue)} />
      <StatCard label="保本概率" value={`${(r.statistics.successRate * 100).toFixed(1)}%`} color="var(--success)" />
      <StatCard label="模拟次数" value={`${r.perPathMetrics?.length ?? numSimulations}`} />
    </div>
  );
}

function ResultTabBar({ activeTab, onTabChange }: { activeTab: ResultTab; onTabChange: (tab: ResultTab) => void }) {
  return (
    <div className="result-tabs" style={{ marginBottom: 16 }}>
      {RESULT_TABS.map((tab) => (
        <button key={tab.key} onClick={() => onTabChange(tab.key)} className={`result-tab ${activeTab === tab.key ? 'active' : ''}`}>{tab.label}</button>
      ))}
    </div>
  );
}

function ResultsDisplay({ r, label, colorIdx, portfolioMode, activeTab, startingValue, numSimulations, distMetric, setDistMetric, onTabChange }: {
  r: MonteCarloResult; label: string; colorIdx: number; portfolioMode: PortfolioMode;
  activeTab: ResultTab; startingValue: number; numSimulations: number;
  distMetric: DistMetric; setDistMetric: (m: DistMetric) => void; onTabChange: (tab: ResultTab) => void;
}) {
  return (
    <div key={label}>
      {portfolioMode === 2 && (
        <div style={{ fontWeight: 600, fontSize: 15, color: CHART_COLORS[colorIdx], marginBottom: 12, marginTop: 8 }}>{label}</div>
      )}
      <StatsGrid r={r} startingValue={startingValue} numSimulations={numSimulations} />
      <ResultTabBar activeTab={activeTab} onTabChange={onTabChange} />
      <div style={{ minHeight: 300 }}>
        <TabContent activeTab={activeTab} r={r} startingValue={startingValue} distMetric={distMetric} setDistMetric={setDistMetric} />
      </div>
    </div>
  );
}

// ===== State Hook =====

function usePortfolioOperations(portfolios: PortfolioState[], setPortfolios: Dispatch<SetStateAction<PortfolioState[]>>) {
  const updatePortfolio = (idx: number, patch: Partial<PortfolioState>) =>
    setPortfolios((prev) => { const next = [...prev]; next[idx] = { ...next[idx], ...patch }; return next; });
  const addAsset = (pIdx: number) => updatePortfolio(pIdx, { assets: [...portfolios[pIdx].assets, { ticker: '', weight: 0 }] });
  const removeAsset = (pIdx: number, aIdx: number) => updatePortfolio(pIdx, { assets: portfolios[pIdx].assets.filter((_, i) => i !== aIdx) });
  const updateAsset = (pIdx: number, aIdx: number, field: 'ticker' | 'weight', val: string | number) => {
    const next = [...portfolios[pIdx].assets]; next[aIdx] = { ...next[aIdx], [field]: val }; updatePortfolio(pIdx, { assets: next });
  };
  const getTotalWeight = (pIdx: number) => portfolios[pIdx].assets.reduce((s, a) => s + (a.weight || 0), 0);
  const isComplete = (pIdx: number) => getTotalWeight(pIdx) === 100;
  return { updatePortfolio, addAsset, removeAsset, updateAsset, getTotalWeight, isComplete };
}

function validatePortfolios(portfolios: PortfolioState[], portfolioMode: PortfolioMode, isComplete: (pIdx: number) => boolean): string | null {
  for (let i = 0; i < portfolioMode; i++) {
    const validAssets = portfolios[i].assets.filter((a) => a.ticker.trim() !== '');
    if (validAssets.length === 0) return `组合 ${i + 1} 请至少添加一个标的`;
    if (!isComplete(i)) return `组合 ${i + 1} 权重合计必须为 100%`;
  }
  return null;
}

async function fetchMcResult(idx: number, portfolios: PortfolioState[], reqBody: { parameters: object; mcParams: object; objectives: object }): Promise<MonteCarloResult> {
  const p = portfolios[idx];
  const res = await fetch('/api/backtest/monte-carlo', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ portfolio: { name: p.name, assets: p.assets.filter((a) => a.ticker.trim()), rebalanceFrequency: p.rebalanceFrequency }, ...reqBody }),
  });
  if (!res.ok) throw new Error(`组合 ${idx + 1}: HTTP ${res.status}`);
  const json = await res.json();
  if (json.success === false) throw new Error(json.error || `组合 ${idx + 1} 模拟失败`);
  return json.data ?? json;
}

interface SimExecParams {
  portfolios: PortfolioState[]; portfolioMode: PortfolioMode; isComplete: (pIdx: number) => boolean;
  numYears: number; numSimulations: number; minBlock: number; maxBlock: number;
  withReplacement: boolean; randomSeed: string; startDate: string; endDate: string;
  startingValue: number; simMode: SimMode; goal1: string; goal2: string; goalWeight: number;
}

async function executeSimulation(params: SimExecParams, setters: {
  setError: (e: string | null) => void; setIsLoading: (b: boolean) => void;
  setResults1: (r: MonteCarloResult | null) => void; setResults2: (r: MonteCarloResult | null) => void;
}): Promise<void> {
  const validationError = validatePortfolios(params.portfolios, params.portfolioMode, params.isComplete);
  if (validationError) { setters.setError(validationError); return; }
  setters.setIsLoading(true); setters.setError(null); setters.setResults1(null); setters.setResults2(null);
  const mcParams = { numYears: params.numYears, numSimulations: params.numSimulations, minBlockYears: params.minBlock, maxBlockYears: params.maxBlock, withReplacement: params.withReplacement, seed: params.randomSeed ? Number(params.randomSeed) : undefined };
  const parameters = { startDate: params.startDate, endDate: params.endDate, startingValue: params.startingValue, adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '', baseCurrency: 'usd', extendedWithdrawalStats: false, cashflowLegs: [], oneTimeCashflows: [] };
  const objectives = { mode: params.simMode, goal1: params.goal1, goal2: params.goal2, goal1Weight: params.goalWeight / 100, goal2Weight: (100 - params.goalWeight) / 100 };
  try {
    const reqBody = { parameters, mcParams, objectives };
    const promises = [fetchMcResult(0, params.portfolios, reqBody)];
    if (params.portfolioMode === 2) promises.push(fetchMcResult(1, params.portfolios, reqBody));
    const results = await Promise.all(promises);
    setters.setResults1(results[0]);
    if (results[1]) setters.setResults2(results[1]);
  } catch (e) {
    setters.setError(e instanceof Error ? e.message : '模拟失败');
  } finally {
    setters.setIsLoading(false);
  }
}

function useMonteCarloState() {
  const [portfolioMode, setPortfolioMode] = useState<PortfolioMode>(1);
  const [numYears, setNumYears] = useState(20);
  const [numSimulations, setNumSimulations] = useState(500);
  const [startingValue, setStartingValue] = useState(100000);
  const [minBlock, setMinBlock] = useState(1);
  const [maxBlock, setMaxBlock] = useState(5);
  const [withReplacement, setWithReplacement] = useState(true);
  const [startDate, setStartDate] = useState('2010-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [randomSeed, setRandomSeed] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results1, setResults1] = useState<MonteCarloResult | null>(null);
  const [results2, setResults2] = useState<MonteCarloResult | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTab>('summary');
  const [distMetric, setDistMetric] = useState<DistMetric>('finalValue');
  const [portfolios, setPortfolios] = useState<PortfolioState[]>([createDefaultPortfolio(1), createDefaultPortfolio(2)]);
  const [simMode, setSimMode] = useState<SimMode>('standard');
  const [goal1, setGoal1] = useState('maxCagrPercentile');
  const [goal2, setGoal2] = useState('minMaxDrawdown');
  const [goalWeight, setGoalWeight] = useState(50);

  const portfolioOps = usePortfolioOperations(portfolios, setPortfolios);
  const runSimulation = () => executeSimulation(
    { portfolios, portfolioMode, ...portfolioOps, numYears, numSimulations, minBlock, maxBlock, withReplacement, randomSeed, startDate, endDate, startingValue, simMode, goal1, goal2, goalWeight },
    { setError, setIsLoading, setResults1, setResults2 },
  );

  return {
    portfolioMode, setPortfolioMode, numYears, setNumYears, numSimulations, setNumSimulations,
    startingValue, setStartingValue, minBlock, setMinBlock, maxBlock, setMaxBlock,
    withReplacement, setWithReplacement, startDate, setStartDate, endDate, setEndDate,
    randomSeed, setRandomSeed, isLoading, error, results1, results2, activeTab, setActiveTab,
    distMetric, setDistMetric, portfolios, simMode, setSimMode, goal1, setGoal1, goal2, setGoal2,
    goalWeight, setGoalWeight, setPortfolios, ...portfolioOps, runSimulation,
  };
}

type McState = ReturnType<typeof useMonteCarloState>;

// ===== 参数面板子组件 =====

function PortfolioModeToggle({ s }: { s: McState }) {
  const { portfolioMode, setPortfolioMode } = s;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>组合数量</span>
      <div style={{ display: 'flex', gap: 0, borderRadius: 'var(--radius-control)', overflow: 'hidden', border: '1px solid var(--border-soft)' }}>
        {[1, 2].map((mode) => (
          <button key={mode} onClick={() => setPortfolioMode(mode as PortfolioMode)} style={{
            padding: '4px 14px', fontSize: 13, fontWeight: 500, border: 'none',
            borderLeft: mode === 2 ? '1px solid var(--border-soft)' : 'none', cursor: 'pointer',
            backgroundColor: portfolioMode === mode ? 'var(--brand)' : 'var(--bg-elevated)',
            color: portfolioMode === mode ? '#fff' : 'var(--text-body)', transition: 'all 0.15s',
          }}>{mode}组合</button>
        ))}
      </div>
    </div>
  );
}

function PortfolioConfigSection({ s }: { s: McState }) {
  const { portfolios, portfolioMode, ...ops } = s;
  return (
    <ParamsSection title="组合配置" info="设置参与模拟的投资组合及其标的权重，权重合计需为 100%">
      <PortfolioModeToggle s={s} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <PortfolioEditor portfolio={portfolios[0]} onUpdate={(patch) => ops.updatePortfolio(0, patch)} onAddAsset={() => ops.addAsset(0)} onRemoveAsset={(aIdx) => ops.removeAsset(0, aIdx)} onUpdateAsset={(aIdx, f, v) => ops.updateAsset(0, aIdx, f, v)} totalWeight={ops.getTotalWeight(0)} isComplete={ops.isComplete(0)} />
        {portfolioMode === 2 && (
          <PortfolioEditor portfolio={portfolios[1]} onUpdate={(patch) => ops.updatePortfolio(1, patch)} onAddAsset={() => ops.addAsset(1)} onRemoveAsset={(aIdx) => ops.removeAsset(1, aIdx)} onUpdateAsset={(aIdx, f, v) => ops.updateAsset(1, aIdx, f, v)} totalWeight={ops.getTotalWeight(1)} isComplete={ops.isComplete(1)} />
        )}
      </div>
    </ParamsSection>
  );
}

function SimParamsSection({ s }: { s: McState }) {
  return (
    <ParamsSection title="模拟参数" info="区块自举法参数：从历史数据中随机抽取区块拼接为模拟路径">
      <div className="params-row">
        <label className="param-check"><input type="checkbox" /><span>全部历史</span></label>
        <div className="param-field"><span className="param-label">开始日期</span><input type="date" className="param-input" value={s.startDate} onChange={(e) => s.setStartDate(e.target.value)} /></div>
        <div className="param-field"><span className="param-label">结束日期</span><input type="date" className="param-input" value={s.endDate} onChange={(e) => s.setEndDate(e.target.value)} /></div>
        <div className="param-field"><span className="param-label">模拟年数</span><input type="number" className="param-input" value={s.numYears} onChange={(e) => s.setNumYears(Number(e.target.value))} /></div>
        <div className="param-field"><span className="param-label">模拟次数</span><input type="number" className="param-input" value={s.numSimulations} onChange={(e) => s.setNumSimulations(Number(e.target.value))} /></div>
        <div className="param-field param-field-start-val"><span className="param-label">初始资金</span><div className="param-input-prefix-wrap"><span className="param-input-prefix">$</span><input type="number" className="param-input param-input-with-prefix" value={s.startingValue} onChange={(e) => s.setStartingValue(Number(e.target.value))} /></div></div>
        <div className="param-field param-field-rolling"><span className="param-label">最小区块</span><div className="param-input-suffix-wrap"><input type="number" className="param-input param-input-with-suffix" value={s.minBlock} onChange={(e) => s.setMinBlock(Number(e.target.value))} /><span className="param-input-suffix">年</span></div></div>
        <div className="param-field param-field-rolling"><span className="param-label">最大区块</span><div className="param-input-suffix-wrap"><input type="number" className="param-input param-input-with-suffix" value={s.maxBlock} onChange={(e) => s.setMaxBlock(Number(e.target.value))} /><span className="param-input-suffix">年</span></div></div>
        <div className="param-field"><span className="param-label">随机种子</span><input type="number" className="param-input" value={s.randomSeed} onChange={(e) => s.setRandomSeed(e.target.value)} placeholder="留空则随机" /></div>
        <label className="param-check"><input type="checkbox" checked={s.withReplacement} onChange={(e) => s.setWithReplacement(e.target.checked)} /><span>有放回抽样</span></label>
      </div>
    </ParamsSection>
  );
}

function BuildModeSection({ s }: { s: McState }) {
  const { simMode, setSimMode } = s;
  const modes = [
    { value: 'standard' as const, label: '标准模拟', desc: '— 对当前组合权重运行蒙特卡洛模拟' },
    { value: 'frontier' as const, label: '有效前沿构建', desc: '— 沿有效前沿采样权重组合并逐一模拟' },
  ];
  return (
    <ParamsSection title="构建模式" info="标准模拟：对当前组合运行区块自举；有效前沿构建：沿有效前沿采样权重组合，对每个组合运行模拟">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {modes.map((opt) => (
          <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-body)', cursor: 'pointer' }}>
            <input type="radio" name="simMode" value={opt.value} checked={simMode === opt.value} onChange={() => setSimMode(opt.value)} style={{ cursor: 'pointer' }} />
            <span>{opt.label}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{opt.desc}</span>
          </label>
        ))}
      </div>
    </ParamsSection>
  );
}

function GoalSelector({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="param-field">
      <span className="param-label">{label}</span>
      <select className="param-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {GOAL_OPTIONS.map((g) => (<option key={g.value} value={g.value}>{g.label}</option>))}
      </select>
    </div>
  );
}

function DualGoalSection({ s }: { s: McState }) {
  const { goal1, setGoal1, goal2, setGoal2, goalWeight, setGoalWeight } = s;
  return (
    <ParamsSection title="双目标设置" info="设定两个优化目标及权重分配，用于在模拟路径中权衡不同指标">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <GoalSelector label="目标 1" value={goal1} onChange={setGoal1} />
        <GoalSelector label="目标 2" value={goal2} onChange={setGoal2} />
        <div className="param-field" style={{ gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="param-label">目标 1 权重</span>
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-strong)' }}>{goalWeight}% : {100 - goalWeight}%</span>
          </div>
          <input type="range" min={0} max={100} step={5} value={goalWeight} onChange={(e) => setGoalWeight(Number(e.target.value))} style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--brand)' }} />
        </div>
      </div>
    </ParamsSection>
  );
}

function McParamsPanel({ s }: { s: McState }) {
  return (
    <ParamsPanel>
      <PortfolioConfigSection s={s} />
      <SimParamsSection s={s} />
      <BuildModeSection s={s} />
      <DualGoalSection s={s} />
      <div className="bt-action-row" style={{ padding: '12px 0 4px' }}>
        <button onClick={s.runSimulation} disabled={s.isLoading} className="main-action-btn" style={{ width: '100%' }}>
          {s.isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {s.isLoading ? '模拟中...' : '开始模拟'}
        </button>
      </div>
    </ParamsPanel>
  );
}

// ===== 预设与结果面板 =====

interface PresetButtonProps { label: string; onClick: () => void; }

function buildPresets(t: {
  setPortfolioMode: (m: PortfolioMode) => void; setPortfolios: (p: PortfolioState[]) => void;
  setNumYears: (n: number) => void; setNumSimulations: (n: number) => void;
  setStartingValue: (n: number) => void; setMinBlock: (n: number) => void; setMaxBlock: (n: number) => void;
}): PresetButtonProps[] {
  return [
    { label: '60/40 退休回测', onClick: () => { t.setPortfolioMode(1); t.setPortfolios([{ ...createDefaultPortfolio(1), assets: [{ ticker: 'VTI', weight: 60 }, { ticker: 'BND', weight: 40 }] }]); t.setNumYears(20); t.setNumSimulations(500); t.setStartingValue(100000); t.setMinBlock(1); t.setMaxBlock(5); } },
    { label: '全股定投 30 年', onClick: () => { t.setPortfolioMode(1); t.setPortfolios([{ ...createDefaultPortfolio(1), assets: [{ ticker: 'VTI', weight: 100 }] }]); t.setNumYears(30); t.setNumSimulations(1000); t.setStartingValue(50000); t.setMinBlock(1); t.setMaxBlock(5); } },
    { label: '三基金 25 年', onClick: () => { t.setPortfolioMode(1); t.setPortfolios([{ ...createDefaultPortfolio(1), assets: [{ ticker: 'VTI', weight: 50 }, { ticker: 'VXUS', weight: 30 }, { ticker: 'BND', weight: 20 }] }]); t.setNumYears(25); t.setNumSimulations(500); t.setStartingValue(200000); t.setMinBlock(2); t.setMaxBlock(8); } },
  ];
}

function PresetButton({ label, onClick }: PresetButtonProps) {
  return <button className="toolbar-btn" onClick={onClick}>{label}</button>;
}

function MonteCarloResultsPanel({ error, results1, results2, portfolios, portfolioMode, activeTab, setActiveTab, startingValue, numSimulations, distMetric, setDistMetric }: {
  error: string | null; results1: MonteCarloResult | null; results2: MonteCarloResult | null;
  portfolios: PortfolioState[]; portfolioMode: PortfolioMode; activeTab: ResultTab; setActiveTab: (tab: ResultTab) => void;
  startingValue: number; numSimulations: number; distMetric: DistMetric; setDistMetric: (m: DistMetric) => void;
}) {
  if (error) return <div className="bt-results-card card" style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}>模拟失败：{error}</div>;
  if (!results1 && !results2) return <div className="bt-results-card card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48 }}>配置左侧参数并点击「开始模拟」查看结果</div>;
  return (
    <div className="bt-results-card card">
      {results1 && <ResultsDisplay r={results1} label={portfolios[0].name} colorIdx={0} portfolioMode={portfolioMode} activeTab={activeTab} startingValue={startingValue} numSimulations={numSimulations} distMetric={distMetric} setDistMetric={setDistMetric} onTabChange={setActiveTab} />}
      {results2 && (
        <>
          <div style={{ borderTop: '1px solid var(--border-soft)', marginTop: 24, paddingTop: 8 }} />
          <ResultsDisplay r={results2} label={portfolios[1].name} colorIdx={1} portfolioMode={portfolioMode} activeTab={activeTab} startingValue={startingValue} numSimulations={numSimulations} distMetric={distMetric} setDistMetric={setDistMetric} onTabChange={setActiveTab} />
        </>
      )}
    </div>
  );
}

function MonteCarloSeoCard() {
  return (
    <div className="bt-seo-card card">
      <p className="bt-seo-desc">本工具使用区块自举法对历史市场数据进行重采样，让您研究大量可能的组合路径，而非仅回放一段固定历史。</p>
      <div className="bt-seo-features">
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">可模拟内容</div>
          <div className="bt-seo-feature-desc">退休提款策略、定投计划、固定提取方案，观察其在数千条模拟市场路径下的表现与存活概率。</div>
        </div>
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">输出结果</div>
          <div className="bt-seo-feature-desc">分布统计表(Summary)、组合价值范围图、成功概率曲线、多指标分布直方图、代表性场景路径。</div>
        </div>
      </div>
      <div className="bt-seo-related">
        <span className="bt-seo-related-label">相关工具：</span>
        <Link to="/" className="link-blue" style={{ fontWeight: 700 }}>组合回测</Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/optimizer" className="link-blue" style={{ fontWeight: 700 }}>组合优化</Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/efficient-frontier" className="link-blue" style={{ fontWeight: 700 }}>有效前沿</Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/analysis" className="link-blue" style={{ fontWeight: 700 }}>资产分析</Link>
      </div>
    </div>
  );
}

function PresetsCard({ presets }: { presets: PresetButtonProps[] }) {
  return (
    <div className="bt-seo-card card" style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>预设示例</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {presets.map((preset) => (<PresetButton key={preset.label} label={preset.label} onClick={preset.onClick} />))}
      </div>
    </div>
  );
}

// ===== 主页面 =====

export default function MonteCarloPage() {
  const s = useMonteCarloState();
  const presets = buildPresets(s);
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">蒙特卡洛模拟</h1>
      </div>
      <MonteCarloSeoCard />
      <PresetsCard presets={presets} />
      <ToolPageLayout
        title="参数设置"
        params={<McParamsPanel s={s} />}
        results={
          <MonteCarloResultsPanel
            error={s.error} results1={s.results1} results2={s.results2}
            portfolios={s.portfolios} portfolioMode={s.portfolioMode}
            activeTab={s.activeTab} setActiveTab={s.setActiveTab}
            startingValue={s.startingValue} numSimulations={s.numSimulations}
            distMetric={s.distMetric} setDistMetric={s.setDistMetric}
          />
        }
      />
    </div>
  );
}
