/**
 * @file 战术分配（Tactical Allocation）页面
 * @description 基于技术指标信号构建战术策略，支持多信号聚合、动态权重切换回测、
 *              What-If 实时信号查询及邮件告警配置
 * @route /tactical
 */
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Play, Plus, X, Search, Mail, Bell } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { ToolPageLayout } from '../components/layout/ToolPageLayout';
import { ParamsPanel, ParamsSection } from '../components/ParamsPanel';
import LoadingButton from '../components/LoadingButton';
import { SortableTable, type Column } from '../components/SortableTable';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { CHART_COLORS } from '../../shared/types';
import type { RebalanceFrequency, PortfolioResult, Statistics } from '../../shared/types';
import type {
  TacticalStrategy,
  TradingSignal,
  SignalCondition,
  TechnicalIndicator,
  WhatIfResult,
  EmailAlertConfig,
} from '../../shared/types/tactical';

// ===== 常量 =====

const INDICATOR_OPTIONS: Array<{ value: TechnicalIndicator; label: string }> = [
  { value: 'sma', label: 'SMA 简单均线' },
  { value: 'ema', label: 'EMA 指数均线' },
  { value: 'rsi', label: 'RSI 相对强弱' },
  { value: 'macd', label: 'MACD' },
  { value: 'bollinger', label: 'Bollinger 布林带' },
  { value: 'momentum', label: 'Momentum 动量' },
];

const OPERATOR_OPTIONS: Array<{ value: SignalCondition['operator']; label: string }> = [
  { value: 'gt', label: '大于' },
  { value: 'lt', label: '小于' },
  { value: 'cross_above', label: '交叉上穿' },
  { value: 'cross_below', label: '交叉下穿' },
];

const REBALANCE_OPTIONS: Array<{ value: RebalanceFrequency; label: string }> = [
  { value: 'daily', label: '每日' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'quarterly', label: '每季' },
  { value: 'annual', label: '每年' },
  { value: 'none', label: '不调仓' },
];

const AGGREGATION_OPTIONS: Array<{ value: TacticalStrategy['aggregationMethod']; label: string }> =
  [
    { value: 'voting', label: '投票' },
    { value: 'weighted_average', label: '加权平均' },
    { value: 'rank', label: '排名' },
  ];

const RANKING_METHOD_OPTIONS: Array<{ value: 'fixed_share' | 'risk_parity'; label: string }> = [
  { value: 'fixed_share', label: '固定份额' },
  { value: 'risk_parity', label: '风险平价' },
];

const ALERT_TRIGGER_OPTIONS: Array<{
  value: EmailAlertConfig['triggers'][number];
  label: string;
  desc: string;
}> = [
  { value: 'signal_change', label: '信号变化', desc: '当激活信号发生切换时触发' },
  { value: 'rebalance', label: '再平衡', desc: '每次再平衡调仓时触发' },
  { value: 'threshold', label: '阈值触发', desc: '指标突破设定阈值时触发' },
];

const TABS = [
  { key: 'backtest', label: '回测结果' },
  { key: 'whatif', label: 'What If' },
  { key: 'alerts', label: '邮件告警' },
];

const tooltipStyle = {
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-body)',
  fontSize: '12px',
  boxShadow: 'var(--shadow-md)',
};

const signalHistoryThStyle = {
  color: 'var(--text-muted)',
  borderBottom: '2px solid var(--border-soft)',
};

const signalHistoryTdStyle = {
  color: 'var(--text-body)',
  borderBottom: '1px solid var(--border-soft)',
};

const signalEditorStyle = {
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  padding: 12,
  marginBottom: 12,
  background: 'var(--bg-subtle)',
};

// ===== 工厂函数 =====

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

function createDefaultCondition(): SignalCondition {
  return { indicator: 'sma', period: 20, operator: 'gt', threshold: 0 };
}

function createDefaultSignal(): TradingSignal {
  return {
    id: genId('signal'),
    name: '信号 1',
    conditions: [createDefaultCondition()],
    targetWeights: [
      { ticker: 'SPY', weight: 60 },
      { ticker: 'TLT', weight: 40 },
    ],
  };
}

function createDefaultStrategy(): TacticalStrategy {
  return {
    id: genId('strategy'),
    name: '战术策略',
    signals: [createDefaultSignal()],
    aggregationMethod: 'voting',
    rankingConfig: { method: 'fixed_share', topN: 3 },
  };
}

// ===== 回测响应类型 =====

interface BacktestResponse {
  portfolio: PortfolioResult;
  benchmark: PortfolioResult;
  signalHistory: Array<{
    date: string;
    activeSignals: string[];
    weights: Array<{ ticker: string; weight: number }>;
  }>;
}

interface StatRow {
  metric: string;
  tactical: string;
  benchmark: string;
  _sortTactical: number;
}

// ===== 格式化与计算工具 =====

function fmtPct(v: number | undefined | null): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(2)}%`;
}
function fmtRatio(v: number | undefined | null): string {
  if (v == null) return '—';
  return v.toFixed(2);
}
function fmtPrice(v: number): string {
  return v > 0 ? `$${v.toFixed(2)}` : '—';
}

function buildGrowthData(
  portfolio: PortfolioResult,
  benchmark: PortfolioResult,
): Array<Record<string, number | string>> {
  const dateMap = new Map<string, Record<string, number | string>>();
  for (const pt of portfolio.growthCurve) {
    if (!dateMap.has(pt.date)) dateMap.set(pt.date, { date: pt.date });
    dateMap.get(pt.date)!['战术分配'] = pt.value;
  }
  for (const pt of benchmark.growthCurve) {
    if (!dateMap.has(pt.date)) dateMap.set(pt.date, { date: pt.date });
    dateMap.get(pt.date)!['等权基准'] = pt.value;
  }
  return Array.from(dateMap.values()).sort((a, b) =>
    (a.date as string).localeCompare(b.date as string),
  );
}

function buildStatRows(portfolio: PortfolioResult, benchmark: PortfolioResult): StatRow[] {
  const metrics: Array<{ key: keyof Statistics; label: string; fmt: 'pct' | 'ratio' }> = [
    { key: 'cagr', label: '年化收益率 (CAGR)', fmt: 'pct' },
    { key: 'totalReturn', label: '累计收益', fmt: 'pct' },
    { key: 'stdev', label: '年化波动率', fmt: 'pct' },
    { key: 'sharpe', label: '夏普比率', fmt: 'ratio' },
    { key: 'maxDrawdown', label: '最大回撤', fmt: 'pct' },
    { key: 'calmar', label: '卡尔玛比率', fmt: 'ratio' },
    { key: 'pctPositiveDays', label: '正收益日占比', fmt: 'pct' },
    { key: 'maxDailyReturn', label: '最大日收益', fmt: 'pct' },
    { key: 'minDailyReturn', label: '最大日亏损', fmt: 'pct' },
  ];
  return metrics.map((m) => ({
    metric: m.label,
    tactical:
      m.fmt === 'pct' ? fmtPct(portfolio.statistics[m.key]) : fmtRatio(portfolio.statistics[m.key]),
    benchmark:
      m.fmt === 'pct' ? fmtPct(benchmark.statistics[m.key]) : fmtRatio(benchmark.statistics[m.key]),
    _sortTactical: portfolio.statistics[m.key] ?? 0,
  }));
}

function whatIfSignalColor(t: WhatIfResult['signalType']): string {
  return t === 'buy' ? 'var(--success)' : t === 'sell' ? 'var(--danger)' : 'var(--text-muted)';
}

function whatIfSignalLabel(t: WhatIfResult['signalType']): string {
  return t === 'buy' ? '买入' : t === 'sell' ? '卖出' : '持有';
}

function buildWhatIfColumns(): Column<WhatIfResult>[] {
  return [
    { key: 'ticker', label: '标的', sortValue: (r) => r.ticker },
    {
      key: 'currentPrice',
      label: '最新价格',
      sortValue: (r) => r.currentPrice,
      render: (r) => <span className="font-mono">{fmtPrice(r.currentPrice)}</span>,
    },
    { key: 'signalDate', label: '信号日期', sortValue: (r) => r.signalDate },
    {
      key: 'signalType',
      label: '信号状态',
      sortValue: (r) => r.signalType,
      render: (r) => (
        <span style={{ color: whatIfSignalColor(r.signalType), fontWeight: 600 }}>
          {whatIfSignalLabel(r.signalType)}
        </span>
      ),
    },
  ];
}

/** 校验策略信号，返回错误信息或 null */
function validateStrategy(signals: TradingSignal[]): string | null {
  for (const sig of signals) {
    if (sig.conditions.length === 0) return `信号「${sig.name}」缺少触发条件`;
    const validWeights = sig.targetWeights.filter((w) => w.ticker && w.weight > 0);
    if (validWeights.length === 0) return `信号「${sig.name}」缺少有效目标权重`;
  }
  return null;
}

// ===== 信号编辑器子组件 =====

function ConditionRow({
  cond,
  ci,
  onUpdate,
  onRemove,
  canRemove,
}: {
  cond: SignalCondition;
  ci: number;
  onUpdate: (ci: number, patch: Partial<SignalCondition>) => void;
  onRemove: (ci: number) => void;
  canRemove: boolean;
}) {
  return (
    <div className="ticker-row" style={{ flexWrap: 'wrap', marginBottom: 4 }}>
      <select
        className="param-input"
        style={{ width: 130, height: 32, fontSize: 12, padding: '2px 6px' }}
        value={cond.indicator}
        onChange={(e) => onUpdate(ci, { indicator: e.target.value as TechnicalIndicator })}
      >
        {INDICATOR_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="param-input-suffix-wrap" style={{ width: 80 }}>
        <input
          type="number"
          className="param-input param-input-with-suffix"
          style={{ height: 32, fontSize: 12, padding: '2px 30px 2px 6px' }}
          value={cond.period}
          onChange={(e) => onUpdate(ci, { period: Number(e.target.value) })}
        />
        <span className="param-input-suffix">周期</span>
      </div>
      <select
        className="param-input"
        style={{ width: 100, height: 32, fontSize: 12, padding: '2px 6px' }}
        value={cond.operator}
        onChange={(e) =>
          onUpdate(ci, { operator: e.target.value as SignalCondition['operator'] })
        }
      >
        {OPERATOR_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="param-input-prefix-wrap" style={{ width: 90 }}>
        <input
          type="number"
          step="0.01"
          className="param-input param-input-with-prefix"
          style={{ height: 32, fontSize: 12, padding: '2px 6px 2px 18px' }}
          value={cond.threshold}
          onChange={(e) => onUpdate(ci, { threshold: Number(e.target.value) })}
        />
        <span className="param-input-prefix">阈值</span>
      </div>
      {canRemove && (
        <button className="row-remove-btn" onClick={() => onRemove(ci)} title="删除条件">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function WeightRow({
  weight,
  wi,
  onUpdate,
  onRemove,
  canRemove,
}: {
  weight: { ticker: string; weight: number };
  wi: number;
  onUpdate: (wi: number, patch: Partial<{ ticker: string; weight: number }>) => void;
  onRemove: (wi: number) => void;
  canRemove: boolean;
}) {
  return (
    <div className="ticker-row" style={{ marginBottom: 4 }}>
      <input
        type="text"
        className="ticker-input"
        style={{ flex: 1, height: 32, fontSize: 12 }}
        value={weight.ticker}
        onChange={(e) => onUpdate(wi, { ticker: e.target.value.toUpperCase() })}
        placeholder="标的代码"
      />
      <div className="param-input-suffix-wrap" style={{ width: 100 }}>
        <input
          type="number"
          className="param-input param-input-with-suffix"
          style={{ height: 32, fontSize: 12, padding: '2px 30px 2px 6px' }}
          value={weight.weight}
          onChange={(e) => onUpdate(wi, { weight: Number(e.target.value) })}
        />
        <span className="param-input-suffix">%</span>
      </div>
      {canRemove && (
        <button className="row-remove-btn" onClick={() => onRemove(wi)} title="删除">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

interface SignalEditorProps {
  signal: TradingSignal;
  index: number;
  onChange: (signal: TradingSignal) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function useSignalEditorHandlers(signal: TradingSignal, onChange: (s: TradingSignal) => void) {
  const updateName = (name: string) => onChange({ ...signal, name });
  const updateCondition = (ci: number, patch: Partial<SignalCondition>) => {
    const next = signal.conditions.map((c, i) => (i === ci ? { ...c, ...patch } : c));
    onChange({ ...signal, conditions: next });
  };
  const addCondition = () =>
    onChange({ ...signal, conditions: [...signal.conditions, createDefaultCondition()] });
  const removeCondition = (ci: number) => {
    if (signal.conditions.length <= 1) return;
    onChange({ ...signal, conditions: signal.conditions.filter((_, i) => i !== ci) });
  };
  const updateWeight = (wi: number, patch: Partial<{ ticker: string; weight: number }>) => {
    const next = signal.targetWeights.map((w, i) => (i === wi ? { ...w, ...patch } : w));
    onChange({ ...signal, targetWeights: next });
  };
  const addWeight = () =>
    onChange({ ...signal, targetWeights: [...signal.targetWeights, { ticker: '', weight: 0 }] });
  const removeWeight = (wi: number) => {
    if (signal.targetWeights.length <= 1) return;
    onChange({ ...signal, targetWeights: signal.targetWeights.filter((_, i) => i !== wi) });
  };
  return {
    updateName,
    updateCondition,
    addCondition,
    removeCondition,
    updateWeight,
    addWeight,
    removeWeight,
  };
}

function SignalEditor({ signal, index, onChange, onRemove, canRemove }: SignalEditorProps) {
  const {
    updateName,
    updateCondition,
    addCondition,
    removeCondition,
    updateWeight,
    addWeight,
    removeWeight,
  } = useSignalEditorHandlers(signal, onChange);

  return (
    <div style={signalEditorStyle}>
      <div className="ticker-row" style={{ marginBottom: 8 }}>
        <input
          type="text"
          className="ticker-input"
          style={{ flex: 1, textTransform: 'none' }}
          value={signal.name}
          onChange={(e) => updateName(e.target.value)}
          placeholder={`信号 ${index + 1} 名称`}
        />
        {canRemove && (
          <button className="row-remove-btn" onClick={onRemove} title="删除信号">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>
        触发条件（全部满足）
      </div>
      {signal.conditions.map((cond, ci) => (
        <ConditionRow
          key={ci}
          cond={cond}
          ci={ci}
          onUpdate={updateCondition}
          onRemove={removeCondition}
          canRemove={signal.conditions.length > 1}
        />
      ))}
      <button className="portfolios-add-btn" onClick={addCondition} style={{ marginTop: 4 }}>
        <Plus className="w-3 h-3" />
        添加条件
      </button>

      <div
        style={{ fontSize: 11, color: 'var(--text-muted)', margin: '10px 0 4px', fontWeight: 600 }}
      >
        目标权重（激活时切换）
      </div>
      {signal.targetWeights.map((w, wi) => (
        <WeightRow
          key={wi}
          weight={w}
          wi={wi}
          onUpdate={updateWeight}
          onRemove={removeWeight}
          canRemove={signal.targetWeights.length > 1}
        />
      ))}
      <button className="portfolios-add-btn" onClick={addWeight} style={{ marginTop: 4 }}>
        <Plus className="w-3 h-3" />
        添加标的
      </button>
    </div>
  );
}

// ===== 回测结果 Tab =====

function GrowthChart({ growthData }: { growthData: Array<Record<string, number | string>> }) {
  return (
    <div className="chart-card">
      <div className="chart-card-title">收益曲线</div>
      <ResponsiveContainer width="100%" height={380}>
        <LineChart data={growthData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
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
          <Legend wrapperStyle={{ fontSize: '12px' }} />
          <Line
            type="monotone"
            dataKey="战术分配"
            stroke={CHART_COLORS[0]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="等权基准"
            stroke={CHART_COLORS[1]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            strokeDasharray="6 3"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SignalHistoryTable({
  signalHistory,
}: {
  signalHistory: BacktestResponse['signalHistory'];
}) {
  return (
    <div className="chart-card">
      <div className="chart-card-title">信号切换历史（再平衡日）</div>
      <div className="overflow-x-auto" style={{ maxHeight: 400, overflowY: 'auto' }}>
        <table className="w-full border-collapse">
          <thead style={{ position: 'sticky', top: 0 }}>
            <tr style={{ backgroundColor: 'var(--bg-elevated)' }}>
              <th className="text-[12px] font-semibold text-left py-2 px-3" style={signalHistoryThStyle}>
                日期
              </th>
              <th className="text-[12px] font-semibold text-left py-2 px-3" style={signalHistoryThStyle}>
                激活信号
              </th>
              <th className="text-[12px] font-semibold text-right py-2 px-3" style={signalHistoryThStyle}>
                目标权重
              </th>
            </tr>
          </thead>
          <tbody>
            {signalHistory.map((h, idx) => (
              <tr
                key={idx}
                style={{ backgroundColor: idx % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}
              >
                <td className="text-[13px] py-2 px-3 font-mono" style={signalHistoryTdStyle}>
                  {h.date}
                </td>
                <td className="text-[13px] py-2 px-3" style={signalHistoryTdStyle}>
                  {h.activeSignals.length > 0 ? (
                    h.activeSignals.join(', ')
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>无（等权）</span>
                  )}
                </td>
                <td
                  className="text-[13px] py-2 px-3 text-right font-mono"
                  style={{ ...signalHistoryTdStyle, color: 'var(--text-strong)' }}
                >
                  {h.weights.map((w) => `${w.ticker}: ${(w.weight * 100).toFixed(1)}%`).join('  ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BacktestResultTab({ results }: { results: BacktestResponse }) {
  const { portfolio, benchmark, signalHistory } = results;
  const growthData = useMemo(
    () => buildGrowthData(portfolio, benchmark),
    [portfolio, benchmark],
  );
  const statRows = useMemo(() => buildStatRows(portfolio, benchmark), [portfolio, benchmark]);
  const statColumns: Column<StatRow>[] = [
    { key: 'metric', label: '指标' },
    { key: 'tactical', label: '战术分配', sortValue: (r) => r._sortTactical },
    { key: 'benchmark', label: '等权基准' },
  ];

  return (
    <div className="space-y-4">
      <GrowthChart growthData={growthData} />
      <div className="chart-card">
        <div className="chart-card-title">统计指标</div>
        <SortableTable
          columns={statColumns}
          data={statRows}
          initialSortKey="tactical"
          initialSortDir="desc"
        />
      </div>
      {signalHistory.length > 0 && <SignalHistoryTable signalHistory={signalHistory} />}
    </div>
  );
}

// ===== What If Tab =====

function WhatIfTab({ strategy }: { strategy: TacticalStrategy }) {
  const [tickerInput, setTickerInput] = useState('SPY, TLT, GLD');
  const [results, setResults] = useState<WhatIfResult[]>([]);
  const { isLoading, error, run, setError } = useAsyncAction();
  const columns = buildWhatIfColumns();

  const handleQuery = () => {
    const tickers = tickerInput
      .split(/[\s,]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (tickers.length === 0) {
      setError('请输入至少一个标的代码');
      return;
    }
    run(async () => {
      const res = await fetch('/api/tactical/what-if', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers, strategy }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || '查询失败');
      setResults(json.data ?? []);
    });
  };

  return (
    <div className="space-y-4">
      <div className="chart-card">
        <div className="chart-card-title">实时价格与信号查询</div>
        <div className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
          输入标的代码（逗号或空格分隔），查询最新价格及当前策略信号状态
        </div>
        <div className="ticker-row" style={{ marginBottom: 12 }}>
          <input
            type="text"
            className="ticker-input"
            style={{ flex: 1 }}
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            placeholder="如 SPY, TLT, GLD"
          />
          <LoadingButton
            isLoading={isLoading}
            onClick={handleQuery}
            loadingText="查询中..."
            className="main-action-btn"
            style={{ minHeight: 40, padding: '0 16px' }}
          >
            <Search className="w-4 h-4" />
            查询
          </LoadingButton>
        </div>
        {error && (
          <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}
        {results.length > 0 && (
          <SortableTable
            columns={columns}
            data={results}
            initialSortKey="ticker"
            initialSortDir="asc"
          />
        )}
        {results.length === 0 && !error && !isLoading && (
          <div
            style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32, fontSize: 13 }}
          >
            输入标的代码后点击「查询」查看结果
          </div>
        )}
      </div>
    </div>
  );
}

// ===== 邮件告警 Tab =====

function AlertEmailInput({
  email,
  enabled,
  onChange,
}: {
  email: string;
  enabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="param-field" style={{ marginBottom: 16, maxWidth: 360 }}>
      <span className="param-label">告警邮箱</span>
      <div className="param-input-prefix-wrap">
        <Mail
          className="w-4 h-4"
          style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-muted)',
          }}
        />
        <input
          type="email"
          className="param-input"
          style={{ paddingLeft: 32 }}
          value={email}
          onChange={(e) => onChange(e.target.value)}
          placeholder="alert@example.com"
          disabled={!enabled}
        />
      </div>
    </div>
  );
}

function AlertTriggerOptions({
  config,
  onToggle,
}: {
  config: EmailAlertConfig;
  onToggle: (t: EmailAlertConfig['triggers'][number]) => void;
}) {
  return (
    <>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 8 }}>
        触发条件
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}>
        {ALERT_TRIGGER_OPTIONS.map((opt) => (
          <label key={opt.value} className="param-toggle" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={config.triggers.includes(opt.value)}
              onChange={() => onToggle(opt.value)}
              disabled={!config.enabled}
            />
            <span style={{ fontWeight: 500 }}>{opt.label}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 'auto' }}>
              {opt.desc}
            </span>
          </label>
        ))}
      </div>
    </>
  );
}

function AlertsTab() {
  const [config, setConfig] = useState<EmailAlertConfig>({
    enabled: false,
    email: '',
    triggers: ['signal_change'],
  });
  const [saved, setSaved] = useState(false);
  const { isLoading, error, run, setError } = useAsyncAction();

  const toggleTrigger = (trigger: EmailAlertConfig['triggers'][number]) => {
    setConfig((prev) => ({
      ...prev,
      triggers: prev.triggers.includes(trigger)
        ? prev.triggers.filter((t) => t !== trigger)
        : [...prev.triggers, trigger],
    }));
  };

  const handleSave = () => {
    if (config.enabled && !config.email) {
      setError('启用告警时必须填写邮箱');
      return;
    }
    run(async () => {
      const res = await fetch('/api/tactical/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || '保存失败');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  };

  return (
    <div className="chart-card">
      <div className="chart-card-title">邮件告警配置</div>
      <div className="text-[11px] mb-4" style={{ color: 'var(--text-muted)' }}>
        配置信号触发时的邮件通知，配置暂存于服务端内存
      </div>
      <label className="param-toggle" style={{ marginBottom: 16 }}>
        <Bell className="w-4 h-4" style={{ color: 'var(--brand)' }} />
        <span>启用邮件告警</span>
        <div
          className={`toggle-switch ${config.enabled ? 'active' : ''}`}
          onClick={() => setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
        />
      </label>
      <AlertEmailInput
        email={config.email}
        enabled={config.enabled}
        onChange={(v) => setConfig((prev) => ({ ...prev, email: v }))}
      />
      <AlertTriggerOptions config={config} onToggle={toggleTrigger} />
      <div className="bt-action-row" style={{ paddingLeft: 0, maxWidth: 360 }}>
        <LoadingButton
          isLoading={isLoading}
          onClick={handleSave}
          loadingText="保存中..."
          style={{ width: '100%' }}
        >
          <Bell className="w-4 h-4" />
          保存告警配置
        </LoadingButton>
      </div>
      {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{error}</div>}
      {saved && (
        <div style={{ color: 'var(--success)', fontSize: 13, marginTop: 8 }}>告警配置已保存</div>
      )}
    </div>
  );
}

// ===== State Hook =====

function useTacticalPageState() {
  const [strategy, setStrategy] = useState<TacticalStrategy>(createDefaultStrategy);
  const [startDate, setStartDate] = useState('2015-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [startingValue, setStartingValue] = useState(10000);
  const [rebalanceFrequency, setRebalanceFrequency] = useState<RebalanceFrequency>('monthly');
  const [activeTab, setActiveTab] = useState('backtest');
  const [results, setResults] = useState<BacktestResponse | null>(null);
  const { isLoading, error, run, setError } = useAsyncAction();

  const updateSignal = (idx: number, signal: TradingSignal) => {
    const next = [...strategy.signals];
    next[idx] = signal;
    setStrategy({ ...strategy, signals: next });
  };
  const addSignal = () => {
    const newSignal = createDefaultSignal();
    newSignal.name = `信号 ${strategy.signals.length + 1}`;
    setStrategy({ ...strategy, signals: [...strategy.signals, newSignal] });
  };
  const removeSignal = (idx: number) => {
    if (strategy.signals.length <= 1) return;
    setStrategy({ ...strategy, signals: strategy.signals.filter((_, i) => i !== idx) });
  };

  const handleRunBacktest = () => {
    const validationError = validateStrategy(strategy.signals);
    if (validationError) {
      setError(validationError);
      return;
    }
    run(async () => {
      const res = await fetch('/api/tactical/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy,
          startDate,
          endDate,
          startingValue,
          rebalanceFrequency,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || '回测失败');
      setResults(json.data);
      setActiveTab('backtest');
    });
  };

  return {
    strategy,
    setStrategy,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    startingValue,
    setStartingValue,
    rebalanceFrequency,
    setRebalanceFrequency,
    activeTab,
    setActiveTab,
    results,
    isLoading,
    error,
    updateSignal,
    addSignal,
    removeSignal,
    handleRunBacktest,
  };
}

type TacticalPageState = ReturnType<typeof useTacticalPageState>;

// ===== 参数面板子组件 =====

function SignalBuilderSection({ state }: { state: TacticalPageState }) {
  const { strategy, updateSignal, addSignal, removeSignal } = state;
  return (
    <ParamsSection
      title="信号构建器"
      info="基于技术指标构建交易信号。每个信号包含若干触发条件（全部满足时激活）及目标权重（激活时切换的配置）"
    >
      {strategy.signals.map((sig, idx) => (
        <SignalEditor
          key={sig.id}
          signal={sig}
          index={idx}
          onChange={(s) => updateSignal(idx, s)}
          onRemove={() => removeSignal(idx)}
          canRemove={strategy.signals.length > 1}
        />
      ))}
      <button
        className="portfolios-add-btn"
        onClick={addSignal}
        style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
      >
        <Plus className="w-4 h-4" />
        添加信号
      </button>
    </ParamsSection>
  );
}

function RankingConfigRow({
  strategy,
  setStrategy,
}: {
  strategy: TacticalStrategy;
  setStrategy: (s: TacticalStrategy) => void;
}) {
  return (
    <div className="params-row">
      <div className="param-field param-field-rolling">
        <span className="param-label">排名方式</span>
        <select
          className="param-input"
          value={strategy.rankingConfig?.method ?? 'fixed_share'}
          onChange={(e) =>
            setStrategy({
              ...strategy,
              rankingConfig: {
                method: e.target.value as 'fixed_share' | 'risk_parity',
                topN: strategy.rankingConfig?.topN ?? 3,
              },
            })
          }
        >
          {RANKING_METHOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="param-field param-field-rolling">
        <span className="param-label">TopN</span>
        <div className="param-input-suffix-wrap">
          <input
            type="number"
            min={1}
            className="param-input param-input-with-suffix"
            value={strategy.rankingConfig?.topN ?? 3}
            onChange={(e) =>
              setStrategy({
                ...strategy,
                rankingConfig: {
                  method: strategy.rankingConfig?.method ?? 'fixed_share',
                  topN: Math.max(1, Number(e.target.value)),
                },
              })
            }
          />
          <span className="param-input-suffix">个</span>
        </div>
      </div>
    </div>
  );
}

function AggregationSection({ state }: { state: TacticalPageState }) {
  const { strategy, setStrategy } = state;
  return (
    <ParamsSection title="聚合配置" info="多信号同时激活时的权重合成方式">
      <div className="param-field" style={{ marginBottom: 8 }}>
        <span className="param-label">聚合方式</span>
        <select
          className="param-input"
          value={strategy.aggregationMethod}
          onChange={(e) =>
            setStrategy({
              ...strategy,
              aggregationMethod: e.target.value as TacticalStrategy['aggregationMethod'],
            })
          }
        >
          {AGGREGATION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {strategy.aggregationMethod === 'rank' && (
        <RankingConfigRow strategy={strategy} setStrategy={setStrategy} />
      )}
    </ParamsSection>
  );
}

function BacktestParamsSection({ state }: { state: TacticalPageState }) {
  const {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    startingValue,
    setStartingValue,
    rebalanceFrequency,
    setRebalanceFrequency,
  } = state;
  return (
    <ParamsSection title="回测参数">
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
      <div className="params-row" style={{ marginTop: 8 }}>
        <div className="param-field param-field-start-val">
          <span className="param-label">初始资金</span>
          <div className="param-input-prefix-wrap">
            <span className="param-input-prefix">$</span>
            <input
              type="number"
              className="param-input param-input-with-prefix"
              value={startingValue}
              onChange={(e) => setStartingValue(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="param-field param-field-rolling">
          <span className="param-label">再平衡频率</span>
          <select
            className="param-input"
            value={rebalanceFrequency}
            onChange={(e) => setRebalanceFrequency(e.target.value as RebalanceFrequency)}
          >
            {REBALANCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </ParamsSection>
  );
}

function TacticalParamsPanel({ state }: { state: TacticalPageState }) {
  const { isLoading, handleRunBacktest } = state;
  return (
    <ParamsPanel>
      <SignalBuilderSection state={state} />
      <AggregationSection state={state} />
      <BacktestParamsSection state={state} />
      <div className="bt-action-row">
        <LoadingButton
          isLoading={isLoading}
          onClick={handleRunBacktest}
          loadingText="回测中..."
          style={{ width: '100%' }}
        >
          <Play className="w-4 h-4" />
          运行战术回测
        </LoadingButton>
      </div>
    </ParamsPanel>
  );
}

// ===== 结果面板 =====

function BacktestEmptyState() {
  return (
    <div
      style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48, fontSize: 14 }}
    >
      配置信号与参数后点击「运行战术回测」查看结果
    </div>
  );
}

function TacticalResultsPanel({ state }: { state: TacticalPageState }) {
  const { error, activeTab, setActiveTab, results, strategy } = state;
  return (
    <div className="space-y-4">
      {error && (
        <div className="card" style={{ color: 'var(--danger)', textAlign: 'center', padding: 24 }}>
          回测失败：{error}
        </div>
      )}
      <div className="card">
        <div className="result-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`result-tab ${activeTab === tab.key ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="result-content">
          {activeTab === 'backtest' &&
            (results ? <BacktestResultTab results={results} /> : <BacktestEmptyState />)}
          {activeTab === 'whatif' && <WhatIfTab strategy={strategy} />}
          {activeTab === 'alerts' && <AlertsTab />}
        </div>
      </div>
    </div>
  );
}

// ===== SEO 卡片 =====

function TacticalSeoCard() {
  return (
    <div className="bt-seo-card card">
      <p className="bt-seo-desc">
        战术分配工具基于技术指标（SMA/EMA/RSI/MACD/布林带/动量）构建交易信号，
        支持多信号聚合（投票/加权平均/排名）生成动态权重切换策略，运行历史回测并与等权基准对比，
        同时提供 What-If 实时信号查询与邮件告警配置。
      </p>
      <div className="bt-seo-features">
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">可配置内容</div>
          <div className="bt-seo-feature-desc">
            技术指标参数、信号触发条件、目标权重、聚合方式、再平衡频率。
          </div>
        </div>
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">可查看结果</div>
          <div className="bt-seo-feature-desc">
            收益曲线、统计指标、信号切换历史、实时价格与信号状态。
          </div>
        </div>
      </div>
      <div className="bt-seo-related">
        <span className="bt-seo-related-label">相关工具：</span>
        <Link to="/" className="link-blue" style={{ fontWeight: 700 }}>
          组合回测
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/analysis" className="link-blue" style={{ fontWeight: 700 }}>
          资产分析
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/optimizer" className="link-blue" style={{ fontWeight: 700 }}>
          组合优化
        </Link>
      </div>
    </div>
  );
}

// ===== 主页面 =====

export default function TacticalPage() {
  const state = useTacticalPageState();
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">战术分配</h1>
      </div>
      <TacticalSeoCard />
      <ToolPageLayout
        title="战术策略参数"
        params={<TacticalParamsPanel state={state} />}
        results={<TacticalResultsPanel state={state} />}
      />
    </div>
  );
}
