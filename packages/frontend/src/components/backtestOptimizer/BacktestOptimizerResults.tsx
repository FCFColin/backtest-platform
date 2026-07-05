import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared/types';
import { SortableTable } from '../SortableTable';
import type { OptimizerState, BestResultItem } from './types.js';
import { TABLE_COLUMNS, OBJECTIVE_SORT_KEY, buildChartData, buildBestMetrics } from './utils.js';

function BestMetricsCard({
  best,
  totalCombos,
}: {
  best: BestResultItem | null;
  totalCombos: number;
}) {
  if (!best) return null;
  const metrics = buildBestMetrics(best);
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)' }}>
          最优参数组合
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>共 {totalCombos} 个组合</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {metrics.map((m) => (
          <div
            key={m.label}
            style={{
              textAlign: 'center',
              padding: 12,
              backgroundColor: 'var(--bg-subtle)',
              borderRadius: 'var(--radius-control)',
            }}
          >
            <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>
              {m.label}
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                fontFamily: 'monospace',
                color: 'var(--text-body)',
              }}
            >
              {m.value}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function GrowthComparisonChart({
  best,
  benchmarkGrowth,
}: {
  best: BestResultItem | null;
  benchmarkGrowth: Array<{ date: string; value: number }> | null;
}) {
  const chartData = buildChartData(best, benchmarkGrowth);
  if (chartData.length === 0) return null;
  return (
    <>
      <div
        style={{
          fontWeight: 600,
          fontSize: 14,
          color: 'var(--text-strong)',
          marginBottom: 12,
          marginTop: 24,
        }}
      >
        收益曲线对比（最优组合 vs 基准）
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ left: 8, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
            tickFormatter={(d: string) => d.substring(0, 7)}
            minTickGap={40}
          />
          <YAxis
            tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
            tickFormatter={(v: number) => `$${v.toLocaleString('en-US')}`}
            width={70}
          />
          <Tooltip
            labelFormatter={(d: string) => d}
            formatter={(v: number, name: string) => [
              `$${v.toLocaleString('en-US')}`,
              name === 'portfolio' ? '最优组合' : '基准',
            ]}
            contentStyle={{
              fontSize: 12,
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-control)',
              color: 'var(--text-body)',
              boxShadow: 'var(--shadow-md)',
            }}
          />
          <Legend formatter={(name: string) => (name === 'portfolio' ? '最优组合' : '基准')} />
          <Line
            type="monotone"
            dataKey="portfolio"
            stroke={CHART_COLORS[0]}
            dot={false}
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="benchmark"
            stroke={CHART_COLORS[1]}
            dot={false}
            strokeWidth={1.5}
            strokeDasharray="4 2"
          />
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}

function ComparisonTableSection({
  results,
  objective,
}: {
  results: OptimizerState['results'];
  objective: OptimizerState['objective'];
}) {
  return (
    <>
      <div
        style={{
          fontWeight: 600,
          fontSize: 14,
          color: 'var(--text-strong)',
          marginBottom: 12,
          marginTop: 24,
        }}
      >
        参数组合对比
      </div>
      {results && results.length > 0 ? (
        <SortableTable
          columns={TABLE_COLUMNS}
          data={results}
          initialSortKey={OBJECTIVE_SORT_KEY[objective]}
          initialSortDir="desc"
        />
      ) : (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24, fontSize: 13 }}>
          没有满足约束条件的参数组合，请放宽约束后重试
        </div>
      )}
    </>
  );
}

export function BacktestOptimizerResults({ state }: { state: OptimizerState }) {
  if (state.error) {
    return (
      <div
        className="bt-results-card card"
        style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}
      >
        优化失败：{state.error}
      </div>
    );
  }
  if (!state.results) {
    return (
      <div
        className="bt-results-card card"
        style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48 }}
      >
        配置左侧参数并点击「开始优化」查看结果
      </div>
    );
  }
  return (
    <div className="bt-results-card card">
      <BestMetricsCard best={state.best} totalCombos={state.totalCombos} />
      <GrowthComparisonChart best={state.best} benchmarkGrowth={state.benchmarkGrowth} />
      <ComparisonTableSection results={state.results} objective={state.objective} />
    </div>
  );
}
