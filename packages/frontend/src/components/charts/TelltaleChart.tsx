/**
 * @file Telltale 走势对比图
 * @description 展示各组合相对基准的累计收益比（Telltale Chart），用于判断相对强弱
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
  ReferenceLine,
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

/** Telltale 走势对比图 Props */
interface TelltaleChartProps {
  portfolios: PortfolioResult[];
}

export default function TelltaleChart({ portfolios }: TelltaleChartProps) {
  if (portfolios.length < 2) {
    return (
      <div className="chart-card">
        <div className="chart-card-title">述事图</div>
        <div
          style={{
            color: 'var(--text-muted)',
            fontSize: '13px',
            padding: '40px 0',
            textAlign: 'center',
          }}
        >
          至少需要2个组合才能显示述事图
        </div>
      </div>
    );
  }

  const mergedData = computeTelltaleData(portfolios);
  // 大数据集（>10000 点）降采样以保持渲染流畅，CSV 导出仍使用完整 mergedData
  const chartData =
    mergedData.length > DOWNSAMPLE_THRESHOLD
      ? downsample(mergedData, DOWNSAMPLE_TARGET)
      : mergedData;

  return (
    <ChartCard title="述事图" data={mergedData} csvFilename="telltale">
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(0, 7)}
          />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: number) => v.toFixed(3)}
            label={{
              value: '相对比率',
              angle: -90,
              position: 'insideLeft',
              style: { fill: 'var(--text-muted)', fontSize: 12 },
            }}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelFormatter={(label: string) => `日期: ${label}`}
            formatter={(value: number) => [value.toFixed(3), '']}
          />
          <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
          <ReferenceLine y={1} stroke="var(--text-muted)" strokeDasharray="4 4" />
          {portfolios.slice(1).map((p, idx) => (
            <Line
              key={p.name}
              type="monotone"
              dataKey={p.name}
              stroke={CHART_COLORS[(idx + 1) % CHART_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
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

function computeTelltaleData(portfolios: PortfolioResult[]) {
  const benchmark = portfolios[0];
  const benchMap = new Map<string, number>();
  for (const point of benchmark.growthCurve) {
    benchMap.set(point.date, point.value);
  }

  const dateMap = new Map<string, Record<string, number | string>>();
  for (let i = 1; i < portfolios.length; i++) {
    const p = portfolios[i];
    for (const point of p.growthCurve) {
      const benchVal = benchMap.get(point.date);
      if (benchVal == null || benchVal === 0) continue;
      if (!dateMap.has(point.date)) {
        dateMap.set(point.date, { date: point.date });
      }
      const ratio = point.value / benchVal;
      dateMap.get(point.date)![p.name] = +ratio.toFixed(6);
    }
  }

  return Array.from(dateMap.values()).sort((a, b) =>
    (a.date as string).localeCompare(b.date as string),
  );
}
