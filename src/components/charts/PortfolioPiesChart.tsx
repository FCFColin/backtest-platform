/**
 * @file 投资组合饼图
 * @description 以饼图形式展示各投资组合的资产配置比例
 */
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { CHART_COLORS } from '../../../shared/types';
import type { Portfolio } from '../../../shared/types';
import ChartCard from '../ChartCard';

/** 投资组合饼图 Props */
interface PortfolioPiesChartProps {
  portfolios: Array<Pick<Portfolio, 'name' | 'assets'>>;
}

export default function PortfolioPiesChart({ portfolios }: PortfolioPiesChartProps) {
  if (portfolios.length === 0) {
    return (
      <div className="chart-card">
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>暂无组合配置数据</div>
      </div>
    );
  }

  const portfoliosWithAssets = portfolios.filter((p) => p.assets && p.assets.length > 0);

  if (portfoliosWithAssets.length === 0) {
    return (
      <div className="chart-card">
        <div className="chart-card-title">配置饼图</div>
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>组合中无资产</div>
      </div>
    );
  }

  const pieWidth = portfoliosWithAssets.length <= 2 ? 50 : 33;

  // 汇总所有组合的资产权重，用于 CSV 导出
  const exportData = portfoliosWithAssets.flatMap((p) =>
    p.assets.map((a) => ({ portfolio: p.name, ticker: a.ticker, weight: a.weight }))
  );

  return (
    <ChartCard title="配置饼图" data={exportData} csvFilename="portfolio-pies">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
        {portfoliosWithAssets.map((portfolio) => {
          const pieData = portfolio.assets.map((a) => ({
            name: a.ticker,
            value: a.weight,
          }));

          return (
            <div
              key={portfolio.name}
              style={{ width: `${pieWidth}%`, minWidth: 200, textAlign: 'center' }}
            >
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, value }) => `${name} ${value}%`}
                  >
                    {pieData.map((_, idx) => (
                      <Cell
                        key={`cell-${idx}`}
                        fill={CHART_COLORS[idx % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-soft)',
                      borderRadius: 'var(--radius-control)',
                      color: 'var(--text-body)',
                      fontSize: '12px',
                      boxShadow: 'var(--shadow-md)',
                    }}
                    formatter={(value: number, name: string) => [`${value}%`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
                </PieChart>
              </ResponsiveContainer>
              <div
                className="text-[13px] font-medium mt-1"
                style={{ color: 'var(--text-strong)' }}
              >
                {portfolio.name}
              </div>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}
