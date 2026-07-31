import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PortfolioResult } from '@backtest/shared';
import ChartCard from '../ChartCard.js';
import { BarChartContent } from './sharedChartContent.js';
interface ReturnsTabDailyChartProps {
  portfolios: PortfolioResult[];
  bins: Array<{ range: string; [portfolioName: string]: string | number }>;
}
export default memo(function ReturnsTabDailyChart({ portfolios, bins }: ReturnsTabDailyChartProps) {
  const { t } = useTranslation();
  if (bins.length === 0) return null;
  return (
    <ChartCard title={t('backtest.dailyReturnsHist')} data={bins}>
      <BarChartContent data={bins} seriesNames={portfolios.map((p) => p.name)} xDataKey="range" height={350} yLabel={t('backtest.frequency')} fillOpacity={0.7} xTickFontSize={9} xTickInterval={4} />
    </ChartCard>
  );
});
