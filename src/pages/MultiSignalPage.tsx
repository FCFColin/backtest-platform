/**
 * @file 多信号聚合页面
 * @description 添加多个信号并按加权/投票/排名方式聚合，展示聚合统计、各信号贡献度与权益曲线
 * @route /multi-signal
 */
import { useState } from 'react';
import { Play, Plus, X } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { CHART_COLORS } from '../../shared/types';
import type {
  SignalAnalysisRequest,
  SignalAnalysisResult,
  MultiSignalConfig,
} from '../../shared/types/signal';
import { useAsyncAction } from '../hooks/useAsyncAction';
import LoadingButton from '../components/LoadingButton';
import { ToolPageLayout } from '../components/layout/ToolPageLayout';
import { ParamsPanel, ParamsSection } from '../components/ParamsPanel';
import { SortableTable, type Column } from '../components/SortableTable';

// ===== 常量 =====
const INDICATORS = ['SMA', 'EMA', 'RSI', 'MACD', 'Bollinger'] as const;
const AGGREGATION_METHODS: { value: 'weighted' | 'voting' | 'rank'; label: string }[] = [
  { value: 'weighted', label: '加权' },
  { value: 'voting', label: '投票' },
  { value: 'rank', label: '排名' },
];

const tooltipStyle = {
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-body)',
  fontSize: '12px',
  boxShadow: 'var(--shadow-md)',
};

// ===== 多信号响应类型（与后端 MultiSignalResult 对齐） =====
interface MultiSignalResponse {
  aggregated: SignalAnalysisResult;
  contributions: Array<{
    index: number;
    indicator: string;
    contribution: number;
    statistics: SignalAnalysisResult['statistics'];
  }>;
}

// ===== 页面内信号项结构 =====
interface SignalItem {
  id: number;
  indicator: string;
  period: number;
  threshold: number;
}

// ===== 工具函数 =====
function fmtPct(v: number | undefined): string {
  if (v === undefined || v === null) return '—';
  return `${(v * 100).toFixed(2)}%`;
}

function fmtRatio(v: number | undefined): string {
  if (v === undefined || v === null) return '—';
  return v.toFixed(2);
}

// ===== 主页面 =====
export default function MultiSignalPage() {
  const [signals, setSignals] = useState<SignalItem[]>([
    { id: 1, indicator: 'SMA', period: 20, threshold: 30 },
    { id: 2, indicator: 'RSI', period: 14, threshold: 30 },
  ]);
  const [weights, setWeights] = useState<number[]>([0.5, 0.5]);
  const [aggregationMethod, setAggregationMethod] = useState<'weighted' | 'voting' | 'rank'>('weighted');
  const [ticker, setTicker] = useState('SPY');
  const [startDate, setStartDate] = useState('2015-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<MultiSignalResponse | null>(null);
  const [nextId, setNextId] = useState(3);

  // 信号列表增删改
  const addSignal = () => {
    const newId = nextId;
    setSignals([...signals, { id: newId, indicator: 'EMA', period: 50, threshold: 30 }]);
    setWeights([...weights, 1 / (signals.length + 1)]);
    setNextId(newId + 1);
  };

  const removeSignal = (id: number) => {
    if (signals.length <= 1) return;
    const idx = signals.findIndex((s) => s.id === id);
    setSignals(signals.filter((s) => s.id !== id));
    if (idx >= 0) {
      const nextW = weights.filter((_, i) => i !== idx);
      setWeights(nextW);
    }
  };

  const updateSignal = (id: number, patch: Partial<SignalItem>) => {
    setSignals(signals.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const updateWeight = (idx: number, val: number) => {
    const next = [...weights];
    next[idx] = val;
    setWeights(next);
  };

  const runAnalysis = () => {
    if (!ticker.trim()) {
      setError('请输入标的代码');
      return;
    }
    if (signals.length === 0) {
      setError('请至少添加一个信号');
      return;
    }
    run(async () => {
      const reqSignals: SignalAnalysisRequest[] = signals.map((s) => ({
        ticker: ticker.trim().toUpperCase(),
        indicator: s.indicator,
        period: s.period,
        threshold: s.threshold,
        startDate,
        endDate,
        signalType: 'both',
      }));
      const reqBody: MultiSignalConfig = {
        signals: reqSignals,
        aggregationMethod,
        weights: aggregationMethod === 'weighted' ? weights : undefined,
      };
      const res = await fetch('/api/signal/multi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || '分析失败');
      setResults(json.data as MultiSignalResponse);
    });
  };

  // ===== 聚合统计表列定义 =====
  const aggStatRows = results
    ? [
        { label: '总信号数', value: String(results.aggregated.statistics.totalSignals) },
        { label: '胜率', value: fmtPct(results.aggregated.statistics.winRate) },
        { label: '平均收益', value: fmtPct(results.aggregated.statistics.avgReturn) },
        { label: '最大回撤', value: fmtPct(results.aggregated.statistics.maxDrawdown) },
        { label: '夏普', value: fmtRatio(results.aggregated.statistics.sharpe) },
      ]
    : [];

  // ===== 贡献度表格列定义 =====
  const contributionColumns: Column<MultiSignalResponse['contributions'][number]>[] = [
    { key: 'index', label: '#', sortValue: (r) => r.index },
    { key: 'indicator', label: '指标', sortValue: (r) => r.indicator },
    {
      key: 'contribution',
      label: '贡献度（平均收益）',
      render: (r) => fmtPct(r.contribution),
      sortValue: (r) => r.contribution,
    },
    {
      key: 'winRate',
      label: '胜率',
      render: (r) => fmtPct(r.statistics.winRate),
      sortValue: (r) => r.statistics.winRate,
    },
    {
      key: 'totalSignals',
      label: '信号数',
      render: (r) => String(r.statistics.totalSignals),
      sortValue: (r) => r.statistics.totalSignals,
    },
  ];

  // ===== 左侧参数面板 =====
  const paramsPanel = (
    <ParamsPanel>
      <ParamsSection title="信号列表" info="添加多个技术指标信号，可单独删除">
        <div className="portfolios-cards">
          <div className="portfolio-card">
            {signals.map((s, idx) => (
              <div key={s.id} className="ticker-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                <select
                  className="param-input"
                  style={{ width: 110, fontSize: 12, padding: '4px 8px' }}
                  value={s.indicator}
                  onChange={(e) => updateSignal(s.id, { indicator: e.target.value })}
                >
                  {INDICATORS.map((ind) => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
                <input
                  type="number"
                  className="param-input"
                  style={{ width: 64, fontSize: 12, padding: '4px 8px' }}
                  value={s.period}
                  min={2}
                  title="周期"
                  onChange={(e) => updateSignal(s.id, { period: Number(e.target.value) })}
                />
                <input
                  type="number"
                  className="param-input"
                  style={{ width: 64, fontSize: 12, padding: '4px 8px' }}
                  value={s.threshold}
                  title="阈值"
                  onChange={(e) => updateSignal(s.id, { threshold: Number(e.target.value) })}
                />
                {aggregationMethod === 'weighted' && (
                  <input
                    type="number"
                    step="0.1"
                    className="param-input"
                    style={{ width: 60, fontSize: 12, padding: '4px 8px' }}
                    value={weights[idx] ?? 0}
                    title="权重"
                    onChange={(e) => updateWeight(idx, Number(e.target.value))}
                  />
                )}
                {signals.length > 1 && (
                  <button
                    onClick={() => removeSignal(s.id)}
                    className="row-remove-btn"
                    title="删除"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        <button className="portfolios-add-btn" onClick={addSignal} style={{ marginTop: 8 }}>
          <Plus className="w-4 h-4" />
          添加信号
        </button>
      </ParamsSection>

      <ParamsSection title="聚合配置">
        <div className="param-field" style={{ marginBottom: 8 }}>
          <span className="param-label">聚合方式</span>
          <select
            className="param-input"
            value={aggregationMethod}
            onChange={(e) => setAggregationMethod(e.target.value as 'weighted' | 'voting' | 'rank')}
          >
            {AGGREGATION_METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {aggregationMethod === 'weighted' && '加权：按权重对信号方向加权求和，正值买入、负值卖出。在信号列表中设置各信号权重。'}
          {aggregationMethod === 'voting' && '投票：多数信号同向时触发（买入数 > 卖出数 则买入，反之卖出）。'}
          {aggregationMethod === 'rank' && '排名：取历史胜率最高的触发信号方向。'}
        </div>
      </ParamsSection>

      <ParamsSection title="回测参数">
        <div className="param-field" style={{ marginBottom: 8 }}>
          <span className="param-label">标的代码</span>
          <input
            type="text"
            className="param-input"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="如 SPY"
          />
        </div>
        <div className="params-row">
          <div className="param-field">
            <span className="param-label">开始日期</span>
            <input type="date" className="param-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="param-field">
            <span className="param-label">结束日期</span>
            <input type="date" className="param-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
      </ParamsSection>

      <div className="bt-action-row">
        <LoadingButton isLoading={isLoading} onClick={runAnalysis} loadingText="分析中...">
          <Play className="w-4 h-4" />
          开始分析
        </LoadingButton>
      </div>
    </ParamsPanel>
  );

  // ===== 右侧结果面板 =====
  const resultsPanel = (
    <div className="space-y-4">
      {error && (
        <div className="card" style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}>
          分析失败：{error}
        </div>
      )}

      {results && (
        <>
          {/* 聚合信号统计表 */}
          <div className="chart-card">
            <div className="chart-card-title">聚合信号统计</div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {aggStatRows.map((r) => (
                <div className="card" key={r.label} style={{ padding: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-strong)', marginTop: 4 }}>
                    {r.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 各信号贡献度对比 */}
          <div className="chart-card">
            <div className="chart-card-title">各信号贡献度对比</div>
            {results.contributions.length > 0 ? (
              <SortableTable
                columns={contributionColumns}
                data={results.contributions}
                initialSortKey="contribution"
                initialSortDir="desc"
              />
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
                无贡献度数据
              </div>
            )}
          </div>

          {/* 权益曲线 */}
          <div className="chart-card">
            <div className="chart-card-title">权益曲线</div>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={results.aggregated.equityCurve} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v: string) => v.slice(0, 7)} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(label: string) => `日期: ${label}`} formatter={(value: number) => [`$${value.toLocaleString()}`, '权益']} />
                <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
                <ReferenceLine y={10000} stroke="var(--text-muted)" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="value" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="聚合权益" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {!results && !error && !isLoading && (
        <div className="card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48, fontSize: 14 }}>
          设置参数后点击「开始分析」查看结果
        </div>
      )}
    </div>
  );

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">多信号聚合</h1>
      </div>
      <ToolPageLayout title="分析参数" params={paramsPanel} results={resultsPanel} />
    </div>
  );
}
