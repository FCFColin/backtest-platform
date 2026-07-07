/**
 * @file 滚动收益折线图
 * @description 展示投资组合在滚动窗口下的收益、波动率等指标随时间变化趋势
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import type { PortfolioResult } from '@backtest/shared';
import { CHART_TOOLTIP_STYLE } from '../chartHelpers';
import ChartCard from '../ChartCard';
import {
  downsample,
  DOWNSAMPLE_THRESHOLD,
  DOWNSAMPLE_TARGET,
} from '../../hooks/useChartInteractions';
import { mergePortfolioSeries } from '../../utils/chartDataMerge';

/** 滚动收益折线图 Props */
interface RollingReturnChartProps {
  portfolios: PortfolioResult[];
}

export default function RollingReturnChart({ portfolios }: RollingReturnChartProps) {
  const mergedData = mergePortfolioSeries(
    portfolios,
    (p) => p.rollingReturns,
    (pt) => pt.date,
    (pt) => +(pt.return * 100).toFixed(2),
  );
  // 大数据集（>10000 点）降采样以保持渲染流畅，CSV 导出仍使用完整 mergedData
  const chartData =
    mergedData.length > DOWNSAMPLE_THRESHOLD
      ? downsample(mergedData, DOWNSAMPLE_TARGET)
      : mergedData;

  return (
    <ChartCard title="滚动收益" data={mergedData} csvFilename="rolling-return">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(0, 7)}
          />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelFormatter={(label: string) => `日期: ${label}`}
            formatter={(value: number) => [`${value.toFixed(2)}%`, '']}
          />
          <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
          {portfolios.map((p, idx) => (
            <Line
              key={p.name}
              type="monotone"
              dataKey={p.name}
              stroke={CHART_COLORS[idx % CHART_COLORS.length]}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3 }}
            />
          ))}
          {chartData.length > 100 && (
            <Brush
              dataKey="date"
              height={20}
              stroke="var(--brand)"
              travellerWidth={8}
              tickFormatter={(v: string) => v.slice(0, 7)}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
