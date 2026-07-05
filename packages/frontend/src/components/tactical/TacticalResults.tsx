/**
 * @file Tactical results panel components
 */
import { useState, useMemo } from 'react';
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
import { Search, Mail, Bell } from 'lucide-react';
import { CHART_COLORS } from '@backtest/shared/types';
import type {
  WhatIfResult,
  EmailAlertConfig,
  TacticalStrategy,
} from '@backtest/shared/types/tactical';
import { SortableTable, type Column } from '../SortableTable';
import LoadingButton from '../LoadingButton';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import {
  TABS,
  ALERT_TRIGGER_OPTIONS,
  tooltipStyle,
  signalHistoryThStyle,
  signalHistoryTdStyle,
} from './types.js';
import type { BacktestResponse, StatRow } from './types.js';
import { fmtPrice, buildGrowthData, buildStatRows } from './utils.js';
import type { TacticalPageState } from '../../hooks/useTacticalState.js';

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
              <th
                className="text-[12px] font-semibold text-left py-2 px-3"
                style={signalHistoryThStyle}
              >
                日期
              </th>
              <th
                className="text-[12px] font-semibold text-left py-2 px-3"
                style={signalHistoryThStyle}
              >
                激活信号
              </th>
              <th
                className="text-[12px] font-semibold text-right py-2 px-3"
                style={signalHistoryThStyle}
              >
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
  const growthData = useMemo(() => buildGrowthData(portfolio, benchmark), [portfolio, benchmark]);
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

function BacktestEmptyState() {
  return (
    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48, fontSize: 14 }}>
      配置信号与参数后点击「运行战术回测」查看结果
    </div>
  );
}

export function TacticalResultsPanel({ state }: { state: TacticalPageState }) {
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
