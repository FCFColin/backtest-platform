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
import type { MultiSignalResultsProps } from './types.js';
import { tooltipStyle } from './types.js';
import { buildAggStatRows, CONTRIBUTION_COLUMNS } from './utils.js';
import { SortableTable } from '../SortableTable';

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
                    style={{
                      fontSize: 20,
                      fontWeight: 600,
                      color: 'var(--text-strong)',
                      marginTop: 4,
                    }}
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
                style={{
                  color: 'var(--text-muted)',
                  fontSize: 13,
                  padding: '24px 0',
                  textAlign: 'center',
                }}
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

export default MultiSignalResultsPanel;
export { EquityCurveChart };
