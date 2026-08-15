import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { EChartsOption } from 'echarts';
import { type Portfolio } from '@backtest/shared';
import { downsample, DOWNSAMPLE_THRESHOLD, DOWNSAMPLE_TARGET } from '../../utils/format.js';
import { DATE_TICK_FORMATTER, getPortfolioColor } from '@/lib/chart-theme.js';
import { tooltipOption, tooltipRow } from './chartUtils.js';
import { SimpleChart } from './sharedChartContent.js';
import { ChartEmptyState } from '@/components/stateDisplay.js';
import EChart from './EChart.js';
import ChartCard from '../ChartCard.js';

interface PortfolioPiesChartProps {
  portfolios: Array<Pick<Portfolio, 'name' | 'assets'>>;
}
function emptyDataCard(t: TFunction) {
  return (
    <ChartCard>
      <ChartEmptyState message={t('No data')} />
    </ChartCard>
  );
}
export default function PortfolioPiesChart({ portfolios }: PortfolioPiesChartProps) {
  const { t } = useTranslation();
  if (portfolios.length === 0) return emptyDataCard(t);
  const portfoliosWithAssets = portfolios.filter((p) => p.assets && p.assets.length > 0);
  if (portfoliosWithAssets.length === 0) {
    return (
      <ChartCard title={t('Allocation Pies')}>
        <ChartEmptyState message={t('No assets')} />
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
          const pieData = portfolio.assets.map((a, idx) => ({
            name: a.ticker,
            value: a.weight,
            itemStyle: { color: getPortfolioColor(idx) },
          }));
          const option: EChartsOption = {
            tooltip: tooltipOption(
              (p: { name: string; value: number; marker: string }) =>
                tooltipRow(p.marker, p.name, `${p.value}%`),
              'item',
            ),
            legend: {
              bottom: 0,
              textStyle: { color: 'hsl(var(--fg-tertiary))', fontSize: 12 },
            },
            series: [
              {
                type: 'pie',
                radius: '65%',
                center: ['50%', '44%'],
                data: pieData,
                avoidLabelOverlap: true,
                labelLayout: { hideOverlap: true },
                label: {
                  formatter: (p: { name: string; value: number }) => `${p.name} ${p.value}%`,
                  color: 'hsl(var(--fg-tertiary))',
                  fontSize: 11,
                },
              },
            ] as EChartsOption['series'],
          };
          return (
            <div
              key={portfolio.name}
              style={{ width: `${pieWidth}%`, minWidth: 200, textAlign: 'center' }}
            >
              <EChart
                option={option}
                height={300}
                ariaLabel={`${portfolio.name} ${t('Allocation')}`}
              />
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
    <SimpleChart
      type="area"
      height={400}
      xType="category"
      xTickFormatter={DATE_TICK_FORMATTER}
      yDomain={[0, 100]}
      yTickFormatter={(v: number) => `${v}%`}
      showLegend
      dataZoom={showBrush}
      tooltipFormatter={(value, name) => [`${value.toFixed(1)}%`, name]}
      ariaLabel={assets.map((a) => a.ticker).join(', ')}
      data={data}
      series={assets.map((asset, idx) => ({
        name: asset.ticker,
        dataKey: asset.ticker,
        stackId: 'total',
        width: 1,
        smooth: true,
        areaOpacity: fillOpacity,
        color: getPortfolioColor(idx),
      }))}
    />
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
  if (portfolios.length === 0) return emptyDataCard(t);
  const firstPortfolio = portfolios[0];
  const assets = firstPortfolio.assets;
  if (assets.length === 0) {
    return (
      <ChartCard title={t('Portfolio Allocation')}>
        <ChartEmptyState message={t('No assets')} />
      </ChartCard>
    );
  }
  const allocationHistory = firstPortfolio.allocationHistory;
  if (allocationHistory && allocationHistory.length > 0) {
    return <AllocationHistoryChart assets={assets} allocationHistory={allocationHistory} />;
  }
  return <InitialWeightChart assets={assets} growthCurve={firstPortfolio.growthCurve || []} />;
}
