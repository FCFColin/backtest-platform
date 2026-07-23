/**
 * @file 组合配置面积图
 * @description 以堆叠面积图展示投资组合资产配置比例随时间的变化
 */
import {
  AreaChart,
  Area,
  CartesianGrid,
  ResponsiveContainer,
  Brush,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { CHART_COLORS } from '@backtest/shared';
import type { Portfolio } from '@backtest/shared';
import ChartCard from '../ChartCard.js';
import {
  downsample,
  DOWNSAMPLE_THRESHOLD,
  DOWNSAMPLE_TARGET,
} from '../../hooks/useChartInteractions.js';
import {
  CHART_MARGIN,
  CHART_GRID_PROPS,
} from './chartConstants.js';
import { ChartXAxis, ChartYAxis, ChartTooltip, ChartLegend } from './ChartAxis.js';

type AllocationPortfolio = Pick<Portfolio, 'name' | 'assets'> & {
  growthCurve: Array<{ date: string; value: number }>;
  allocationHistory?: Array<{ date: string; weights: number[] }>;
};

/** 组合配置面积图 Props */
interface PortfolioAllocationChartProps {
  portfolios: AllocationPortfolio[];
}

const dateFormatter = (v: string | number) => {
  const str = String(v);
  return str.length > 7 ? str.slice(0, 7) : str;
};

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
        <ChartXAxis dataKey="date" tickFormatter={dateFormatter} />
        <ChartYAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
        <ChartTooltip
          labelFormatter={(label: string) => label}
          formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name]}
        />
        <ChartLegend />
        {assets.map((asset, idx) => (
          <Area
            key={asset.ticker}
            type="monotone"
            dataKey={asset.ticker}
            name={asset.ticker}
            stackId="1"
            stroke={CHART_COLORS[idx % CHART_COLORS.length]}
            fill={CHART_COLORS[idx % CHART_COLORS.length]}
            fillOpacity={fillOpacity}
            activeDot={{ r: 5, stroke: 'var(--bg-elevated)', strokeWidth: 2 }}
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
  const { t } = useTranslation();
  const data = allocationHistory.map((snapshot) => {
    const entry: Record<string, string | number> = { date: snapshot.date };
    for (let i = 0; i < assets.length; i++) {
      entry[assets[i].ticker] = (snapshot.weights[i] ?? 0) * 100;
    }
    return entry;
  });
  const chartData = data.length > DOWNSAMPLE_THRESHOLD ? downsample(data, DOWNSAMPLE_TARGET) : data;

  return (
    <ChartCard
      title={t('charts.portfolioAllocation.title')}
      data={data}
      csvFilename="portfolio-allocation"
    >
      <AllocationAreaChart
        data={chartData}
        assets={assets}
        showBrush={chartData.length > 100}
        fillOpacity={0.6}
      />
    </ChartCard>
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
  const { t } = useTranslation();
  const sampled = growthCurve.filter((_, i) => i % 20 === 0);
  const data = sampled.map((point) => {
    const entry: Record<string, string | number> = { date: point.date };
    for (const asset of assets) entry[asset.ticker] = asset.weight;
    return entry;
  });
  if (data.length === 0) {
    const entry: Record<string, string | number> = {
      date: t('charts.portfolioAllocation.startDate'),
    };
    for (const asset of assets) entry[asset.ticker] = asset.weight;
    data.push(entry);
  }

  return (
    <ChartCard
      title={t('charts.portfolioAllocation.title')}
      data={data}
      csvFilename="portfolio-allocation"
    >
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
        {t('charts.portfolioAllocation.initialWeightHint')}
      </div>
    </ChartCard>
  );
}

export default function PortfolioAllocationChart({ portfolios }: PortfolioAllocationChartProps) {
  const { t } = useTranslation();
  if (portfolios.length === 0) {
    return (
      <div className="chart-card">
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          {t('charts.portfolioAllocation.noData')}
        </div>
      </div>
    );
  }

  const firstPortfolio = portfolios[0];
  const assets = firstPortfolio.assets;

  if (assets.length === 0) {
    return (
      <div className="chart-card">
        <div className="chart-card-title">{t('charts.portfolioAllocation.title')}</div>
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          {t('charts.portfolioAllocation.noAssets')}
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
