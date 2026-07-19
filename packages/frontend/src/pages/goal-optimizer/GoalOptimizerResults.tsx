/**
 * @file 目标优化器结果面板子组件
 * @description 承载达成概率卡、概率分布图、最优路径图与建议配置卡
 */
import { useTranslation } from 'react-i18next';
import type { GoalOptimizerResult } from '@backtest/shared';
import { CHART_COLORS } from '@backtest/shared';
import { fmtPct, fmtDollar } from '@/utils/format';
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
import {
  CHART_TOOLTIP_STYLE,
  CHART_GRID_PROPS,
  AXIS_TICK_STYLE,
} from '@/components/charts/chartConstants.js';
import ChartCard from '../../components/ChartCard.js';
import { AnalysisErrorAlert } from '@/components/resultsShell.js';
import { getProbColor } from './goalOptimizerUtils.js';

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: 16,
        backgroundColor: 'var(--bg-subtle)',
        borderRadius: 'var(--radius-control)',
      }}
    >
      <div style={{ fontSize: 11, marginBottom: 6, color: 'var(--text-muted)' }}>{label}</div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 600,
          fontFamily: 'monospace',
          color,
        }}
      >
        {value}
      </div>
    </div>
  );
}

/** 概率分布图 */
function ProbabilityDistributionChart({
  data,
  targetAmount,
}: {
  data: GoalOptimizerResult['probabilityCurve'];
  targetAmount: number;
}) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('goalOptimizer.results.probDistTitle')}>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
          <XAxis
            dataKey="amount"
            type="number"
            domain={['dataMin', 'dataMax']}
            tick={AXIS_TICK_STYLE}
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
          />
          <YAxis tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(v: number) => [
              `${(v * 100).toFixed(2)}%`,
              t('goalOptimizer.results.probability'),
            ]}
            labelFormatter={(v: number) => fmtDollar(v)}
          />
          <ReferenceLine
            x={targetAmount}
            stroke={CHART_COLORS[3]}
            strokeDasharray="4 2"
            label={{
              value: t('goalOptimizer.results.target'),
              position: 'top',
              fill: CHART_COLORS[3],
              fontSize: 11,
            }}
          />
          <Area
            type="monotone"
            dataKey="probability"
            stroke={CHART_COLORS[0]}
            fill={CHART_COLORS[0]}
            fillOpacity={0.3}
            name={t('goalOptimizer.results.probability')}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** 最优路径图 */
function OptimalPathChart({
  data,
  targetAmount,
}: {
  data: GoalOptimizerResult['optimalPath'];
  targetAmount: number;
}) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('goalOptimizer.results.optimalPathTitle')}>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
          <XAxis dataKey="year" tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => `${v}y`} />
          <YAxis
            tick={AXIS_TICK_STYLE}
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(v: number) => fmtDollar(v)}
            labelFormatter={(v: number) => t('goalOptimizer.results.yearLabel', { year: v })}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
          <ReferenceLine
            y={targetAmount}
            stroke={CHART_COLORS[3]}
            strokeDasharray="4 2"
            label={{
              value: t('goalOptimizer.results.target'),
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
            name={t('goalOptimizer.results.median')}
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
    </ChartCard>
  );
}

/** 建议配置卡片 */
function RecommendationCards({
  recommendation,
  probColor,
}: {
  recommendation: GoalOptimizerResult['recommendation'];
  probColor: string;
}) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('goalOptimizer.results.recommendationTitle')}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <StatCard
          label={t('goalOptimizer.results.expectedReturn')}
          value={fmtPct(recommendation.expectedReturn)}
          color="var(--text-strong)"
        />
        <StatCard
          label={t('goalOptimizer.results.requiredContribution')}
          value={fmtDollar(recommendation.requiredContribution)}
          color="var(--text-strong)"
        />
        <StatCard
          label={t('goalOptimizer.results.successRate')}
          value={fmtPct(recommendation.successRate)}
          color={probColor}
        />
      </div>
    </ChartCard>
  );
}

/** 目标优化器结果面板（错误态 + 达成概率 + 概率分布 + 最优路径 + 建议配置 + 空态） */
export function GoalOptimizerResultsPanel({
  results,
  error,
  isLoading,
  targetAmount,
  initialAmount,
  years,
}: {
  results: GoalOptimizerResult | null;
  error: string | null;
  isLoading: boolean;
  targetAmount: number;
  initialAmount: number;
  years: number;
}) {
  const { t } = useTranslation();
  const probColor = getProbColor(results?.successProbability);

  return (
    <div className="space-y-4">
      <AnalysisErrorAlert error={error} prefix={`${t('goalOptimizer.optFailed')}: `} />

      {results && (
        <div className="space-y-4">
          <div className="card" style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
              {t('goalOptimizer.results.achieveProb')}
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
              {t('goalOptimizer.results.targetInitialYears', {
                target: fmtDollar(targetAmount),
                initial: fmtDollar(initialAmount),
                years,
              })}
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
          {t('goalOptimizer.results.emptyHint')}
        </div>
      )}
    </div>
  );
}
