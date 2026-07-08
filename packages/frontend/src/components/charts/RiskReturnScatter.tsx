/**
 * @file 风险收益散点图
 * @description 以波动率为横轴、年化收益为纵轴绘制散点图，直观对比各组合的风险收益比
 */
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
  LabelList,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import type { PortfolioResult } from '@backtest/shared';
import { CHART_TOOLTIP_STYLE } from '../chartHelpers.js';
import ChartCard from '../ChartCard.js';

/** 风险收益散点图 Props */
interface RiskReturnScatterProps {
  portfolios: PortfolioResult[];
}

interface ScatterPoint {
  name: string;
  stdev: number;
  cagr: number;
  sharpe: number;
}

/** 空数据占位 */
function EmptyScatter() {
  return (
    <div className="chart-card">
      <div className="chart-card-title">风险与收益</div>
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

export default function RiskReturnScatter({ portfolios }: RiskReturnScatterProps) {
  if (portfolios.length === 0) return <EmptyScatter />;

  const data: ScatterPoint[] = portfolios.map((p) => ({
    name: p.name,
    stdev: +(p.statistics.stdev * 100).toFixed(2),
    cagr: +(p.statistics.cagr * 100).toFixed(2),
    sharpe: +p.statistics.sharpe.toFixed(2),
  }));

  return (
    <ChartCard
      title="风险与收益"
      data={data.map((p): Record<string, string | number> => ({
        name: p.name,
        stdev: p.stdev,
        cagr: p.cagr,
        sharpe: p.sharpe,
      }))}
      csvFilename="risk-return"
    >
      <ResponsiveContainer width="100%" height={400}>
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis
            type="number"
            dataKey="stdev"
            name="波动率"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            label={{
              value: '年化波动率 (%)',
              position: 'insideBottom',
              offset: -10,
              style: { fill: 'var(--text-muted)', fontSize: 12 },
            }}
          />
          <YAxis
            type="number"
            dataKey="cagr"
            name="收益率"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            label={{
              value: '年化收益率 (%)',
              angle: -90,
              position: 'insideLeft',
              style: { fill: 'var(--text-muted)', fontSize: 12 },
            }}
          />
          <ZAxis range={[80, 80]} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(value: number, name: string) => {
              if (name === 'stdev') return [`${value.toFixed(2)}%`, '波动率'];
              if (name === 'cagr') return [`${value.toFixed(2)}%`, '收益率'];
              return [value, name];
            }}
            labelFormatter={() => ''}
          />
          {data.map((point, idx) => (
            <Scatter key={point.name} data={[point]} fill={CHART_COLORS[idx % CHART_COLORS.length]}>
              <LabelList
                dataKey="name"
                position="right"
                style={{ fill: 'var(--text-muted)', fontSize: 11 }}
              />
            </Scatter>
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
