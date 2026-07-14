/**
 * @file 组合配置面积图
 * @description 以堆叠面积图展示投资组合资产配置比例随时间的变化
 */
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Brush,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import type { Portfolio } from '@backtest/shared';
import { ChartExporter } from '../ChartExporter.js';
import {
  downsample,
  DOWNSAMPLE_THRESHOLD,
  DOWNSAMPLE_TARGET,
} from '../../hooks/useChartInteractions.js';
import { CHART_TOOLTIP_STYLE } from '../chartHelpers.js';
import {
  CHART_MARGIN,
  CHART_GRID_PROPS,
  AXIS_TICK_STYLE,
  LEGEND_WRAPPER_STYLE,
} from './chartConstants.js';

type AllocationPortfolio = Pick<Portfolio, 'name' | 'assets'> & {
  growthCurve: Array<{ date: string; value: number }>;
  allocationHistory?: Array<{ date: string; weights: number[] }>;
};

/** 组合配置面积图 Props */
interface PortfolioAllocationChartProps {
  portfolios: AllocationPortfolio[];
}

const dateFormatter = (v: string) => (v.length > 7 ? v.slice(0, 7) : v);

/** 共享的堆叠面积图渲染块（配置历史/初始权重复用） */
function AllocationAreaChart({
  data,
  assets,
  showBrush,
  fillOpacity,
}: {
  data: Array<Record<string, string | number>>;
  assets: Portfolio['assets'];
  showBrush: boolean;
  fillOpacity: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <AreaChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
        <XAxis dataKey="date" tick={AXIS_TICK_STYLE} tickFormatter={dateFormatter} />
        <YAxis domain={[0, 100]} tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => `${v}%`} />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name]}
        />
        <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
        {assets.map((asset, idx) => (
          <Area
            key={asset.ticker}
            type="monotone"
            dataKey={asset.ticker}
            stackId="1"
            stroke={CHART_COLORS[idx % CHART_COLORS.length]}
            fill={CHART_COLORS[idx % CHART_COLORS.length]}
            fillOpacity={fillOpacity}
          />
        ))}
        {showBrush && (
          <Brush
            dataKey="date"
            height={20}
            stroke="var(--brand)"
            travellerWidth={8}
            tickFormatter={dateFormatter}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** 有 allocationHistory 的堆叠面积图 */
function AllocationHistoryChart({
  assets,
  allocationHistory,
}: {
  assets: Portfolio['assets'];
  allocationHistory: NonNullable<AllocationPortfolio['allocationHistory']>;
}) {
  const data = allocationHistory.map((snapshot) => {
    const entry: Record<string, string | number> = { date: snapshot.date };
    for (let i = 0; i < assets.length; i++) {
      entry[assets[i].ticker] = (snapshot.weights[i] ?? 0) * 100;
    }
    return entry;
  });
  const chartData = data.length > DOWNSAMPLE_THRESHOLD ? downsample(data, DOWNSAMPLE_TARGET) : data;

  return (
    <div className="chart-card">
      <div className="flex items-center justify-between mb-3">
        <div className="chart-card-title mb-0">组合配置</div>
        <ChartExporter data={data} filename="portfolio-allocation" />
      </div>
      <AllocationAreaChart
        data={chartData}
        assets={assets}
        showBrush={chartData.length > 100}
        fillOpacity={0.6}
      />
    </div>
  );
}

/** 无 allocationHistory 的初始权重面积图 */
function InitialWeightChart({
  assets,
  growthCurve,
}: {
  assets: Portfolio['assets'];
  growthCurve: Array<{ date: string; value: number }>;
}) {
  const sampled = growthCurve.filter((_, i) => i % 20 === 0);
  const data = sampled.map((point) => {
    const entry: Record<string, string | number> = { date: point.date };
    for (const asset of assets) entry[asset.ticker] = asset.weight;
    return entry;
  });
  if (data.length === 0) {
    const entry: Record<string, string | number> = { date: '起始' };
    for (const asset of assets) entry[asset.ticker] = asset.weight;
    data.push(entry);
  }

  return (
    <div className="chart-card">
      <div className="flex items-center justify-between mb-3">
        <div className="chart-card-title mb-0">组合配置</div>
        <ChartExporter data={data} filename="portfolio-allocation" />
      </div>
      <AllocationAreaChart
        data={data}
        assets={assets}
        showBrush={data.length > 100}
        fillOpacity={0.6}
      />
      <div
        className="text-[11px] mt-2 text-center"
        style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}
      >
        精确配置漂移需要逐资产净值数据，当前展示初始权重分配
      </div>
    </div>
  );
}

export default function PortfolioAllocationChart({ portfolios }: PortfolioAllocationChartProps) {
  if (portfolios.length === 0) {
    return (
      <div className="chart-card">
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          暂无组合配置数据
        </div>
      </div>
    );
  }

  const firstPortfolio = portfolios[0];
  const assets = firstPortfolio.assets;

  if (assets.length === 0) {
    return (
      <div className="chart-card">
        <div className="chart-card-title">组合配置</div>
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          组合中无资产
        </div>
      </div>
    );
  }

  const allocationHistory = firstPortfolio.allocationHistory;
  if (allocationHistory && allocationHistory.length > 0) {
    return <AllocationHistoryChart assets={assets} allocationHistory={allocationHistory} />;
  }

  return <InitialWeightChart assets={assets} growthCurve={firstPortfolio.growthCurve || []} />;
}
