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
import { CHART_COLORS } from '@backtest/shared/types';
import type { SignalAnalysisResult } from '@backtest/shared/types/signal';
import type { SignalResultsPanelProps } from './types.js';
import { tooltipStyle } from './types.js';
import { fmtPct, fmtRatio, fmtPrice } from './utils.js';
import { SortableTable, type Column } from '../SortableTable';

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

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
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

function SignalListSection({
  results,
}: {
  results: SignalAnalysisResult;
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

function SignalResultsContent({
  results,
}: {
  results: SignalAnalysisResult;
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
      <SignalListSection results={results} />
      <EquityCurveSection equityCurve={results.equityCurve} />
    </>
  );
}

function SignalResultsPanel({ error, results, isLoading }: SignalResultsPanelProps) {
  return (
    <div className="space-y-4">
      {error && (
        <div className="card" style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}>
          分析失败：{error}
        </div>
      )}
      {results && <SignalResultsContent results={results} />}
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

export default SignalResultsPanel;
