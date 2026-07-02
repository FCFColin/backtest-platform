/**
 * @file 多信号聚合页面
 * @description 添加多个信号并按加权/投票/排名方式聚合，展示聚合统计、各信号贡献度与权益曲线
 * @route /multi-signal
 */
import { useState } from 'react';
import { Play, Plus, X } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
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

// ===== 多信号响应类型 =====
interface MultiSignalResponse {
  aggregated: SignalAnalysisResult;
  contributions: Array<{
    index: number;
    indicator: string;
    contribution: number;
    statistics: SignalAnalysisResult['statistics'];
  }>;
}

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

const CONTRIBUTION_COLUMNS: Column<MultiSignalResponse['contributions'][number]>[] = [
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

function buildAggStatRows(results: MultiSignalResponse) {
  const s = results.aggregated.statistics;
  return [
    { label: '总信号数', value: String(s.totalSignals) },
    { label: '胜率', value: fmtPct(s.winRate) },
    { label: '平均收益', value: fmtPct(s.avgReturn) },
    { label: '最大回撤', value: fmtPct(s.maxDrawdown) },
    { label: '夏普', value: fmtRatio(s.sharpe) },
  ];
}

// ===== 参数面板 =====
interface MultiSignalParamsProps {
  signals: SignalItem[];
  weights: number[];
  aggregationMethod: 'weighted' | 'voting' | 'rank';
  ticker: string;
  startDate: string;
  endDate: string;
  isLoading: boolean;
  onAddSignal: () => void;
  onRemoveSignal: (id: number) => void;
  onUpdateSignal: (id: number, patch: Partial<SignalItem>) => void;
  onUpdateWeight: (idx: number, val: number) => void;
  onAggregationMethodChange: (m: 'weighted' | 'voting' | 'rank') => void;
  onTickerChange: (v: string) => void;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onRun: () => void;
}

function SignalRow({
  signal: s,
  idx,
  weight,
  showWeight,
  canRemove,
  onUpdateSignal,
  onRemoveSignal,
  onUpdateWeight,
}: {
  signal: SignalItem;
  idx: number;
  weight: number;
  showWeight: boolean;
  canRemove: boolean;
  onUpdateSignal: (id: number, patch: Partial<SignalItem>) => void;
  onRemoveSignal: (id: number) => void;
  onUpdateWeight: (idx: number, val: number) => void;
}) {
  const inputStyle = { width: 64, fontSize: 12, padding: '4px 8px' };
  return (
    <div className="ticker-row" style={{ flexWrap: 'wrap', gap: 6 }}>
      <select
        className="param-input"
        style={{ width: 110, fontSize: 12, padding: '4px 8px' }}
        value={s.indicator}
        onChange={(e) => onUpdateSignal(s.id, { indicator: e.target.value })}
      >
        {INDICATORS.map((ind) => (
          <option key={ind} value={ind}>{ind}</option>
        ))}
      </select>
      <input type="number" className="param-input" style={inputStyle} value={s.period} min={2} title="周期" onChange={(e) => onUpdateSignal(s.id, { period: Number(e.target.value) })} />
      <input type="number" className="param-input" style={inputStyle} value={s.threshold} title="阈值" onChange={(e) => onUpdateSignal(s.id, { threshold: Number(e.target.value) })} />
      {showWeight && (
        <input type="number" step="0.1" className="param-input" style={{ ...inputStyle, width: 60 }} value={weight} title="权重" onChange={(e) => onUpdateWeight(idx, Number(e.target.value))} />
      )}
      {canRemove && (
        <button onClick={() => onRemoveSignal(s.id)} className="row-remove-btn" title="删除">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function SignalListSection({
  signals, weights, aggregationMethod, onAddSignal, onRemoveSignal, onUpdateSignal, onUpdateWeight,
}: Pick<MultiSignalParamsProps, 'signals' | 'weights' | 'aggregationMethod' | 'onAddSignal' | 'onRemoveSignal' | 'onUpdateSignal' | 'onUpdateWeight'>) {
  return (
    <ParamsSection title="信号列表" info="添加多个技术指标信号，可单独删除">
      <div className="portfolios-cards">
        <div className="portfolio-card">
          {signals.map((s, idx) => (
            <SignalRow
              key={s.id} signal={s} idx={idx} weight={weights[idx] ?? 0}
              showWeight={aggregationMethod === 'weighted'} canRemove={signals.length > 1}
              onUpdateSignal={onUpdateSignal} onRemoveSignal={onRemoveSignal} onUpdateWeight={onUpdateWeight}
            />
          ))}
        </div>
      </div>
      <button className="portfolios-add-btn" onClick={onAddSignal} style={{ marginTop: 8 }}>
        <Plus className="w-4 h-4" /> 添加信号
      </button>
    </ParamsSection>
  );
}

function AggregationSection({
  aggregationMethod, onAggregationMethodChange,
}: Pick<MultiSignalParamsProps, 'aggregationMethod' | 'onAggregationMethodChange'>) {
  const descMap: Record<string, string> = {
    weighted: '加权：按权重对信号方向加权求和，正值买入、负值卖出。在信号列表中设置各信号权重。',
    voting: '投票：多数信号同向时触发（买入数 > 卖出数 则买入，反之卖出）。',
    rank: '排名：取历史胜率最高的触发信号方向。',
  };
  return (
    <ParamsSection title="聚合配置">
      <div className="param-field" style={{ marginBottom: 8 }}>
        <span className="param-label">聚合方式</span>
        <select className="param-input" value={aggregationMethod} onChange={(e) => onAggregationMethodChange(e.target.value as 'weighted' | 'voting' | 'rank')}>
          {AGGREGATION_METHODS.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
        </select>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{descMap[aggregationMethod]}</div>
    </ParamsSection>
  );
}

function BacktestParamsSection({
  ticker, startDate, endDate, onTickerChange, onStartDateChange, onEndDateChange,
}: Pick<MultiSignalParamsProps, 'ticker' | 'startDate' | 'endDate' | 'onTickerChange' | 'onStartDateChange' | 'onEndDateChange'>) {
  return (
    <ParamsSection title="回测参数">
      <div className="param-field" style={{ marginBottom: 8 }}>
        <span className="param-label">标的代码</span>
        <input type="text" className="param-input" value={ticker} onChange={(e) => onTickerChange(e.target.value)} placeholder="如 SPY" />
      </div>
      <div className="params-row">
        <div className="param-field">
          <span className="param-label">开始日期</span>
          <input type="date" className="param-input" value={startDate} onChange={(e) => onStartDateChange(e.target.value)} />
        </div>
        <div className="param-field">
          <span className="param-label">结束日期</span>
          <input type="date" className="param-input" value={endDate} onChange={(e) => onEndDateChange(e.target.value)} />
        </div>
      </div>
    </ParamsSection>
  );
}

function MultiSignalParamsPanel(props: MultiSignalParamsProps) {
  return (
    <ParamsPanel>
      <SignalListSection {...props} />
      <AggregationSection {...props} />
      <BacktestParamsSection {...props} />
      <div className="bt-action-row">
        <LoadingButton isLoading={props.isLoading} onClick={props.onRun} loadingText="分析中...">
          <Play className="w-4 h-4" />
          开始分析
        </LoadingButton>
      </div>
    </ParamsPanel>
  );
}

// ===== 结果面板 =====
interface MultiSignalResultsProps {
  results: MultiSignalResponse | null;
  error: string | null;
  isLoading: boolean;
}

function EquityCurveChart({ data }: { data: SignalAnalysisResult['equityCurve'] }) {
  return (
    <div className="chart-card">
      <div className="chart-card-title">权益曲线</div>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(0, 7)}
          />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)
            }
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(label: string) => `日期: ${label}`}
            formatter={(value: number) => [`$${value.toLocaleString()}`, '权益']}
          />
          <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
          <ReferenceLine y={10000} stroke="var(--text-muted)" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="value"
            stroke={CHART_COLORS[0]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            name="聚合权益"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function MultiSignalResultsPanel({ results, error, isLoading }: MultiSignalResultsProps) {
  const aggStatRows = results ? buildAggStatRows(results) : [];

  return (
    <div className="space-y-4">
      {error && (
        <div className="card" style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}>
          分析失败：{error}
        </div>
      )}
      {results && (
        <>
          <div className="chart-card">
            <div className="chart-card-title">聚合信号统计</div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {aggStatRows.map((r) => (
                <div className="card" key={r.label} style={{ padding: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.label}</div>
                  <div
                    style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-strong)', marginTop: 4 }}
                  >
                    {r.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="chart-card">
            <div className="chart-card-title">各信号贡献度对比</div>
            {results.contributions.length > 0 ? (
              <SortableTable
                columns={CONTRIBUTION_COLUMNS}
                data={results.contributions}
                initialSortKey="contribution"
                initialSortDir="desc"
              />
            ) : (
              <div
                style={{ color: 'var(--text-muted)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}
              >
                无贡献度数据
              </div>
            )}
          </div>
          <EquityCurveChart data={results.aggregated.equityCurve} />
        </>
      )}
      {!results && !error && !isLoading && (
        <div
          className="card"
          style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48, fontSize: 14 }}
        >
          设置参数后点击「开始分析」查看结果
        </div>
      )}
    </div>
  );
}

// ===== 主页面 =====
function useMultiSignalState() {
  const [signals, setSignals] = useState<SignalItem[]>([
    { id: 1, indicator: 'SMA', period: 20, threshold: 30 },
    { id: 2, indicator: 'RSI', period: 14, threshold: 30 },
  ]);
  const [weights, setWeights] = useState<number[]>([0.5, 0.5]);
  const [aggregationMethod, setAggregationMethod] = useState<'weighted' | 'voting' | 'rank'>(
    'weighted',
  );
  const [ticker, setTicker] = useState('SPY');
  const [startDate, setStartDate] = useState('2015-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<MultiSignalResponse | null>(null);
  const [nextId, setNextId] = useState(3);

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
    if (idx >= 0) setWeights(weights.filter((_, i) => i !== idx));
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
    if (!ticker.trim()) { setError('请输入标的代码'); return; }
    if (signals.length === 0) { setError('请至少添加一个信号'); return; }
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

  return {
    signals, weights, aggregationMethod, ticker, startDate, endDate,
    isLoading, error, results, addSignal, removeSignal, updateSignal, updateWeight,
    setAggregationMethod, setTicker, setStartDate, setEndDate, runAnalysis,
  };
}

export default function MultiSignalPage() {
  const s = useMultiSignalState();

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">多信号聚合</h1>
      </div>
      <ToolPageLayout
        title="分析参数"
        params={
          <MultiSignalParamsPanel
            signals={s.signals}
            weights={s.weights}
            aggregationMethod={s.aggregationMethod}
            ticker={s.ticker}
            startDate={s.startDate}
            endDate={s.endDate}
            isLoading={s.isLoading}
            onAddSignal={s.addSignal}
            onRemoveSignal={s.removeSignal}
            onUpdateSignal={s.updateSignal}
            onUpdateWeight={s.updateWeight}
            onAggregationMethodChange={s.setAggregationMethod}
            onTickerChange={s.setTicker}
            onStartDateChange={s.setStartDate}
            onEndDateChange={s.setEndDate}
            onRun={s.runAnalysis}
          />
        }
        results={<MultiSignalResultsPanel results={s.results} error={s.error} isLoading={s.isLoading} />}
      />
    </div>
  );
}
