import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import type { GoalOptimizerResult } from '@backtest/shared/types/goal.js';
import { fmtDollar, fmtPct, getProbColor } from './utils.js';
import { tooltipStyle } from './types.js';

interface GoalResultsProps {
  results: GoalOptimizerResult | null;
  error: string | null;
  isLoading: boolean;
  targetAmount: number;
  initialAmount: number;
  years: number;
}

function ProbabilityDistributionChart({
  data,
  targetAmount,
}: {
  data: GoalOptimizerResult['probabilityCurve'];
  targetAmount: number;
}) {
  return (
    <div className="chart-card">
      <div className="chart-card-title">终值概率分布</div>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis
            dataKey="amount"
            type="number"
            domain={['dataMin', 'dataMax']}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
          />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v: number) => [`${(v * 100).toFixed(2)}%`, '概率']}
            labelFormatter={(v: number) => fmtDollar(v)}
          />
          <ReferenceLine
            x={targetAmount}
            stroke={CHART_COLORS[3]}
            strokeDasharray="4 2"
            label={{ value: '目标', position: 'top', fill: CHART_COLORS[3], fontSize: 11 }}
          />
          <Area
            type="monotone"
            dataKey="probability"
            stroke={CHART_COLORS[0]}
            fill={CHART_COLORS[0]}
            fillOpacity={0.3}
            name="概率"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function OptimalPathChart({
  data,
  targetAmount,
}: {
  data: GoalOptimizerResult['optimalPath'];
  targetAmount: number;
}) {
  return (
    <div className="chart-card">
      <div className="chart-card-title">最优路径（中位数 / P10 / P90）</div>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis
            dataKey="year"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: number) => `${v}y`}
          />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v: number) => fmtDollar(v)}
            labelFormatter={(v: number) => `第 ${v} 年`}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
          <ReferenceLine
            y={targetAmount}
            stroke={CHART_COLORS[3]}
            strokeDasharray="4 2"
            label={{
              value: '目标',
              fill: CHART_COLORS[3],
              fontSize: 11,
              position: 'insideTopRight',
            }}
          />
          <Line
            type="monotone"
            dataKey="p90"
            stroke={CHART_COLORS[2]}
            strokeWidth={1.5}
            dot={false}
            name="P90"
          />
          <Line
            type="monotone"
            dataKey="median"
            stroke={CHART_COLORS[0]}
            strokeWidth={2.5}
            dot={false}
            name="中位数"
          />
          <Line
            type="monotone"
            dataKey="p10"
            stroke={CHART_COLORS[3]}
            strokeWidth={1.5}
            dot={false}
            name="P10"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function RecommendationCards({
  recommendation,
  probColor,
}: {
  recommendation: GoalOptimizerResult['recommendation'];
  probColor: string;
}) {
  return (
    <div className="chart-card">
      <div className="chart-card-title">建议配置</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <div
          style={{
            textAlign: 'center',
            padding: 16,
            backgroundColor: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-control)',
          }}
        >
          <div style={{ fontSize: 11, marginBottom: 6, color: 'var(--text-muted)' }}>
            预期年化收益
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 600,
              fontFamily: 'monospace',
              color: 'var(--text-strong)',
            }}
          >
            {fmtPct(recommendation.expectedReturn)}
          </div>
        </div>
        <div
          style={{
            textAlign: 'center',
            padding: 16,
            backgroundColor: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-control)',
          }}
        >
          <div style={{ fontSize: 11, marginBottom: 6, color: 'var(--text-muted)' }}>
            所需定期投入（年）
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 600,
              fontFamily: 'monospace',
              color: 'var(--text-strong)',
            }}
          >
            {fmtDollar(recommendation.requiredContribution)}
          </div>
        </div>
        <div
          style={{
            textAlign: 'center',
            padding: 16,
            backgroundColor: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-control)',
          }}
        >
          <div style={{ fontSize: 11, marginBottom: 6, color: 'var(--text-muted)' }}>成功率</div>
          <div style={{ fontSize: 20, fontWeight: 600, fontFamily: 'monospace', color: probColor }}>
            {fmtPct(recommendation.successRate)}
          </div>
        </div>
      </div>
    </div>
  );
}

export function GoalOptimizerResultsPanel({
  results,
  error,
  isLoading,
  targetAmount,
  initialAmount,
  years,
}: GoalResultsProps) {
  const probColor = getProbColor(results?.successProbability);

  return (
    <div className="space-y-4">
      {error && (
        <div className="card" style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}>
          优化失败：{error}
        </div>
      )}

      {results && (
        <div className="space-y-4">
          <div className="card" style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
              达成目标概率
            </div>
            <div
              style={{
                fontSize: 48,
                fontWeight: 700,
                fontFamily: 'monospace',
                color: probColor,
                lineHeight: 1.2,
              }}
            >
              {(results.successProbability * 100).toFixed(1)}%
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
              目标 {fmtDollar(targetAmount)} · 初始 {fmtDollar(initialAmount)} · {years} 年
            </div>
          </div>
          <ProbabilityDistributionChart
            data={results.probabilityCurve}
            targetAmount={targetAmount}
          />
          <OptimalPathChart data={results.optimalPath} targetAmount={targetAmount} />
          <RecommendationCards recommendation={results.recommendation} probColor={probColor} />
        </div>
      )}

      {!results && !error && !isLoading && (
        <div
          className="card"
          style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48, fontSize: 14 }}
        >
          设置目标与资产配置后点击「开始优化」查看结果
        </div>
      )}
    </div>
  );
}
