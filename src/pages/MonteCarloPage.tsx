/**
 * @file 蒙特卡洛模拟页面
 * @description 基于历史收益分布进行蒙特卡洛模拟，展示未来净值区间、成功率及分布统计
 * @route /monte-carlo
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Loader2, Plus, X } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, LineChart, Line, ReferenceLine,
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
    assets: suffix === 1
      ? [{ ticker: 'VTI', weight: 60 }, { ticker: 'BND', weight: 40 }]
      : [{ ticker: 'VXUS', weight: 50 }, { ticker: 'BND', weight: 50 }],
    rebalanceFrequency: 'yearly',
  };
}

// 双目标可选项
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
  const idx = Math.min(Math.floor(sorted.length * p), sorted.length - 1);
  return sorted[idx];
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
  finalValue: '终值',
  cagr: 'CAGR',
  maxDrawdown: '最大回撤',
  volatility: '波动率',
  sharpe: '夏普比率',
  sortino: 'Sortino比率',
};

const METRIC_FORMAT: Record<DistMetric, (v: number) => string> = {
  finalValue: (v) => fmtDollar(v),
  cagr: (v) => fmtPct(v),
  maxDrawdown: (v) => fmtPct(v),
  volatility: (v) => fmtPct(v),
  sharpe: (v) => fmtNum(v),
  sortino: (v) => fmtNum(v),
};

const SUMMARY_STATS = ['Min', 'P10', 'P25', 'P50', 'Mean', 'P75', 'P90', 'Max', 'Std'] as const;

const RESULT_TABS: { key: ResultTab; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'range', label: 'Portfolio Value Range' },
  { key: 'success', label: 'Portfolio Success' },
  { key: 'distributions', label: 'Distributions' },
  { key: 'scenarios', label: 'Scenarios' },
];

// ===== 数据计算 =====

function buildSummaryData(r: MonteCarloResult, startingValue: number) {
  const metrics = r.perPathMetrics;
  if (!metrics || metrics.length === 0) return null;

  const rows: { metric: string; key: DistMetric; values: Record<string, string> }[] = [];
  const keys: DistMetric[] = ['finalValue', 'cagr', 'maxDrawdown', 'volatility', 'sharpe', 'sortino'];

  for (const key of keys) {
    let vals: number[];
    if (key === 'finalValue') {
      vals = metrics.map((m) => m.finalValue * startingValue);
    } else {
      vals = metrics.map((m) => m[key]);
    }

    const p = (frac: number) => percentile(vals, frac);
    const m = mean(vals);
    const s = std(vals);

    const values: Record<string, string> = {
      Min: METRIC_FORMAT[key](Math.min(...vals)),
      P10: METRIC_FORMAT[key](p(0.1)),
      P25: METRIC_FORMAT[key](p(0.25)),
      P50: METRIC_FORMAT[key](p(0.5)),
      Mean: METRIC_FORMAT[key](m),
      P75: METRIC_FORMAT[key](p(0.75)),
      P90: METRIC_FORMAT[key](p(0.9)),
      Max: METRIC_FORMAT[key](Math.max(...vals)),
      Std: key === 'finalValue' ? fmtDollar(s) : fmtNum(s),
    };

    rows.push({ metric: METRIC_LABELS[key], key, values });
  }

  return rows;
}

function buildRangeData(r: MonteCarloResult, startingValue: number) {
  // 从日度百分位数据中按月采样
  const p5 = r.percentiles.p5;
  const p25 = r.percentiles.p25;
  const p50 = r.percentiles.p50;
  const p75 = r.percentiles.p75;
  const p95 = r.percentiles.p95;

  if (!p5 || p5.length === 0) return [];

  const data: { month: number; label: string; p5: number; p25: number; p50: number; p75: number; p95: number }[] = [];
  let month = 0;
  let day = 0;

  // 起点
  data.push({
    month: 0,
    label: '0',
    p5: p5[0] * startingValue,
    p25: p25[0] * startingValue,
    p50: p50[0] * startingValue,
    p75: p75[0] * startingValue,
    p95: p95[0] * startingValue,
  });

  while (day < p5.length - 1) {
    day += 21; // 约1个月
    month++;
    if (day >= p5.length) day = p5.length - 1;
    data.push({
      month,
      label: month % 12 === 0 ? `${month / 12}y` : '',
      p5: p5[day] * startingValue,
      p25: p25[day] * startingValue,
      p50: p50[day] * startingValue,
      p75: p75[day] * startingValue,
      p95: p95[day] * startingValue,
    });
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
  let vals: number[];
  if (metric === 'finalValue') {
    vals = metrics.map((m) => m.finalValue * startingValue);
  } else {
    vals = metrics.map((m) => m[metric]);
  }

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
  for (let i = 0; i < binCount; i++) {
    const lo = min + i * binWidth;
    bins.push({ range: formatBin(lo), count: 0, minVal: lo });
  }

  for (const v of vals) {
    let idx = Math.floor((v - min) / binWidth);
    if (idx >= binCount) idx = binCount - 1;
    bins[idx].count++;
  }

  const medianVal = percentile(vals, 0.5);
  const meanVal = mean(vals);
  const medianLabel = formatBin(Math.floor((medianVal - min) / binWidth) * binWidth + min);
  const meanLabel = formatBin(Math.floor((meanVal - min) / binWidth) * binWidth + min);

  return { data: bins, medianLabel, meanLabel, medianVal, meanVal };
}

function buildScenarioData(r: MonteCarloResult, startingValue: number) {
  const rp = r.representativePaths;
  if (!rp || !rp.best || rp.best.length === 0) return { data: [], legend: [] };

  const len = rp.best.length;
  const data: { month: number; [key: string]: number }[] = [];

  for (let i = 0; i < len; i++) {
    data.push({
      month: i,
      best: rp.best[i] * startingValue,
      p75: rp.p75[i] * startingValue,
      median: rp.median[i] * startingValue,
      p25: rp.p25[i] * startingValue,
      worst: rp.worst[i] * startingValue,
    });
  }

  return { data };
}

// ===== 组件 =====

export default function MonteCarloPage() {
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

  // Tab 状态
  const [activeTab, setActiveTab] = useState<ResultTab>('summary');
  const [distMetric, setDistMetric] = useState<DistMetric>('finalValue');

  // 组合状态
  const [portfolios, setPortfolios] = useState<PortfolioState[]>([
    createDefaultPortfolio(1),
    createDefaultPortfolio(2),
  ]);

  // 新增：模拟模式与双目标设置
  const [simMode, setSimMode] = useState<SimMode>('standard');
  const [goal1, setGoal1] = useState('maxCagrPercentile');
  const [goal2, setGoal2] = useState('minMaxDrawdown');
  const [goalWeight, setGoalWeight] = useState(50); // 目标1权重（0-100），目标2 = 100 - goalWeight

  const updatePortfolio = (idx: number, patch: Partial<PortfolioState>) => {
    setPortfolios(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const addAsset = (pIdx: number) => {
    updatePortfolio(pIdx, { assets: [...portfolios[pIdx].assets, { ticker: '', weight: 0 }] });
  };

  const removeAsset = (pIdx: number, aIdx: number) => {
    updatePortfolio(pIdx, { assets: portfolios[pIdx].assets.filter((_, i) => i !== aIdx) });
  };

  const updateAsset = (pIdx: number, aIdx: number, field: 'ticker' | 'weight', val: string | number) => {
    const next = [...portfolios[pIdx].assets];
    next[aIdx] = { ...next[aIdx], [field]: val };
    updatePortfolio(pIdx, { assets: next });
  };

  const getTotalWeight = (pIdx: number) => portfolios[pIdx].assets.reduce((s, a) => s + (a.weight || 0), 0);
  const isComplete = (pIdx: number) => getTotalWeight(pIdx) === 100;

  const runSimulation = async () => {
    const activeCount = portfolioMode;
    for (let i = 0; i < activeCount; i++) {
      const validAssets = portfolios[i].assets.filter(a => a.ticker.trim() !== '');
      if (validAssets.length === 0) {
        setError(`组合 ${i + 1} 请至少添加一个标的`);
        return;
      }
      if (!isComplete(i)) {
        setError(`组合 ${i + 1} 权重合计必须为 100%`);
        return;
      }
    }
    setIsLoading(true);
    setError(null);
    setResults1(null);
    setResults2(null);

    const mcParams = { numYears, numSimulations, minBlockYears: minBlock, maxBlockYears: maxBlock, withReplacement, seed: randomSeed ? Number(randomSeed) : undefined };
    const parameters = { startDate, endDate, startingValue, adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '', baseCurrency: 'usd', extendedWithdrawalStats: false, cashflowLegs: [], oneTimeCashflows: [] };
    // 双目标与构建模式参数（传递给后端，标准模式下不影响现有行为）
    const objectives = {
      mode: simMode,
      goal1,
      goal2,
      goal1Weight: goalWeight / 100,
      goal2Weight: (100 - goalWeight) / 100,
    };

    try {
      const fetchOne = async (idx: number): Promise<MonteCarloResult> => {
        const p = portfolios[idx];
        const res = await fetch('/api/backtest/monte-carlo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            portfolio: { name: p.name, assets: p.assets.filter(a => a.ticker.trim()), rebalanceFrequency: p.rebalanceFrequency },
            parameters,
            mcParams,
            objectives,
          }),
        });
        if (!res.ok) throw new Error(`组合 ${idx + 1}: HTTP ${res.status}`);
        const json = await res.json();
        if (json.success === false) throw new Error(json.error || `组合 ${idx + 1} 模拟失败`);
        return json.data ?? json;
      };

      const promises = [fetchOne(0)];
      if (portfolioMode === 2) promises.push(fetchOne(1));

      const results = await Promise.all(promises);
      setResults1(results[0]);
      if (results[1]) setResults2(results[1]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '模拟失败');
    } finally {
      setIsLoading(false);
    }
  };

  const renderPortfolioEditor = (idx: number) => {
    const p = portfolios[idx];
    const total = getTotalWeight(idx);
    const complete = isComplete(idx);
    return (
      <div className="portfolio-card" style={{ width: '100%', maxWidth: 'none', minWidth: 0, display: 'block' }}>
        <div className="portfolio-card-header">
          <div className="portfolio-card-name-row">
            <input
              type="text"
              className="portfolio-name-input"
              style={{ flex: 1, width: 'auto' }}
              value={p.name}
              onChange={(e) => updatePortfolio(idx, { name: e.target.value })}
            />
            <select
              className="portfolio-rebalance-select"
              value={p.rebalanceFrequency}
              onChange={(e) => updatePortfolio(idx, { rebalanceFrequency: e.target.value })}
            >
              <option value="yearly">每年</option>
              <option value="quarterly">每季度</option>
              <option value="monthly">每月</option>
              <option value="none">不调仓</option>
            </select>
          </div>
        </div>
        {p.assets.map((a, i) => (
          <div key={i} className="ticker-row">
            <input
              type="text"
              value={a.ticker}
              onChange={(e) => updateAsset(idx, i, 'ticker', e.target.value)}
              placeholder="输入代码，如 VTI"
              className="ticker-input"
            />
            <div className="weight-cell">
              <input
                type="number"
                value={a.weight || ''}
                onChange={(e) => updateAsset(idx, i, 'weight', Number(e.target.value))}
                min={0}
                max={100}
                className="weight-input"
                placeholder="%"
              />
              <span className="weight-suffix">%</span>
            </div>
            <button onClick={() => removeAsset(idx, i)} className="row-remove-btn" title="删除">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        <div className="portfolio-card-toolbar">
          <button className="toolbar-btn" onClick={() => addAsset(idx)}>
            <Plus className="w-4 h-4" />
            添加标的
          </button>
        </div>
        <div className={`portfolio-total ${complete ? 'complete' : 'incomplete'}`}>
          <span>合计</span>
          <span className="total-value">{total}%</span>
        </div>
      </div>
    );
  };

  // ===== Tab 渲染 =====

  const renderSummaryTab = (r: MonteCarloResult) => {
    const rows = buildSummaryData(r, startingValue);
    if (!rows) return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>暂无数据</div>;

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
                  <td key={s} style={{ textAlign: 'right', padding: '8px 12px', borderBottom: '1px solid var(--border-soft)', fontFamily: 'monospace', color: 'var(--text-body)' }}>
                    {row.values[s]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderRangeTab = (r: MonteCarloResult) => {
    const data = buildRangeData(r, startingValue);
    if (data.length === 0) return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>暂无数据</div>;

    return (
      <ResponsiveContainer width="100%" height={450}>
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            tickFormatter={(v: number) => {
              const y = v / 12;
              return Number.isInteger(y) ? `${y}y` : '';
            }}
            interval={11}
          />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            formatter={(v: number) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            labelFormatter={(l: number) => `${(l / 12).toFixed(1)} 年`}
            contentStyle={{ fontSize: 12, backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-control)', color: 'var(--text-body)', boxShadow: 'var(--shadow-md)' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
          {/* P5-P95 浅色带 */}
          <Area type="monotone" dataKey="p95" stackId="outer" stroke="none" fill={CHART_COLORS[0]} fillOpacity={0.06} name="P95" />
          <Area type="monotone" dataKey="p5" stackId="outer-base" stroke="none" fill="#fff" fillOpacity={1} name="" />
          {/* P25-P75 中间色带 */}
          <Area type="monotone" dataKey="p75" stackId="inner" stroke="none" fill={CHART_COLORS[0]} fillOpacity={0.12} name="P75" />
          <Area type="monotone" dataKey="p25" stackId="inner-base" stroke="none" fill="#fff" fillOpacity={1} name="" />
          {/* P50 实线 */}
          <Line type="monotone" dataKey="p50" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} name="中位数" />
          {/* 边界线 */}
          <Line type="monotone" dataKey="p5" stroke={CHART_COLORS[3]} strokeWidth={0.8} strokeDasharray="4 2" dot={false} name="P5" />
          <Line type="monotone" dataKey="p95" stroke={CHART_COLORS[4]} strokeWidth={0.8} strokeDasharray="4 2" dot={false} name="P95" />
          <Line type="monotone" dataKey="p25" stroke={CHART_COLORS[1]} strokeWidth={0.8} strokeDasharray="3 3" dot={false} name="P25" />
          <Line type="monotone" dataKey="p75" stroke={CHART_COLORS[2]} strokeWidth={0.8} strokeDasharray="3 3" dot={false} name="P75" />
        </AreaChart>
      </ResponsiveContainer>
    );
  };

  const renderSuccessTab = (r: MonteCarloResult) => {
    const data = buildSuccessData(r);
    if (data.length === 0) return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>暂无数据</div>;

    return (
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis dataKey="year" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} label={{ value: '年限', position: 'insideBottom', offset: -5, fontSize: 12, fill: 'var(--text-muted)' }} />
          <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
          <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ fontSize: 12, backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-control)', color: 'var(--text-body)', boxShadow: 'var(--shadow-md)' }} />
          <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
          <Line type="monotone" dataKey="survival" stroke={CHART_COLORS[2]} strokeWidth={2} dot={false} name="存活概率 (终值>0)" />
          <Line type="monotone" dataKey="capitalPreservation" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} name="保本概率 (终值≥初始资金)" />
          <Line type="monotone" dataKey="profit" stroke={CHART_COLORS[1]} strokeWidth={2} dot={false} name="盈利概率 (终值>初始资金)" />
        </LineChart>
      </ResponsiveContainer>
    );
  };

  const renderDistributionsTab = (r: MonteCarloResult) => {
    if (!r.perPathMetrics || r.perPathMetrics.length === 0) {
      return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>暂无数据</div>;
    }

    const { data, medianLabel, meanLabel, medianVal, meanVal } = buildDistHistogram(r.perPathMetrics, distMetric, startingValue);

    return (
      <div>
        {/* 指标选择 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {(Object.keys(METRIC_LABELS) as DistMetric[]).map((key) => (
            <button
              key={key}
              onClick={() => setDistMetric(key)}
              style={{
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 500,
                border: '1px solid var(--border-soft)',
                borderRadius: 'var(--radius-control)',
                cursor: 'pointer',
                backgroundColor: distMetric === key ? 'var(--brand)' : 'var(--bg-elevated)',
                color: distMetric === key ? '#fff' : 'var(--text-body)',
                transition: 'all 0.15s',
              }}
            >
              {METRIC_LABELS[key]}
            </button>
          ))}
        </div>

        {data.length > 0 && (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
              <XAxis dataKey="range" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} interval={3} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-control)', color: 'var(--text-body)', boxShadow: 'var(--shadow-md)' }} />
              <Bar dataKey="count" fill={CHART_COLORS[0]} fillOpacity={0.7} name="频次" radius={[2, 2, 0, 0]} />
              <ReferenceLine x={medianLabel} stroke={CHART_COLORS[2]} strokeDasharray="4 2" label={{ value: `中位数: ${medianVal !== undefined ? METRIC_FORMAT[distMetric](medianVal) : ''}`, position: 'top', fontSize: 11, fill: CHART_COLORS[2] }} />
              <ReferenceLine x={meanLabel} stroke={CHART_COLORS[1]} strokeDasharray="4 2" label={{ value: `均值: ${meanVal !== undefined ? METRIC_FORMAT[distMetric](meanVal) : ''}`, position: 'top', fontSize: 11, fill: CHART_COLORS[1] }} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    );
  };

  const renderScenariosTab = (r: MonteCarloResult) => {
    const { data } = buildScenarioData(r, startingValue);
    if (data.length === 0) return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>暂无数据</div>;

    return (
      <ResponsiveContainer width="100%" height={450}>
        <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            tickFormatter={(v: number) => {
              const y = v / 12;
              return Number.isInteger(y) ? `${y}y` : '';
            }}
            interval={11}
          />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            formatter={(v: number) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            labelFormatter={(l: number) => `${(l / 12).toFixed(1)} 年`}
            contentStyle={{ fontSize: 12, backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-control)', color: 'var(--text-body)', boxShadow: 'var(--shadow-md)' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
          <Line type="monotone" dataKey="best" stroke={CHART_COLORS[2]} strokeWidth={2} dot={false} name="Best" />
          <Line type="monotone" dataKey="p75" stroke={CHART_COLORS[0]} strokeWidth={1.5} dot={false} name="P75" />
          <Line type="monotone" dataKey="median" stroke={CHART_COLORS[4]} strokeWidth={2.5} dot={false} name="Median" />
          <Line type="monotone" dataKey="p25" stroke={CHART_COLORS[1]} strokeWidth={1.5} dot={false} name="P25" />
          <Line type="monotone" dataKey="worst" stroke={CHART_COLORS[3]} strokeWidth={2} dot={false} name="Worst" />
        </LineChart>
      </ResponsiveContainer>
    );
  };

  const renderTabContent = (r: MonteCarloResult) => {
    switch (activeTab) {
      case 'summary': return renderSummaryTab(r);
      case 'range': return renderRangeTab(r);
      case 'success': return renderSuccessTab(r);
      case 'distributions': return renderDistributionsTab(r);
      case 'scenarios': return renderScenariosTab(r);
    }
  };

  const renderResults = (r: MonteCarloResult, label: string, colorIdx: number) => {
    return (
      <div key={label}>
        {portfolioMode === 2 && (
          <div style={{ fontWeight: 600, fontSize: 15, color: CHART_COLORS[colorIdx], marginBottom: 12, marginTop: 8 }}>{label}</div>
        )}

        {/* 快速统计摘要 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <div style={{ textAlign: 'center', padding: 14, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
            <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>中位终值</div>
            <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-strong)' }}>${(r.statistics.medianFinalValue * startingValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
          <div style={{ textAlign: 'center', padding: 14, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
            <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>均值终值</div>
            <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-strong)' }}>${(r.statistics.meanFinalValue * startingValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
          <div style={{ textAlign: 'center', padding: 14, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
            <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>保本概率</div>
            <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'monospace', color: 'var(--success)' }}>{(r.statistics.successRate * 100).toFixed(1)}%</div>
          </div>
          <div style={{ textAlign: 'center', padding: 14, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
            <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>模拟次数</div>
            <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-strong)' }}>{r.perPathMetrics?.length ?? numSimulations}</div>
          </div>
        </div>

        {/* Tab 导航 */}
        <div className="result-tabs" style={{ marginBottom: 16 }}>
          {RESULT_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`result-tab ${activeTab === tab.key ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 内容 */}
        <div style={{ minHeight: 300 }}>
          {renderTabContent(r)}
        </div>
      </div>
    );
  };

  // ===== 左侧参数面板 =====
  const renderParams = () => (
    <ParamsPanel>
      <ParamsSection title="组合配置" info="设置参与模拟的投资组合及其标的权重，权重合计需为 100%">
        {/* 1组合/2组合 切换 */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>组合数量</span>
          <div style={{ display: 'flex', gap: 0, borderRadius: 'var(--radius-control)', overflow: 'hidden', border: '1px solid var(--border-soft)' }}>
            <button
              onClick={() => setPortfolioMode(1)}
              style={{
                padding: '4px 14px', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer',
                backgroundColor: portfolioMode === 1 ? 'var(--brand)' : 'var(--bg-elevated)',
                color: portfolioMode === 1 ? '#fff' : 'var(--text-body)', transition: 'all 0.15s',
              }}
            >
              1组合
            </button>
            <button
              onClick={() => setPortfolioMode(2)}
              style={{
                padding: '4px 14px', fontSize: 13, fontWeight: 500, border: 'none', borderLeft: '1px solid var(--border-soft)', cursor: 'pointer',
                backgroundColor: portfolioMode === 2 ? 'var(--brand)' : 'var(--bg-elevated)',
                color: portfolioMode === 2 ? '#fff' : 'var(--text-body)', transition: 'all 0.15s',
              }}
            >
              2组合
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {renderPortfolioEditor(0)}
          {portfolioMode === 2 && renderPortfolioEditor(1)}
        </div>
      </ParamsSection>

      <ParamsSection title="模拟参数" info="区块自举法参数：从历史数据中随机抽取区块拼接为模拟路径">
        <div className="params-row">
          <label className="param-check">
            <input type="checkbox" />
            <span>全部历史</span>
          </label>
          <div className="param-field">
            <span className="param-label">开始日期</span>
            <input type="date" className="param-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="param-field">
            <span className="param-label">结束日期</span>
            <input type="date" className="param-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="param-field">
            <span className="param-label">模拟年数</span>
            <input type="number" className="param-input" value={numYears} onChange={(e) => setNumYears(Number(e.target.value))} />
          </div>
          <div className="param-field">
            <span className="param-label">模拟次数</span>
            <input type="number" className="param-input" value={numSimulations} onChange={(e) => setNumSimulations(Number(e.target.value))} />
          </div>
          <div className="param-field param-field-start-val">
            <span className="param-label">初始资金</span>
            <div className="param-input-prefix-wrap">
              <span className="param-input-prefix">$</span>
              <input type="number" className="param-input param-input-with-prefix" value={startingValue} onChange={(e) => setStartingValue(Number(e.target.value))} />
            </div>
          </div>
          <div className="param-field param-field-rolling">
            <span className="param-label">最小区块</span>
            <div className="param-input-suffix-wrap">
              <input type="number" className="param-input param-input-with-suffix" value={minBlock} onChange={(e) => setMinBlock(Number(e.target.value))} />
              <span className="param-input-suffix">年</span>
            </div>
          </div>
          <div className="param-field param-field-rolling">
            <span className="param-label">最大区块</span>
            <div className="param-input-suffix-wrap">
              <input type="number" className="param-input param-input-with-suffix" value={maxBlock} onChange={(e) => setMaxBlock(Number(e.target.value))} />
              <span className="param-input-suffix">年</span>
            </div>
          </div>
          <div className="param-field">
            <span className="param-label">随机种子</span>
            <input type="number" className="param-input" value={randomSeed} onChange={(e) => setRandomSeed(e.target.value)} placeholder="留空则随机" />
          </div>
          <label className="param-check">
            <input type="checkbox" checked={withReplacement} onChange={(e) => setWithReplacement(e.target.checked)} />
            <span>有放回抽样</span>
          </label>
        </div>
      </ParamsSection>

      <ParamsSection title="构建模式" info="标准模拟：对当前组合运行区块自举；有效前沿构建：沿有效前沿采样权重组合，对每个组合运行模拟">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-body)', cursor: 'pointer' }}>
            <input
              type="radio"
              name="simMode"
              value="standard"
              checked={simMode === 'standard'}
              onChange={() => setSimMode('standard')}
              style={{ cursor: 'pointer' }}
            />
            <span>标准模拟</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— 对当前组合权重运行蒙特卡洛模拟</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-body)', cursor: 'pointer' }}>
            <input
              type="radio"
              name="simMode"
              value="frontier"
              checked={simMode === 'frontier'}
              onChange={() => setSimMode('frontier')}
              style={{ cursor: 'pointer' }}
            />
            <span>有效前沿构建</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— 沿有效前沿采样权重组合并逐一模拟</span>
          </label>
        </div>
      </ParamsSection>

      <ParamsSection title="双目标设置" info="设定两个优化目标及权重分配，用于在模拟路径中权衡不同指标">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="param-field">
            <span className="param-label">目标 1</span>
            <select className="param-input" value={goal1} onChange={(e) => setGoal1(e.target.value)}>
              {GOAL_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>
          <div className="param-field">
            <span className="param-label">目标 2</span>
            <select className="param-input" value={goal2} onChange={(e) => setGoal2(e.target.value)}>
              {GOAL_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>
          <div className="param-field" style={{ gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="param-label">目标 1 权重</span>
              <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-strong)' }}>
                {goalWeight}% : {100 - goalWeight}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={goalWeight}
              onChange={(e) => setGoalWeight(Number(e.target.value))}
              style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--brand)' }}
            />
          </div>
        </div>
      </ParamsSection>

      {/* 执行按钮 */}
      <div className="bt-action-row" style={{ padding: '12px 0 4px' }}>
        <button onClick={runSimulation} disabled={isLoading} className="main-action-btn" style={{ width: '100%' }}>
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {isLoading ? '模拟中...' : '开始模拟'}
        </button>
      </div>
    </ParamsPanel>
  );

  // ===== 右侧结果面板 =====
  const renderResultsPanel = () => {
    if (error) {
      return (
        <div className="bt-results-card card" style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}>
          模拟失败：{error}
        </div>
      );
    }
    if (!results1 && !results2) {
      return (
        <div className="bt-results-card card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48 }}>
          配置左侧参数并点击「开始模拟」查看结果
        </div>
      );
    }
    return (
      <div className="bt-results-card card">
        {results1 && renderResults(results1, portfolios[0].name, 0)}
        {results2 && (
          <>
            <div style={{ borderTop: '1px solid var(--border-soft)', marginTop: 24, paddingTop: 8 }} />
            {renderResults(results2, portfolios[1].name, 1)}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">蒙特卡洛模拟</h1>
      </div>

      <div className="bt-seo-card card">
        <p className="bt-seo-desc">
          本工具使用区块自举法对历史市场数据进行重采样，让您研究大量可能的组合路径，而非仅回放一段固定历史。
        </p>
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

      <div className="bt-seo-card card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>预设示例</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="toolbar-btn"
            onClick={() => {
              setPortfolioMode(1);
              setPortfolios([{ ...createDefaultPortfolio(1), assets: [{ ticker: 'VTI', weight: 60 }, { ticker: 'BND', weight: 40 }] }]);
              setNumYears(20);
              setNumSimulations(500);
              setStartingValue(100000);
              setMinBlock(1);
              setMaxBlock(5);
            }}
          >
            60/40 退休回测
          </button>
          <button
            className="toolbar-btn"
            onClick={() => {
              setPortfolioMode(1);
              setPortfolios([{ ...createDefaultPortfolio(1), assets: [{ ticker: 'VTI', weight: 100 }] }]);
              setNumYears(30);
              setNumSimulations(1000);
              setStartingValue(50000);
              setMinBlock(1);
              setMaxBlock(5);
            }}
          >
            全股定投 30 年
          </button>
          <button
            className="toolbar-btn"
            onClick={() => {
              setPortfolioMode(1);
              setPortfolios([{ ...createDefaultPortfolio(1), assets: [{ ticker: 'VTI', weight: 50 }, { ticker: 'VXUS', weight: 30 }, { ticker: 'BND', weight: 20 }] }]);
              setNumYears(25);
              setNumSimulations(500);
              setStartingValue(200000);
              setMinBlock(2);
              setMaxBlock(8);
            }}
          >
            三基金 25 年
          </button>
        </div>
      </div>

      <ToolPageLayout
        title="参数设置"
        params={renderParams()}
        results={renderResultsPanel()}
      />
    </div>
  );
}
