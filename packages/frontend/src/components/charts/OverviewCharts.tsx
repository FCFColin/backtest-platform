import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetAnalysisResult } from '@backtest/shared';
import { useAnalysisData } from '../../hooks/useAnalysisData.js';
import { GrowthChart } from './AnalysisGrowthChart.js';
import DrawdownChart from './DrawdownChart.js';
import { CorrelationMatrixTable } from './CorrelationMatrixTable.js';
import ChartCard from '../ChartCard.js';

export const OverviewCharts = memo(function OverviewCharts({
  results,
  StatsTable,
}: {
  results: AssetAnalysisResult;
  StatsTable: React.ComponentType<{ tickers: AssetAnalysisResult['tickers'] }>;
}) {
  const { t } = useTranslation();
  const { tickers, portfolioResults, growthData } = useAnalysisData(results, 12);

  return (
    <div className="space-y-6">
      <ChartCard title={t('analysis.statsOverview')}>
        <StatsTable tickers={tickers} />
      </ChartCard>
      <GrowthChart growthData={growthData} portfolioResults={portfolioResults} />
      <DrawdownChart portfolios={portfolioResults} />
      {results.correlations && results.correlations.length >= 2 && (
        <CorrelationMatrixTable tickers={tickers} correlations={results.correlations} />
      )}
    </div>
  );
});
