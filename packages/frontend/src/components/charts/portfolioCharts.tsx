import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  Brush,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { CHART_COLORS, type Portfolio } from '@backtest/shared';
import { downsample, DOWNSAMPLE_THRESHOLD, DOWNSAMPLE_TARGET } from '../../utils/format.js';
import { CHART_MARGIN, CHART_GRID_PROPS } from '@/lib/chart-theme.js';
import { ChartTooltip, ChartLegend, ChartXAxis, ChartYAxis } from './sharedChartContent.js';
import ChartCard from '../ChartCard.js';

interface PortfolioPiesChartProps {
  portfolios: Array<Pick<Portfolio, 'name' | 'assets'>>;
}
export default function PortfolioPiesChart({ portfolios }: PortfolioPiesChartProps) {
  const { t } = useTranslation();
  if (portfolios.length === 0) {
    return (
      <ChartCard>
        <div className="text-label text-fg-tertiary">{t('No data')}</div>
      </ChartCard>
    );
  }
  const portfoliosWithAssets = portfolios.filter((p) => p.assets && p.assets.length > 0);
  if (portfoliosWithAssets.length === 0) {
    return (
      <ChartCard title={t('Allocation Pies')}>
        <div className="text-label text-fg-tertiary">{t('No assets')}</div>
      </ChartCard>
    );
  }
  const pieWidth = portfoliosWithAssets.length <= 2 ? 50 : 33;
  const exportData = portfoliosWithAssets.flatMap((p) =>
    p.assets.map((a) => ({ portfolio: p.name, ticker: a.ticker, weight: a.weight })),
  );
  return (
    <ChartCard title={t('Allocation Pies')} data={exportData} csvFilename="portfolio-pies">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
        {portfoliosWithAssets.map((portfolio) => {
          const pieData = portfolio.assets.map((a) => ({ name: a.ticker, value: a.weight }));
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
                      <Cell key={`cell-${idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip
                    cursor={false}
                    formatter={(value: number, name: string) => [`${value}%`, name]}
                  />
                  <ChartLegend />
                </PieChart>
              </ResponsiveContainer>
              <div className="text-label font-medium mt-1" style={{ color: 'var(--text-strong)' }}>
                {portfolio.name}
              </div>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}

type AllocationPortfolio = Pick<Portfolio, 'name' | 'assets'> & {
  growthCurve: Array<{ date: string; value: number }>;
  allocationHistory?: Array<{ date: string; weights: number[] }>;
};
interface PortfolioAllocationChartProps {
  portfolios: AllocationPortfolio[];
}
const dateFormatter = (v: string | number) => {
  const str = String(v);
  return str.length > 7 ? str.slice(0, 7) : str;
};
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
    <ChartCard title={t('Portfolio Allocation')} data={data} csvFilename="portfolio-allocation">
      <AllocationAreaChart
        data={chartData}
        assets={assets}
        showBrush={chartData.length > 100}
        fillOpacity={0.6}
      />
    </ChartCard>
  );
}
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
      date: t('Start Date'),
    };
    for (const asset of assets) entry[asset.ticker] = asset.weight;
    data.push(entry);
  }
  return (
    <ChartCard title={t('Portfolio Allocation')} data={data} csvFilename="portfolio-allocation">
      <AllocationAreaChart
        data={data}
        assets={assets}
        showBrush={data.length > 100}
        fillOpacity={0.6}
      />
      <div
        className="text-label-tiny mt-2 text-center"
        style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}
      >
        {t('Initial Weight')}
      </div>
    </ChartCard>
  );
}
export function PortfolioAllocationChart({ portfolios }: PortfolioAllocationChartProps) {
  const { t } = useTranslation();
  if (portfolios.length === 0) {
    return (
      <div className="chart-card">
        <div className="text-label text-fg-tertiary">{t('No data')}</div>
      </div>
    );
  }
  const firstPortfolio = portfolios[0];
  const assets = firstPortfolio.assets;
  if (assets.length === 0) {
    return (
      <div className="chart-card">
        <div className="chart-card-title">{t('Portfolio Allocation')}</div>
        <div className="text-label text-fg-tertiary">{t('No assets')}</div>
      </div>
    );
  }
  const allocationHistory = firstPortfolio.allocationHistory;
  if (allocationHistory && allocationHistory.length > 0) {
    return <AllocationHistoryChart assets={assets} allocationHistory={allocationHistory} />;
  }
  return <InitialWeightChart assets={assets} growthCurve={firstPortfolio.growthCurve || []} />;
}
