/**
 * @file 双信号对比页面
 * @description 配置两个信号并按 AND/OR/XOR 组合，对比组合信号与单信号的统计与权益曲线
 * @route /dual-signal
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
  DualSignalConfig,
} from '../../shared/types/signal';
import { useAsyncAction } from '../hooks/useAsyncAction';
import LoadingButton from '../components/LoadingButton';
import { ToolPageLayout } from '../components/layout/ToolPageLayout';
import { ParamsPanel, ParamsSection } from '../components/ParamsPanel';
import { SortableTable, type Column } from '../components/SortableTable';

// ===== 常量 =====
const INDICATORS = ['SMA', 'EMA', 'RSI', 'MACD', 'Bollinger'] as const;
const COMBINATION_METHODS: { value: 'and' | 'or' | 'xor'; label: string }[] = [
  { value: 'and', label: 'AND（两者同向）' },
  { value: 'or', label: 'OR（任一触发）' },
  { value: 'xor', label: 'XOR（恰好一个）' },
];

const tooltipStyle = {
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-body)',
  fontSize: '12px',
  boxShadow: 'var(--shadow-md)',
};

// ===== 双信号响应类型（与后端 DualSignalResult 对齐） =====
type SignalDir = 'buy' | 'sell' | null;

interface DualSignalResponse {
  signal1: SignalAnalysisResult;
  signal2: SignalAnalysisResult;
  combined: SignalAnalysisResult;
  comparison: Array<{
    date: string;
    signal1: SignalDir;
    signal2: SignalDir;
    combined: SignalDir;
  }>;
}

// ===== 单信号配置（页面内简化结构） =====
interface SignalCfg {
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

function renderDir(d: SignalDir): React.ReactNode {
  if (d === 'buy') return <span style={{ color: '#1a7a3a', fontWeight: 600 }}>买入</span>;
  if (d === 'sell') return <span style={{ color: '#c94a4a', fontWeight: 600 }}>卖出</span>;
  return <span style={{ color: 'var(--text-muted)' }}>—</span>;
}

// ===== 信号配置子组件 =====
interface SignalCfgFieldsProps {
  cfg: SignalCfg;
  onChange: (cfg: SignalCfg) => void;
}

function SignalCfgFields({ cfg, onChange }: SignalCfgFieldsProps) {
  return (
    <>
      <div className="param-field" style={{ marginBottom: 8 }}>
        <span className="param-label">技术指标</span>
        <select
          className="param-input"
          value={cfg.indicator}
          onChange={(e) => onChange({ ...cfg, indicator: e.target.value })}
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
            value={cfg.period}
            min={2}
            onChange={(e) => onChange({ ...cfg, period: Number(e.target.value) })}
          />
        </div>
        <div className="param-field">
          <span className="param-label">阈值</span>
          <input
            type="number"
            className="param-input"
            value={cfg.threshold}
            onChange={(e) => onChange({ ...cfg, threshold: Number(e.target.value) })}
          />
        </div>
      </div>
    </>
  );
}

// ===== 权益曲线合并 =====
function buildEquityData(results: DualSignalResponse): Array<Record<string, number | string>> {
  const dateMap = new Map<string, Record<string, number | string>>();
  const series: Array<{ name: string; curve: SignalAnalysisResult['equityCurve'] }> = [
    { name: '信号1', curve: results.signal1.equityCurve },
    { name: '信号2', curve: results.signal2.equityCurve },
    { name: '组合', curve: results.combined.equityCurve },
  ];
  for (const s of series) {
    for (const p of s.curve) {
      if (!dateMap.has(p.date)) dateMap.set(p.date, { date: p.date });
      dateMap.get(p.date)![s.name] = p.value;
    }
  }
  return Array.from(dateMap.values()).sort((a, b) =>
    (a.date as string).localeCompare(b.date as string),
  );
}

// ===== 统计列定义 =====
const STAT_COLS: { key: string; label: string; fmt: 'int' | 'pct' | 'ratio' }[] = [
  { key: 'totalSignals', label: '总信号数', fmt: 'int' },
  { key: 'winRate', label: '胜率', fmt: 'pct' },
  { key: 'avgReturn', label: '平均收益', fmt: 'pct' },
  { key: 'maxDrawdown', label: '最大回撤', fmt: 'pct' },
  { key: 'sharpe', label: '夏普', fmt: 'ratio' },
];

function formatStat(v: number, fmt: 'int' | 'pct' | 'ratio'): string {
  if (fmt === 'int') return String(v);
  if (fmt === 'pct') return fmtPct(v);
  return fmtRatio(v);
}

// ===== 参数面板 =====
interface DualSignalParamsProps {
  cfg1: SignalCfg;
  cfg2: SignalCfg;
  combinationMethod: 'and' | 'or' | 'xor';
  ticker: string;
  startDate: string;
  endDate: string;
  isLoading: boolean;
  onCfg1Change: (cfg: SignalCfg) => void;
  onCfg2Change: (cfg: SignalCfg) => void;
  onCombinationMethodChange: (m: 'and' | 'or' | 'xor') => void;
  onTickerChange: (v: string) => void;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onRun: () => void;
}

function DualSignalParamsPanel({
  cfg1,
  cfg2,
  combinationMethod,
  ticker,
  startDate,
  endDate,
  isLoading,
  onCfg1Change,
  onCfg2Change,
  onCombinationMethodChange,
  onTickerChange,
  onStartDateChange,
  onEndDateChange,
  onRun,
}: DualSignalParamsProps) {
  return (
    <ParamsPanel>
      <ParamsSection title="信号 1 配置">
        <SignalCfgFields cfg={cfg1} onChange={onCfg1Change} />
      </ParamsSection>
      <ParamsSection title="信号 2 配置">
        <SignalCfgFields cfg={cfg2} onChange={onCfg2Change} />
      </ParamsSection>
      <ParamsSection title="组合方式">
        <div className="param-field" style={{ marginBottom: 8 }}>
          <span className="param-label">组合逻辑</span>
          <select
            className="param-input"
            value={combinationMethod}
            onChange={(e) => onCombinationMethodChange(e.target.value as 'and' | 'or' | 'xor')}
          >
            {COMBINATION_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="param-field" style={{ marginBottom: 8 }}>
          <span className="param-label">标的代码</span>
          <input
            type="text"
            className="param-input"
            value={ticker}
            onChange={(e) => onTickerChange(e.target.value)}
            placeholder="如 SPY"
          />
        </div>
        <div className="params-row">
          <div className="param-field">
            <span className="param-label">开始日期</span>
            <input
              type="date"
              className="param-input"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
            />
          </div>
          <div className="param-field">
            <span className="param-label">结束日期</span>
            <input
              type="date"
              className="param-input"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
            />
          </div>
        </div>
      </ParamsSection>
      <div className="bt-action-row">
        <LoadingButton isLoading={isLoading} onClick={onRun} loadingText="分析中...">
          <Play className="w-4 h-4" />
          开始分析
        </LoadingButton>
      </div>
    </ParamsPanel>
  );
}

// ===== 结果面板 =====
interface DualSignalResultsProps {
  results: DualSignalResponse | null;
  error: string | null;
  isLoading: boolean;
}

/** 统计对比表 */
function StatsComparisonTable({
  statRows,
}: {
  statRows: { name: string; stats: SignalAnalysisResult['statistics'] }[];
}) {
  return (
    <div className="chart-card">
      <div className="chart-card-title">组合信号统计 vs 单信号统计</div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
              <th
                className="text-[12px] font-semibold text-left py-2.5 px-3"
                style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}
              >
                指标
              </th>
              {statRows.map((r, idx) => (
                <th
                  key={r.name}
                  className="text-[12px] font-semibold text-right py-2.5 px-3"
                  style={{
                    color: 'var(--text-muted)',
                    borderBottom: '2px solid var(--border-soft)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
                    style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                  />
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STAT_COLS.map((col, ri) => (
              <tr
                key={col.key}
                style={{ backgroundColor: ri % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}
              >
                <td
                  className="text-[13px] py-2 px-3"
                  style={{
                    color: 'var(--text-body)',
                    borderBottom: '1px solid var(--border-soft)',
                  }}
                >
                  {col.label}
                </td>
                {statRows.map((r) => (
                  <td
                    key={r.name}
                    className="text-[13px] font-medium text-right py-2 px-3 font-mono"
                    style={{
                      color: 'var(--text-strong)',
                      borderBottom: '1px solid var(--border-soft)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatStat((r.stats as Record<string, number>)[col.key], col.fmt)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 权益曲线图 */
function EquityCurveChart({ equityData }: { equityData: Array<Record<string, number | string>> }) {
  return (
    <div className="chart-card">
      <div className="chart-card-title">权益曲线对比</div>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={equityData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
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
            formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
          />
          <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
          <ReferenceLine y={10000} stroke="var(--text-muted)" strokeDasharray="4 4" />
          {['信号1', '信号2', '组合'].map((name, idx) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              stroke={CHART_COLORS[idx % CHART_COLORS.length]}
              strokeWidth={idx === 2 ? 2.5 : 1.5}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function DualSignalResultsPanel({ results, error, isLoading }: DualSignalResultsProps) {
  const comparisonColumns: Column<DualSignalResponse['comparison'][number]>[] = [
    { key: 'date', label: '日期', sortValue: (r) => r.date },
    {
      key: 'signal1',
      label: '信号 1',
      render: (r) => renderDir(r.signal1),
      sortValue: (r) => r.signal1 ?? '',
    },
    {
      key: 'signal2',
      label: '信号 2',
      render: (r) => renderDir(r.signal2),
      sortValue: (r) => r.signal2 ?? '',
    },
    {
      key: 'combined',
      label: '组合信号',
      render: (r) => renderDir(r.combined),
      sortValue: (r) => r.combined ?? '',
    },
  ];

  const statRows = results
    ? [
        { name: '信号 1', stats: results.signal1.statistics },
        { name: '信号 2', stats: results.signal2.statistics },
        { name: '组合', stats: results.combined.statistics },
      ]
    : [];

  const equityData = results ? buildEquityData(results) : [];

  return (
    <div className="space-y-4">
      {error && (
        <div className="card" style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}>
          分析失败：{error}
        </div>
      )}
      {results && (
        <>
          <StatsComparisonTable statRows={statRows} />
          <div className="chart-card">
            <div className="chart-card-title">信号对比（{results.comparison.length}）</div>
            {results.comparison.length > 0 ? (
              <SortableTable
                columns={comparisonColumns}
                data={results.comparison}
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
          <EquityCurveChart equityData={equityData} />
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
export default function DualSignalPage() {
  const [cfg1, setCfg1] = useState<SignalCfg>({ indicator: 'SMA', period: 20, threshold: 30 });
  const [cfg2, setCfg2] = useState<SignalCfg>({ indicator: 'EMA', period: 50, threshold: 30 });
  const [combinationMethod, setCombinationMethod] = useState<'and' | 'or' | 'xor'>('and');
  const [ticker, setTicker] = useState('SPY');
  const [startDate, setStartDate] = useState('2015-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<DualSignalResponse | null>(null);

  const runAnalysis = () => {
    if (!ticker.trim()) {
      setError('请输入标的代码');
      return;
    }
    run(async () => {
      const buildReq = (c: SignalCfg): SignalAnalysisRequest => ({
        ticker: ticker.trim().toUpperCase(),
        indicator: c.indicator,
        period: c.period,
        threshold: c.threshold,
        startDate,
        endDate,
        signalType: 'both',
      });
      const reqBody: DualSignalConfig = {
        signal1: buildReq(cfg1),
        signal2: buildReq(cfg2),
        combinationMethod,
      };
      const res = await fetch('/api/signal/dual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || '分析失败');
      setResults(json.data as DualSignalResponse);
    });
  };

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">双信号对比</h1>
      </div>
      <ToolPageLayout
        title="分析参数"
        params={
          <DualSignalParamsPanel
            cfg1={cfg1}
            cfg2={cfg2}
            combinationMethod={combinationMethod}
            ticker={ticker}
            startDate={startDate}
            endDate={endDate}
            isLoading={isLoading}
            onCfg1Change={setCfg1}
            onCfg2Change={setCfg2}
            onCombinationMethodChange={setCombinationMethod}
            onTickerChange={setTicker}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onRun={runAnalysis}
          />
        }
        results={<DualSignalResultsPanel results={results} error={error} isLoading={isLoading} />}
      />
    </div>
  );
}
