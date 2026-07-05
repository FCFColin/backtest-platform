import { useMemo } from 'react';
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
import type { LETFResult } from '@backtest/shared/types';
import { SortableTable, type Column } from '../SortableTable.js';
import type { StatRow, LETFResultsProps } from './types.js';
import { tooltipStyle, fmtPct, buildStatRows } from './utils.js';

const STAT_COLUMNS: Column<StatRow>[] = [
  { key: 'metric', label: '指标' },
  {
    key: 'value',
    label: '数值',
    sortValue: (r) => r.value,
    render: (r) => (
      <span className="font-mono" style={{ fontWeight: 600 }}>
        {fmtPct(r.value)}
      </span>
    ),
  },
];

function LETFKpiCards({ results }: { results: LETFResult }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12,
      }}
    >
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>年化拖累</div>
        <div
          className="font-mono"
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: results.annualDecay < 0 ? 'var(--error)' : 'var(--text-strong)',
          }}
        >
          {fmtPct(results.annualDecay)}
        </div>
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>基准收益</div>
        <div
          className="font-mono"
          style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)' }}
        >
          {fmtPct(results.stats.benchmarkReturn)}
        </div>
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>LETF 收益</div>
        <div
          className="font-mono"
          style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)' }}
        >
          {fmtPct(results.stats.letfReturn)}
        </div>
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>总滑点</div>
        <div
          className="font-mono"
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: results.stats.slippage < 0 ? 'var(--error)' : 'var(--text-strong)',
          }}
        >
          {fmtPct(results.stats.slippage)}
        </div>
      </div>
    </div>
  );
}

function SlippageCurveChart({
  data,
}: {
  data: Array<{ date: string; cumulative: number; daily: number }>;
}) {
  return (
    <div className="chart-card">
      <div className="chart-card-title">滑点曲线</div>
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
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(label: string) => `日期: ${label}`}
            formatter={(value: number) => [`${value.toFixed(2)}%`, '']}
          />
          <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
          <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="cumulative"
            name="累积滑点"
            stroke={CHART_COLORS[0]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="daily"
            name="每日滑点"
            stroke={CHART_COLORS[1]}
            strokeWidth={1}
            dot={false}
            activeDot={{ r: 3 }}
            strokeOpacity={0.6}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function LeverageComparisonChart({
  data,
  leverage,
}: {
  data: Array<{ date: string; effective: number | null; nominal: number }>;
  leverage: number;
}) {
  return (
    <div className="chart-card">
      <div className="chart-card-title">实际杠杆 vs 名义杠杆</div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(0, 7)}
          />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: number) => `${v.toFixed(1)}x`}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(label: string) => `日期: ${label}`}
            formatter={(value: number) => [`${value.toFixed(2)}x`, '']}
          />
          <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
          <Line
            type="monotone"
            dataKey="nominal"
            name={`名义杠杆 (${leverage}x)`}
            stroke="var(--text-muted)"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="effective"
            name="实际杠杆"
            stroke={CHART_COLORS[2]}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LETFResultsPanel({ results, error, isLoading, leverage }: LETFResultsProps) {
  const slippageChartData = useMemo(() => {
    if (!results) return [];
    return results.slippageCurve.map((p, i) => {
      const daily = i === 0 ? p.slippage : p.slippage - results.slippageCurve[i - 1].slippage;
      return {
        date: p.date,
        cumulative: +(p.slippage * 100).toFixed(4),
        daily: +(daily * 100).toFixed(4),
      };
    });
  }, [results]);

  const leverageChartData = useMemo(() => {
    if (!results) return [];
    return results.slippageCurve.map((p, i) => {
      const lev = results.effectiveLeverage[i];
      return {
        date: p.date,
        effective: lev == null || isNaN(lev) ? null : +lev.toFixed(3),
        nominal: leverage,
      };
    });
  }, [results, leverage]);

  const statRows = useMemo(() => (results ? buildStatRows(results) : []), [results]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="card" style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}>
          分析失败：{error}
        </div>
      )}

      {results && (
        <div className="space-y-4">
          <LETFKpiCards results={results} />
          <SlippageCurveChart data={slippageChartData} />
          <LeverageComparisonChart data={leverageChartData} leverage={leverage} />
          <div className="chart-card">
            <div className="chart-card-title">对比统计</div>
            <SortableTable
              columns={STAT_COLUMNS}
              data={statRows}
              initialSortKey="value"
              initialSortDir="desc"
            />
          </div>
        </div>
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
