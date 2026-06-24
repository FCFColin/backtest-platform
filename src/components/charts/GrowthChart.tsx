/**
 * @file 净值增长曲线图
 * @description 展示各投资组合的净值增长曲线，支持线性和对数坐标切换及基准货币换算
 */
import { useState } from 'react';
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
import { CHART_COLORS } from '../../../shared/types';
import type { PortfolioResult, BaseCurrency } from '../../../shared/types';
import { ChartExporter } from '../ChartExporter';
import { downsample } from '../../hooks/useChartInteractions';

/** 货币符号映射 */
const CURRENCY_SYMBOL: Record<BaseCurrency, string> = { usd: '$', cny: '¥' };

/** 净值增长曲线图 Props */
interface GrowthChartProps {
  portfolios: PortfolioResult[];
  /** 基准货币，用于换算并展示统一货币口径的净值 */
  baseCurrency?: BaseCurrency;
}

export default function GrowthChart({ portfolios, baseCurrency = 'usd' }: GrowthChartProps) {
  const [logScale, setLogScale] = useState(false);

  const mergedData = mergeGrowthCurves(portfolios);
  // 大数据集（>10000 点）降采样以保持渲染流畅，CSV 导出仍使用完整 mergedData
  const chartData = mergedData.length > 10000 ? downsample(mergedData, 1000) : mergedData;

  return (
    <div className="chart-card">
      <div className="flex items-center justify-between mb-3">
        <div className="chart-card-title mb-0">组合增长</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLogScale(!logScale)}
            className="px-2.5 py-1 text-[12px] border transition-colors"
            style={{
              borderRadius: 'var(--radius-control)',
              backgroundColor: logScale ? 'var(--brand)' : 'var(--bg-elevated)',
              color: logScale ? '#fff' : 'var(--text-muted)',
              borderColor: logScale ? 'var(--brand)' : 'var(--border-soft)',
            }}
          >
            对数坐标
          </button>
          <ChartExporter data={mergedData} filename="growth" />
        </div>
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(0, 7)}
          />
          <YAxis
            scale={logScale ? 'log' : 'linear'}
            domain={['auto', 'auto']}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-control)',
              color: 'var(--text-body)',
              fontSize: '12px',
              boxShadow: 'var(--shadow-md)',
            }}
            labelFormatter={(label: string) => `Date: ${label}`}
            formatter={(value: number) => [`${CURRENCY_SYMBOL[baseCurrency]}${value.toLocaleString()}`, '']}
          />
          <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
          {portfolios.map((p, idx) => (
            <Line
              key={p.name}
              type="monotone"
              dataKey={p.name}
              stroke={CHART_COLORS[idx % CHART_COLORS.length]}
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
    </div>
  );
}

function mergeGrowthCurves(portfolios: PortfolioResult[]) {
  if (portfolios.length === 0) return [];
  const dateMap = new Map<string, Record<string, number | string>>();
  for (const p of portfolios) {
    for (const point of p.growthCurve) {
      if (!dateMap.has(point.date)) {
        dateMap.set(point.date, { date: point.date });
      }
      dateMap.get(point.date)![p.name] = point.value;
    }
  }
  return Array.from(dateMap.values()).sort(
    (a, b) => (a.date as string).localeCompare(b.date as string)
  );
}
