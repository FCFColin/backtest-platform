/**
 * @file 季节性收益柱状图
 * @description 展示投资组合按月份统计的平均收益季节性分布
 */
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { CHART_COLORS } from '../../../shared/types';
import type { PortfolioResult } from '../../../shared/types';
import { CHART_TOOLTIP_STYLE } from '../chartHelpers';
import ChartCard from '../ChartCard';

/** 季节性收益柱状图 Props */
interface SeasonalityChartProps {
  portfolios: PortfolioResult[];
}

const MONTH_LABELS = [
  '1月',
  '2月',
  '3月',
  '4月',
  '5月',
  '6月',
  '7月',
  '8月',
  '9月',
  '10月',
  '11月',
  '12月',
];

export default function SeasonalityChart({ portfolios }: SeasonalityChartProps) {
  if (portfolios.length === 0) {
    return (
      <div className="chart-card">
        <div className="chart-card-title">季节性</div>
        <div
          style={{
            color: 'var(--text-muted)',
            fontSize: '13px',
            padding: '40px 0',
            textAlign: 'center',
          }}
        >
          暂无组合数据
        </div>
      </div>
    );
  }

  const data = computeSeasonalityData(portfolios);

  return (
    <ChartCard title="季节性" data={data} csvFilename="seasonality">
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            label={{
              value: '平均收益 (%)',
              angle: -90,
              position: 'insideLeft',
              style: { fill: 'var(--text-muted)', fontSize: 12 },
            }}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(value: number) => [`${value.toFixed(2)}%`, '']}
          />
          <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
          {portfolios.length === 1 ? (
            <Bar dataKey={portfolios[0].name} radius={[2, 2, 0, 0]}>
              {data.map((entry, idx) => {
                const val = entry[portfolios[0].name] as number;
                return <Cell key={idx} fill={val >= 0 ? 'var(--success)' : 'var(--error)'} />;
              })}
            </Bar>
          ) : (
            portfolios.map((p, idx) => (
              <Bar
                key={p.name}
                dataKey={p.name}
                fill={CHART_COLORS[idx % CHART_COLORS.length]}
                radius={[2, 2, 0, 0]}
              />
            ))
          )}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function computeSeasonalityData(portfolios: PortfolioResult[]) {
  const monthData: Record<number, Record<string, { sum: number; count: number }>> = {};
  for (let m = 1; m <= 12; m++) {
    monthData[m] = {};
  }

  for (const p of portfolios) {
    for (const point of p.monthlyReturns || []) {
      if (!monthData[point.month][p.name]) {
        monthData[point.month][p.name] = { sum: 0, count: 0 };
      }
      monthData[point.month][p.name].sum += point.return;
      monthData[point.month][p.name].count += 1;
    }
  }

  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const row: Record<string, number | string> = { month: MONTH_LABELS[i] };
    for (const p of portfolios) {
      const d = monthData[m][p.name];
      if (d && d.count > 0) {
        row[p.name] = +((d.sum / d.count) * 100).toFixed(2);
      }
    }
    return row;
  });
}
