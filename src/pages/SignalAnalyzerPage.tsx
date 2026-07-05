/**
 * @file 单信号分析页面
 * @description 基于技术指标（SMA/EMA/RSI/MACD/Bollinger）生成买卖信号，并展示信号列表、统计卡片与权益曲线
 * @route /signal-analyzer
 */
import { useState } from 'react';
import { Play } from 'lucide-react';
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
  SignalType,
} from '../../shared/types/signal';
import { useAsyncAction } from '../hooks/useAsyncAction';
import LoadingButton from '../components/LoadingButton';
import { ToolPageLayout } from '../components/layout/ToolPageLayout';
import { ParamsPanel, ParamsSection } from '../components/ParamsPanel';
import { SortableTable, type Column } from '../components/SortableTable';

// ===== 常量 =====
const INDICATORS = ['SMA', 'EMA', 'RSI', 'MACD', 'Bollinger'] as const;
const SIGNAL_TYPES: { value: SignalType; label: string }[] = [
  { value: 'entry', label: '入场（买入）' },
  { value: 'exit', label: '出场（卖出）' },
  { value: 'both', label: '两者' },
];

const tooltipStyle = {
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-body)',
  fontSize: '12px',
  boxShadow: 'var(--shadow-md)',
};

// ===== 工具函数 =====
function fmtPct(v: number | undefined): string {
  if (v === undefined || v === null) return '—';
  return `${(v * 100).toFixed(2)}%`;
}

function fmtRatio(v: number | undefined): string {
  if (v === undefined || v === null) return '—';
  return v.toFixed(2);
}

function fmtPrice(v: number | undefined): string {
  if (v === undefined || v === null) return '—';
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ===== 统计卡片 =====
interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
}

function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-strong)', marginTop: 4 }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

// ===== 参数面板子组件 =====
interface SignalParamsProps {
  ticker: string;
  setTicker: (v: string) => void;
  indicator: string;
  setIndicator: (v: string) => void;
  period: number;
  setPeriod: (v: number) => void;
  threshold: number;
  setThreshold: (v: number) => void;
  signalType: SignalType;
  setSignalType: (v: SignalType) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  isLoading: boolean;
  runAnalysis: () => void;
}

function SignalParamsPanel({
  ticker,
  setTicker,
  indicator,
  setIndicator,
  period,
  setPeriod,
  threshold,
  setThreshold,
  signalType,
  setSignalType,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  isLoading,
  runAnalysis,
}: SignalParamsProps) {
  return (
    <ParamsPanel>
      <IndicatorConfigSection
        ticker={ticker}
        setTicker={setTicker}
        indicator={indicator}
        setIndicator={setIndicator}
        period={period}
        setPeriod={setPeriod}
        threshold={threshold}
        setThreshold={setThreshold}
      />
      <SignalConfigSection
        signalType={signalType}
        setSignalType={setSignalType}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
      />
      <div className="bt-action-row">
        <LoadingButton isLoading={isLoading} onClick={runAnalysis} loadingText="分析中...">
          <Play className="w-4 h-4" />
          开始分析
        </LoadingButton>
      </div>
    </ParamsPanel>
  );
}

function IndicatorConfigSection({
  ticker,
  setTicker,
  indicator,
  setIndicator,
  period,
  setPeriod,
  threshold,
  setThreshold,
}: {
  ticker: string;
  setTicker: (v: string) => void;
  indicator: string;
  setIndicator: (v: string) => void;
  period: number;
  setPeriod: (v: number) => void;
  threshold: number;
  setThreshold: (v: number) => void;
}) {
  return (
    <ParamsSection title="标的与指标" info="选择标的与技术指标，根据指标交叉/突破生成买卖信号">
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
      <div className="param-field" style={{ marginBottom: 8 }}>
        <span className="param-label">技术指标</span>
        <select
          className="param-input"
          value={indicator}
          onChange={(e) => setIndicator(e.target.value)}
        >
          {INDICATORS.map((ind) => (
            <option key={ind} value={ind}>
              {ind}
            </option>
          ))}
        </select>
      </div>
      <div className="params-row">
        <div className="param-field">
          <span className="param-label">周期</span>
          <input
            type="number"
            className="param-input"
            value={period}
            min={2}
            onChange={(e) => setPeriod(Number(e.target.value))}
          />
        </div>
        <div className="param-field">
          <span className="param-label">阈值</span>
          <input
            type="number"
            className="param-input"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
        阈值含义：RSI 为超卖阈值；Bollinger 为标准差倍数；SMA/EMA/MACD 不使用。
      </div>
    </ParamsSection>
  );
}

function SignalConfigSection({
  signalType,
  setSignalType,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
}: {
  signalType: SignalType;
  setSignalType: (v: SignalType) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
}) {
  return (
    <ParamsSection title="信号配置">
      <div className="param-field" style={{ marginBottom: 8 }}>
        <span className="param-label">信号类型</span>
        <select
          className="param-input"
          value={signalType}
          onChange={(e) => setSignalType(e.target.value as SignalType)}
        >
          {SIGNAL_TYPES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="params-row">
        <div className="param-field">
          <span className="param-label">开始日期</span>
          <input
            type="date"
            className="param-input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="param-field">
          <span className="param-label">结束日期</span>
          <input
            type="date"
            className="param-input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>
    </ParamsSection>
  );
}

// ===== 结果面板子组件 =====
interface SignalResultsProps {
  error: string | null;
  results: SignalAnalysisResult | null;
  isLoading: boolean;
}

function SignalResultsPanel({ error, results, isLoading }: SignalResultsProps) {
  const signalColumns: Column<{ date: string; type: 'buy' | 'sell'; price: number }>[] = [
    { key: 'date', label: '日期', sortValue: (r) => r.date },
    {
      key: 'type',
      label: '类型',
      render: (r) => (
        <span style={{ color: r.type === 'buy' ? '#1a7a3a' : '#c94a4a', fontWeight: 600 }}>
          {r.type === 'buy' ? '买入' : '卖出'}
        </span>
      ),
      sortValue: (r) => r.type,
    },
    { key: 'price', label: '价格', render: (r) => fmtPrice(r.price), sortValue: (r) => r.price },
  ];
  return (
    <div className="space-y-4">
      {error && (
        <div className="card" style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}>
          分析失败：{error}
        </div>
      )}
      {results && <SignalResultsContent results={results} signalColumns={signalColumns} />}
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

function SignalResultsContent({
  results,
  signalColumns,
}: {
  results: SignalAnalysisResult;
  signalColumns: Column<{ date: string; type: 'buy' | 'sell'; price: number }>[];
}) {
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="总信号数" value={String(results.statistics.totalSignals)} />
        <StatCard label="胜率" value={fmtPct(results.statistics.winRate)} />
        <StatCard label="平均收益" value={fmtPct(results.statistics.avgReturn)} />
        <StatCard label="最大回撤" value={fmtPct(results.statistics.maxDrawdown)} />
        <StatCard label="夏普" value={fmtRatio(results.statistics.sharpe)} />
      </div>
      <SignalListSection results={results} signalColumns={signalColumns} />
      <EquityCurveSection equityCurve={results.equityCurve} />
    </>
  );
}

function SignalListSection({
  results,
  signalColumns,
}: {
  results: SignalAnalysisResult;
  signalColumns: Column<{ date: string; type: 'buy' | 'sell'; price: number }>[];
}) {
  return (
    <div className="chart-card">
      <div className="chart-card-title">信号列表（{results.signals.length}）</div>
      {results.signals.length > 0 ? (
        <SortableTable
          columns={signalColumns}
          data={results.signals}
          initialSortKey="date"
          initialSortDir="asc"
        />
      ) : (
        <div
          style={{
            color: 'var(--text-muted)',
            fontSize: 13,
            padding: '24px 0',
            textAlign: 'center',
          }}
        >
          当前参数下未生成任何信号
        </div>
      )}
    </div>
  );
}

function EquityCurveSection({
  equityCurve: data,
}: {
  equityCurve: SignalAnalysisResult['equityCurve'];
}) {
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
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0))}
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
            name="权益"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ===== 主页面 =====
export default function SignalAnalyzerPage() {
  const [ticker, setTicker] = useState('SPY');
  const [indicator, setIndicator] = useState<string>('SMA');
  const [period, setPeriod] = useState(20);
  const [threshold, setThreshold] = useState(30);
  const [signalType, setSignalType] = useState<SignalType>('both');
  const [startDate, setStartDate] = useState('2015-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<SignalAnalysisResult | null>(null);

  const runAnalysis = () => {
    if (!ticker.trim()) {
      setError('请输入标的代码');
      return;
    }
    run(async () => {
      const reqBody: SignalAnalysisRequest = {
        ticker: ticker.trim().toUpperCase(),
        indicator,
        period,
        threshold,
        startDate,
        endDate,
        signalType,
      };
      const res = await fetch('/api/signal/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || '分析失败');
      setResults(json.data as SignalAnalysisResult);
    });
  };

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">单信号分析</h1>
      </div>
      <ToolPageLayout
        title="分析参数"
        params={
          <SignalParamsPanel
            ticker={ticker}
            setTicker={setTicker}
            indicator={indicator}
            setIndicator={setIndicator}
            period={period}
            setPeriod={setPeriod}
            threshold={threshold}
            setThreshold={setThreshold}
            signalType={signalType}
            setSignalType={setSignalType}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            isLoading={isLoading}
            runAnalysis={runAnalysis}
          />
        }
        results={<SignalResultsPanel error={error} results={results} isLoading={isLoading} />}
      />
    </div>
  );
}
