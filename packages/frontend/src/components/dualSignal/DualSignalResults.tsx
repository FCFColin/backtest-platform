import { type ReactNode } from 'react';
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
import { type Column, SortableTable } from '../SortableTable.js';
import { tooltipStyle, type DualSignalResponse, type SignalDir, type DualSignalResultsProps } from './types.js';
import { STAT_COLS, formatStat, buildEquityData } from './utils.js';

function renderDir(d: SignalDir): ReactNode {
  if (d === 'buy') return <span style={{ color: '#1a7a3a', fontWeight: 600 }}>买入</span>;
  if (d === 'sell') return <span style={{ color: '#c94a4a', fontWeight: 600 }}>卖出</span>;
  return <span style={{ color: 'var(--text-muted)' }}>—</span>;
}

function StatsComparisonTable({
  statRows,
}: {
  statRows: { name: string; stats: DualSignalResponse['signal1']['statistics'] }[];
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

export function DualSignalResultsPanel({ results, error, isLoading }: DualSignalResultsProps) {
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
